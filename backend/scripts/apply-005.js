// One-shot: apply 005_face_verification.sql to the configured database.
// Safe to re-run (the migration uses IF NOT EXISTS).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const sql = fs.readFileSync(
  path.join(__dirname, '..', 'db', 'migrations', '005_face_verification.sql'),
  'utf8',
);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(sql);
  const check = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'recruiter_face_verifications' ORDER BY ordinal_position",
  );
  console.log(`OK — recruiter_face_verifications ready (${check.rows.length} columns)`);
} finally {
  await client.end();
}
