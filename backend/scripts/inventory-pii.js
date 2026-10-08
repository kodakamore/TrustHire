// Phase 0 baseline: counts every plaintext PII artifact that must disappear.
// Run BEFORE any other step and record the output — it is the migration's
// success criteria.
//
//   node scripts/inventory-pii.js
//   node scripts/inventory-pii.js --json

import 'dotenv/config';
import { query } from '../config/database.js';

const asJson = process.argv.includes('--json');

const run = async () => {
  const inventory = {};

  const nin = await query(`
    SELECT
      COUNT(*) FILTER (WHERE nin  IS NOT NULL)              AS plaintext_nin,
      COUNT(*) FILTER (WHERE nin_enc IS NOT NULL)           AS encrypted_nin,
      COUNT(*) FILTER (WHERE nin IS NOT NULL AND nin_enc IS NULL) AS unmigrated_nin,
      COUNT(*) FILTER (WHERE bvn  IS NOT NULL)              AS plaintext_bvn,
      COUNT(*) FILTER (WHERE bvn_enc IS NOT NULL)           AS encrypted_bvn,
      COUNT(*) FILTER (WHERE bvn IS NOT NULL AND bvn_enc IS NULL) AS unmigrated_bvn,
      COUNT(*) AS total_recruiters
    FROM recruiters
  `);
  inventory.recruiters = nin.rows[0];

  // Base64 image data hiding inside verification_checks.raw_response.
  // (LIKE, not regex — POSIX regex here adds no value and is easy to get wrong.)
  const photos = await query(`
    SELECT COUNT(*) AS rows_with_photos
    FROM verification_checks
    WHERE raw_response::text LIKE '%"photo":"data:image%'
       OR raw_response::text LIKE '%"image":"data:image%'
       OR raw_response::text LIKE '%"photo":"/9j/%'
       OR raw_response::text LIKE '%"image":"/9j/%'
       OR raw_response::text LIKE '%"photo":"iVBOR%'
       OR raw_response::text LIKE '%"image":"iVBOR%'
  `);
  inventory.photos_in_db = photos.rows[0];

  const media = await query(`
    SELECT COUNT(*) AS extracted_photos, COALESCE(SUM(size_bytes), 0) AS total_bytes
    FROM media_objects
  `).catch(() => ({ rows: [{ extracted_photos: 0, total_bytes: 0 }] }));
  inventory.photos_in_storage = media.rows[0];

  const keys = await query(
    `SELECT key_id, status, created_at FROM encryption_keys ORDER BY created_at`,
  ).catch(() => ({ rows: [] }));
  inventory.encryption_keys = keys.rows;

  if (asJson) {
    console.log(JSON.stringify(inventory, null, 2));
  } else {
    console.log('\n================ PII INVENTORY ================');
    console.log('Recruiters total:        ', inventory.recruiters.total_recruiters);
    console.log('NIN plaintext/encrypted: ', inventory.recruiters.plaintext_nin, '/', inventory.recruiters.encrypted_nin, `(unmigrated: ${inventory.recruiters.unmigrated_nin})`);
    console.log('BVN plaintext/encrypted: ', inventory.recruiters.plaintext_bvn, '/', inventory.recruiters.encrypted_bvn, `(unmigrated: ${inventory.recruiters.unmigrated_bvn})`);
    console.log('DB rows w/ embedded photo:', inventory.photos_in_db.rows_with_photos);
    console.log('Photos in encrypted store:', inventory.photos_in_storage.extracted_photos, `(${inventory.photos_in_storage.total_bytes} bytes)`);
    console.log('Encryption keys:          ', inventory.encryption_keys.length);
    console.log('==============================================\n');
  }

  process.exit(0);
};

run().catch((err) => {
  console.error('Inventory failed:', err.message);
  process.exit(1);
});
