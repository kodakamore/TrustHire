// ===========================================================================
// E2E SECURITY REGRESSION SUITE — boots the REAL server and drives the audit
// hardening (C1–C13) plus the FULL verification funnel over HTTP against the
// live database.
//
//   node tests/e2e.security.test.js
//
// What it proves:
//   • Generic free emails (gmail…) are rejected at recruiter registration (C8)
//   • Mass-assignment on company/job create+update is ignored (C1)
//   • corporate_email_otp never appears in company GET responses (C2)
//   • Email OTP: 5 wrong guesses → 429, resend resets the counter (C6)
//   • Corporate OTP: 5 wrong guesses → 429, resend resets the counter (C6)
//   • Phone OTP: per-account 60s send cooldown → 429 (C7)
//   • Phone OTP: changing a verified number drops the verified flag (C7)
//   • A job edit cannot forge status/flags/recruiter_id, and a public
//     application_email is re-rejected on edit (C1/C9)
//   • FULL FUNNEL: email → phone → NIN → face → company → CAC → website →
//     corporate email → job, and the job AUTO-APPROVES with a QR/PIN.
//
// Uses USE_MOCK_API=true (already set in .env) so no external API is called.
// Admin registration lockdown (C3) is covered by e2e.test.js; the SSRF guard
// (C4) and public-suffix bypass (C8) are covered by tests/core.test.js.
// ===========================================================================

import 'dotenv/config';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../config/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, '..');
const PORT = process.env.E2E_SECURITY_PORT || 5210;
const BASE = `http://127.0.0.1:${PORT}`;

const STAMP = Date.now();
// Digits-only stamp: the whois/apivoid/content SANDBOX mocks deliberately
// flag domains containing 'new'/'temp'/'unrelated'/'mismatch', so a
// letters-free stamp keeps this funnel deterministic.
const DOMAIN = `acme${STAMP}.ng`;
const EMAIL = `hr@${DOMAIN}`;
const CORPORATE_EMAIL = `careers@${DOMAIN}`;
const WEBSITE = `https://www.${DOMAIN}`;
const COMPANY_NAME = 'Acme Holdings Nigeria Limited';
const LOCK_EMAIL = `lock${STAMP}@lockco.test`;
const GMAIL = `sec-${STAMP}@gmail.com`;
const NIN = '55544433322';
const PHONE_A = '08012345678';
const PHONE_B = '08098765432';

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
      if (r.status === 200) return;
    } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new Error(`server did not become healthy in 25s:\n${serverLog.slice(-2000)}`);
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

// ---------------------------------------------------------------------------
// fixtures: recruiters (cascade companies/jobs/codes), checks, media
// ---------------------------------------------------------------------------
let recruiterId = null;
let lockRecruiterId = null;
let companyId = null;

const cleanup = async () => {
  try {
    if (recruiterId) {
      const checks = [recruiterId];
      if (companyId) checks.push(companyId);
      await query('DELETE FROM verification_checks WHERE target_id = ANY($1::uuid[])', [checks]);

      const media = await query('SELECT storage_key FROM media_objects WHERE owner_id = $1', [recruiterId]);
      for (const r of media.rows) {
        const p = path.resolve(BACKEND_DIR, process.env.STORAGE_ROOT || 'storage/photos', r.storage_key);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      await query('DELETE FROM media_objects WHERE owner_id = $1', [recruiterId]);
    }
    if (lockRecruiterId) {
      await query('DELETE FROM verification_checks WHERE target_id = $1', [lockRecruiterId]);
    }
    if (recruiterId) await query('DELETE FROM recruiters WHERE id = $1', [recruiterId]);
    if (lockRecruiterId) await query('DELETE FROM recruiters WHERE id = $1', [lockRecruiterId]);
    console.log('  (test fixtures removed)');
  } catch (e) {
    console.log(`  ! cleanup warning: ${e.message}`);
  }
};

// ===========================================================================
const main = async () => {
  console.log('====================================================');
  console.log('TRUSTHIRE E2E SECURITY REGRESSION SUITE');
  console.log('====================================================\n');

  console.log('[boot]');
  await startServer();
  await step('server boots and reports healthy', async () => {
    const r = await api('GET', '/health');
    must(r.status === 200, `expected 200, got ${r.status}`);
  });

  // --- registration gates ---------------------------------------------------
  console.log('\n[registration gates]');
  await step('generic free email rejected at registration (C8)', async () => {
    const r = await api('POST', '/api/auth/register', {
      body: { email: GMAIL, password: 'SecPass123!', firstName: 'Free', lastName: 'Mail' },
    });
    must(r.status === 400, `gmail register should 400, got ${r.status}`);
    must(String(r.json?.error || '').toLowerCase().includes('company email'),
      `unexpected error: ${r.json?.error}`);
  });

  await step('register recruiter on company domain', async () => {
    const r = await api('POST', '/api/auth/register', {
      body: { email: EMAIL, password: 'SecPass123!', firstName: 'Acme', lastName: 'Recruiter', phone: PHONE_A },
    });
    must([200, 201].includes(r.status), `register failed: ${r.status} ${JSON.stringify(r.json)}`);
    const row = await query('SELECT id FROM recruiters WHERE email = $1', [EMAIL]);
    must(row.rowCount === 1, 'recruiter row not created');
    recruiterId = row.rows[0].id;
  });

  let token = null;
  await step('verify email via OTP', async () => {
    const otp = await query('SELECT email_otp FROM recruiters WHERE id = $1', [recruiterId]);
    const code = otp.rows[0].email_otp;
    must(code, 'no email OTP stored');
    const r = await api('POST', '/api/auth/verify-email-otp', { body: { email: EMAIL, otp: code } });
    must(r.status === 200 && r.json?.success, `otp verify failed: ${r.status}`);
    token = r.json?.data?.token;
    must(token, 'no session token issued');
  });

  // --- email OTP attempt limit (C6) ----------------------------------------
  console.log('\n[email OTP attempt limit]');
  let lockEmailVerified = false;
  await step('register throwaway recruiter for lockout test', async () => {
    const r = await api('POST', '/api/auth/register', {
      body: { email: LOCK_EMAIL, password: 'SecPass123!', firstName: 'Lock', lastName: 'Test' },
    });
    must([200, 201].includes(r.status), `register failed: ${r.status}`);
    const row = await query('SELECT id FROM recruiters WHERE email = $1', [LOCK_EMAIL]);
    must(row.rowCount === 1, 'lock recruiter row not created');
    lockRecruiterId = row.rows[0].id;
  });

  await step('5 wrong email OTPs each rejected, 6th attempt locked (429)', async () => {
    for (let i = 1; i <= 5; i++) {
      const r = await api('POST', '/api/auth/verify-email-otp', { body: { email: LOCK_EMAIL, otp: '000000' } });
      must(r.status === 400, `wrong OTP #${i} should 400, got ${r.status}`);
    }
    const real = await query('SELECT email_otp FROM recruiters WHERE id = $1', [lockRecruiterId]);
    const r = await api('POST', '/api/auth/verify-email-otp', { body: { email: LOCK_EMAIL, otp: real.rows[0].email_otp } });
    must(r.status === 429, `correct OTP after lockout should 429, got ${r.status}`);
    const row = await query('SELECT is_email_verified FROM recruiters WHERE id = $1', [lockRecruiterId]);
    must(row.rows[0].is_email_verified !== true, 'lockout did not hold — account verified anyway');
  });

  await step('resend resets the counter and the real code works', async () => {
    const send = await api('POST', '/api/auth/resend-verification', { body: { email: LOCK_EMAIL } });
    must(send.status === 200, `resend failed: ${send.status}`);
    const real = await query('SELECT email_otp FROM recruiters WHERE id = $1', [lockRecruiterId]);
    const r = await api('POST', '/api/auth/verify-email-otp', { body: { email: LOCK_EMAIL, otp: real.rows[0].email_otp } });
    must(r.status === 200 && r.json?.success, `verify after resend failed: ${r.status} ${JSON.stringify(r.json)}`);
    lockEmailVerified = true;
  });

  // --- phone OTP policy (C7) ------------------------------------------------
  console.log('\n[phone OTP policy]');
  await step('send phone OTP ok, wrong code rejected', async () => {
    const send = await api('POST', '/api/verify/phone/send-otp', { token, body: { phoneNumber: PHONE_A } });
    must(send.status === 200, `send-otp failed: ${send.status}`);
    const bad = await api('POST', '/api/verify/phone/verify-otp', { token, body: { otp: '000000' } });
    must(bad.status === 400, `wrong OTP should 400, got ${bad.status}`);
  });

  await step('immediate resend blocked by per-account cooldown (429) (C7)', async () => {
    const r = await api('POST', '/api/verify/phone/send-otp', { token, body: { phoneNumber: PHONE_A } });
    must(r.status === 429, `cooldown should 429, got ${r.status}`);
  });

  await step('correct code verifies phone', async () => {
    const r = await api('POST', '/api/verify/phone/verify-otp', { token, body: { otp: '1234' } });
    must(r.status === 200 && r.json?.success, `verify failed: ${r.status}`);
    const row = await query('SELECT is_phone_verified FROM recruiters WHERE id = $1', [recruiterId]);
    must(row.rows[0].is_phone_verified === true, 'phone not marked verified');
  });

  await step('changing a verified number drops the verified flag (C7)', async () => {
    // Clear the 60s send cooldown directly (tests must not sleep 60s).
    await query('UPDATE recruiters SET phone_otp_sent_at = NULL WHERE id = $1', [recruiterId]);
    const send = await api('POST', '/api/verify/phone/send-otp', { token, body: { phoneNumber: PHONE_B } });
    must(send.status === 200, `send to new number failed: ${send.status} ${JSON.stringify(send.json)}`);
    const row = await query('SELECT is_phone_verified FROM recruiters WHERE id = $1', [recruiterId]);
    must(row.rows[0].is_phone_verified === false, 'is_phone_verified not reset on number change');
    // Prove the NEW number with its code.
    const v = await api('POST', '/api/verify/phone/verify-otp', { token, body: { otp: '1234' } });
    must(v.status === 200 && v.json?.success, `re-verify failed: ${v.status}`);
    const after = await query('SELECT is_phone_verified, phone_number FROM recruiters WHERE id = $1', [recruiterId]);
    must(after.rows[0].is_phone_verified === true, 'phone not re-verified for new number');
    must(after.rows[0].phone_number.replace(/\D/g, '') === PHONE_B, 'phone_number not updated');
  });

  // --- identity + face ------------------------------------------------------
  console.log('\n[identity & face]');
  await step('identity (NIN) verification succeeds', async () => {
    const r = await api('POST', '/api/verify/identity', { token, body: { type: 'nin', number: NIN } });
    must(r.status === 200 && r.json?.success, `identity verify failed: ${r.status} ${JSON.stringify(r.json)}`);
  });

  await step('face: liveness + face-match passes', async () => {
    const r = await api('POST', '/api/verify/face', {
      token,
      body: { frames: [makeFrame(1), makeFrame(2), makeFrame(3)] },
    });
    must(r.status === 200 && r.json?.success, `face verify failed: ${r.status} ${JSON.stringify(r.json)}`);
    must(r.json.data?.isSuccessful === true, 'face verification did not pass');
  });

  await step('verification status fully verified', async () => {
    const r = await api('GET', '/api/verify/status', { token });
    must(r.status === 200, `status failed: ${r.status}`);
    must(r.json?.data?.verification_status === 'verified',
      `overall status: ${r.json?.data?.verification_status} ${JSON.stringify(r.json?.data?.checks)}`);
  });

  // --- company: mass-assignment (C1) + OTP stripping (C2) -------------------
  console.log('\n[company hardening]');
  await step('company create ignores verification-flag mass-assignment (C1)', async () => {
    const r = await api('POST', '/api/company', {
      token,
      body: {
        name: COMPANY_NAME,
        websiteUrl: WEBSITE,
        registrationNumber: `RC${STAMP}`,
        tinNumber: '12345678901',
        address: '12 Admiralty Way, Lekki, Lagos',
        industry: 'Software',
        // forbidden keys — must be ignored
        is_corporate_email_verified: true,
        verification_status: 'verified',
        is_cac_verified: true,
        recruiter_id: '00000000-0000-0000-0000-000000000000',
      },
    });
    must(r.status === 201, `create failed: ${r.status} ${JSON.stringify(r.json)}`);
    const d = r.json.data;
    must(d.is_corporate_email_verified !== true, 'is_corporate_email_verified set from create body');
    must(d.verification_status !== 'verified', 'verification_status set from create body');
    must(d.is_cac_verified !== true, 'is_cac_verified set from create body');
    companyId = d.id;
    const row = await query('SELECT recruiter_id, verification_status FROM companies WHERE id = $1', [companyId]);
    must(row.rows[0].recruiter_id === recruiterId, 'company recruiter_id wrong in DB');
    must(row.rows[0].verification_status !== 'verified', 'verification_status forged in DB');
  });

  await step('company update ignores verification-flag mass-assignment (C1)', async () => {
    const r = await api('PUT', `/api/company/${companyId}`, {
      token,
      body: {
        industry: 'Fintech',
        is_corporate_email_verified: true,
        verification_status: 'verified',
        corporate_email_otp: '123456',
        is_dns_verified: true,
      },
    });
    must(r.status === 200, `update failed: ${r.status} ${JSON.stringify(r.json)}`);
    must(r.json.data.industry === 'Fintech', 'allowlisted field (industry) not applied');
    must(r.json.data.is_corporate_email_verified !== true, 'is_corporate_email_verified forged by update');
    must(r.json.data.verification_status !== 'verified', 'verification_status forged by update');
    const row = await query('SELECT is_dns_verified, corporate_email_otp FROM companies WHERE id = $1', [companyId]);
    must(row.rows[0].is_dns_verified === false, 'is_dns_verified forged by update');
    must(!row.rows[0].corporate_email_otp, 'corporate_email_otp written by update');
  });

  let corpOtp = null;
  await step('corporate send ok; GET responses never expose the OTP (C2/C10)', async () => {
    const send = await api('POST', `/api/company/${companyId}/corporate-email/send-otp`, {
      token,
      body: { corporateEmail: CORPORATE_EMAIL },
    });
    must(send.status === 200, `corporate send failed: ${send.status} ${JSON.stringify(send.json)}`);
    corpOtp = send.json?.data?.debugOtp;
    must(corpOtp, 'debugOtp missing — EXPOSE_DEBUG_OTP not enabled in this environment');
    for (const url of [`/api/company/${companyId}`, '/api/company', `/api/company/${companyId}/status`]) {
      const r = await api('GET', url, { token });
      must(r.status === 200, `GET ${url} failed: ${r.status}`);
      const body = JSON.stringify(r.json);
      must(!body.includes('corporate_email_otp'), `corporate_email_otp key leaked by GET ${url}`);
      must(!body.includes(String(corpOtp)), `OTP VALUE leaked by GET ${url}`);
    }
  });

  await step('5 wrong corporate OTPs locked (429), resend resets (C6)', async () => {
    for (let i = 1; i <= 5; i++) {
      const r = await api('POST', `/api/company/${companyId}/corporate-email/verify-otp`, {
        token,
        body: { otp: '999999' },
      });
      must(r.status === 400, `wrong OTP #${i} should 400, got ${r.status}`);
    }
    const r = await api('POST', `/api/company/${companyId}/corporate-email/verify-otp`, {
      token,
      body: { otp: corpOtp },
    });
    must(r.status === 429, `locked OTP (even correct) should 429, got ${r.status}`);
    const row = await query('SELECT is_corporate_email_verified FROM companies WHERE id = $1', [companyId]);
    must(row.rows[0].is_corporate_email_verified !== true, 'lockout did not hold');

    const resend = await api('POST', `/api/company/${companyId}/corporate-email/send-otp`, {
      token,
      body: { corporateEmail: CORPORATE_EMAIL },
    });
    must(resend.status === 200, `resend failed: ${resend.status}`);
    corpOtp = resend.json?.data?.debugOtp;
    const v = await api('POST', `/api/company/${companyId}/corporate-email/verify-otp`, {
      token,
      body: { otp: corpOtp },
    });
    must(v.status === 200 && v.json?.success, `verify after resend failed: ${v.status} ${JSON.stringify(v.json)}`);
    const after = await query('SELECT is_corporate_email_verified FROM companies WHERE id = $1', [companyId]);
    must(after.rows[0].is_corporate_email_verified === true, 'corporate email not verified');
  });

  // --- job A: pre-verification job stays pending + edit cannot forge (C1) --
  console.log('\n[job edit hardening]');
  let jobAId = null;
  await step('job created before CAC/domain checks lands in pending with critical flags', async () => {
    const r = await api('POST', '/api/job', {
      token,
      body: {
        companyId,
        title: 'Security Regression Analyst',
        description: 'Temporary posting used to prove the edit-hardening rules.',
        location: 'Lagos, Nigeria',
        employmentType: 'Full-time',
        salaryRange: 'NGN 400,000 - 600,000',
        applicationEmail: CORPORATE_EMAIL,
        requirements: ['- SQL', '- Linux'],
        benefits: ['- Health insurance'],
      },
    });
    must(r.status === 201, `create failed: ${r.status} ${JSON.stringify(r.json)}`);
    const d = r.json.data;
    must(d.status === 'pending', `expected pending (verification incomplete), got ${d.status}`);
    must(Array.isArray(d.flags) && d.flags.some((f) => f.severity === 'critical'),
      'expected critical flags while company is unverified');
    jobAId = d.id;
  });

  await step('job update cannot forge status/flags/recruiter_id (C1/C9)', async () => {
    const r = await api('PUT', `/api/job/${jobAId}`, {
      token,
      body: {
        title: 'Security Regression Analyst (edited)',
        status: 'approved',
        flags: [],
        recruiter_id: '00000000-0000-0000-0000-000000000000',
        data_hash: 'deadbeef',
      },
    });
    must(r.status === 200, `edit failed: ${r.status} ${JSON.stringify(r.json)}`);
    const row = await query('SELECT status, flags, recruiter_id, title FROM job_advertisements WHERE id = $1', [jobAId]);
    must(row.rows[0].status === 'pending', `status forged to "${row.rows[0].status}"`);
    must(row.rows[0].recruiter_id === recruiterId, 'recruiter_id forged by edit');
    must(row.rows[0].title === 'Security Regression Analyst (edited)', 'allowlisted field (title) not applied');
    must(Array.isArray(row.rows[0].flags) && row.rows[0].flags.length > 0,
      'flags wiped/forged by edit — re-verification did not run');
    must(row.rows[0].flags.some((f) => f.severity === 'critical'),
      'fresh flags lost the critical findings — edit re-verification did not run');
  });

  await step('job update re-rejects a public application_email (C1)', async () => {
    const r = await api('PUT', `/api/job/${jobAId}`, {
      token,
      body: { application_email: 'apply@gmail.com' },
    });
    must(r.status === 400, `public application_email should 400 on edit, got ${r.status}`);
  });

  // --- complete company verification, then the full funnel ------------------
  console.log('\n[full funnel → auto-approval]');
  await step('CAC verification passes (mock Dojah sandbox)', async () => {
    const r = await api('POST', `/api/company/${companyId}/verify/cac`, { token });
    must(r.status === 200 && r.json?.success, `CAC verify failed: ${r.status} ${JSON.stringify(r.json)}`);
    const row = await query('SELECT is_cac_verified, verification_status FROM companies WHERE id = $1', [companyId]);
    must(row.rows[0].is_cac_verified === true, 'is_cac_verified not set');
  });

  await step('website verification passes (whois + apivoid + content sandbox)', async () => {
    const r = await api('POST', `/api/company/${companyId}/verify/website`, { token });
    must(r.status === 200 && r.json?.success, `website verify failed: ${r.status} ${JSON.stringify(r.json)}`);
    const row = await query('SELECT is_domain_verified FROM companies WHERE id = $1', [companyId]);
    must(row.rows[0].is_domain_verified === true, 'is_domain_verified not set');
  });

  let jobBId = null;
  let jobBPin = null;
  await step('fully-verified funnel: job AUTO-APPROVED with QR/PIN', async () => {
    const r = await api('POST', '/api/job', {
      token,
      body: {
        companyId,
        title: 'Senior Cloud Engineer',
        description: 'A fully verified posting that must clear all four pillars without manual review.',
        location: 'Abuja, Nigeria',
        employmentType: 'Full-time',
        salaryRange: 'NGN 900,000 - 1,200,000',
        applicationEmail: CORPORATE_EMAIL,
        requirements: ['- AWS', '- Kubernetes'],
        benefits: ['- Remote-friendly'],
      },
    });
    must(r.status === 201, `create failed: ${r.status} ${JSON.stringify(r.json)}`);
    const d = r.json.data;
    must(d.status === 'approved',
      `expected auto-approval, got "${d.status}". flags: ${JSON.stringify(d.flags)}`);
    must(Array.isArray(d.flags) && !d.flags.some((f) => f.severity === 'critical' || f.severity === 'warning'),
      `unexpected blocking flags: ${JSON.stringify(d.flags)}`);
    must(d.pin && /^VRF-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(d.pin), `bad PIN: ${d.pin}`);
    must(d.qrCodeUrl, 'no QR code URL returned');
    must(d.expiresAt, 'no expiry returned');
    jobBId = d.id;
    jobBPin = d.pin;
  });

  await step('approved job PIN resolves through the public lookup', async () => {
    const r = await api('GET', `/api/public/verify/${jobBPin}`);
    must(r.status === 200 && r.json?.success === true,
      `public PIN lookup failed: ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`);
  });

};

const finish = async () => {
  stopServer();
  await cleanup();
  const failed = results.filter((r) => !r.ok);
  console.log('\n====================================================');
  if (failed.length === 0) {
    console.log(`✅ ALL ${results.length} SECURITY E2E STEPS PASSED`);
  } else {
    console.log(`❌ ${failed.length}/${results.length} SECURITY E2E STEPS FAILED`);
    for (const f of failed) console.log(`   ✗ ${f.name}\n     ${f.err}`);
  }
  console.log('====================================================');
  process.exit(failed.length === 0 ? 0 : 1);
};

process.on('SIGINT', async () => { await finish(); });
process.on('unhandledRejection', (e) => {
  console.error('UNHANDLED REJECTION:', e);
});

try {
  await main();
} catch (e) {
  console.error(`\nFATAL: ${e.message}`);
  if (serverLog) console.error(`--- server log tail ---\n${serverLog.slice(-2000)}`);
  results.push({ name: 'suite bootstrap', ok: false, err: e.message });
}
await finish();
