// ===========================================================================
// WORKFLOW E2E — exercises the full report lifecycle against the REAL server
// and live database:
//
//   intake (categories/severity/auto-escalate)
//     -> Admin review (side-by-side detail, assignment)
//       -> QR/PIN CLONE handling (compromised -> reissue -> recruiter safe)
//         -> recruiter-fault handling (revoke_verification)
//           -> role enforcement (Admin vs Super Admin)
//             -> account sanctions (suspend -> blocked -> reactivate)
//
// Fixtures are inserted directly (recruiter + company + approved job +
// active PIN) so the test starts from a known-good verified advert.
// Run: node tests/e2e.workflow.test.js
// ===========================================================================

import 'dotenv/config';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { query } from '../config/database.js';
import { hashJobData } from '../services/hash.service.js';
import { generatePIN } from '../utils/pinGenerator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, '..');
const PORT = process.env.WF_PORT || 5299;
const BASE = `http://127.0.0.1:${PORT}`;

const STAMP = Date.now();
const RECR_EMAIL = `wf-recruiter-${STAMP}@test.local`;
const ADMIN_EMAIL = `wf-admin-${STAMP}@test.local`;
const SUPER_EMAIL = `wf-super-${STAMP}@test.local`;
const WF_PASSWORD = 'WorkflowTest123!';
const OLD_PIN = generatePIN();

const ids = { recruiter: null, company: null, job: null, code: null, admin: null, super: null };
let newPin = null;

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
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

let server = null;
const startServer = async () => {
  server = spawn(process.execPath, ['server.js'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, PORT: String(PORT), DISABLE_RATE_LIMIT: 'true' },
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
    // Order matters: reports reference codes (no cascade) -> delete first.
    if (ids.job) await query('DELETE FROM reports WHERE job_ad_id = $1', [ids.job]);
    if (ids.job) await query('DELETE FROM verification_codes WHERE job_ad_id = $1', [ids.job]);
    if (ids.job) await query('DELETE FROM job_advertisements WHERE id = $1', [ids.job]);
    if (ids.recruiter) await query('DELETE FROM recruiters WHERE id = $1', [ids.recruiter]);
    if (ids.admin) await query('DELETE FROM admins WHERE id = $1', [ids.admin]);
    if (ids.super) await query('DELETE FROM admins WHERE id = $1', [ids.super]);
    console.log('  (workflow fixtures removed)');
  } catch (e) {
    console.log(`  ! cleanup warning: ${e.message}`);
  }
};

const seedFixture = async () => {
  const passwordHash = await bcrypt.hash(WF_PASSWORD, 10);

  const rec = await query(
    `INSERT INTO recruiters (email, password_hash, first_name, last_name, is_email_verified, is_phone_verified, is_identity_verified, is_face_verified, verification_status)
     VALUES ($1, $2, 'Workflow', 'Tester', true, true, true, true, 'verified')
     RETURNING id`,
    [RECR_EMAIL, passwordHash],
  );
  ids.recruiter = rec.rows[0].id;

  const co = await query(
    `INSERT INTO companies (recruiter_id, name, website_url, is_cac_verified, is_domain_verified, is_corporate_email_verified, corporate_email, verification_status)
     VALUES ($1, 'Workflow Test Co', 'https://wf-test.ng', true, true, true, 'hr@wf-test.ng', 'verified')
     RETURNING id`,
    [ids.recruiter],
  );
  ids.company = co.rows[0].id;

  const jobFields = {
    title: 'Workflow Test Role',
    description: 'A verified role used by the workflow test suite.',
    company_id: ids.company,
    location: 'Lagos',
    employment_type: 'Full-time',
    salary_range: 'N500,000/month',
  };
  const dataHash = hashJobData(jobFields);
  const job = await query(
    `INSERT INTO job_advertisements (recruiter_id, company_id, title, description, location, employment_type, salary_range, data_hash, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'approved')
     RETURNING id`,
    [ids.recruiter, ids.company, jobFields.title, jobFields.description, jobFields.location, jobFields.employment_type, jobFields.salary_range, dataHash],
  );
  ids.job = job.rows[0].id;

  const code = await query(
    `INSERT INTO verification_codes (job_ad_id, pin, qr_code_url, expires_at)
     VALUES ($1, $2, $3, now() + interval '90 days')
     RETURNING id`,
    [ids.job, OLD_PIN, `${process.env.FRONTEND_URL || 'http://localhost:3000'}/v/${OLD_PIN}`],
  );
  ids.code = code.rows[0].id;
};

// ===========================================================================
const main = async () => {
  console.log('====================================================');
  console.log('TRUSTHIRE WORKFLOW E2E (reports -> findings -> sanctions)');
  console.log('====================================================\n');

  console.log('[boot + fixture]');
  await startServer();
  await seedFixture();
  await step('server healthy + verified advert seeded', async () => {
    const r = await api('GET', '/health');
    must(r.status === 200, `health ${r.status}`);
    must(ids.job && ids.code, 'fixture missing');
  });

  // --- public lookup --------------------------------------------------------
  console.log('\n[public lookup]');
  await step('active PIN -> verified_valid + integrity verified', async () => {
    const r = await api('GET', `/api/public/verify/${OLD_PIN}`);
    must(r.status === 200 && r.json?.success, `lookup failed: ${r.status}`);
    const d = r.json.data;
    must(d.status === 'verified_valid', `status: ${d.status}`);
    must(d.integrity === 'verified', `integrity: ${d.integrity}`);
    must(d.job?.title === 'Workflow Test Role', 'snapshot title missing');
    must(!JSON.stringify(d).includes('password_hash'), 'password_hash leaked');
  });

  // --- intake ---------------------------------------------------------------
  console.log('\n[report intake]');
  let reportOpenId = null;
  let reportHighId = null;

  await step('detail_mismatch -> open + medium + code linked + observed stored', async () => {
    const r = await api('POST', '/api/public/report', {
      body: {
        jobAdId: OLD_PIN,
        reporterEmail: 'seeker@test.local',
        category: 'detail_mismatch',
        reportReason: 'Details do not match the verified advert',
        description: 'Salary differs from the poster',
        observedContent: { title: 'Different Role', company: 'Other Co', salary: 'N5,000,000', url: 'https://scam.example/job' },
      },
    });
    must(r.status === 201 && r.json?.success, `report failed: ${r.status} ${JSON.stringify(r.json)}`);
    reportOpenId = r.json.data.id;
    must(r.json.data.status === 'open', `expected open, got ${r.json.data.status}`);
    must(r.json.data.severity === 'medium', `expected medium, got ${r.json.data.severity}`);

    const row = await query('SELECT * FROM reports WHERE id = $1', [reportOpenId]);
    must(row.rows[0].verification_code_id === ids.code, 'verification_code_id not linked at intake');
    must(row.rows[0].observed_content?.company === 'Other Co', 'observed_content not stored');
  });

  await step('fee_requested -> auto-escalated + high severity', async () => {
    const r = await api('POST', '/api/public/report', {
      body: {
        jobAdId: OLD_PIN,
        category: 'fee_requested',
        reportReason: 'Looks like a scam / requests money',
        description: 'Asked me to pay 5000 processing fee',
      },
    });
    must(r.status === 201, `report failed: ${r.status}`);
    reportHighId = r.json.data.id;
    must(r.json.data.severity === 'high', `severity: ${r.json.data.severity}`);
    must(r.json.data.status === 'escalated', `status: ${r.json.data.status}`);
  });

  await step('unknown PIN report -> 400', async () => {
    const r = await api('POST', '/api/public/report', {
      body: { jobAdId: 'VRF-ZZZZ-ZZZZ', category: 'other', reportReason: 'Other', description: 'x' },
    });
    must(r.status === 400, `expected 400, got ${r.status}`);
  });

  // --- admin review ---------------------------------------------------------
  console.log('\n[admin review]');
  let adminToken = null;
  let superToken = null;

  await step('register Admin + Super Admin', async () => {
    const a = await api('POST', '/api/auth/admin/register', { body: { email: ADMIN_EMAIL, password: WF_PASSWORD, role: 'admin' } });
    must([200, 201].includes(a.status) && a.json?.data?.token, `admin register: ${a.status}`);
    adminToken = a.json.data.token;
    const row = await query('SELECT id FROM admins WHERE email = $1', [ADMIN_EMAIL]);
    ids.admin = row.rows[0].id;

    const s = await api('POST', '/api/auth/admin/register', { body: { email: SUPER_EMAIL, password: WF_PASSWORD, role: 'super_admin' } });
    must([200, 201].includes(s.status) && s.json?.data?.token, `super register: ${s.status}`);
    superToken = s.json.data.token;
    const row2 = await query('SELECT id FROM admins WHERE email = $1', [SUPER_EMAIL]);
    ids.super = row2.rows[0].id;
  });

  await step('list reports includes both with filters', async () => {
    const r = await api('GET', '/api/admin/reports', { token: adminToken });
    must(r.status === 200 && Array.isArray(r.json?.data), `list failed: ${r.status}`);
    const idsFound = r.json.data.map((x) => x.id);
    must(idsFound.includes(reportOpenId) && idsFound.includes(reportHighId), 'reports not listed');
    const hi = await api('GET', '/api/admin/reports?severity=high', { token: adminToken });
    must(hi.json.data.every((x) => x.severity === 'high'), 'severity filter broken');
  });

  await step('detail = side-by-side payload (snapshot + code + observed)', async () => {
    const r = await api('GET', `/api/admin/reports/${reportOpenId}`, { token: adminToken });
    must(r.status === 200, `detail failed: ${r.status}`);
    const d = r.json.data;
    must(d.job?.title === 'Workflow Test Role', 'job snapshot missing');
    must(d.code?.pin === OLD_PIN, 'code missing from detail');
    must(d.recruiter?.email === RECR_EMAIL, 'recruiter missing from detail');
    must(d.report?.observed_content?.company === 'Other Co', 'observed_content missing from detail');
  });

  await step('start review -> under_review + assigned to Admin', async () => {
    const r = await api('PUT', `/api/admin/report/${reportOpenId}`, {
      token: adminToken,
      body: { status: 'under_review' },
    });
    must(r.status === 200, `update failed: ${r.status}`);
    must(r.json.data.status === 'under_review', `status: ${r.json.data.status}`);
    must(r.json.data.assigned_to === ids.admin, 'assigned_to not set');
  });

  // --- role enforcement -----------------------------------------------------
  console.log('\n[chain of responsibility]');
  await step('Admin CANNOT resolve with account_sanction (403)', async () => {
    const r = await api('PUT', `/api/admin/report/${reportOpenId}`, {
      token: adminToken,
      body: { finding: 'recruiter_misrepresentation', resolutionAction: 'account_sanction' },
    });
    must(r.status === 403, `expected 403, got ${r.status}`);
  });

  await step('Admin CANNOT change recruiter account_status (403)', async () => {
    const r = await api('POST', `/api/admin/recruiters/${ids.recruiter}/status`, {
      token: adminToken,
      body: { status: 'suspended', reason: 'not allowed' },
    });
    must(r.status === 403, `expected 403, got ${r.status}`);
  });

  await step('resolution without finding -> 400', async () => {
    const r = await api('PUT', `/api/admin/report/${reportOpenId}`, {
      token: adminToken,
      body: { resolutionAction: 'no_action' },
    });
    must(r.status === 400, `expected 400, got ${r.status}`);
  });

  // --- QR/PIN clone handling ------------------------------------------------
  console.log('\n[QR/PIN clone: compromised -> reissue -> recruiter protected]');
  await step('compromise burns old code and reissues new PIN', async () => {
    const r = await api('POST', `/api/admin/reports/${reportOpenId}/compromise`, {
      token: adminToken,
      body: { reason: 'QR copied onto a fake advert' },
    });
    must(r.status === 200 && r.json?.success, `compromise failed: ${r.status} ${JSON.stringify(r.json)}`);
    const reissue = r.json.data.reissue;
    must(reissue.oldPin === OLD_PIN, `oldPin: ${reissue.oldPin}`);
    must(reissue.newPin && reissue.newPin !== OLD_PIN, 'newPin missing/same');
    newPin = reissue.newPin;

    const old = await query('SELECT status, is_active FROM verification_codes WHERE id = $1', [ids.code]);
    must(old.rows[0].status === 'compromised', `old code status: ${old.rows[0].status}`);
    must(old.rows[0].is_active === false, 'old code still active');
  });

  await step('exactly ONE active code per job (invariant)', async () => {
    const r = await query(`SELECT COUNT(*) AS n FROM verification_codes WHERE job_ad_id = $1 AND status = 'active'`, [ids.job]);
    must(Number(r.rows[0].n) === 1, `active codes: ${r.rows[0].n}`);
  });

  await step('old PIN -> compromised status, recruiter-protected wording, snapshot intact', async () => {
    const r = await api('GET', `/api/public/verify/${OLD_PIN}`);
    must(r.status === 200, `lookup failed: ${r.status}`);
    const d = r.json.data;
    must(d.status === 'compromised', `status: ${d.status}`);
    must(/intact/i.test(d.message), 'message does not protect the recruiter');
    must(/cloned|another advert|misused/i.test(d.message), 'message does not warn about cloning');
    must(d.job?.title === 'Workflow Test Role', 'verified snapshot must still be shown');
  });

  await step('new PIN -> verified_valid again', async () => {
    const r = await api('GET', `/api/public/verify/${newPin}`);
    must(r.status === 200, `lookup failed: ${r.status}`);
    must(r.json.data.status === 'verified_valid', `status: ${r.json.data.status}`);
  });

  await step('recruiter + advert untouched by the clone response', async () => {
    const rec = await query('SELECT account_status FROM recruiters WHERE id = $1', [ids.recruiter]);
    must(rec.rows[0].account_status === 'active', `recruiter status: ${rec.rows[0].account_status}`);
    const job = await query('SELECT status FROM job_advertisements WHERE id = $1', [ids.job]);
    must(job.rows[0].status === 'approved', `job status: ${job.rows[0].status}`);
  });

  await step('Admin resolves report: finding + compromise_reissue', async () => {
    const r = await api('PUT', `/api/admin/report/${reportOpenId}`, {
      token: adminToken,
      body: { finding: 'credential_misuse', resolutionAction: 'compromise_reissue', adminNotes: 'Confirmed cloned' },
    });
    // Code already burned above -> reissue runs again (reissues a THIRD code);
    // the point here is the resolution fields land correctly.
    must(r.status === 200, `resolve failed: ${r.status} ${JSON.stringify(r.json)}`);
    must(r.json.data.finding === 'credential_misuse', `finding: ${r.json.data.finding}`);
    must(r.json.data.resolution_action === 'compromise_reissue', `action: ${r.json.data.resolution_action}`);
    must(r.json.data.status === 'resolved', `status: ${r.json.data.status}`);
    must(r.json.data.resolved_by === ids.admin, 'resolved_by not set');
    if (r.json.sideEffect?.reissue?.newPin) newPin = r.json.sideEffect.reissue.newPin;
    const active = await query(`SELECT pin FROM verification_codes WHERE job_ad_id = $1 AND status='active'`, [ids.job]);
    newPin = active.rows[0].pin; // trust the DB for the latest active pin
  });

  // --- recruiter-fault path -------------------------------------------------
  console.log('\n[recruiter-fault path: revoke_verification]');
  await step('resolve -> revoke_verification withdraws verification', async () => {
    const r = await api('PUT', `/api/admin/report/${reportHighId}`, {
      token: adminToken,
      body: { finding: 'recruiter_misrepresentation', resolutionAction: 'revoke_verification', adminNotes: 'False salary submitted' },
    });
    must(r.status === 200, `resolve failed: ${r.status} ${JSON.stringify(r.json)}`);
    must(r.json.sideEffect?.revokedVerification === true, 'sideEffect.revokedVerification missing');

    const job = await query('SELECT status FROM job_advertisements WHERE id = $1', [ids.job]);
    must(job.rows[0].status === 'revoked', `job status: ${job.rows[0].status}`);
    const code = await query(`SELECT status FROM verification_codes WHERE job_ad_id = $1 AND is_active = FALSE AND status='revoked'`, [ids.job]);
    must(code.rowCount >= 1, 'no code marked revoked');
  });

  await step('lookup now reads revoked', async () => {
    const r = await api('GET', `/api/public/verify/${newPin}`);
    must(r.status === 200, `lookup failed: ${r.status}`);
    must(r.json.data.status === 'revoked', `status: ${r.json.data.status}`);
    must(/NOT proceeding/i.test(r.json.data.message), 'revoked message missing');
  });

  // --- account sanctions ----------------------------------------------------
  console.log('\n[Super Admin account sanctions]');
  const mintRecruiterToken = () =>
    jwt.sign({ id: ids.recruiter, email: RECR_EMAIL }, process.env.JWT_SECRET, { expiresIn: '1h' });

  await step('Super Admin suspends recruiter', async () => {
    const r = await api('POST', `/api/admin/recruiters/${ids.recruiter}/status`, {
      token: superToken,
      body: { status: 'suspended', reason: 'Verified fraud ring' },
    });
    must(r.status === 200 && r.json?.success, `suspend failed: ${r.status} ${JSON.stringify(r.json)}`);
    must(r.json.data.recruiter.account_status === 'suspended', `status: ${r.json.data.recruiter.account_status}`);
  });

  await step('suspended recruiter cannot log in (403)', async () => {
    const r = await api('POST', '/api/auth/login', { body: { email: RECR_EMAIL, password: WF_PASSWORD } });
    must(r.status === 403, `expected 403, got ${r.status}`);
    must(r.json.data?.accountStatus === 'suspended' || r.json?.accountStatus === 'suspended', 'accountStatus missing');
  });

  await step('existing sessions die instantly (403 with accountStatus)', async () => {
    const r = await api('GET', '/api/verify/status', { token: mintRecruiterToken() });
    must(r.status === 403, `expected 403, got ${r.status}`);
    must(JSON.stringify(r.json).includes('suspended'), 'accountStatus not surfaced');
  });

  await step('reactivation restores access', async () => {
    const r = await api('POST', `/api/admin/recruiters/${ids.recruiter}/status`, {
      token: superToken,
      body: { status: 'active', reason: 'Investigation cleared' },
    });
    must(r.status === 200, `reactivate failed: ${r.status}`);
    const login = await api('POST', '/api/auth/login', { body: { email: RECR_EMAIL, password: WF_PASSWORD } });
    must(login.status === 200, `login after reactivation: ${login.status}`);
  });

  await step('Super Admin sanction with revokeAds sweeps live adverts', async () => {
    // Re-activate the advert, then sanction with ad revocation.
    await query(`UPDATE job_advertisements SET status = 'approved' WHERE id = $1`, [ids.job]);
    await query(
      `UPDATE verification_codes SET status = 'active', is_active = TRUE
       WHERE id = (
         SELECT id FROM verification_codes
         WHERE job_ad_id = $1 AND status <> 'compromised'
         ORDER BY created_at DESC LIMIT 1
       )`,
      [ids.job],
    );
    const r = await api('POST', `/api/admin/recruiters/${ids.recruiter}/status`, {
      token: superToken,
      body: { status: 'suspended', reason: 'Final sanction', revokeAds: true },
    });
    must(r.status === 200, `sanction failed: ${r.status}`);
    must(r.json.data.revokedAds === 1, `revokedAds: ${r.json.data.revokedAds}`);
    const job = await query('SELECT status FROM job_advertisements WHERE id = $1', [ids.job]);
    must(job.rows[0].status === 'revoked', `job status: ${job.rows[0].status}`);
    const active = await query(`SELECT COUNT(*) AS n FROM verification_codes WHERE job_ad_id = $1 AND status='active'`, [ids.job]);
    must(Number(active.rows[0].n) === 0, 'codes still active after sanction');
  });

  // --- summary --------------------------------------------------------------
  const failed = results.filter((r) => !r.ok);
  console.log('\n====================================================');
  console.log(`RESULT: ${results.length - failed.length}/${results.length} passed`);
  console.log('====================================================');
  if (failed.length > 0) {
    console.log('\nFAILED:');
    for (const f of failed) console.log(`  \u2717 ${f.name}: ${f.err}`);
  }

  await cleanup();
  stopServer();
  process.exit(failed.length > 0 ? 1 : 0);
};

const timer = setTimeout(() => {
  console.error('\n❌ Workflow suite timed out after 120s');
  stopServer();
  process.exit(1);
}, 120000);

main().catch(async (e) => {
  console.error(`\n❌ Workflow suite crashed: ${e.message}\n${e.stack}`);
  await cleanup();
  stopServer();
  clearTimeout(timer);
  process.exit(1);
});
