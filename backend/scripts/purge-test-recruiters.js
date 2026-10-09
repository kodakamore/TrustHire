// ===========================================================================
// purge-test-recruiters.js — remove test recruiters, keep production accounts.
//
// Deletes every recruiter EXCEPT the hardcoded allowlist (your real account),
// along with their non-cascading dependents:
//   verification_checks (soft FK target_id), media_objects (soft owner_id,
//   blobs removed from disk), audit_logs (soft actor/target refs).
// FK-cascaded children (companies, jobs, codes, lookups, reports,
// face-verification rows) are removed by the DB itself.
//
// Optionally (--reset-face) resets the ALLOWLISTED recruiter's face
// verification so Step 4 can be re-tested without touching their companies,
// jobs, or completed email/phone/ID steps — no email OTP needed.
//
// Usage:
//   node scripts/purge-test-recruiters.js            # dry run (prints plan)
//   node scripts/purge-test-recruiters.js --apply    # execute
//   node scripts/purge-test-recruiters.js --apply --reset-face
// ===========================================================================

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../config/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, '..');

// Recruiters that are NEVER deleted. Provided via PURGE_KEEP_EMAILS in .env
// (comma-separated) so personal addresses never enter version control.
// The script refuses to run without it.
const KEEP_EMAILS = (process.env.PURGE_KEEP_EMAILS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const APPLY = process.argv.includes('--apply');
const RESET_FACE = process.argv.includes('--reset-face');

if (KEEP_EMAILS.length === 0) {
  console.error('FATAL: PURGE_KEEP_EMAILS is empty or missing in .env — refusing to run.');
  console.error('  An empty allowlist would delete EVERY recruiter, including real accounts.');
  process.exit(1);
}

const removeBlobs = (rows) => {
  for (const r of rows) {
    const abs = path.resolve(BACKEND_DIR, process.env.STORAGE_ROOT || 'storage/photos', r.storage_key);
    try { fs.rmSync(abs, { force: true }); } catch { /* already gone */ }
  }
};

async function main() {
  const keep = await query(
    'SELECT id, email FROM recruiters WHERE lower(email) = ANY($1)',
    [KEEP_EMAILS.map((e) => e.toLowerCase())],
  );
  if (keep.rows.length !== KEEP_EMAILS.length) {
    console.error('FATAL: allowlisted recruiter not found — refusing to run.');
    console.error(`  found: ${keep.rows.map((r) => r.email).join(', ') || '(none)'}`);
    process.exit(1);
  }
  const keepIds = keep.rows.map((r) => r.id);
  console.log(`Allowlist (never deleted): ${keep.rows.map((r) => r.email).join(', ')}`);

  const victims = await query(
    'SELECT id, email FROM recruiters WHERE NOT (id = ANY($1))',
    [keepIds],
  );
  if (victims.rows.length === 0) {
    console.log('No test recruiters to delete.');
  } else {
    const ids = victims.rows.map((r) => r.id);
    // Companies/jobs/codes cascade from recruiter, but media_objects and
    // audit_logs have no FK — collect their ids too so nothing is orphaned.
    const companyIds = (await query(
      'SELECT id FROM companies WHERE recruiter_id = ANY($1)',
      [ids],
    )).rows.map((r) => r.id);
    const jobIds = (await query(
      'SELECT id FROM job_advertisements WHERE recruiter_id = ANY($1)',
      [ids],
    )).rows.map((r) => r.id);
    const codeIds = (await query(
      'SELECT id FROM verification_codes WHERE job_ad_id = ANY($1)',
      [jobIds],
    )).rows.map((r) => r.id);
    const allTargets = [...ids, ...companyIds, ...jobIds, ...codeIds];
    const media = await query(
      'SELECT storage_key FROM media_objects WHERE owner_id = ANY($1)',
      [allTargets],
    );

    console.log(`\nWill delete ${victims.rows.length} test recruiter(s):`);
    for (const r of victims.rows) console.log(`  - ${r.email}`);
    console.log(`  verification_checks: ${(
      await query('SELECT COUNT(*) AS n FROM verification_checks WHERE target_id = ANY($1)', [allTargets])
    ).rows[0].n} row(s)`);
    console.log(`  audit_logs: ${(
      await query(
        'SELECT COUNT(*) AS n FROM audit_logs WHERE actor_id = ANY($1) OR target_id = ANY($2)',
        [ids, allTargets],
      )
    ).rows[0].n} row(s)`);
    console.log(`  media_objects (+disk blobs): ${media.rows.length} object(s)`);
    console.log('  cascaded by DB: companies, jobs, verification_codes, lookups, reports, face records');

    if (APPLY) {
      removeBlobs(media.rows);
      await query('DELETE FROM media_objects WHERE owner_id = ANY($1)', [allTargets]);
      await query('DELETE FROM verification_checks WHERE target_id = ANY($1)', [allTargets]);
      await query(
        'DELETE FROM audit_logs WHERE actor_id = ANY($1) OR target_id = ANY($2)',
        [ids, allTargets],
      );
      const del = await query('DELETE FROM recruiters WHERE id = ANY($1)', [ids]);
      console.log(`\nDeleted ${del.rowCount} recruiter(s) (children cascaded).`);
    } else {
      console.log('\nDRY RUN — nothing deleted. Re-run with --apply to execute.');
    }
  }

  // Reset the allowlisted recruiter's face verification for re-testing.
  if (RESET_FACE) {
    const kid = keepIds[0];
    if (!APPLY) {
      console.log('\n--reset-face: DRY RUN (would clear face records + flags for the allowlisted account)');
      return;
    }
    const faceMedia = await query(
      "SELECT storage_key FROM media_objects WHERE owner_id = $1 AND purpose = 'face_liveness'",
      [kid],
    );
    removeBlobs(faceMedia.rows);
    await query(
      "DELETE FROM media_objects WHERE owner_id = $1 AND purpose = 'face_liveness'",
      [kid],
    );
    await query('DELETE FROM verification_checks WHERE target_id = $1 AND check_type IN (\'liveness\', \'face_match\')', [kid]);
    const fv = await query(
      'DELETE FROM recruiter_face_verifications WHERE recruiter_id = $1',
      [kid],
    );
    await query(
      'UPDATE recruiters SET is_face_verified = false, verification_status = \'partially_verified\' WHERE id = $1',
      [kid],
    );
    console.log(`\nAllowlisted account face reset: ${fv.rowCount} face record(s), ` +
      `${faceMedia.rows.length} photo(s); Step 4 can be re-tested (other steps kept).`);
  }
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
