import { query } from '../config/database.js';

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
  `;
  const res = await query(text, [pin]);
  return res.rows[0];
};

export const findByJobAdId = async (jobAdId) => {
  const text = 'SELECT * FROM verification_codes WHERE job_ad_id = $1 AND is_active = TRUE ORDER BY created_at DESC LIMIT 1';
  const res = await query(text, [jobAdId]);
  return res.rows[0];
};

export const deactivate = async (id) => {
  const text = `UPDATE verification_codes SET is_active = FALSE WHERE id = $1 RETURNING *`;
  const res = await query(text, [id]);
  return res.rows[0];
};

export const deactivateByJobAdId = async (jobAdId) => {
  const text = `UPDATE verification_codes SET is_active = FALSE WHERE job_ad_id = $1 RETURNING *`;
  const res = await query(text, [jobAdId]);
  return res.rows;
};
