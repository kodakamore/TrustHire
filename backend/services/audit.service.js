import { query } from '../config/database.js';

export const logEvent = async (eventType, actorId, actorType, targetId, targetType, details, ipAddress, userAgent) => {
  try {
    const text = `
      INSERT INTO audit_logs (event_type, actor_id, actor_type, target_id, target_type, details, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const values = [eventType, actorId, actorType, targetId, targetType, details, ipAddress, userAgent];
    const res = await query(text, values);
    return res.rows[0];
  } catch (error) {
    console.error('Error logging audit event:', error);
    // Don't throw, we don't want audit failure to break the app
  }
};
