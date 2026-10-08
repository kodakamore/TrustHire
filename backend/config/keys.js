import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { query } from './database.js';

dotenv.config();

// ===========================================================================
// Envelope encryption key hierarchy (self-managed, no cloud KMS):
//
//   ENCRYPTION_MASTER_KEY (.env, 32 bytes, never in DB)
//        └─ wraps ► DEKs (row per key_id in `encryption_keys`, wrapped at rest)
//                     └─ wraps ► NIN / BVN / photo ciphertext in app tables
//
// Every packed ciphertext carries its key_id (`v1:<key_id>:...`), so rotating
// keys never invalidates old rows: decryptors look up the DEK by id.
// ===========================================================================

const ALGO = 'aes-256-gcm';

/** Packed format shared by wrapped DEKs and field ciphertext:
 *    v1:<key_id>:<iv_b64>:<tag_b64>:<ciphertext_b64>
 * The version prefix doubles as the "is this encrypted?" sentinel. */
export const packCiphertext = (keyId, iv, tag, ctB64) =>
  `v1:${keyId}:${iv.toString('base64')}:${tag.toString('base64')}:${ctB64}`;

export const unpackCiphertext = (packed) => {
  if (typeof packed !== 'string') return null;
  const parts = packed.split(':');
  if (parts.length !== 5 || parts[0] !== 'v1') return null;
  const [, keyId, ivB64, tagB64, ctB64] = parts;
  if (!keyId || !ivB64 || !tagB64 || ctB64 === undefined) return null;
  return { keyId, iv: Buffer.from(ivB64, 'base64'), tag: Buffer.from(tagB64, 'base64'), ctB64 };
};

// ---------------------------------------------------------------------------
// Master key: 32 raw bytes, base64-encoded in .env. NO fallbacks — a missing
// or malformed key is a hard failure by design (a silent default key is how
// "encrypted" databases end up decryptable by anyone who read the source).
// ---------------------------------------------------------------------------
export const getMasterKey = () => {
  const raw = process.env.ENCRYPTION_MASTER_KEY;
  if (!raw) {
    throw new Error(
      'ENCRYPTION_MASTER_KEY is not set. Generate one with: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  let buf;
  try {
    buf = Buffer.from(raw, 'base64');
  } catch {
    throw new Error('ENCRYPTION_MASTER_KEY is not valid base64.');
  }
  if (buf.length !== 32) {
    throw new Error(
      `ENCRYPTION_MASTER_KEY must decode to exactly 32 bytes (got ${buf.length}). ` +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  return buf;
};

/** Called once at process startup so a missing key fails fast, not at first write. */
export const assertKeyConfigured = () => {
  getMasterKey();
  return true;
};

// ---------------------------------------------------------------------------
// Key wrapping: DEKs are encrypted with the master key before hitting the DB,
// so a full database dump (or a leaked backup) yields no usable key material.
// ---------------------------------------------------------------------------
export const wrapKey = (dek) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getMasterKey(), iv);
  const ct = Buffer.concat([cipher.update(dek), cipher.final()]);
  return packCiphertext('master', iv, cipher.getAuthTag(), ct.toString('base64'));
};

export const unwrapKey = (wrapped) => {
  const parsed = unpackCiphertext(wrapped);
  if (!parsed || parsed.keyId !== 'master') {
    throw new Error('Malformed wrapped key (expected v1:master:...).');
  }
  const decipher = crypto.createDecipheriv(ALGO, getMasterKey(), parsed.iv);
  decipher.setAuthTag(parsed.tag);
  const ct = Buffer.from(parsed.ctB64, 'base64');
  const dek = Buffer.concat([decipher.update(ct), decipher.final()]);
  if (dek.length !== 32) throw new Error('Unwrapped DEK has invalid length.');
  return dek;
};

// ---------------------------------------------------------------------------
// DEK cache + persistence
// ---------------------------------------------------------------------------
let activeKeyCache = null; // { keyId, key: Buffer }
const dekCache = new Map(); // keyId -> Buffer

export const getActiveKey = async () => {
  if (activeKeyCache) return activeKeyCache;

  const existing = await query(
    `SELECT key_id, wrapped_key FROM encryption_keys
     WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`,
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    const key = unwrapKey(row.wrapped_key);
    dekCache.set(row.key_id, key);
    activeKeyCache = { keyId: row.key_id, key };
    return activeKeyCache;
  }

  // First run: mint the initial DEK.
  const dek = crypto.randomBytes(32);
  const keyId = `dek_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${crypto.randomBytes(3).toString('hex')}`;
  const wrapped = wrapKey(dek);
  await query(
    `INSERT INTO encryption_keys (key_id, wrapped_key, algo, status)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (key_id) DO NOTHING`,
    [keyId, wrapped, ALGO],
  );
  // Re-read so concurrent first-runs converge on the same active row.
  return getActiveKey();
};

export const getDEK = async (keyId) => {
  if (dekCache.has(keyId)) return dekCache.get(keyId);
  if (keyId === 'master') throw new Error('Refusing to use the master key as a data key.');
  const res = await query(
    'SELECT wrapped_key FROM encryption_keys WHERE key_id = $1',
    [keyId],
  );
  if (res.rows.length === 0) {
    throw new Error(`Encryption key "${keyId}" not found — cannot decrypt data.`);
  }
  const key = unwrapKey(res.rows[0].wrapped_key);
  dekCache.set(keyId, key);
  return key;
};

/** Rotation step 1: mint a new active DEK. New writes use it; old rows still
 *  decrypt via their embedded key_id. Re-encrypt old rows with the backfill
 *  script, then retire the old key. */
export const createDEK = async () => {
  const dek = crypto.randomBytes(32);
  const keyId = `dek_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${crypto.randomBytes(3).toString('hex')}`;
  await query(
    `INSERT INTO encryption_keys (key_id, wrapped_key, algo, status)
     VALUES ($1, $2, $3, 'active')`,
    [keyId, wrapKey(dek), ALGO],
  );
  await query(
    `UPDATE encryption_keys SET status = 'retiring'
     WHERE status = 'active' AND key_id <> $1`,
    [keyId],
  );
  activeKeyCache = null;
  return keyId;
};

/** For tests / tooling that operate without a database connection. */
export const resetKeyCache = () => {
  activeKeyCache = null;
  dekCache.clear();
};
