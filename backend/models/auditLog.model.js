import { query } from '../config/database.js';

export const create = async (data) => {
  const { eventType, actorId, actorType, targetId, targetType, details, ipAddress, userAgent } = data;
  const text = `
    INSERT INTO audit_logs (event_type, actor_id, actor_type, target_id, target_type, details, ip_address, user_agent)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *;
  `;
  const values = [eventType, actorId, actorType, targetId, targetType, details ? JSON.stringify(details) : null, ipAddress, userAgent];
  const res = await query(text, values);
  return res.rows[0];
};

export const findAll = async (limit = 50, offset = 0) => {
  const text = 'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2';
  const res = await query(text, [limit, offset]);
  return res.rows;
};
