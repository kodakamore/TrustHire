-- ===========================================================================
-- 003_drop_plaintext.sql — PHASE 5, MANUAL, RUN ONLY AFTER BACKFILL IS
-- VERIFIED AND SOAKED. This migration is NOT applied by `npm run migrate`
-- (see below); run it explicitly:
--
--   psql "$DATABASE_URL" -f db/migrations/003_drop_plaintext.sql
--
-- Pre-flight checklist (all must be true):
--   [ ] node scripts/backfill-nin-bvn.js --verify   exits 0
--   [ ] node scripts/verify-migration.js            exits 0
--   [ ] node scripts/extract-photos.js --verify     exits 0
--   [ ] READ_MODE=encrypted has run ≥ 7 days with no decrypt errors
--   [ ] Application rollback window has closed
--   [ ] Old unencrypted DB backups are expired/destroyed (see README)
--
-- ROLLBACK: restore from backup taken before this file ran. There is no
-- undo — plaintext columns are destroyed permanently.
-- ===========================================================================

BEGIN;

-- 1. Refuse to run unless every row is actually encrypted.
DO $$
DECLARE
    plaintext_nin  INTEGER;
    plaintext_bvn  INTEGER;
BEGIN
    SELECT COUNT(*) INTO plaintext_nin  FROM recruiters WHERE nin  IS NOT NULL AND nin_enc  IS NULL;
    SELECT COUNT(*) INTO plaintext_bvn  FROM recruiters WHERE bvn  IS NOT NULL AND bvn_enc  IS NULL;
    IF plaintext_nin > 0 OR plaintext_bvn > 0 THEN
        RAISE EXCEPTION 'ABORT: % NIN and % BVN rows are not encrypted. Run backfill first.',
            plaintext_nin, plaintext_bvn;
    END IF;
END $$;

-- 2. Drop plaintext identifier columns.
ALTER TABLE recruiters DROP COLUMN IF EXISTS nin;
ALTER TABLE recruiters DROP COLUMN IF EXISTS bvn;

-- 3. Purge base64 photos that may still sit inside verification_checks
--    raw_response (entity.photo / entity.image), replacing any surviving
--    data: URI with a pointer to the extracted media object.
UPDATE verification_checks
SET raw_response = jsonb_set(
    jsonb_set(raw_response, '{data,entity,photo}', '"photo://extracted"'::jsonb, true),
    '{data,entity,image}', '"photo://extracted"'::jsonb, true
)
WHERE raw_response->'data'->'entity' ? 'photo'
   OR raw_response->'data'->'entity' ? 'image';

COMMIT;

VACUUM (ANALYZE) recruiters;
