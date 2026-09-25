/**
 * reset-recruiter-password.js
 * Usage: node scripts/reset-recruiter-password.js [email] [new-password]
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

const RECRUITER_EMAIL = process.argv[2] || 'testrecruiter@example.com';
const NEW_PASSWORD = process.argv[3] || 'Recruiter@Test2024';

async function resetRecruiterPassword() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const existing = await pool.query(
      'SELECT id, email FROM recruiters WHERE email = $1',
      [RECRUITER_EMAIL]
    );

    if (existing.rowCount === 0) {
      console.error(`❌ No recruiter found with email "${RECRUITER_EMAIL}"`);
      process.exit(1);
    }

    const hash = await bcrypt.hash(NEW_PASSWORD, 10);

    await pool.query(
      'UPDATE recruiters SET password_hash = $1 WHERE email = $2',
      [hash, RECRUITER_EMAIL]
    );

    console.log(`✅ Password updated for recruiter: ${RECRUITER_EMAIL}`);
    console.log(`\n🔑 Recruiter Credentials`);
    console.log(`   Email:    ${RECRUITER_EMAIL}`);
    console.log(`   Password: ${NEW_PASSWORD}`);
    console.log(`\n   Login at: http://localhost:3000/recruiter/login\n`);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

resetRecruiterPassword();
