-- 007_verification_hardening.sql
-- Audit hardening (C6/C7/C13): per-account OTP attempt counters, phone send
-- cooldown, and the distinct DNS-ownership flag.
--
-- Idempotent: safe to re-run.

-- C6: per-account guess limit for the REGISTRATION email OTP.
ALTER TABLE recruiters
  ADD COLUMN IF NOT EXISTS email_otp_attempts INTEGER NOT NULL DEFAULT 0;

-- C7: per-account send cooldown for phone OTPs (60s), independent of the
-- per-IP rate limiter which is bypassable behind shared NAT.
ALTER TABLE recruiters
  ADD COLUMN IF NOT EXISTS phone_otp_sent_at TIMESTAMPTZ;

-- C6: per-account guess limit for the CORPORATE email OTP.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS corporate_email_otp_attempts INTEGER NOT NULL DEFAULT 0;

-- C13: DNS TXT ownership proof recorded distinctly from the WHOIS/APIVoid
-- heuristic verdict (is_domain_verified). Reset on website_url change.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS is_dns_verified BOOLEAN NOT NULL DEFAULT FALSE;
