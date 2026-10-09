// ===========================================================================
// create-admin.js — provision an admin account WITHOUT going through the
// HTTP endpoint. POST /api/auth/admin/register is locked down (audit C3):
// once any admin exists it requires the ADMIN_BOOTSTRAP_TOKEN. This script
// is the supported alternative — it talks to the database directly, so it
// must be run on the server host (same access model as reset-admin-password).
//
// Usage:
//   node scripts/create-admin.js <email> <password> [role]
//   role defaults to "admin"; use "super_admin" for the elevated role.
// ===========================================================================
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { query } from '../config/database.js';

dotenv.config();

const [email, password, role = 'admin'] = process.argv.slice(2);

if (!email || !password) {
  console.error('Usage: node scripts/create-admin.js <email> <password> [role]');
  process.exit(1);
}
if (password.length < 6) {
  console.error('ERROR: password must be at least 6 characters.');
  process.exit(1);
}
if (!['admin', 'super_admin'].includes(role)) {
  console.error(`ERROR: role must be "admin" or "super_admin" (got "${role}").`);
  process.exit(1);
}

try {
  const existing = await query('SELECT id FROM admins WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length > 0) {
    console.error(`ERROR: admin "${email}" already exists.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const res = await query(
    'INSERT INTO admins (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role',
    [email.toLowerCase(), passwordHash, role],
  );
  console.log(`✅ Created ${res.rows[0].role} admin: ${res.rows[0].email} (id ${res.rows[0].id})`);
} catch (err) {
  console.error('ERROR:', err.message);
  process.exit(1);
}
process.exit(0);
