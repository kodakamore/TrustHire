// ===========================================================================
// seed-defense-recruiter.js — build the DEFENSE DEMO account: a recruiter
// that passes every TrustHire verification phase end-to-end and ends with an
// AUTO-APPROVED job ad carrying a QR/PIN.
//
//   node scripts/seed-defense-recruiter.js [--skip-face]
//
// What it does (all over real HTTP against the local database):
//   1. Boots a throwaway server instance on a private port (so it works
//      whether or not `npm run dev` is up — both talk to the same DB).
//   2. Wipes any previous demo account (idempotent re-seed).
//   3. Registers  hr@acmeskills.ng  (a company-domain address — free webmail
//      is rejected at registration by design).
//   4. Phase 1  Email OTP        (code read from DB, verified over the API)
//   5. Phase 2  Phone OTP        (sandbox code 1234)
//   6. Phase 3  NIN identity     (mock Dojah — ciphertext at rest)
//   7. Phase 4  Face / liveness  (legacy frame path, mock; --skip-face to skip)
//   8. Company  CAC + WHOIS/APIVoid/content + corporate-email OTP
//   9. Job ad   → expects status "approved" + QR code + PIN
//  10. Prints a defense dashboard with credentials + every phase status.
//
// IMPORTANT (sandbox honesty): USE_MOCK_API=true must be set — Dojah /
// WhoisXML / APIVoid / Resend all run against local mocks. Nothing here
// calls a live third-party API; see README/audit notes for what changes
// when real credentials are configured.
//
// The demo account is listed in PURGE_KEEP_EMAILS so
// scripts/purge-test-recruiters.js never deletes it.
// ===========================================================================

import 'dotenv/config';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { query } from '../config/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, '..');
const PORT = process.env.SEED_PORT || 5211;
const BASE = `http://127.0.0.1:${PORT}`;

const SKIP_FACE = process.argv.includes('--skip-face');

// --- demo identity -----------------------------------------------------------
const EMAIL = process.env.DEMO_RECRUITER_EMAIL || 'hr@acmeskills.ng';
const PASSWORD = process.env.DEMO_RECRUITER_PASSWORD || 'AcmeSkills@2026';
const FIRST_NAME = 'Adaeze';
const LAST_NAME = 'Nwosu';
const PHONE = '08039998877';
const NIN = '22113344556';

const COMPANY_NAME = 'Acme Skills Nigeria Limited';
const WEBSITE = 'https://www.acmeskills.ng';
const CORPORATE_EMAIL = 'careers@acmeskills.ng';
const RC_NUMBER = 'RC7788990';

const log = (msg) => console.log(msg);
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
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

// --- throwaway server --------------------------------------------------------
let server = null;
let serverLog = '';
const startServer = async () => {
  server = spawn(process.execPath, ['server.js'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => { serverLog += d.toString(); });
  server.stderr.on('data', (d) => { serverLog += d.toString(); });

  const deadline = Date.now() + 25000;
  for (;;) {
    if (server.exitCode !== null) throw new Error(`server exited early (${server.exitCode}):\n${serverLog.slice(-2000)}`);
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.status === 200) return;
    } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new Error(`server not healthy in 25s:\n${serverLog.slice(-2000)}`);
    await new Promise((r) => setTimeout(r, 300));
  }
};

const stopServer = () => {
  if (server && server.exitCode === null) {
    server.kill();
    if (process.platform === 'win32') {
      try { spawn('taskkill', ['/pid', String(server.pid), '/f', '/t']); } catch { /* best effort */ }
    }
  }
};

// --- wipe previous demo account (idempotent re-seed) --------------------------
const wipeDemo = async () => {
  const existing = await query('SELECT id FROM recruiters WHERE email = $1', [EMAIL]);
  if (existing.rowCount === 0) return false;
  const rid = existing.rows[0].id;

  const companies = await query('SELECT id FROM companies WHERE recruiter_id = $1', [rid]);
  const targets = [rid, ...companies.rows.map((r) => r.id)];
  await query('DELETE FROM verification_checks WHERE target_id = ANY($1::uuid[])', [targets]);

  const media = await query('SELECT storage_key FROM media_objects WHERE owner_id = $1', [rid]);
  for (const r of media.rows) {
    const p = path.resolve(BACKEND_DIR, process.env.STORAGE_ROOT || 'storage/photos', r.storage_key);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  await query('DELETE FROM media_objects WHERE owner_id = $1', [rid]);

  // cascades: companies → job_advertisements → verification_codes → lookups
  await query('DELETE FROM recruiters WHERE id = $1', [rid]);
  return true;
};

// ===========================================================================
const main = async () => {
  log('====================================================');
  log('TRUSTHIRE DEFENSE DEMO — seed fully-verified recruiter');
  log('====================================================\n');

  if (process.env.USE_MOCK_API !== 'true') {
    log('⚠ USE_MOCK_API is not "true" in backend/.env.');
    log('  This script is designed for the LOCAL SANDBOX (mock Dojah/Whois/');
    log('  APIVoid/Resend). Set USE_MOCK_API=true and re-run.');
    process.exit(1);
  }

  const wiped = await wipeDemo();
  log(wiped ? '  (previous demo account wiped — reseeding)\n' : '  (no previous demo account — fresh seed)\n');

  await startServer();
  const phases = [];

  // --- 1. registration (company-domain gate) --------------------------------
  log('[1/9] registration (company-domain email)');
  const reg = await api('POST', '/api/auth/register', {
    body: { email: EMAIL, password: PASSWORD, firstName: FIRST_NAME, lastName: LAST_NAME, phone: PHONE },
  });
  must([200, 201].includes(reg.status), `register failed: ${reg.status} ${JSON.stringify(reg.json)}`);
  const rRow = await query('SELECT id FROM recruiters WHERE email = $1', [EMAIL]);
  must(rRow.rowCount === 1, 'recruiter row missing after register');
  const recruiterId = rRow.rows[0].id;
  log('   ✓ registered ' + EMAIL);

  // --- 2. email OTP ----------------------------------------------------------
  log('[2/9] Phase 1 — email OTP');
  const otpRow = await query('SELECT email_otp FROM recruiters WHERE id = $1', [recruiterId]);
  must(otpRow.rows[0].email_otp, 'no email OTP stored');
  const emailV = await api('POST', '/api/auth/verify-email-otp', { body: { email: EMAIL, otp: otpRow.rows[0].email_otp } });
  must(emailV.status === 200 && emailV.json?.success, `email verify failed: ${emailV.status}`);
  const token = emailV.json?.data?.token;
  must(token, 'no session token');
  phases.push(['Email OTP', 'verified']);
  log('   ✓ verified');

  // --- 3. phone OTP ----------------------------------------------------------
  log('[3/9] Phase 2 — phone OTP (sandbox code 1234)');
  const ps = await api('POST', '/api/verify/phone/send-otp', { token, body: { phoneNumber: PHONE } });
  must(ps.status === 200, `phone send failed: ${ps.status} ${JSON.stringify(ps.json)}`);
  const pv = await api('POST', '/api/verify/phone/verify-otp', { token, body: { otp: '1234' } });
  must(pv.status === 200 && pv.json?.success, `phone verify failed: ${pv.status} ${JSON.stringify(pv.json)}`);
  phases.push(['Phone OTP', 'verified']);
  log('   ✓ verified');

  // --- 4. NIN identity -------------------------------------------------------
  log('[4/9] Phase 3 — NIN identity (mock Dojah, encrypted at rest)');
  const idv = await api('POST', '/api/verify/identity', { token, body: { type: 'nin', number: NIN } });
  must(idv.status === 200 && idv.json?.success, `identity failed: ${idv.status} ${JSON.stringify(idv.json)}`);
  const encRow = await query('SELECT nin_enc FROM recruiters WHERE id = $1', [recruiterId]);
  must(encRow.rows[0].nin_enc && encRow.rows[0].nin_enc.startsWith('v1:'), 'NIN not encrypted at rest');
  phases.push(['NIN identity', 'verified (ciphertext at rest)']);
  log('   ✓ verified, stored as ciphertext');

  // --- 5. face / liveness ----------------------------------------------------
  if (SKIP_FACE) {
    log('[5/9] Phase 4 — face/liveness SKIPPED (--skip-face)');
    phases.push(['Face / liveness', 'SKIPPED (--skip-face) — job will NOT auto-approve']);
  } else {
    log('[5/9] Phase 4 — face / liveness (mock frame path)');
    // Frames must satisfy BOTH gates on this path: the Dojah mock's
    // "realistic capture" size check (>= 5KB base64) and the encrypted
    // photo store's magic-byte sniff (the dashboard self-view photo is
    // served from that store). Noise-filled PNGs are valid images that
    // don't deflate away; each frame is distinct, so the anti-replay
    // identical-frame check passes too.
    const pngChunk = (type, data) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const typeBuf = Buffer.from(type, 'ascii');
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(zlib.crc32(Buffer.concat([typeBuf, data])) >>> 0);
      return Buffer.concat([len, typeBuf, data, crc]);
    };
    const noisyPng = (size = 96) => {
      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(size, 0);
      ihdr.writeUInt32BE(size, 4);
      ihdr[8] = 8; // bit depth
      ihdr[9] = 2; // color type: truecolor RGB
      const rows = [];
      for (let y = 0; y < size; y += 1) {
        // Filter byte 0 (None) + random pixel data
        rows.push(Buffer.concat([Buffer.from([0]), crypto.randomBytes(size * 3)]));
      }
      const idat = zlib.deflateSync(Buffer.concat(rows));
      return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG signature
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', idat),
        pngChunk('IEND', Buffer.alloc(0)),
      ]);
    };
    const mk = () => `data:image/png;base64,${noisyPng().toString('base64')}`;
    const fv = await api('POST', '/api/verify/face', { token, body: { frames: [mk(1), mk(2), mk(3)] } });
    must(fv.status === 200 && fv.json?.success, `face failed: ${fv.status} ${JSON.stringify(fv.json)}`);
    phases.push(['Face / liveness', 'verified']);
    log('   ✓ verified');
  }

  // --- 6. company onboarding -------------------------------------------------
  log('[6/9] company onboarding');
  const co = await api('POST', '/api/company', {
    token,
    body: {
      name: COMPANY_NAME,
      websiteUrl: WEBSITE,
      registrationNumber: RC_NUMBER,
      tinNumber: '21098765432',
      address: '14 Bala Sokoto Road, Asokoro, Abuja',
      industry: 'Education & Training',
    },
  });
  must(co.status === 201, `company create failed: ${co.status} ${JSON.stringify(co.json)}`);
  const companyId = co.json.data.id;
  log('   ✓ company created: ' + COMPANY_NAME);

  // --- 7. corporate email OTP ------------------------------------------------
  log('[7/9] corporate email OTP (' + CORPORATE_EMAIL + ')');
  const cs = await api('POST', `/api/company/${companyId}/corporate-email/send-otp`, {
    token, body: { corporateEmail: CORPORATE_EMAIL },
  });
  must(cs.status === 200, `corporate send failed: ${cs.status} ${JSON.stringify(cs.json)}`);
  const corpOtp = await query('SELECT corporate_email_otp FROM companies WHERE id = $1', [companyId]);
  must(corpOtp.rows[0].corporate_email_otp, 'no corporate OTP stored');
  const cv = await api('POST', `/api/company/${companyId}/corporate-email/verify-otp`, {
    token, body: { otp: corpOtp.rows[0].corporate_email_otp },
  });
  must(cv.status === 200 && cv.json?.success, `corporate verify failed: ${cv.status} ${JSON.stringify(cv.json)}`);
  phases.push(['Corporate email OTP', 'verified']);
  log('   ✓ verified');

  // --- 8. CAC + website (WHOIS/APIVoid/content sandbox) ---------------------
  log('[8/9] CAC + website checks (sandbox providers)');
  const cac = await api('POST', `/api/company/${companyId}/verify/cac`, { token });
  must(cac.status === 200 && cac.json?.success, `CAC failed: ${cac.status} ${JSON.stringify(cac.json)}`);
  phases.push(['CAC registration', 'verified']);
  log('   ✓ CAC verified');
  const web = await api('POST', `/api/company/${companyId}/verify/website`, { token });
  must(web.status === 200 && web.json?.success, `website failed: ${web.status} ${JSON.stringify(web.json)}`);
  phases.push(['Website (WHOIS + APIVoid + content)', 'verified']);
  log('   ✓ website verified (domain age + reputation + content match)');

  // --- 9. the money shot: auto-approved job ---------------------------------
  log('[9/9] job submission → auto-approval');
  const job = await api('POST', '/api/job', {
    token,
    body: {
      companyId,
      title: 'Senior Cloud Engineer (Verified Posting)',
      description:
        'Acme Skills Nigeria Limited is hiring a Senior Cloud Engineer. This posting was auto-approved by TrustHire after all four verification pillars passed with zero flags.',
      location: 'Abuja, Nigeria (Hybrid)',
      employmentType: 'Full-time',
      salaryRange: 'NGN 900,000 - 1,200,000',
      applicationEmail: CORPORATE_EMAIL,
      requirements: ['- 5+ years AWS experience', '- Kubernetes', '- Terraform'],
      benefits: ['- Health insurance', '- Remote-friendly'],
    },
  });
  must(job.status === 201, `job create failed: ${job.status} ${JSON.stringify(job.json)}`);
  const jd = job.json.data;
  if (SKIP_FACE) {
    must(jd.status !== 'approved', 'job auto-approved despite --skip-face — verification gate is broken!');
    log(`   ⚠ job status: ${jd.status} (expected — face was skipped)`);
    phases.push(['Job ad', `${jd.status} (face skipped)`]);
  } else {
    must(jd.status === 'approved',
      `job should AUTO-APPROVE, got "${jd.status}". flags: ${JSON.stringify(jd.flags)}`);
    must(jd.pin && jd.qrCodeUrl, 'approved job missing PIN/QR');
    phases.push(['Job ad', `AUTO-APPROVED — PIN ${jd.pin}`]);
    log('   ✓ AUTO-APPROVED with PIN ' + jd.pin);
  }

  // cross-checks for the dashboard
  const status = await api('GET', '/api/verify/status', { token });
  const checks = status.json?.data?.checks || {};
  if (!SKIP_FACE) {
    must(status.json?.data?.verification_status === 'verified',
      `overall recruiter status not verified: ${JSON.stringify(checks)}`);
  }
  const pub = jd.pin ? await api('GET', `/api/public/verify/${jd.pin}`) : null;
  must(pub && pub.status === 200 && pub.json?.success === true,
    `public PIN lookup failed: ${pub && pub.status}`);

  // --- dashboard --------------------------------------------------------------
  log('');
  log('====================================================');
  log(' DEFENSE DEMO ACCOUNT — READY');
  log('====================================================');
  log(` Recruiter login : ${EMAIL}  /  ${PASSWORD}`);
  log(` Company         : ${COMPANY_NAME}`);
  log(` Website         : ${WEBSITE}`);
  log(` Portal (local)  : ${process.env.FRONTEND_RECRUITER_URL || 'http://localhost:3003'}`);
  log(' ----------------------------------------------------');
  for (const [phase, result] of phases) {
    log(`  ${phase.padEnd(36, '.')} ${result}`);
  }
  log(' ----------------------------------------------------');
  log('  Recruiter status endpoint:');
  for (const [k, v] of Object.entries(checks)) log(`    ${k.padEnd(14)} ${v}`);
  log(`    overall ........ ${status.json?.data?.verification_status}`);
  if (jd.pin) {
    log(`  Public PIN check: ${BASE.replace(String(PORT), '5000')}/api/public/verify/${jd.pin}`);
    log(`  QR code URL    : ${jd.qrCodeUrl}`);
    log(`  Expires        : ${jd.expiresAt}`);
  }
  log('====================================================');
  log(' NOTE: all providers ran in SANDBOX/MOCK mode (USE_MOCK_API=true).');
  log('       Live Dojah/WhoisXML/APIVoid/Resend calls require real keys.');
  log('====================================================');
};

try {
  await main();
  stopServer();
  process.exit(0);
} catch (e) {
  console.error(`\n❌ SEED FAILED: ${e.message}`);
  if (serverLog) console.error(`--- server log tail ---\n${serverLog.slice(-2000)}`);
  stopServer();
  process.exit(1);
}
