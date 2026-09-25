import { query } from '../config/database.js';

export const create = async (data) => {
  const { jobAdId, reporterEmail, reportReason } = data;
  const text = `
    INSERT INTO reports (job_ad_id, reporter_email, report_reason)
    VALUES ($1, $2, $3)
    RETURNING *;
  `;
  const values = [jobAdId, reporterEmail, reportReason];
  const res = await query(text, values);
  return res.rows[0];
};

export const findAll = async () => {
  const text = 'SELECT * FROM reports ORDER BY created_at DESC';
  const res = await query(text);
  return res.rows;
};

export const findById = async (id) => {
  const text = 'SELECT * FROM reports WHERE id = $1';
  const res = await query(text, [id]);
  return res.rows[0];
};

export const updateStatus = async (id, status, adminNotes) => {
  const text = `UPDATE reports SET status = $1, admin_notes = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *`;
  const res = await query(text, [status, adminNotes, id]);
  return res.rows[0];
};
