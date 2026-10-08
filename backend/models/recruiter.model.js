import { query } from "../config/database.js";

export const create = async (data) => {
  const {
    email,
    passwordHash,
    firstName,
    lastName,
    phoneNumber,
    emailOtp,
    emailOtpExpiresAt,
    phoneOtp,
    phoneOtpExpiresAt,
  } = data;
  const text = `
    INSERT INTO recruiters (email, password_hash, first_name, last_name, phone_number, email_otp, email_otp_expires_at, phone_otp, phone_otp_expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, email, first_name, last_name, phone_number, email_otp, email_otp_expires_at, phone_otp, phone_otp_expires_at, verification_status;
  `;
  const values = [
    email,
    passwordHash,
    firstName,
    lastName,
    phoneNumber || null,
    emailOtp || null,
    emailOtpExpiresAt || null,
    phoneOtp || null,
    phoneOtpExpiresAt || null,
  ];
  const res = await query(text, values);
  return res.rows[0];
};

export const findById = async (id) => {
  const text =
    "SELECT id, email, first_name, last_name, phone_number, nin, bvn, email_otp, email_otp_expires_at, phone_otp, phone_otp_expires_at, phone_otp_reference_id, phone_otp_attempts, is_email_verified, is_phone_verified, is_identity_verified, is_face_verified, verification_status FROM recruiters WHERE id = $1";
  const res = await query(text, [id]);
  return res.rows[0];
};

export const findByEmail = async (email) => {
  const text = "SELECT * FROM recruiters WHERE email = $1";
  const res = await query(text, [email]);
  return res.rows[0];
};

export const update = async (id, data) => {
  const fields = [];
  const values = [];
  let i = 1;
  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = $${i}`);
    values.push(value);
    i++;
  }
  if (fields.length === 0) return null;
  values.push(id);
  const text = `UPDATE recruiters SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = $${i} RETURNING *`;
  const res = await query(text, values);
  return res.rows[0];
};

export const updateVerificationStatus = async (id, status) => {
  const text = `UPDATE recruiters SET verification_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`;
  const res = await query(text, [status, id]);
  return res.rows[0];
};
