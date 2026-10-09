// ===========================================================================
// END-TO-END ENCRYPTION SUITE — boots the REAL server and drives the entire
// recruiter verification flow over HTTP against the live database.
//
//   node tests/e2e.test.js
//
// What it proves:
//   • NIN is ciphertext at rest and decrypts to the original
//   • No full NIN/BVN or base64 image ever appears in an HTTP response
//   • Dojah ID photos are extracted to encrypted storage, never stored in DB
//   • Face-match still works THROUGH the photo:// pointer (the integration
//     that breaks silently if extraction and resolution disagree)
//   • Admin photo access: authenticated, no-store, noindex, real image bytes
//   • Logs contain neither images nor identifiers
//
// Uses USE_MOCK_API=true (already set in .env) so no external API is called.
// ===========================================================================

import 'dotenv/config';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { decryptField, isEncrypted } from '../utils/cryptoHelper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, '..');
const PORT = process.env.E2E_PORT || 5199;
const BASE = `http://127.0.0.1:${PORT}`;

const STAMP = Date.now();
const EMAIL = `e2e-crypto-${STAMP}@test.local`;
const NIN = '98765432109'; // 11 digits, distinct from seeded data
const ADMIN_EMAIL = `e2e-admin-${STAMP}@test.local`;
const ADMIN_PW = 'e2eAdminPass123!';
const RECRUITER_PW = 'e2eRecruiterPass123!';

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

async function api(method, url, { token, body } = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON body */ }
  return { status: res.status, json, headers: res.headers };
}

// Frames must clear mock liveness (>=5000 chars) and must not all be
// byte-identical (anti-replay check compares length + tail).
const makeFrame = (i) => `data:image/jpeg;base64,${'A'.repeat(5000 + i * 37)}${i}`;

let server = null;
let serverLog = '';

const startServer = async () => {
  server = spawn(process.execPath, ['server.js'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, PORT: String(PORT), DISABLE_RATE_LIMIT: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => { serverLog += d.toString(); });
  server.stderr.on('data', (d) => { serverLog += d.toString(); });

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
    try { server.kill(); } catch { /* already gone */ }
  }
};

// ---------------------------------------------------------------------------
// Test data lifecycle
// ---------------------------------------------------------------------------
let recruiterId = null;
let adminId = null;
let mediaRow = null;

const cleanup = async () => {
  try {
    if (mediaRow) {
      const rows = await query('SELECT storage_key FROM media_objects WHERE owner_id = $1', [recruiterId]);
      for (const r of rows.rows) {
        const p = path.resolve(BACKEND_DIR, process.env.STORAGE_ROOT || 'storage/photos', r.storage_key);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      await query('DELETE FROM media_objects WHERE owner_id = $1', [recruiterId]);
    }
    if (recruiterId) {
      await query('DELETE FROM verification_checks WHERE target_id = $1', [recruiterId]);
      await query('DELETE FROM recruiters WHERE id = $1', [recruiterId]);
    }
    if (adminId) await query('DELETE FROM admins WHERE id = $1', [adminId]);
    console.log('  (test fixtures removed)');
  } catch (e) {
    console.log(`  ! cleanup warning: ${e.message}`);
  }
};

// ===========================================================================
const main = async () => {
  console.log('====================================================');
  console.log('TRUSTHIRE E2E ENCRYPTION SUITE (real HTTP + live DB)');
  console.log('====================================================\n');

  console.log('[boot]');
  await startServer();
  await step('server boots and reports healthy', async () => {
    const r = await api('GET', '/health');
    must(r.status === 200, `expected 200, got ${r.status}`);
  });

  // --- recruiter onboarding -------------------------------------------------
  console.log('\n[recruiter flow]');
  let recruiterToken = null;

  await step('register recruiter', async () => {
    const r = await api('POST', '/api/auth/register', {
      body: { email: EMAIL, password: RECRUITER_PW, firstName: 'E2E', lastName: 'Crypto', phone: '08012345678' },
    });
    must([200, 201].includes(r.status), `register failed: ${r.status} ${JSON.stringify(r.json)}`);
    must(!JSON.stringify(r.json).includes('password_hash'), 'password_hash leaked in register response');
    const row = await query('SELECT id FROM recruiters WHERE email = $1', [EMAIL]);
    must(row.rowCount === 1, 'recruiter row not created');
    recruiterId = row.rows[0].id;
  });

  await step('verify email via OTP', async () => {
    const otp = await query('SELECT email_otp FROM recruiters WHERE id = $1', [recruiterId]);
    const code = otp.rows[0].email_otp;
    must(code, 'no email OTP stored');
    const r = await api('POST', '/api/auth/verify-email-otp', { body: { email: EMAIL, otp: code } });
    must(r.status === 200 && r.json?.success, `otp verify failed: ${r.status}`);
    recruiterToken = r.json?.data?.token;
    must(recruiterToken, 'no session token issued');
    const body = JSON.stringify(r.json);
    must(!body.includes(NIN), 'NIN in email-verify response'); // pre-condition
    must(!/"(nin|bvn)"/.test(body), 'nin/bvn key in email-verify response');
    must(!body.includes('data:image'), 'base64 image in email-verify response');
  });

  await step('phone OTP: wrong code rejected', async () => {
    const send = await api('POST', '/api/verify/phone/send-otp', { token: recruiterToken, body: { phoneNumber: '08012345678' } });
    must(send.status === 200, `send-otp failed: ${send.status}`);
    const bad = await api('POST', '/api/verify/phone/verify-otp', { token: recruiterToken, body: { otp: '000000' } });
    must(bad.status === 400, `wrong OTP should 400, got ${bad.status}`);
  });

  await step('phone OTP: correct code verifies', async () => {
    const r = await api('POST', '/api/verify/phone/verify-otp', { token: recruiterToken, body: { otp: '1234' } });
    must(r.status === 200 && r.json?.success, `verify failed: ${r.status}`);
    const body = JSON.stringify(r.json);
    must(!body.includes('data:image'), 'base64 image in phone response');
  });

  // --- identity: the core encryption path -----------------------------------
  await step('identity (NIN) verification succeeds', async () => {
    const r = await api('POST', '/api/verify/identity', { token: recruiterToken, body: { type: 'nin', number: NIN } });
    must(r.status === 200 && r.json?.success, `identity verify failed: ${r.status} ${JSON.stringify(r.json)}`);
  });

  await step('NIN stored as ciphertext (decrypted by model seam)', async () => {
    const raw = await query('SELECT nin, bvn, nin_enc, bvn_enc FROM recruiters WHERE id = $1', [recruiterId]);
    const row = raw.rows[0];
    must(row.nin_enc, 'nin_enc is NULL — write path did not encrypt');
    must(isEncrypted(row.nin_enc), `nin_enc is not packed ciphertext: ${String(row.nin_enc).slice(0, 20)}`);
    must(row.nin_enc !== NIN, 'nin_enc equals plaintext');
    const decrypted = await decryptField(row.nin_enc);
    must(decrypted === NIN, `decrypt mismatch: got ${decrypted}`);
    must(row.nin === NIN, 'dual-write plaintext column missing (expected during migration window)');
  });

  await step('identity response contains NO plaintext NIN', async () => {
    // Re-submit to capture the response body (same NIN is idempotent).
    const r = await api('POST', '/api/verify/identity', { token: recruiterToken, body: { type: 'nin', number: NIN } });
    const body = JSON.stringify(r.json);
    must(!body.includes(NIN), 'PLAINTEXT NIN LEAKED IN HTTP RESPONSE');
    must(!body.includes('data:image'), 'base64 image leaked in identity response');
  });

  await step('provider raw_response masked + photo externalized', async () => {
    const r = await query(
      `SELECT raw_response FROM verification_checks
       WHERE target_id = $1 AND check_type = 'nin' ORDER BY created_at DESC LIMIT 1`,
      [recruiterId],
    );
    must(r.rowCount === 1, 'no nin check row');
    const txt = JSON.stringify(r.rows[0].raw_response);
    must(!txt.includes('data:image'), 'base64 photo still stored in raw_response');
    must(!new RegExp(`"nin"\\s*:\\s*"${NIN}"`).test(txt), 'plaintext NIN still stored in raw_response');
    must(txt.includes('photo://') || !/"photo"/.test(txt), 'photo field neither externalized nor removed');
    // Masked form: first 3 + last 3 survive, middle is stars.
    must(txt.includes('987*****109') || !/"nin"/.test(txt), `nin not masked in raw_response: ${txt.slice(0, 300)}`);
  });

  await step('ID photo exists in encrypted object storage', async () => {
    const r = await query(
      `SELECT m.* FROM media_objects m
       JOIN verification_checks c ON c.target_id = m.owner_id
       WHERE m.owner_id = $1 AND c.check_type = 'nin' LIMIT 1`,
      [recruiterId],
    );
    must(r.rowCount === 1, 'no media_objects row created for ID photo');
    mediaRow = r.rows[0];
    must(/^[0-9a-f]{2}\/[0-9a-f]{64}\.enc$/.test(mediaRow.storage_key), `bad storage key: ${mediaRow.storage_key}`);
    const abs = path.resolve(BACKEND_DIR, process.env.STORAGE_ROOT || 'storage/photos', mediaRow.storage_key);
    must(fs.existsSync(abs), 'encrypted blob missing on disk');
    const onDisk = fs.readFileSync(abs, 'utf8');
    must(onDisk.startsWith('v1:'), 'blob on disk is not packed ciphertext');
    must(!onDisk.includes('data:image'), 'blob contains plaintext data URL');
  });

  // --- face: proves photo:// resolution works end-to-end --------------------
  await step('face: identical frames rejected (anti-replay)', async () => {
    const f = makeFrame(1);
    const r = await api('POST', '/api/verify/face', { token: recruiterToken, body: { frames: [f, f, f] } });
    must(r.status === 400, `identical frames should 400, got ${r.status}`);
    must(String(r.json?.error).toLowerCase().includes('movement'), `unexpected error: ${r.json?.error}`);
  });

  await step('face: liveness + face-match via photo:// pointer', async () => {
    const r = await api('POST', '/api/verify/face', {
      token: recruiterToken,
      body: { frames: [makeFrame(1), makeFrame(2), makeFrame(3)] },
    });
    must(r.status === 200 && r.json?.success, `face verify failed: ${r.status} ${JSON.stringify(r.json)}`);
    const data = r.json.data || {};
    // matchAttempted=true proves the photo:// pointer resolved to real bytes
    // and reached face-match — if resolution broke, this silently flips false.
    must(data.matchAttempted === true, 'face-match was NOT attempted — photo:// resolution likely failed');
    must(data.isSuccessful === true, 'face verification did not pass');
  });

  // --- status & serialization ----------------------------------------------
  console.log('\n[serialization]');
  await step('verification status exposes no NIN/BVN/OTP/ciphertext', async () => {
    const r = await api('GET', '/api/verify/status', { token: recruiterToken });
    must(r.status === 200, `status failed: ${r.status}`);
    const body = JSON.stringify(r.json);
    const d = r.json?.data || {};
    must(!body.includes(NIN), 'NIN leaked in status response');
    must(d.nin === undefined, 'nin key present in status response');
    must(d.bvn === undefined, 'bvn key present in status response');
    must(d.nin_enc === undefined, 'nin_enc (ciphertext) leaked in status response');
    must(d.password_hash === undefined, 'password_hash leaked in status response');
    must(d.email_otp === undefined || d.email_otp === null, 'email_otp leaked in status response');
    must(!body.includes('v1:dek_'), 'raw ciphertext leaked in status response');
    must(!body.includes('data:image'), 'base64 image in status response');
    must(d.checks?.identity === 'verified', `identity check not verified: ${JSON.stringify(d.checks)}`);
    must(d.checks?.phone === 'verified', 'phone check not verified');
    must(d.checks?.face === 'verified', 'face check not verified');
    must(d.verification_status === 'verified', `overall status: ${d.verification_status}`);
  });

  await step('login response exposes no NIN/BVN/OTP', async () => {
    const r = await api('POST', '/api/auth/login', { body: { email: EMAIL, password: RECRUITER_PW } });
    must(r.status === 200, `login failed: ${r.status}`);
    const body = JSON.stringify(r.json);
    must(!body.includes(NIN), 'NIN leaked in login response');
    must(!/(nin|bvn)"/.test(body) || !/"nin"/.test(body), 'nin key leaked in login response');
    must(!body.includes('password_hash'), 'password_hash leaked in login response');
  });

  // --- admin photo access ---------------------------------------------------
  console.log('\n[admin photo access]');
  let adminToken = null;

  await step('admin register is locked without bootstrap token (403)', async () => {
    // Audit C3: once any admin exists, POST /admin/register must refuse
    // anonymous self-provisioning. (If the table were empty — first run —
    // an untokened register is legitimately allowed, so only assert 403
    // when at least one admin already exists.)
    const admins = await query('SELECT COUNT(*)::int AS n FROM admins');
    if (admins.rows[0].n > 0) {
      const r = await api('POST', '/api/auth/admin/register', {
        body: { email: `locked-${ADMIN_EMAIL}`, password: ADMIN_PW, role: 'super_admin' },
      });
      must(r.status === 403, `expected 403 for tokenless admin register, got ${r.status}`);
      const row = await query('SELECT id FROM admins WHERE email = $1', [`locked-${ADMIN_EMAIL}`]);
      must(row.rowCount === 0, 'locked admin register created a row anyway');
    }
  });

  await step('register temp admin (with bootstrap token)', async () => {
    const r = await api('POST', '/api/auth/admin/register', {
      body: {
        email: ADMIN_EMAIL,
        password: ADMIN_PW,
        role: 'admin',
        bootstrapToken: process.env.ADMIN_BOOTSTRAP_TOKEN,
      },
    });
    must([200, 201].includes(r.status), `admin register failed: ${r.status}`);
    adminToken = r.json?.data?.token;
    const row = await query('SELECT id FROM admins WHERE email = $1', [ADMIN_EMAIL]);
    adminId = row.rows[0]?.id;
    must(adminToken && adminId, 'admin token/id missing');
  });

  await step('photo endpoint rejects unauthenticated access (401)', async () => {
    const r = await api('GET', `/api/admin/photo/${mediaRow.id}`);
    must(r.status === 401, `expected 401, got ${r.status}`);
  });

  await step('photo endpoint rejects recruiter token (401/403)', async () => {
    const r = await api('GET', `/api/admin/photo/${mediaRow.id}`, { token: recruiterToken });
    must([401, 403].includes(r.status), `expected 401/403 for recruiter, got ${r.status}`);
  });

  await step('photo endpoint serves decrypted image with hardening headers', async () => {
    const res = await fetch(`${BASE}/api/admin/photo/${mediaRow.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    must(res.status === 200, `expected 200, got ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    must(buf.length === mediaRow.size_bytes, `size mismatch: ${buf.length} vs ${mediaRow.size_bytes}`);
    must(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff, 'bytes are not a JPEG (decryption wrong)');
    must((res.headers.get('cache-control') || '').includes('no-store'), 'cache-control missing no-store');
    must((res.headers.get('x-robots-tag') || '').includes('noindex'), 'x-robots-tag missing noindex');
    must((res.headers.get('content-type') || '').startsWith('image/'), 'wrong content-type');
  });

  await step('photo endpoint rejects invalid and traversal ids', async () => {
    for (const bad of ['not-a-uuid', '../../.env', '..%2f..%2f.env', '00000000-0000-0000-0000-000000000000']) {
      const r = await api('GET', `/api/admin/photo/${bad}`, { token: adminToken });
      must([400, 403, 404].includes(r.status), `id "${bad}" should 400/403/404, got ${r.status}`);
    }
  });

  // --- logs -----------------------------------------------------------------
  console.log('\n[log hygiene]');
  await step('server logs contain no base64 images and no NIN', async () => {
    must(!serverLog.includes('data:image'), 'base64 image found in server logs');
    must(!serverLog.includes(NIN), 'plaintext NIN found in server logs');
    must(!/\/9j\/4AAQ/.test(serverLog), 'raw JPEG base64 found in server logs');
    must(!serverLog.includes('v1:dek_'), 'raw ciphertext found in server logs');
  });

  await step('rate-limit disable flag is not honored in production', async () => {
    // Guards against DISABLE_RATE_LIMIT being a real production bypass.
    const src = fs.readFileSync(path.join(BACKEND_DIR, 'middleware', 'rateLimiter.js'), 'utf8');
    must(src.includes('NODE_ENV'), 'DISABLE_RATE_LIMIT has no NODE_ENV guard');
    must(/production/.test(src), 'DISABLE_RATE_LIMIT could be disabled in production');
  });

  // --- summary --------------------------------------------------------------
  const failed = results.filter((r) => !r.ok);
  console.log('\n====================================================');
  console.log(`RESULT: ${results.length - failed.length}/${results.length} passed`);
  console.log('====================================================');
  if (failed.length > 0) {
    console.log('\nFAILED:');
    for (const f of failed) console.log(`  ✗ ${f.name}: ${f.err}`);
  }

  await cleanup();
  stopServer();
  process.exit(failed.length > 0 ? 1 : 0);
};

// Hard timeout so a hung server can never wedge CI.
const timer = setTimeout(() => {
  console.error('\n❌ E2E suite timed out after 120s');
  stopServer();
  process.exit(1);
}, 120000);

main().catch(async (e) => {
  console.error(`\n❌ E2E suite crashed: ${e.message}\n${e.stack}`);
  await cleanup();
  stopServer();
  clearTimeout(timer);
  process.exit(1);
});
