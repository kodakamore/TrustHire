import crypto from 'node:crypto';
import {
  packCiphertext,
  unpackCiphertext,
  getActiveKey,
  getDEK,
} from '../config/keys.js';

// ===========================================================================
// Field-level envelope encryption for PII (NIN, BVN) and photo payloads.
//
// Design rules:
//   * AES-256-GCM — authenticated encryption; tampering fails loudly instead
//     of decrypting to garbage.
//   * Random 96-bit IV per write — NON-deterministic, so equal plaintexts
//     produce unrelated ciphertext (we never query by NIN/BVN).
//   * Packed as v1:<key_id>:<iv>:<tag>:<ct> — key rotation stays decodable.
//   * NO key fallbacks — a missing key is a hard error, never a default.
// ===========================================================================

const ALGO = 'aes-256-gcm';

/** Encrypt with an explicit key (sync). Used by scripts/tests; runtime code
 *  should prefer encryptField()/encryptBytes() which resolve the active DEK. */
export const encryptWithKey = (key, keyId, plaintext) => {
  if (typeof plaintext !== 'string') throw new TypeError('encryptWithKey expects a string.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return packCiphertext(keyId, iv, cipher.getAuthTag(), ct.toString('base64'));
};

/** Decrypt with an explicit key resolver (async): resolver(keyId) -> Buffer. */
export const decryptWith = async (resolveKey, packed) => {
  const parsed = unpackCiphertext(packed);
  if (!parsed) return null;
  const key = await resolveKey(parsed.keyId);
  try {
    const decipher = crypto.createDecipheriv(ALGO, key, parsed.iv);
    decipher.setAuthTag(parsed.tag);
    const ct = Buffer.from(parsed.ctB64, 'base64');
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    // GCM tag mismatch: wrong key or tampered ciphertext.
    throw new Error('Decryption failed: authentication tag mismatch (wrong key or tampered data).');
  }
};

/** Encrypt a string field under the current active DEK. */
export const encryptField = async (plaintext) => {
  if (plaintext === null || plaintext === undefined || plaintext === '') return null;
  const { keyId, key } = await getActiveKey();
  return encryptWithKey(key, keyId, String(plaintext));
};

/** Decrypt a packed field produced by encryptField. Returns null when the
 *  input is not packed ciphertext (lets callers dual-read during migration). */
export const decryptField = async (packed) => {
  if (!packed) return null;
  return decryptWith(getDEK, packed);
};

/** Encrypt arbitrary bytes (photos). Input: Buffer. Output: packed string. */
export const encryptBytes = async (buf) => {
  if (!Buffer.isBuffer(buf)) throw new TypeError('encryptBytes expects a Buffer.');
  const { keyId, key } = await getActiveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(buf), cipher.final()]);
  return packCiphertext(keyId, iv, cipher.getAuthTag(), ct.toString('base64'));
};

/** Decrypt a packed byte payload back to a Buffer. */
export const decryptBytes = async (packed) => {
  if (!packed) return null;
  const parsed = unpackCiphertext(packed);
  if (!parsed) return null;
  const key = await getDEK(parsed.keyId);
  try {
    const decipher = crypto.createDecipheriv(ALGO, key, parsed.iv);
    decipher.setAuthTag(parsed.tag);
    const ct = Buffer.from(parsed.ctB64, 'base64');
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    throw new Error('Decryption failed: authentication tag mismatch (wrong key or tampered data).');
  }
};

/** Sentinel test — used by the dual-read migration shim to decide whether a
 *  column already holds ciphertext or legacy plaintext. */
export const isEncrypted = (value) =>
  typeof value === 'string' && value.startsWith('v1:') && value.split(':').length === 5;

/**
 * Masks sensitive identifiers for safe UI rendering.
 * e.g., "12345678901" -> "123*****901"
 */
export const maskIdentifier = (value) => {
  if (!value) return '';
  const clean = value.toString().trim();
  if (clean.length <= 4) return '****';
  const prefix = clean.slice(0, 3);
  const suffix = clean.slice(-3);
  const stars = '*'.repeat(Math.max(3, clean.length - 6));
  return `${prefix}${stars}${suffix}`;
};

/**
 * Cryptographically secure random 6-digit numeric OTP.
 */
export const generateSecureOTP = () => crypto.randomInt(100000, 1000000).toString();
