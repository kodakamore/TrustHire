// apply-007.js — apply db/migrations/007_verification_hardening.sql to the
// configured database. Idempotent (the migration uses IF NOT EXISTS).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { Client } = pg;

const run = async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, '..', 'db', 'migrations', '007_verification_hardening.sql'),
      'utf8',
    );
    await client.query(sql);
    console.log('007_verification_hardening.sql applied.');
    const cols = await client.query(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE (table_name='recruiters' AND column_name IN ('email_otp_attempts','phone_otp_sent_at'))
         OR (table_name='companies' AND column_name IN ('corporate_email_otp_attempts','is_dns_verified'))
      ORDER BY table_name, column_name`);
    for (const r of cols.rows) console.log(`  ✓ ${r.table_name}.${r.column_name}`);
    if (cols.rows.length !== 4) {
      console.error(`ERROR: expected 4 columns, found ${cols.rows.length}`);
      process.exit(1);
    }
  } finally {
    await client.end();
  }
};

run().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
