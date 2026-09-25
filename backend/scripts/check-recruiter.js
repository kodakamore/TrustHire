import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const res = await pool.query(
  `SELECT id, email, phone_number, is_email_verified, is_phone_verified, is_identity_verified, is_face_verified, verification_status 
   FROM recruiters WHERE email = 'testrecruiter@example.com'`
);
console.log('Recruiter record:', JSON.stringify(res.rows[0], null, 2));

// If phone_number is null or missing, set a valid one
if (res.rows[0] && !res.rows[0].phone_number) {
  await pool.query(
    `UPDATE recruiters SET phone_number = '+2348012345678' WHERE email = 'testrecruiter@example.com'`
  );
  console.log('✅ Phone number set to +2348012345678');
}

await pool.end();
