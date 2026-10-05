import crypto from 'node:crypto';
import dotenv from 'dotenv';
dotenv.config();

const getEncryptionKey = () => {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'trusthire-default-encryption-key-fallback-32b';
  return crypto.scryptSync(secret, 'trusthire_salt_v1', 32);
};

/**
 * Encrypts plaintext string using AES-256-GCM.
 * Output format: <iv_b64>:<tag_b64>:<ciphertext_b64>
 */
export const encrypt = (plaintext) => {
  if (!plaintext) return null;
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');
    const tag = cipher.getAuthTag().toString('base64');
    return `${iv.toString('base64')}:${tag}:${ciphertext}`;
  } catch (err) {
    console.error('Encryption failed:', err.message);
    return null;
  }
};

/**
 * Decrypts an AES-256-GCM encrypted string.
 */
export const decrypt = (packed) => {
  if (!packed || typeof packed !== 'string' || !packed.includes(':')) return null;
  try {
    const [ivB64, tagB64, dataB64] = packed.split(':');
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    let decrypted = decipher.update(dataB64, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Decryption failed:', err.message);
    return null;
  }
};

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
export const generateSecureOTP = () => {
  return crypto.randomInt(100000, 1000000).toString();
};
