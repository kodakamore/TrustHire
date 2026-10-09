-- ===========================================================================
-- 006_face_photo.sql
-- Store the verified face image pointer on the Didit verification record.
--
-- The Didit decision returns time-limited presigned URLs (liveness
-- reference_image / face-match target_image). We download the bytes at
-- approval time and persist them in the ENCRYPTED photo store (same
-- AES-256-GCM object storage as NIN/BVN ID photos, see storage.service.js);
-- this column holds only the photo://<uuid> pointer, never image bytes.
--
-- Purpose limitation: the photo exists so the recruiter (and investigators)
-- can see WHICH face was verified. It is served only through the
-- authenticated self-view endpoint — never in list payloads, never cached.
-- ===========================================================================

ALTER TABLE recruiter_face_verifications
  ADD COLUMN IF NOT EXISTS face_photo_ref TEXT;
