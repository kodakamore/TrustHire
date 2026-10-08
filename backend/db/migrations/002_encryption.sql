-- ===========================================================================
-- 002_encryption.sql — envelope encryption: key registry, encrypted ID
-- columns, photo manifest. Additive only: plaintext columns remain untouched
-- until backfill is verified (Phase 5 drops them in a separate migration).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Key registry: data-encryption keys (DEKs), stored wrapped by the master
--    key which lives ONLY in .env. A DB dump alone yields no usable key.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS encryption_keys (
    key_id      VARCHAR(64)  PRIMARY KEY,
    wrapped_key TEXT         NOT NULL,      -- AES-256-GCM, master-key wrapped
    algo        VARCHAR(32)  NOT NULL DEFAULT 'aes-256-gcm',
    status      VARCHAR(16)  NOT NULL DEFAULT 'active',  -- active | retiring | retired
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- 2. Recruiter national identifiers: new encrypted twins. Kept alongside the
--    plaintext columns during the dual-write/backfill window.
--    Widths: ciphertext is a base64 packed string — it does NOT fit VARCHAR(20).
-- ---------------------------------------------------------------------------
ALTER TABLE recruiters ADD COLUMN IF NOT EXISTS nin_enc TEXT;
ALTER TABLE recruiters ADD COLUMN IF NOT EXISTS bvn_enc TEXT;
ALTER TABLE recruiters ADD COLUMN IF NOT EXISTS nin_key_id VARCHAR(64);
ALTER TABLE recruiters ADD COLUMN IF NOT EXISTS bvn_key_id VARCHAR(64);

-- Partial index over un-migrated rows powers the backfill cursor:
--   WHERE nin IS NOT NULL AND nin_enc IS NULL ORDER BY id
CREATE INDEX IF NOT EXISTS idx_recruiters_nin_unmigrated
    ON recruiters (id) WHERE nin IS NOT NULL AND nin_enc IS NULL;
CREATE INDEX IF NOT EXISTS idx_recruiters_bvn_unmigrated
    ON recruiters (id) WHERE bvn IS NOT NULL AND bvn_enc IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Photo manifest: where encrypted image bytes live on disk. raw_response
--    stores only a `photo://<id>` pointer instead of base64 image data.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS media_objects (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_type  VARCHAR(32) NOT NULL,   -- 'recruiter'
    owner_id    UUID        NOT NULL,
    purpose     VARCHAR(32) NOT NULL,   -- 'id_photo' | 'liveness_frame'
    storage_key TEXT        NOT NULL,   -- relative path under STORAGE_ROOT
    key_id      VARCHAR(64) NOT NULL REFERENCES encryption_keys(key_id),
    sha256      CHAR(64)    NOT NULL,   -- hash of PLAINTEXT bytes (integrity)
    size_bytes  INTEGER     NOT NULL,
    mime_type   VARCHAR(64) NOT NULL DEFAULT 'image/jpeg',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_media_objects_owner
    ON media_objects (owner_type, owner_id, purpose);
