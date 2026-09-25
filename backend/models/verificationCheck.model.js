import { query } from '../config/database.js';

export const create = async (data) => {
  const { targetId, targetType, checkType, provider, referenceId, rawResponse, isSuccessful } = data;
  const text = `
    INSERT INTO verification_checks (target_id, target_type, check_type, provider, reference_id, raw_response, is_successful)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *;
  `;
  const values = [targetId, targetType, checkType, provider, referenceId, JSON.stringify(rawResponse), isSuccessful];
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
