-- ============================================================
-- 004_reports_workflow.sql
-- Report findings/severity state machine, verification-code
-- lifecycle (compromised + reissue), recruiter account sanctions.
-- Idempotent: safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1) verification_codes: lifecycle status
--    active | deactivated | revoked | compromised
--    (expiry stays time-based via expires_at — no cron needed)
-- ------------------------------------------------------------
ALTER TABLE verification_codes ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE verification_codes ADD COLUMN IF NOT EXISTS compromised_at TIMESTAMPTZ;
ALTER TABLE verification_codes ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
ALTER TABLE verification_codes ADD COLUMN IF NOT EXISTS revoked_reason TEXT;
ALTER TABLE verification_codes ADD COLUMN IF NOT EXISTS reissued_from UUID REFERENCES verification_codes(id);

DO $$ BEGIN
  ALTER TABLE verification_codes ADD CONSTRAINT chk_verification_codes_status
    CHECK (status IN ('active', 'expired', 'deactivated', 'revoked', 'compromised'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill: historic is_active = FALSE rows become 'deactivated'
-- (historic reason is unknowable; revoked-ness is derived from job status)
UPDATE verification_codes
SET status = 'deactivated', deactivated_at = COALESCE(deactivated_at, now())
WHERE is_active = FALSE AND status = 'active';

-- Enforce ONE active code per job: demote older duplicates first
-- (latest created_at stays active) so the unique index can build.
UPDATE verification_codes vc
SET status = 'deactivated', is_active = FALSE, deactivated_at = COALESCE(deactivated_at, now())
WHERE vc.status = 'active'
  AND EXISTS (
    SELECT 1 FROM verification_codes x
    WHERE x.job_ad_id = vc.job_ad_id
      AND x.status = 'active'
      AND (x.created_at > vc.created_at OR (x.created_at = vc.created_at AND x.id > vc.id))
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_verification_codes_one_active_per_job
  ON verification_codes (job_ad_id)
  WHERE status = 'active';

-- ------------------------------------------------------------
-- 2) reports: intake + investigation workflow
--    status:  open -> under_review -> escalated -> resolved | closed
--    finding: set by Admin after side-by-side comparison
-- ------------------------------------------------------------
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS category VARCHAR(40) NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS finding VARCHAR(40),
  ADD COLUMN IF NOT EXISTS severity VARCHAR(10) NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS observed_content JSONB,
  ADD COLUMN IF NOT EXISTS verification_code_id UUID REFERENCES verification_codes(id),
  ADD COLUMN IF NOT EXISTS reporter_phone VARCHAR(30),
  ADD COLUMN IF NOT EXISTS assigned_to UUID,
  ADD COLUMN IF NOT EXISTS resolved_by UUID,
  ADD COLUMN IF NOT EXISTS resolution_action VARCHAR(40),
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status);
CREATE INDEX IF NOT EXISTS idx_reports_severity ON reports (severity);
CREATE INDEX IF NOT EXISTS idx_reports_code ON reports (verification_code_id);

-- Link historic reports to their verification code
UPDATE reports r
SET verification_code_id = vc.id
FROM verification_codes vc
WHERE r.verification_code_id IS NULL
  AND vc.job_ad_id = r.job_ad_id;

-- Split legacy "reason: description" concatenation (runs once: description
-- becomes non-NULL so the WHERE no longer matches on re-run)
UPDATE reports
SET description = substring(report_reason from position(': ' in report_reason) + 2),
    report_reason = substring(report_reason from 1 for position(': ' in report_reason) - 1)
WHERE description IS NULL
  AND position(': ' in report_reason) > 0;

-- ------------------------------------------------------------
-- 3) recruiters: account-level sanctions (Super Admin only)
-- ------------------------------------------------------------
ALTER TABLE recruiters ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE recruiters ADD COLUMN IF NOT EXISTS account_status_reason TEXT;
ALTER TABLE recruiters ADD COLUMN IF NOT EXISTS account_status_changed_at TIMESTAMPTZ;
ALTER TABLE recruiters ADD COLUMN IF NOT EXISTS account_status_changed_by UUID;

DO $$ BEGIN
  ALTER TABLE recruiters ADD CONSTRAINT chk_recruiters_account_status
    CHECK (account_status IN ('active', 'suspended', 'removed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
