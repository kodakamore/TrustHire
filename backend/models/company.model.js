import { query } from '../config/database.js';

export const create = async (data) => {
  const { recruiterId, name, registrationNumber, tinNumber, websiteUrl, address, industry } = data;
  const text = `
    INSERT INTO companies (recruiter_id, name, registration_number, tin_number, website_url, address, industry)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *;
  `;
  const values = [recruiterId, name, registrationNumber, tinNumber, websiteUrl, address, industry];
  const res = await query(text, values);
  return res.rows[0];
};

export const findById = async (id) => {
  const text = 'SELECT * FROM companies WHERE id = $1';
  const res = await query(text, [id]);
  return res.rows[0];
};

export const findByRecruiterId = async (recruiterId) => {
  const text = 'SELECT * FROM companies WHERE recruiter_id = $1';
  const res = await query(text, [recruiterId]);
  return res.rows;
};

export const update = async (id, data) => {
  const fields = [];
  const values = [];
  let i = 1;
  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = $${i}`);
    values.push(value);
    i++;
  }
  if (fields.length === 0) return null;
  values.push(id);
  const text = `UPDATE companies SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${i} RETURNING *`;
  const res = await query(text, values);
  return res.rows[0];
};

export const updateVerificationStatus = async (id, status) => {
  const text = `UPDATE companies SET verification_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`;
  const res = await query(text, [status, id]);
  return res.rows[0];
};
