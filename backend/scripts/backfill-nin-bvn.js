// Phase 4 backfill: encrypt every existing plaintext NIN/BVN.
//
//   node scripts/backfill-nin-bvn.js            # migrate (batched, resumable)
//   node scripts/backfill-nin-bvn.js --verify   # re-encrypt-compare ONLY, exit 1 on any mismatch
//   node scripts/backfill-nin-bvn.js --batch=100
//
// Safety properties:
//   * Batched transactions — never one giant lock-held transaction.
//   * Idempotent — the partial index (nin IS NOT NULL AND nin_enc IS NULL)
//     is the cursor; re-running just picks up whatever is left.
//   * Verify mode decrypts every *_enc and compares to plaintext byte-for-byte;
//     ANY mismatch aborts with exit code 1 (this gates Phase 5).

import 'dotenv/config';
import { query } from '../config/database.js';
import { encryptField, decryptField, isEncrypted } from '../utils/cryptoHelper.js';

const args = process.argv.slice(2);
const VERIFY = args.includes('--verify');
const BATCH = parseInt((args.find((a) => a.startsWith('--batch=')) || '--batch=500').split('=')[1], 10);

const migrateBatch = async () => {
  const res = await query(`
    SELECT id, nin, bvn FROM recruiters
    WHERE (nin IS NOT NULL AND nin_enc IS NULL)
       OR (bvn IS NOT NULL AND bvn_enc IS NULL)
    ORDER BY id
    LIMIT $1
  `, [BATCH]);

  if (res.rows.length === 0) return 0;

  let migrated = 0;
  for (const row of res.rows) {
    // WHERE clause already guarantees the *_enc columns are NULL for whichever
    // field still needs migrating.
    const sets = [];
    const values = [];
    let i = 1;
    if (row.nin) {
      sets.push(`nin_enc = $${i++}`);
      values.push(await encryptField(String(row.nin)));
      sets.push(`nin_key_id = (SELECT key_id FROM encryption_keys WHERE status = 'active' LIMIT 1)`);
    }
    if (row.bvn) {
      sets.push(`bvn_enc = $${i++}`);
      values.push(await encryptField(String(row.bvn)));
      sets.push(`bvn_key_id = (SELECT key_id FROM encryption_keys WHERE status = 'active' LIMIT 1)`);
    }
    if (sets.length === 0) continue;
    values.push(row.id);
    await query(`UPDATE recruiters SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${i}`, values);
    migrated += 1;
  }
  return migrated;
};

const verifyAll = async () => {
  const res = await query(`
    SELECT id, nin, bvn, nin_enc, bvn_enc FROM recruiters
    WHERE nin_enc IS NOT NULL OR bvn_enc IS NOT NULL
  `);

  let checked = 0;
  const failures = [];
  for (const row of res.rows) {
    for (const field of ['nin', 'bvn']) {
      const enc = row[`${field}_enc`];
      if (!enc) continue;
      if (!isEncrypted(enc)) {
        failures.push({ id: row.id, field, reason: 'not ciphertext' });
        continue;
      }
      try {
        const plain = await decryptField(enc);
        checked += 1;
        // Rows whose plaintext was already dropped (post-Phase-5) compare
        // against null — treat as pass; anything else must match exactly.
        if (row[field] !== null && plain !== String(row[field])) {
          failures.push({ id: row.id, field, reason: 'mismatch after decrypt' });
        }
      } catch (err) {
        failures.push({ id: row.id, field, reason: err.message });
      }
    }
  }

  console.log(`\nVerified ${checked} encrypted identifier(s).`);
  if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} FAILURE(S):`);
    for (const f of failures.slice(0, 20)) {
      console.error(`   recruiter=${f.id} field=${f.field}: ${f.reason}`);
    }
    process.exit(1);
  }
  console.log('✅ All encrypted identifiers decrypt to their plaintext originals.');
  process.exit(0);
};

const main = async () => {
  if (VERIFY) return verifyAll();

  let total = 0;
  let batch;
  // eslint-disable-next-line no-cond-assign
  while ((batch = await migrateBatch()) > 0) {
    total += batch;
    process.stdout.write(`\rMigrated ${total} row(s)...`);
    if (batch < BATCH) break;
  }
  console.log(`\n✅ Backfill complete: ${total} row(s) encrypted.`);

  // Always self-verify what we just wrote — never trust a silent success.
  console.log('Re-reading and decrypting all migrated rows...');
  return verifyAll();
};

main().catch((err) => {
  console.error('\n❌ Backfill aborted:', err.message);
  process.exit(1);
});
