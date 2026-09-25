import dotenv from 'dotenv';
dotenv.config();

import { query } from '../config/database.js';

async function migrate() {
  console.log('Migrating recruiters table to add OTP columns...');
  try {
    await query(`
      ALTER TABLE recruiters
      ADD COLUMN IF NOT EXISTS phone_otp VARCHAR(10),
      ADD COLUMN IF NOT EXISTS phone_otp_expires_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS email_otp VARCHAR(10),
      ADD COLUMN IF NOT EXISTS email_otp_expires_at TIMESTAMP WITH TIME ZONE;
    `);
    console.log('Migration successful: phone_otp and email_otp columns added to recruiters table.');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    process.exit(0);
  }
}

migrate();
