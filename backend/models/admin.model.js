import { query } from '../config/database.js';

export const create = async (data) => {
  const { email, passwordHash, role } = data;
  const text = `
    INSERT INTO admins (email, password_hash, role)
    VALUES ($1, $2, $3)
    RETURNING id, email, role, created_at;
  `;
  const values = [email, passwordHash, role || 'admin'];
  const res = await query(text, values);
  return res.rows[0];
};

export const findByEmail = async (email) => {
  const text = 'SELECT * FROM admins WHERE email = $1';
  const res = await query(text, [email]);
  return res.rows[0];
};

export const findById = async (id) => {
  const text = 'SELECT id, email, role, created_at FROM admins WHERE id = $1';
  const res = await query(text, [id]);
  return res.rows[0];
};

// Used by the admin-registration lockdown (audit C3): first-run bootstrap is
// only permitted while this is zero.
export const count = async () => {
  const res = await query('SELECT COUNT(*)::int AS n FROM admins');
  return res.rows[0].n;
};
