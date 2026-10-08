import { query } from '../config/database.js';

// Manifest for encrypted photo blobs on disk (see services/storage.service.js).
// Rows point at ciphertext; no plaintext ever touches this table.

export const create = async ({
  ownerType,
  ownerId,
  purpose,
  storageKey,
  keyId,
  sha256,
  sizeBytes,
  mimeType,
}) => {
  const res = await query(
    `INSERT INTO media_objects (owner_type, owner_id, purpose, storage_key, key_id, sha256, size_bytes, mime_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [ownerType, ownerId, purpose, storageKey, keyId, sha256, sizeBytes, mimeType],
  );
  return res.rows[0];
};

export const findById = async (id) => {
  const res = await query('SELECT * FROM media_objects WHERE id = $1', [id]);
  return res.rows[0] || null;
};

export const findByStorageKey = async (storageKey) => {
  const res = await query('SELECT * FROM media_objects WHERE storage_key = $1', [storageKey]);
  return res.rows[0] || null;
};

/** Dedupe: same owner + purpose + identical plaintext hash. */
export const findByContent = async (ownerType, ownerId, purpose, sha256) => {
  const res = await query(
    `SELECT * FROM media_objects
     WHERE owner_type = $1 AND owner_id = $2 AND purpose = $3 AND sha256 = $4
     ORDER BY created_at ASC LIMIT 1`,
    [ownerType, ownerId, purpose, sha256],
  );
  return res.rows[0] || null;
};

export const listByOwner = async (ownerType, ownerId, purpose = null) => {
  const res = purpose
    ? await query(
        `SELECT * FROM media_objects
         WHERE owner_type = $1 AND owner_id = $2 AND purpose = $3
         ORDER BY created_at DESC`,
        [ownerType, ownerId, purpose],
      )
    : await query(
        `SELECT * FROM media_objects WHERE owner_type = $1 AND owner_id = $2
         ORDER BY created_at DESC`,
        [ownerType, ownerId],
      );
  return res.rows;
};
