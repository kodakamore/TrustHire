import dotenv from "dotenv";
dotenv.config();

import { query } from "../config/database.js";

// Supports moving phone OTP generation/validation to Dojah itself (storing
// only Dojah's reference_id, not a locally-generated code) plus a simple
// attempt-limit counter to slow down brute-forcing a 4-6 digit OTP.
async function migrate() {
  console.log(
    "Migrating recruiters table to add Dojah-OTP reference + attempt-limit columns...",
  );
  try {
    await query(`
      ALTER TABLE recruiters
      ADD COLUMN IF NOT EXISTS phone_otp_reference_id TEXT,
      ADD COLUMN IF NOT EXISTS phone_otp_attempts INTEGER NOT NULL DEFAULT 0;
    `);
    console.log(
      "Migration successful: phone_otp_reference_id and phone_otp_attempts columns added to recruiters table.",
    );
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    process.exit(0);
  }
}

migrate();
