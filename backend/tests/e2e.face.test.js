// ===========================================================================
// FACE E2E — exercises the Didit face/liveness verification flow against the
// REAL server and live database:
//
//   hosted session creation (mock mode, same controller path as live)
//     -> webcam capture completion -> state machine -> recruiter flags
//       -> signed webhook delivery (HMAC-SHA256, raw body)
//         -> signature rejection (401) and idempotent replay
//
// Run with mock Didit (no keys needed): the spawned server gets
// DIDIT_MOCK=true + a test webhook secret. With real keys in backend/.env
// the exact same routes drive real Didit sessions.
// Run: node tests/e2e.face.test.js
// ===========================================================================

import 'dotenv/config';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { query } from '../config/database.js';
import * as FaceVerification from '../models/faceVerification.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, '..');
const PORT = process.env.FACE_PORT || 5398;
const BASE = `http://127.0.0.1:${PORT}`;

const STAMP = Date.now();
const RECR_A_EMAIL = `wf-face-a-${STAMP}@test.local`;
const RECR_B_EMAIL = `wf-face-b-${STAMP}@test.local`;
const FACE_PASSWORD = 'FaceTest123!';
const WEBHOOK_SECRET = 'face-e2e-test-secret';

const ids = { recruiterA: null, recruiterB: null };
const faceRecords = [];
let tokenA = null;
let imgServerRef = null; // in-test media host, closed in finally

const results = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  \u2713 ${name}`);
  } catch (e) {
    results.push({ name, ok: false, err: e.message });
    console.log(`  \u2717 ${name}\n      ${e.message}`);
  }
};
const must = (cond, msg) => { if (!cond) throw new Error(msg); };

async function api(method, url, { token, body, headers } = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

const sign = (payload) =>
  crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');

// Canonical JSON exactly as Didit signs for X-Signature-V2 (sorted keys,
// compact, whole floats -> ints, Unicode preserved).
const shortenFloats = (d) => {
  if (Array.isArray(d)) return d.map(shortenFloats);
  if (d !== null && typeof d === 'object') {
    return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, shortenFloats(v)]));
  }
  if (typeof d === 'number' && !Number.isInteger(d) && d % 1 === 0) return Math.trunc(d);
  return d;
};
const sortKeys = (d) => {
  if (Array.isArray(d)) return d.map(sortKeys);
  if (d !== null && typeof d === 'object') {
    return Object.keys(d).sort().reduce((acc, k) => { acc[k] = sortKeys(d[k]); return acc; }, {});
  }
  return d;
};
const signV2 = (obj) =>
  crypto.createHmac('sha256', WEBHOOK_SECRET)
    .update(JSON.stringify(sortKeys(shortenFloats(obj))), 'utf8')
    .digest('hex');

// Headers for a raw-body X-Signature delivery (V3 envelope requires the
// timestamp Didit always sends; verification rejects >5min skew).
const deliverHeaders = (payload, extra = {}) => ({
  'X-Signature': sign(payload),
  'X-Timestamp': String(Math.floor(Date.now() / 1000)),
  ...extra,
});

// A realistic V3 status.updated envelope for an approved session.
const v3ApprovedEvent = (sessionId, vendorData) => ({
  event_id: crypto.randomUUID(),
  webhook_type: 'status.updated',
  timestamp: Math.floor(Date.now() / 1000),
  created_at: Math.floor(Date.now() / 1000),
  environment: 'sandbox',
  session_id: sessionId,
  status: 'Approved',
  vendor_data: vendorData,
  decision: {
    session_id: sessionId,
    status: 'Approved',
    features: ['LIVENESS'],
    liveness_checks: [{ node_id: 'liveness_1', status: 'Approved', method: 'PASSIVE', score: 97.5 }],
    face_matches: [],
    reviews: [],
  },
});

let server = null;
const startServer = async () => {
  server = spawn(process.execPath, ['server.js'], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      DISABLE_RATE_LIMIT: 'true',
      DIDIT_MOCK: 'true',
      DIDIT_WEBHOOK_SECRET: WEBHOOK_SECRET,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', () => {});
  const deadline = Date.now() + 25000;
  for (;;) {
    if (server.exitCode !== null) throw new Error(`server exited early (code ${server.exitCode})`);
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new Error('server did not become healthy in 25s');
    await new Promise((r) => setTimeout(r, 300));
  }
};
const stopServer = () => {
  if (server && server.exitCode === null) {
    try { server.kill(); } catch { /* gone */ }
  }
};

const cleanup = async () => {
  try {
    for (const recId of [ids.recruiterA, ids.recruiterB]) {
      if (!recId) continue;
      // Encrypted face-photo objects: remove blobs from disk, then rows.
      const media = await query('SELECT storage_key FROM media_objects WHERE owner_id = $1', [recId]);
      for (const m of media.rows) {
        const abs = path.resolve(BACKEND_DIR, process.env.STORAGE_ROOT || 'storage/photos', m.storage_key);
        try { fs.rmSync(abs, { force: true }); } catch { /* already gone */ }
      }
      await query('DELETE FROM media_objects WHERE owner_id = $1', [recId]);
      await query('DELETE FROM verification_checks WHERE target_id = $1', [recId]);
      await query('DELETE FROM recruiter_face_verifications WHERE recruiter_id = $1', [recId]);
      await query('DELETE FROM recruiters WHERE id = $1', [recId]);
    }
    console.log('  (face fixtures removed)');
  } catch (e) {
    console.log(`  ! cleanup warning: ${e.message}`);
  }
};

// 1x1 JPEG — stands in for a captured webcam frame / Didit reference image.
const TINY_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';

const seedRecruiter = async (email, { faceVerified, status }) => {
  const passwordHash = await bcrypt.hash(FACE_PASSWORD, 10);
  const res = await query(
    `INSERT INTO recruiters (email, password_hash, first_name, last_name, is_email_verified, is_phone_verified, is_identity_verified, is_face_verified, verification_status)
     VALUES ($1, $2, 'Face', 'Tester', true, true, true, $3, $4)
     RETURNING id`,
    [email, passwordHash, faceVerified, status],
  );
  return res.rows[0].id;
};

async function main() {
  console.log('\n========================================');
  console.log('🚀 TrustHire Face Verification E2E');
  console.log('========================================\n');

  let failed = false;
  try {
    // Fixtures: A has every other step done (face approval should complete
    // their verification), B starts a webhook-only journey.
    ids.recruiterA = await seedRecruiter(RECR_A_EMAIL, { faceVerified: false, status: 'partially_verified' });
    ids.recruiterB = await seedRecruiter(RECR_B_EMAIL, { faceVerified: false, status: 'partially_verified' });
    tokenA = jwt.sign({ id: ids.recruiterA, email: RECR_A_EMAIL }, process.env.JWT_SECRET, { expiresIn: '1h' });

    await startServer();
    console.log('  (server up on port ' + PORT + ')\n');

    let session = null;

    await step('start face session (mock mode) -> hosted session record', async () => {
      const r = await api('POST', '/api/verify/face/session', { token: tokenA });
      must(r.status === 200, `expected 200, got ${r.status}`);
      must(r.json?.success, 'success flag missing');
      const d = r.json.data;
      must(d.mode === 'mock', `expected mock mode, got ${d.mode}`);
      must(d.sessionId?.startsWith('mock_'), `bad session id: ${d.sessionId}`);
      session = d;
      const row = await query('SELECT * FROM recruiter_face_verifications WHERE session_id = $1', [d.sessionId]);
      must(row.rows.length === 1, 'session row not persisted');
      must(row.rows[0].status === 'pending', 'new session should be pending');
      faceRecords.push(d.sessionId);
    });

    await step('face status while pending', async () => {
      const r = await api('GET', '/api/verify/face/status', { token: tokenA });
      must(r.status === 200, `expected 200, got ${r.status}`);
      const fv = r.json?.data?.faceVerification;
      must(fv?.status === 'pending', `expected pending, got ${fv?.status}`);
      must(fv?.sessionId === session.sessionId, 'status returned wrong session');
      must(r.json?.data?.faceVerified === false, 'faceVerified should still be false');
    });

    await step('mock capture completion -> approved + recruiter flags + audit row', async () => {
      const r = await api('POST', '/api/verify/face/mock/complete', {
        token: tokenA,
        body: { selfieBase64: `data:image/jpeg;base64,${TINY_JPEG_B64}` },
      });
      must(r.status === 200, `expected 200, got ${r.status}`);

      const st = await api('GET', '/api/verify/face/status', { token: tokenA });
      const fv = st.json?.data?.faceVerification;
      must(fv?.status === 'approved', `expected approved, got ${fv?.status}`);
      must(st.json?.data?.faceVerified === true, 'faceVerified should be true');
      must(fv?.livenessResult === true, 'liveness_result should be true');
      must(fv?.verifiedAt, 'verified_at should be set');

      const rec = await query('SELECT is_face_verified, verification_status FROM recruiters WHERE id = $1', [ids.recruiterA]);
      must(rec.rows[0].is_face_verified === true, 'recruiter.is_face_verified not set');
      must(rec.rows[0].verification_status === 'verified',
        `all steps done -> expected verification_status verified, got ${rec.rows[0].verification_status}`);

      const checks = await query(
        "SELECT * FROM verification_checks WHERE target_id = $1 AND check_type = 'liveness' AND provider = 'didit'",
        [ids.recruiterA],
      );
      must(checks.rows.length === 1, `expected 1 didit audit row, got ${checks.rows.length}`);
      must(checks.rows[0].is_successful === true, 'audit row should be successful');
    });

    await step('repeated start -> alreadyVerified short-circuit', async () => {
      const r = await api('POST', '/api/verify/face/session', { token: tokenA });
      must(r.status === 200, `expected 200, got ${r.status}`);
      must(r.json?.data?.alreadyVerified === true, 'should short-circuit when already verified');
    });

    await step('verified face photo stored encrypted + served via self-view endpoint', async () => {
      // Status now advertises the photo
      const st = await api('GET', '/api/verify/face/status', { token: tokenA });
      must(st.json?.data?.faceVerification?.hasFacePhoto === true, 'hasFacePhoto should be true after mock capture');

      // Encrypted object exists in the photo store (never plaintext on disk)
      const media = await query(
        "SELECT * FROM media_objects WHERE owner_id = $1 AND purpose = 'face_liveness'",
        [ids.recruiterA],
      );
      must(media.rows.length === 1, `expected 1 face media row, got ${media.rows.length}`);
      const abs = path.resolve(BACKEND_DIR, process.env.STORAGE_ROOT || 'storage/photos', media.rows[0].storage_key);
      const onDisk = fs.readFileSync(abs, 'utf8');
      must(onDisk.startsWith('v1:'), 'photo blob must be envelope-encrypted ciphertext');

      // Self-view endpoint serves the decrypted image with hardening headers
      const res = await fetch(`${BASE}/api/verify/face/photo`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      must(res.status === 200, `photo endpoint expected 200, got ${res.status}`);
      must((res.headers.get('content-type') || '').startsWith('image/'), 'content-type must be an image');
      must((res.headers.get('cache-control') || '').includes('no-store'), 'photo must be no-store');
      const bytes = Buffer.from(await res.arrayBuffer());
      must(bytes.length > 0, 'photo bytes empty');
      // JPEG magic numbers — proves decryption round-tripped the real image
      must(bytes[0] === 0xff && bytes[1] === 0xd8, 'served bytes are not a JPEG');

      // Unauthenticated -> 401
      const anon = await fetch(`${BASE}/api/verify/face/photo`);
      must(anon.status === 401, `photo endpoint without token expected 401, got ${anon.status}`);

      // Another recruiter's token -> 404 (their own record has no photo yet)
      const tokenB = jwt.sign({ id: ids.recruiterB, email: RECR_B_EMAIL }, process.env.JWT_SECRET, { expiresIn: '1h' });
      const other = await fetch(`${BASE}/api/verify/face/photo`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      must(other.status === 404, `photo endpoint for photoless recruiter expected 404, got ${other.status}`);
    });

    await step('mock complete disabled with no pending mock session', async () => {
      const r = await api('POST', '/api/verify/face/mock/complete', { token: tokenA });
      // Already-terminal record: endpoint reports a no-op or a clean error,
      // never a crash and never a state change.
      must(r.status === 200 || r.status === 400, `expected 200/400, got ${r.status}`);
      const rec = await query('SELECT is_face_verified FROM recruiters WHERE id = $1', [ids.recruiterA]);
      must(rec.rows[0].is_face_verified === true, 'flag must stay true');
    });

    // --- webhook path (recruiter B) ------------------------------------------
    let hookSession = null;

    // Local stand-in for Didit's media host: serves the reference_image bytes
    // the backend must download at approval time.
    const imgServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      res.end(Buffer.from(TINY_JPEG_B64, 'base64'));
    });
    await new Promise((r) => imgServer.listen(0, '127.0.0.1', r));
    imgServerRef = imgServer;
    const imgPort = imgServer.address().port;

    await step('seed pending session for webhook delivery', async () => {
      const row = await FaceVerification.create({
        recruiterId: ids.recruiterB,
        provider: 'didit',
        environment: 'live',
        sessionId: `wf-hook-${STAMP}`,
      });
      faceRecords.push(row.session_id);
      hookSession = row;
    });

    await step('signed webhook (V3 Approved envelope) -> verified', async () => {
      const event = v3ApprovedEvent(hookSession.session_id, String(ids.recruiterB));
      // Include the presigned media URL — the backend must download these
      // bytes at approval time (Didit URLs are short-validity).
      event.decision.liveness_checks[0].reference_image =
        `http://127.0.0.1:${imgPort}/reference.jpg`;
      const payload = JSON.stringify(event);
      const r = await api('POST', '/api/webhooks/didit', {
        body: payload,
        headers: deliverHeaders(payload),
      });
      must(r.status === 200, `expected 200, got ${r.status}`);

      const row = await query('SELECT * FROM recruiter_face_verifications WHERE session_id = $1', [hookSession.session_id]);
      must(row.rows[0].status === 'approved', `record not approved: ${row.rows[0].status}`);
      must(row.rows[0].liveness_result === true, 'liveness not recorded from decision.liveness_checks[]');
      must(row.rows[0].face_match_score === null, 'no face_matches -> score stays null');

      const rec = await query('SELECT is_face_verified FROM recruiters WHERE id = $1', [ids.recruiterB]);
      must(rec.rows[0].is_face_verified === true, 'webhook should set is_face_verified');

      // reference_image was downloaded and stored encrypted (photo:// pointer)
      must(!!row.rows[0].face_photo_ref, 'face_photo_ref should be set from reference_image');
      must(row.rows[0].face_photo_ref.startsWith('photo://'), 'face_photo_ref must be a photo:// pointer');
      const media = await query(
        "SELECT * FROM media_objects WHERE owner_id = $1 AND purpose = 'face_liveness'",
        [ids.recruiterB],
      );
      must(media.rows.length === 1, 'reference_image bytes must land in encrypted store');
    });

    await step('webhook replay (same event) is idempotent', async () => {
      const payload = JSON.stringify({
        session_id: hookSession.session_id,
        status: 'Approved',
        webhook_type: 'status.updated',
      });
      const r = await api('POST', '/api/webhooks/didit', {
        body: payload,
        headers: deliverHeaders(payload),
      });
      must(r.status === 200, `expected 200 on replay, got ${r.status}`);
      const checks = await query(
        "SELECT * FROM verification_checks WHERE target_id = $1 AND check_type = 'liveness'",
        [ids.recruiterB],
      );
      must(checks.rows.length === 1, `replay must not duplicate audit rows, got ${checks.rows.length}`);
    });

    await step('X-Signature-V2 (canonical JSON, unsorted body) verifies', async () => {
      // V2 signs the canonical form — the wire body is deliberately written
      // with unsorted keys to prove verification does not depend on byte
      // order, only on the parsed content.
      const event = v3ApprovedEvent(`wf-v2-${STAMP}`, String(ids.recruiterB));
      const wireObj = {
        status: event.status,
        session_id: event.session_id,
        decision: event.decision,
        event_id: event.event_id,
        webhook_type: event.webhook_type,
      };
      const r = await api('POST', '/api/webhooks/didit', {
        body: JSON.stringify(wireObj),
        headers: {
          'X-Signature-V2': signV2(wireObj),
          'X-Timestamp': String(Math.floor(Date.now() / 1000)),
        },
      });
      // Unknown session (never created) -> acknowledged but must be 200,
      // proving the signature itself passed (bad signatures get 401).
      must(r.status === 200, `expected 200 (V2 signature accepted), got ${r.status}`);
    });

    await step('stale X-Timestamp (>5min) rejected even with valid signature', async () => {
      const payload = JSON.stringify({ session_id: `wf-stale-${STAMP}`, status: 'Approved' });
      const r = await api('POST', '/api/webhooks/didit', {
        body: payload,
        headers: {
          'X-Signature': sign(payload),
          'X-Timestamp': String(Math.floor(Date.now() / 1000) - 400),
        },
      });
      must(r.status === 401, `expected 401 on stale timestamp, got ${r.status}`);
    });

    await step('missing X-Timestamp rejected even with valid signature', async () => {
      const payload = JSON.stringify({ session_id: `wf-noTs-${STAMP}`, status: 'Approved' });
      const r = await api('POST', '/api/webhooks/didit', {
        body: payload,
        headers: { 'X-Signature': sign(payload) },
      });
      must(r.status === 401, `expected 401 without timestamp, got ${r.status}`);
    });

    await step('webhook with bad signature -> 401, no state change', async () => {
      const payload = JSON.stringify({ session_id: `wf-hook-bad-${STAMP}`, status: 'Approved' });
      const r = await api('POST', '/api/webhooks/didit', {
        body: payload,
        headers: deliverHeaders(payload, { 'X-Signature': 'deadbeef'.repeat(8) }),
      });
      must(r.status === 401, `expected 401, got ${r.status}`);
      const row = await query('SELECT * FROM recruiter_face_verifications WHERE session_id = $1', [`wf-hook-bad-${STAMP}`]);
      must(row.rows.length === 0, 'unsigned event must not create records');
    });

    await step('signed webhook for unknown session -> acknowledged, ignored', async () => {
      const payload = JSON.stringify({ session_id: 'wf-unknown-session', status: 'Approved' });
      const r = await api('POST', '/api/webhooks/didit', {
        body: payload,
        headers: deliverHeaders(payload),
      });
      must(r.status === 200, `expected 200 (acknowledge), got ${r.status}`);
    });

    await step('signed webhook DECLINED recorded for fresh session', async () => {
      const row = await FaceVerification.create({
        recruiterId: ids.recruiterB,
        provider: 'didit',
        environment: 'live',
        sessionId: `wf-hook-declined-${STAMP}`,
      });
      faceRecords.push(row.session_id);
      const payload = JSON.stringify({
        event_id: crypto.randomUUID(),
        webhook_type: 'status.updated',
        session_id: row.session_id,
        status: 'Declined',
        decision: {
          session_id: row.session_id,
          status: 'Declined',
          liveness_checks: [{ node_id: 'liveness_1', status: 'Declined', score: 41.2 }],
          face_matches: [],
        },
      });
      const r = await api('POST', '/api/webhooks/didit', {
        body: payload,
        headers: deliverHeaders(payload),
      });
      must(r.status === 200, `expected 200, got ${r.status}`);
      const after = await query('SELECT * FROM recruiter_face_verifications WHERE session_id = $1', [row.session_id]);
      must(after.rows[0].status === 'declined', `expected declined, got ${after.rows[0].status}`);
      const checks = await query(
        "SELECT * FROM verification_checks WHERE reference_id = $1 AND is_successful = false",
        [row.session_id],
      );
      must(checks.rows.length === 1, 'declined verdict should leave a failed audit row');
    });

    await step('Abandoned session maps to declined (retryable)', async () => {
      const row = await FaceVerification.create({
        recruiterId: ids.recruiterB,
        provider: 'didit',
        environment: 'live',
        sessionId: `wf-hook-abandoned-${STAMP}`,
      });
      faceRecords.push(row.session_id);
      const payload = JSON.stringify({
        session_id: row.session_id,
        status: 'Abandoned',
        decision: { session_id: row.session_id, status: 'Abandoned' },
      });
      const r = await api('POST', '/api/webhooks/didit', {
        body: payload,
        headers: deliverHeaders(payload),
      });
      must(r.status === 200, `expected 200, got ${r.status}`);
      const after = await query('SELECT status FROM recruiter_face_verifications WHERE session_id = $1', [row.session_id]);
      must(after.rows[0].status === 'declined', `abandoned should be declined, got ${after.rows[0].status}`);
    });
  } catch (e) {
    failed = true;
    console.error(`\nFATAL: ${e.message}`);
  } finally {
    stopServer();
    if (imgServerRef) { try { imgServerRef.close(); } catch { /* gone */ } }
    await cleanup();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n========================================`);
  console.log(`Face verification E2E: ${passed}/${results.length} steps passed`);
  console.log(`========================================\n`);
  process.exit(failed || passed !== results.length ? 1 : 0);
}

main();
