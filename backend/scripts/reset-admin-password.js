/**
 * reset-admin-password.js
 * Usage: node scripts/reset-admin-password.js [new-password]
 * If no password is provided, defaults to "Admin@TrustHire2024"
 */
import bcrypt from 'bcrypt';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = pg;

const ADMIN_EMAIL = 'admin@trusthire.ng';
const NEW_PASSWORD = process.argv[2] || 'Admin@TrustHire2024';

async function resetAdminPassword() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Check if admin exists
    const existing = await pool.query(
      'SELECT id, email, role FROM admins WHERE email = $1',
      [ADMIN_EMAIL]
    );

    const hash = await bcrypt.hash(NEW_PASSWORD, 10);

    if (existing.rowCount === 0) {
      // Admin doesn't exist — create one
      console.log(`⚠️  No admin found with email "${ADMIN_EMAIL}". Creating...`);
      await pool.query(
        `INSERT INTO admins (email, password_hash, role)
         VALUES ($1, $2, 'super_admin')`,
        [ADMIN_EMAIL, hash]
      );
      console.log(`✅ Admin account created.`);
    } else {
      // Update existing admin
      await pool.query(
        'UPDATE admins SET password_hash = $1 WHERE email = $2',
        [hash, ADMIN_EMAIL]
      );
      console.log(`✅ Password updated for admin: ${ADMIN_EMAIL}`);
    }

    console.log(`\n🔑 Admin Credentials`);
    console.log(`   Email:    ${ADMIN_EMAIL}`);
    console.log(`   Password: ${NEW_PASSWORD}`);
    console.log(`\n   Login at: http://localhost:3000/admin/login\n`);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

resetAdminPassword();
