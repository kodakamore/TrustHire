import { query } from '../config/database.js';
import { hashJobData } from '../services/hash.service.js';

export const create = async (data) => {
  const { 
    recruiterId, companyId, title, description, location, employmentType, 
    salaryRange, applicationUrl, applicationEmail, requirements, benefits, 
    deadline, dataHash, status, flags 
  } = data;
  const text = `
    INSERT INTO job_advertisements (
      recruiter_id, company_id, title, description, location, 
      employment_type, salary_range, application_url, application_email, 
      requirements, benefits, deadline, data_hash, status, flags
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING *;
  `;
  const values = [
    recruiterId, companyId, title, description, location, 
    employmentType, salaryRange, applicationUrl || null, applicationEmail || null, 
    requirements || null, benefits || null, deadline || null, 
    dataHash, status || 'pending', flags ? JSON.stringify(flags) : null
  ];
  const res = await query(text, values);
  return res.rows[0];
};

export const findById = async (id) => {
  const text = `
    SELECT j.*, c.name as company_name, vc.pin, vc.expires_at, vc.qr_code_url, vc.qr_code_path
    FROM job_advertisements j 
    LEFT JOIN companies c ON j.company_id = c.id 
    LEFT JOIN verification_codes vc ON j.id = vc.job_ad_id AND vc.is_active = TRUE
    WHERE j.id = $1
  `;
  const res = await query(text, [id]);
  return res.rows[0];
};

export const findByRecruiterId = async (recruiterId) => {
  const text = `
    SELECT j.*, c.name as company_name, vc.pin, vc.expires_at, vc.qr_code_url, vc.qr_code_path
    FROM job_advertisements j 
    LEFT JOIN companies c ON j.company_id = c.id 
    LEFT JOIN verification_codes vc ON j.id = vc.job_ad_id AND vc.is_active = TRUE
    WHERE j.recruiter_id = $1
    ORDER BY j.created_at DESC
  `;
  const res = await query(text, [recruiterId]);
  return res.rows;
};

// Column names are interpolated into SQL, so keys must look like plain
// identifiers (defense-in-depth on top of the controller allowlist — audit C1).
const SAFE_COLUMN = /^[a-z_][a-z0-9_]*$/;

export const update = async (id, data) => {
  const fields = [];
  const values = [];
  let i = 1;
  for (const [key, value] of Object.entries(data)) {
    if (!SAFE_COLUMN.test(key)) {
      throw new Error(`Invalid column name in update: ${key}`);
    }
    if (key === 'flags') {
        fields.push(`${key} = $${i}::jsonb`);
        values.push(JSON.stringify(value));
    } else {
        fields.push(`${key} = $${i}`);
        values.push(value);
    }
    i++;
  }
  if (fields.length === 0) return null;
  values.push(id);
  const text = `UPDATE job_advertisements SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${i} RETURNING *`;
  const res = await query(text, values);
  const row = res.rows[0];

  // Keep data_hash in lockstep with content: any edit re-hashes, so the
  // snapshot-integrity check at public lookup time reflects reality and
  // never false-positives after a legit pre-approval edit.
  if (row) {
    try {
      const fresh = hashJobData({
        title: row.title,
        description: row.description,
        company_id: row.company_id,
        location: row.location,
        employment_type: row.employment_type,
        salary_range: row.salary_range,
      });
      if (row.data_hash !== fresh) {
        await query('UPDATE job_advertisements SET data_hash = $1 WHERE id = $2', [fresh, id]);
        row.data_hash = fresh;
      }
    } catch (err) {
      console.error(`data_hash recompute failed for job ${id}: ${err.message}`);
    }
  }
  return row;
};

export const updateStatus = async (id, status) => {
  const text = `UPDATE job_advertisements SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`;
  const res = await query(text, [status, id]);
  return res.rows[0];
};
