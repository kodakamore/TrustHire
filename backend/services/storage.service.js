import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { encryptBytes, decryptBytes } from '../utils/cryptoHelper.js';
import * as Media from '../models/media.model.js';

// ===========================================================================
// Encrypted photo object storage (local disk, self-managed).
//
// - Blobs live OUTSIDE public/ (never directly served by static middleware).
// - Each blob is AES-256-GCM encrypted before hitting disk.
// - storage_key is derived from the plaintext SHA-256 (sharded 2-char prefix)
//   — never from user input, so path traversal is structurally impossible.
// - Reads decrypt into memory only; callers must not persist plaintext.
// ===========================================================================

const STORAGE_ROOT = () =>
  path.resolve(process.cwd(), process.env.STORAGE_ROOT || 'storage/photos');

const MAX_PHOTO_BYTES = () => parseInt(process.env.MAX_PHOTO_BYTES || '5000000', 10);

const SAFE_KEY_RE = /^[0-9a-f]{2}\/[0-9a-f]{64}\.enc$/;

/** Parse a data: URL or bare base64 string into { buffer, mimeType }. */
export const parseImagePayload = (payload) => {
  if (typeof payload !== 'string' || payload.length === 0) {
    throw new Error('Photo payload must be a non-empty string.');
  }
  const dataUrlMatch = payload.match(/^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  let mimeType = 'image/jpeg';
  let b64;
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1].toLowerCase();
    b64 = dataUrlMatch[2];
  } else if (/^[A-Za-z0-9+/=\s]+$/.test(payload)) {
    b64 = payload;
  } else {
    throw new Error('Photo payload is not a valid data URL or base64 string.');
  }
  const buffer = Buffer.from(b64.replace(/\s/g, ''), 'base64');
  if (buffer.length === 0) throw new Error('Photo payload decoded to zero bytes.');
  if (buffer.length > MAX_PHOTO_BYTES()) {
    throw new Error(`Photo exceeds maximum allowed size of ${MAX_PHOTO_BYTES()} bytes.`);
  }
  // Sniff the magic numbers — never trust the client-declared MIME type.
  const sniffed = sniffImageType(buffer);
  if (!sniffed) throw new Error('Photo payload is not a recognized image (jpeg/png/webp).');
  return { buffer, mimeType: sniffed };
};

const sniffImageType = (buf) => {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
};

/**
 * Encrypt and persist an image. Returns the manifest row.
 * Idempotent per (owner, purpose, plaintext): re-submitting identical bytes
 * reuses the existing object rather than duplicating storage.
 */
export const putImage = async ({ payload, ownerType, ownerId, purpose }) => {
  const { buffer, mimeType } = parseImagePayload(payload);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  const existing = await Media.findByContent(ownerType, ownerId, purpose, sha256);
  if (existing) return existing;

  const packed = await encryptBytes(buffer);
  const keyId = packed.split(':')[1]; // v1:<key_id>:<iv>:<tag>:<ct>
  const storageKey = `${sha256.slice(0, 2)}/${sha256}.enc`;
  const absPath = safeResolve(storageKey);

  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, packed, { encoding: 'utf8', mode: 0o600 });

  return Media.create({
    ownerType,
    ownerId,
    purpose,
    storageKey,
    keyId,
    sha256,
    sizeBytes: buffer.length,
    mimeType,
  });
};

/** Read + decrypt an image by storage_key. Returns { buffer, mimeType }. */
export const getImage = async (storageKey) => {
  const absPath = safeResolve(storageKey);
  if (!fs.existsSync(absPath)) {
    throw new Error('Photo object not found in storage.');
  }
  const packed = fs.readFileSync(absPath, { encoding: 'utf8' });
  const buffer = await decryptBytes(packed);
  if (!buffer) throw new Error('Photo object is not valid ciphertext.');
  const sha = crypto.createHash('sha256').update(buffer).digest('hex');
  const expected = path.basename(storageKey, '.enc');
  if (sha !== expected) {
    throw new Error('Photo integrity check failed (SHA-256 mismatch).');
  }
  const row = await Media.findByStorageKey(storageKey);
  return { buffer, mimeType: row?.mime_type || 'image/jpeg' };
};

/** Read a photo via its media_objects id (admin access path). */
export const getImageById = async (mediaId) => {
  const row = await Media.findById(mediaId);
  if (!row) throw new Error('Photo not found.');
  const { buffer, mimeType } = await getImage(row.storage_key);
  return { buffer, mimeType, row };
};

/** Resolve a `photo://<uuid>` pointer (as stored in raw_response) to bytes. */
export const resolvePhotoRef = async (ref) => {
  if (typeof ref !== 'string' || !ref.startsWith('photo://')) return null;
  const id = ref.slice('photo://'.length);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const { buffer, mimeType } = await getImageById(id);
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
};

/** Validate a storage_key and resolve it within STORAGE_ROOT. Rejects
 *  traversal, absolute paths, and anything not matching the generated form. */
const safeResolve = (storageKey) => {
  if (typeof storageKey !== 'string' || !SAFE_KEY_RE.test(storageKey)) {
    throw new Error('Invalid storage key format.');
  }
  const root = STORAGE_ROOT();
  const abs = path.resolve(root, storageKey);
  if (!abs.startsWith(root + path.sep)) {
    throw new Error('Storage key escapes storage root.');
  }
  return abs;
};
