import { query } from "../config/database.js";
import { encryptField, decryptField, isEncrypted } from "../utils/cryptoHelper.js";
import { getActiveKey } from "../config/keys.js";

// ===========================================================================
// Encryption seam. Business code keeps passing/reading plain `nin`/`bvn`;
// this model is the single place that knows ciphertext exists.
//
// READ_MODE=plaintext → dual-write (legacy + *_enc), read legacy (backfill era)
// READ_MODE=encrypted → dual-write, read *_enc with legacy fallback
// After Phase 5 drops plaintext columns, *_enc is simply the column.
// ===========================================================================

const READ_MODE = () => (process.env.READ_MODE === 'encrypted' ? 'encrypted' : 'plaintext');

const IDENTIFIER_COLUMNS = new Set(['nin', 'bvn']);

/** Encrypt identifier fields and append their ciphertext twin columns. */
const withEncryptedIdentifiers = async (data) => {
  const extra = {};
  let activeKeyId = null;
  for (const field of IDENTIFIER_COLUMNS) {
    if (data[field] !== undefined && data[field] !== null && data[field] !== '') {
      const value = String(data[field]);
      const packed = await encryptField(value);
      extra[`${field}_enc`] = packed;
      if (!activeKeyId) activeKeyId = (await getActiveKey()).keyId;
      extra[`${field}_key_id`] = activeKeyId;
    } else if (data[field] === null) {
      extra[`${field}_enc`] = null;
      extra[`${field}_key_id`] = null;
    }
  }
  return { ...data, ...extra };
};

/** Dual-read: prefer ciphertext when READ_MODE=encrypted, fall back to
 *  legacy plaintext so un-migrated rows keep working mid-backfill. */
const revealIdentifiers = async (row) => {
  if (!row) return row;
  const out = { ...row };
  if (READ_MODE() === 'encrypted') {
    for (const field of IDENTIFIER_COLUMNS) {
      const enc = out[`${field}_enc`];
      if (enc && isEncrypted(enc)) {
        try {
          out[field] = await decryptField(enc);
        } catch (err) {
          // Never fail an entire request over one undecryptable field, but
          // make the failure loud — silent nulls hide key-rotation bugs.
          console.error(`Decrypt failed for recruiters.${field} (id=${row.id}): ${err.message}`);
          out[field] = out[field] ?? null;
        }
      }
    }
  }
  // Ciphertext twins never leave this module.
  delete out.nin_enc;
  delete out.bvn_enc;
  delete out.nin_key_id;
  delete out.bvn_key_id;
  return out;
};

export const create = async (data) => {
  const {
    email,
    passwordHash,
    firstName,
    lastName,
    phoneNumber,
    emailOtp,
    emailOtpExpiresAt,
    phoneOtp,
    phoneOtpExpiresAt,
  } = data;
  const text = `
    INSERT INTO recruiters (email, password_hash, first_name, last_name, phone_number, email_otp, email_otp_expires_at, phone_otp, phone_otp_expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, email, first_name, last_name, phone_number, email_otp, email_otp_expires_at, phone_otp, phone_otp_expires_at, verification_status;
  `;
  const values = [
    email,
    passwordHash,
    firstName,
    lastName,
    phoneNumber || null,
    emailOtp || null,
    emailOtpExpiresAt || null,
    phoneOtp || null,
    phoneOtpExpiresAt || null,
  ];
  const res = await query(text, values);
  return res.rows[0];
};

export const findById = async (id) => {
  const text =
    "SELECT id, email, first_name, last_name, phone_number, nin, bvn, nin_enc, bvn_enc, nin_key_id, bvn_key_id, email_otp, email_otp_expires_at, email_otp_attempts, phone_otp, phone_otp_expires_at, phone_otp_reference_id, phone_otp_attempts, phone_otp_sent_at, is_email_verified, is_phone_verified, is_identity_verified, is_face_verified, verification_status, account_status, account_status_reason FROM recruiters WHERE id = $1";
  const res = await query(text, [id]);
  return revealIdentifiers(res.rows[0]);
};

export const findByEmail = async (email) => {
  const text = "SELECT * FROM recruiters WHERE email = $1";
  const res = await query(text, [email]);
  return revealIdentifiers(res.rows[0]);
};

export const update = async (id, data) => {
  const enriched = await withEncryptedIdentifiers(data);
  const fields = [];
  const values = [];
  let i = 1;
  for (const [key, value] of Object.entries(enriched)) {
    fields.push(`${key} = $${i}`);
    values.push(value);
    i++;
  }
  if (fields.length === 0) return null;
  values.push(id);
  const text = `UPDATE recruiters SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = $${i} RETURNING *`;
  const res = await query(text, values);
  return revealIdentifiers(res.rows[0]);
};

export const updateVerificationStatus = async (id, status) => {
  const text = `UPDATE recruiters SET verification_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`;
  const res = await query(text, [status, id]);
  return res.rows[0];
};

/**
 * Account-level sanction (Super Admin only — enforced at the route).
 * Returns the public-safe row; never touches PII columns.
 */
export const setAccountStatus = async (id, { status, reason = null, changedBy = null }) => {
  const text = `
    UPDATE recruiters
    SET account_status = $1,
        account_status_reason = $2,
        account_status_changed_at = CURRENT_TIMESTAMP,
        account_status_changed_by = $3,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $4
    RETURNING id, email, first_name, last_name, account_status, account_status_reason, account_status_changed_at
  `;
  const res = await query(text, [status, reason, changedBy, id]);
  return res.rows[0];
};

/**
 * Serialize a recruiter for API responses. NIN/BVN (plaintext or ciphertext)
 * and OTP secrets never leave the server — the model decrypts them for
 * internal business logic only. No frontend consumes these fields.
 */
export const toPublicRecruiter = (row) => {
  if (!row) return row;
  const out = { ...row };
  for (const field of [
    'password_hash', 'nin', 'bvn', 'nin_enc', 'bvn_enc', 'nin_key_id', 'bvn_key_id',
    'email_otp', 'email_otp_expires_at', 'phone_otp', 'phone_otp_expires_at',
    'phone_otp_reference_id', 'phone_otp_attempts',
  ]) {
    delete out[field];
  }
  return out;
};
