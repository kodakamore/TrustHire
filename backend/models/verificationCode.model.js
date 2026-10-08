import { query } from '../config/database.js';

// ===========================================================================
// Verification-code lifecycle.
//   active -> deactivated | revoked | compromised (then a fresh code is
//   reissued for the SAME approved advert).
// compromised is the victim-protecting state: the credential was cloned by a
// third party; the recruiter stays verified and gets a new code.
// `is_active` is kept in sync with `status = 'active'` (dual-write) because
// legacy queries filter on it.
// ===========================================================================

export const create = async (data) => {
  const { jobAdId, pin, qrCodeUrl, qrCodePath, expiresAt } = data;
  const text = `
    INSERT INTO verification_codes (job_ad_id, pin, qr_code_url, qr_code_path, expires_at)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;
  const values = [jobAdId, pin, qrCodeUrl, qrCodePath, expiresAt];
  const res = await query(text, values);
  return res.rows[0];
};

export const findById = async (id) => {
  const res = await query('SELECT * FROM verification_codes WHERE id = $1', [id]);
  return res.rows[0];
};

export const findByPin = async (pin) => {
  const text = `
    SELECT 
      vc.*,
      j.title,
      j.description,
      j.location,
      j.employment_type,
      j.salary_range,
      j.application_url,
      j.application_email,
      j.requirements,
      j.benefits,
      j.deadline,
      j.status as job_status,
      j.data_hash,
      j.company_id,
      c.name as company_name,
      c.website_url as company_website,
      c.is_cac_verified,
      c.is_domain_verified,
      c.verification_status as company_verification_status,
      r.first_name as recruiter_first_name,
      r.last_name as recruiter_last_name,
      r.email as recruiter_email
    FROM verification_codes vc
    JOIN job_advertisements j ON vc.job_ad_id = j.id
    JOIN companies c ON j.company_id = c.id
    JOIN recruiters r ON j.recruiter_id = r.id
    WHERE UPPER(vc.pin) = UPPER($1) OR REPLACE(UPPER(vc.pin), '-', '') = REPLACE(UPPER($1), '-', '')
    ORDER BY (vc.status = 'active') DESC, vc.created_at DESC
    LIMIT 1
  `;
  const res = await query(text, [pin]);
  return res.rows[0];
};

export const findByJobAdId = async (jobAdId) => {
  const text = 'SELECT * FROM verification_codes WHERE job_ad_id = $1 AND is_active = TRUE ORDER BY created_at DESC LIMIT 1';
  const res = await query(text, [jobAdId]);
  return res.rows[0];
};

/** Move a code to a terminal lifecycle state (dual-write is_active). */
export const setStatus = async (id, status, reason = null) => {
  // Booleans computed in JS — reusing one param in both SET and CASE
  // contexts makes Postgres fail with "inconsistent types deduced".
  const isRevoked = status === 'revoked';
  const isCompromised = status === 'compromised';
  const isTerminal = status !== 'active';
  const text = `
    UPDATE verification_codes
    SET status = $1,
        is_active = FALSE,
        revoked_reason = CASE WHEN $2 THEN COALESCE($3, revoked_reason) ELSE revoked_reason END,
        compromised_at = CASE WHEN $4 THEN now() ELSE compromised_at END,
        deactivated_at = CASE WHEN $5 THEN now() ELSE deactivated_at END
    WHERE id = $6
    RETURNING *
  `;
  const res = await query(text, [status, isRevoked, reason, isCompromised, isTerminal, id]);
  return res.rows[0];
};

export const deactivate = async (id) => setStatus(id, 'deactivated');

export const deactivateByJobAdId = async (jobAdId) => {
  const text = `
    UPDATE verification_codes
    SET is_active = FALSE, status = 'deactivated', deactivated_at = now()
    WHERE job_ad_id = $1 AND status = 'active'
    RETURNING *
  `;
  const res = await query(text, [jobAdId]);
  return res.rows;
};

/**
 * Issue a fresh code for a job, demoting any other active codes first.
 * Enforces the "exactly one active code per job" invariant (unique index
 * uq_verification_codes_one_active_per_job).
 */
export const reissueForJob = async ({ jobAdId, pin, qrCodeUrl, qrCodePath, expiresAt, previousId = null }) => {
  await deactivateByJobAdId(jobAdId);
  const text = `
    INSERT INTO verification_codes (job_ad_id, pin, qr_code_url, qr_code_path, expires_at, status, is_active, reissued_from)
    VALUES ($1, $2, $3, $4, $5, 'active', TRUE, $6)
    RETURNING *
  `;
  const res = await query(text, [jobAdId, pin, qrCodeUrl, qrCodePath, expiresAt, previousId]);
  return res.rows[0];
};
