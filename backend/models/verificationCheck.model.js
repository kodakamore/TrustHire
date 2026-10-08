import { query } from '../config/database.js';
import { sanitizeProviderResponse } from '../utils/piiRedactor.js';

// ===========================================================================
// SINGLE WRITE SEAM for verification_checks.raw_response.
//
// Provider responses (Dojah, WhoisJSON, APIVoid) can echo back full NIN/BVN
// and base64 ID photos. Every controller that persists a rawResponse goes
// through here, so sanitizing in the model guarantees no write path can leak
// — including future ones that forget to sanitize.
//
// Images that were extracted to encrypted storage first are stored as
// `photo://<uuid>` pointers (short, not image-shaped) and pass through
// untouched; only leftover raw base64 bytes are dropped.
// ===========================================================================

export const create = async (data) => {
  const { targetId, targetType, checkType, provider, referenceId, rawResponse, isSuccessful } = data;
  const { clean } = sanitizeProviderResponse(rawResponse);
  const text = `
    INSERT INTO verification_checks (target_id, target_type, check_type, provider, reference_id, raw_response, is_successful)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *;
  `;
  const values = [targetId, targetType, checkType, provider, referenceId, JSON.stringify(clean), isSuccessful];
  const res = await query(text, values);
  return res.rows[0];
};

export const findByRecruiterId = async (recruiterId) => {
  const text = `SELECT * FROM verification_checks WHERE target_id = $1 AND target_type = 'recruiter' ORDER BY created_at DESC`;
  const res = await query(text, [recruiterId]);
  return res.rows;
};

export const findByCompanyId = async (companyId) => {
  const text = `SELECT * FROM verification_checks WHERE target_id = $1 AND target_type = 'company' ORDER BY created_at DESC`;
  const res = await query(text, [companyId]);
  return res.rows;
};
