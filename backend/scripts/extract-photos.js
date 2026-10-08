// Phase 2/4 photo extraction: move base64 ID photos OUT of
// verification_checks.raw_response into encrypted object storage, leaving a
// `photo://<uuid>` pointer behind.
//
//   node scripts/extract-photos.js --dry-run   # report only (DEFAULT)
//   node scripts/extract-photos.js --apply     # move bytes, then self-verify
//   node scripts/extract-photos.js --verify    # decrypt every stored photo, check sha256
//
// Idempotent: rows already holding `photo://` pointers no longer match the
// scan, so re-running after a partial failure is safe.

import 'dotenv/config';
import crypto from 'node:crypto';
import { query } from '../config/database.js';
import { putImage, getImage } from '../services/storage.service.js';
import { sanitizeProviderResponse } from '../utils/piiRedactor.js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const VERIFY = args.includes('--verify');
const DRY_RUN = !APPLY && !VERIFY;

const PHOTO_FIELDS = ['photo', 'image'];
// Accept data URLs AND bare base64 (Dojah returns both). Deliberately
// length-based rather than padding-alignment-based: real-world base64 often
// lacks '=' padding and need not be a multiple of 4 — requiring either
// silently skipped a 579 KB photo during the first extraction attempt.
const LOOKS_LIKE_IMAGE = (v) =>
  typeof v === 'string' &&
  v.length >= 256 &&
  (v.startsWith('data:image/') || /^[A-Za-z0-9+/]+={0,2}$/.test(v));

/** Recursively find { path, value } for photo-ish base64 fields. */
const findImageFields = (obj, path = []) => {
  const found = [];
  if (!obj || typeof obj !== 'object') return found;
  for (const [key, value] of Object.entries(obj)) {
    if (PHOTO_FIELDS.includes(key) && LOOKS_LIKE_IMAGE(value)) {
      found.push({ path: [...path, key], value });
    } else if (value && typeof value === 'object') {
      found.push(...findImageFields(value, [...path, key]));
    }
  }
  return found;
};

const setAtPath = (obj, path, value) => {
  let cursor = obj;
  for (let i = 0; i < path.length - 1; i++) cursor = cursor[path[i]];
  cursor[path[path.length - 1]] = value;
};

// Only rows still containing raw image bytes, plaintext identifiers, or
// un-masked NIN/BVN match this scan — that IS the idempotency cursor.
const scanRows = () => query(`
  SELECT id, target_id, target_type, check_type, raw_response
  FROM verification_checks
  WHERE raw_response::text LIKE '%data:image%'
     OR raw_response::text LIKE '%/9j/%'
     OR raw_response::text LIKE '%iVBOR%'
     OR raw_response::text ~ '"nin"\\s*:\\s*"[0-9]{11}"'
     OR raw_response::text ~ '"bvn"\\s*:\\s*"[0-9]{11}"'
  ORDER BY created_at ASC
`);

const verifyStored = async () => {
  const res = await query('SELECT id, storage_key, sha256 FROM media_objects');
  if (res.rows.length === 0) {
    console.log('No media_objects rows to verify.');
    return;
  }
  const failures = [];
  for (const row of res.rows) {
    try {
      const { buffer } = await getImage(row.storage_key);
      const sha = crypto.createHash('sha256').update(buffer).digest('hex');
      if (sha !== row.sha256) failures.push({ id: row.id, reason: 'sha256 mismatch' });
    } catch (err) {
      failures.push({ id: row.id, reason: err.message });
    }
  }
  console.log(`Verified ${res.rows.length} stored photo(s).`);
  if (failures.length > 0) {
    console.error(`❌ ${failures.length} FAILURE(S):`);
    for (const f of failures) console.error(`   media=${f.id}: ${f.reason}`);
    process.exit(1);
  }
  console.log('✅ All stored photos decrypt to byte-identical content.');
};

const run = async () => {
  if (VERIFY) {
    await verifyStored();
    process.exit(0);
  }

  const rows = (await scanRows()).rows;
  let moved = 0, masked = 0, skipped = 0, failed = 0;

  for (const row of rows) {
    const raw = row.raw_response;
    if (!raw) { skipped += 1; continue; }

    // Company checks (CAC registry documents) are out of scope by decision —
    // only recruiter biometric/ID photos and identifiers are handled.
    if (row.target_type !== 'recruiter') { skipped += 1; continue; }

    const images = findImageFields(raw);
    // Does this row still carry an un-masked 11-digit identifier?
    const rawText = JSON.stringify(raw);
    const hasPlainId = /"(nin|bvn)"\s*:\s*"\d{11}"/.test(rawText);
    if (images.length === 0 && !hasPlainId) { skipped += 1; continue; }

    if (DRY_RUN) {
      console.log(`[dry-run] check=${row.id} type=${row.check_type} images=${images.length} plain_id=${hasPlainId}`);
      moved += images.length;
      if (hasPlainId) masked += 1;
      continue;
    }

    try {
      let clean = JSON.parse(JSON.stringify(raw));
      for (const img of images) {
        const media = await putImage({
          payload: img.value,
          ownerType: 'recruiter',
          ownerId: row.target_id,
          purpose: 'id_photo',
        });
        setAtPath(clean, img.path, `photo://${media.id}`);
        moved += 1;
      }
      // Mask any plaintext NIN/BVN still sitting in the payload. Applied
      // AFTER extraction so pointers (short, non-numeric) are untouched.
      if (hasPlainId) {
        const sanitized = sanitizeProviderResponse(clean);
        clean = sanitized.clean;
        masked += 1;
      }
      await query('UPDATE verification_checks SET raw_response = $1 WHERE id = $2', [clean, row.id]);
      process.stdout.write(`\rProcessed ${rows.length} row(s): ${moved} photo(s) extracted, ${masked} sanitized...`);
    } catch (err) {
      failed += 1;
      console.error(`\n❌ check=${row.id}: ${err.message}`);
    }
  }

  const prefix = DRY_RUN ? '[dry-run] ' : '';
  console.log(`\n${prefix}Scanned ${rows.length} row(s): ${moved} image(s) ${DRY_RUN ? 'found' : 'moved'}, ${masked} id-sanitized, ${skipped} skipped, ${failed} failed.`);
  if (failed > 0) process.exit(1);

  if (APPLY) {
    // Re-scan: ANY surviving match (image or plaintext id) means partial failure.
    const stragglers = (await scanRows()).rows.filter((r) => r.target_type === 'recruiter');
    if (stragglers.length > 0) {
      console.error(`⚠️  ${stragglers.length} recruiter row(s) still match the PII scan — re-run --apply.`);
      process.exit(1);
    }
    console.log('Re-scan clean: no recruiter rows still embed images or plaintext IDs.');
    await verifyStored();
    process.exit(0);
  }
  process.exit(0);
};

run().catch((err) => {
  console.error('\n❌ Extraction failed:', err.message);
  process.exit(1);
});
