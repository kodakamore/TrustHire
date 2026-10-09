import { query } from '../config/database.js';

// ===========================================================================
// recruiter_face_verifications — one row per Didit verification session.
//
// The decision is written exactly once: markDecision only updates rows still
// in a non-terminal state, so a retried/duplicate webhook is a no-op.
// ===========================================================================

export const create = async ({
  recruiterId,
  provider = 'didit',
  environment,
  sessionId,
}) => {
  const text = `
    INSERT INTO recruiter_face_verifications (recruiter_id, provider, environment, session_id)
    VALUES ($1, $2, $3, $4)
    RETURNING *;
  `;
  const res = await query(text, [recruiterId, provider, environment, sessionId]);
  return res.rows[0];
};

export const findBySessionId = async (sessionId) => {
  const res = await query(
    'SELECT * FROM recruiter_face_verifications WHERE session_id = $1',
    [sessionId],
  );
  return res.rows[0];
};

export const findLatestByRecruiterId = async (recruiterId) => {
  const res = await query(
    `SELECT * FROM recruiter_face_verifications
     WHERE recruiter_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [recruiterId],
  );
  return res.rows[0];
};

/** Record a terminal decision. Guarded: only applies to non-terminal rows. */
export const markDecision = async ({
  id,
  status,
  livenessResult = null,
  faceMatch = null,
  faceMatchScore = null,
  method = null,
  rawEncrypted = null,
  verifiedAt = null,
}) => {
  const text = `
    UPDATE recruiter_face_verifications
    SET status = $2,
        liveness_result = $3,
        face_match = $4,
        face_match_score = $5,
        method = $6,
        raw_result = COALESCE($7, raw_result),
        verified_at = $8,
        updated_at = now()
    WHERE id = $1 AND status IN ('pending', 'in_review')
    RETURNING *;
  `;
  const res = await query(text, [
    id, status, livenessResult, faceMatch, faceMatchScore, method, rawEncrypted, verifiedAt,
  ]);
  return res.rows[0] || null; // null = already terminal (idempotent replay)
};

/** Attach the encrypted-store pointer of the verified face image. */
export const setFacePhotoRef = async (id, ref) => {
  const res = await query(
    `UPDATE recruiter_face_verifications
     SET face_photo_ref = $2, updated_at = now()
     WHERE id = $1
     RETURNING face_photo_ref;`,
    [id, ref],
  );
  return res.rows[0]?.face_photo_ref ?? null;
};
