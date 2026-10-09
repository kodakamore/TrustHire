-- ===========================================================================
-- 005_face_verification.sql
-- Didit-powered recruiter face/liveness verification records.
--
-- Each row is ONE Didit verification session for one recruiter. The verdict
-- arrives asynchronously via a signed webhook (or polling), so the row starts
-- 'pending' and moves to a terminal state (approved/declined) exactly once.
--
-- Privacy posture: we store the DECISION, not the biometrics. The raw
-- provider payload is persisted encrypted (raw_result) for the audit trail;
-- face images/video never touch our database — Didit holds the evidence
-- for the duration of its retention window.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS recruiter_face_verifications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id     UUID NOT NULL REFERENCES recruiters(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL DEFAULT 'didit',
  -- 'sandbox' | 'live' (real keys) | 'mock' (local flow without keys)
  environment      TEXT NOT NULL DEFAULT 'sandbox',
  session_id       TEXT NOT NULL UNIQUE,
  -- pending -> approved | declined (terminal); in_review = manual review
  status           TEXT NOT NULL DEFAULT 'pending',
  liveness_result  BOOLEAN,
  face_match       BOOLEAN,
  face_match_score NUMERIC,
  method           TEXT,
  -- Full provider event, encrypted at rest (envelope encryption, see
  -- docs/ENCRYPTION.md). Audit only — never rendered to clients.
  raw_result       TEXT,
  verified_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ff_status_valid CHECK (status IN ('pending', 'in_review', 'approved', 'declined'))
);

CREATE INDEX IF NOT EXISTS idx_ff_recruiter_latest
  ON recruiter_face_verifications (recruiter_id, created_at DESC);
