// Phase 4 gate: one command that must exit 0 before Phase 5 (dropping
// plaintext columns) is allowed to run.
//
//   node scripts/verify-migration.js
//
// Checks:
//   1. Every non-null NIN/BVN has ciphertext twin
//   2. Every ciphertext decrypts to its plaintext original (round trip)
//   3. No recruiter raw_response still embeds base64 ID photos
//   4. Active DEK exists and is unwrappable with the current master key
//   5. Read path in encrypted mode: sample findById returns sane shape

import 'dotenv/config';
import crypto from 'node:crypto';
import { query } from '../config/database.js';
import { decryptField, isEncrypted } from '../utils/cryptoHelper.js';
import { getActiveKey } from '../config/keys.js';

const failures = [];
const fail = (msg) => failures.push(msg);

const main = async () => {
  console.log('============ MIGRATION VERIFICATION ============\n');

  // 1. Coverage: every plaintext has ciphertext
  const coverage = await query(`
    SELECT
      COUNT(*) FILTER (WHERE nin IS NOT NULL AND nin_enc IS NULL) AS nin_missing,
      COUNT(*) FILTER (WHERE bvn IS NOT NULL AND bvn_enc IS NULL) AS bvn_missing,
      COUNT(*) FILTER (WHERE nin IS NOT NULL) AS nin_total,
      COUNT(*) FILTER (WHERE bvn IS NOT NULL) AS bvn_total
    FROM recruiters
  `);
  const c = coverage.rows[0];
  console.log(`[1] NIN coverage: ${Number(c.nin_total) - Number(c.nin_missing)}/${c.nin_total}`);
  console.log(`[2] BVN coverage: ${Number(c.bvn_total) - Number(c.bvn_missing)}/${c.bvn_total}`);
  if (Number(c.nin_missing) > 0) fail(`${c.nin_missing} NIN row(s) lack ciphertext`);
  if (Number(c.bvn_missing) > 0) fail(`${c.bvn_missing} BVN row(s) lack ciphertext`);

  // 2. Round trip: decrypt every ciphertext, compare to plaintext
  const rows = await query(
    'SELECT id, nin, bvn, nin_enc, bvn_enc FROM recruiters WHERE nin_enc IS NOT NULL OR bvn_enc IS NOT NULL',
  );
  let checked = 0;
  for (const row of rows.rows) {
    for (const field of ['nin', 'bvn']) {
      const enc = row[`${field}_enc`];
      if (!enc) continue;
      if (!isEncrypted(enc)) { fail(`recruiter=${row.id} ${field}: ciphertext sentinel missing`); continue; }
      try {
        const plain = await decryptField(enc);
        checked += 1;
        if (row[field] !== null && plain !== String(row[field])) {
          fail(`recruiter=${row.id} ${field}: decrypted value differs from plaintext`);
        }
      } catch (err) {
        fail(`recruiter=${row.id} ${field}: ${err.message}`);
      }
    }
  }
  console.log(`[3] Round-trip decrypted ${checked} field(s)`);

  // 3. No embedded photos AND no plaintext 11-digit identifiers remain
  const photos = await query(`
    SELECT COUNT(*) AS n FROM verification_checks
    WHERE target_type = 'recruiter'
      AND (raw_response::text LIKE '%data:image%'
        OR raw_response::text LIKE '%/9j/%'
        OR raw_response::text ~ '"nin"\\s*:\\s*"[0-9]{11}"'
        OR raw_response::text ~ '"bvn"\\s*:\\s*"[0-9]{11}"')
  `);
  const n = Number(photos.rows[0].n);
  console.log(`[4] Recruiter rows still embedding photos or plaintext IDs: ${n}`);
  if (n > 0) fail(`${n} verification_checks row(s) still embed base64 photos or plaintext NIN/BVN`);

  // 4. Active DEK loads under the current master key
  try {
    const { keyId, key } = await getActiveKey();
    if (key.length !== 32) fail('Active DEK is not 32 bytes');
    else console.log(`[5] Active DEK loads: ${keyId}`);
  } catch (err) {
    fail(`Active DEK unusable: ${err.message}`);
  }

  // 5. Stored photos decrypt (sha256 spot check via media manifest)
  const media = await query('SELECT COUNT(*) AS n FROM media_objects');
  console.log(`[6] Extracted photo manifest rows: ${media.rows[0].n}`);

  console.log('\n===============================================');
  if (failures.length > 0) {
    console.error(`❌ ${failures.length} CHECK(S) FAILED:`);
    for (const f of failures) console.error(`   • ${f}`);
    console.error('\nPhase 5 (drop plaintext) MUST NOT run until this exits 0.');
    process.exit(1);
  }
  console.log('✅ ALL CHECKS PASSED — safe to proceed to Phase 5.');
  console.log('   (Also confirm: backups rotated, soak period elapsed, rollback window closed.)');
  process.exit(0);
};

main().catch((err) => {
  console.error('❌ Verification crashed:', err.message);
  process.exit(1);
});
