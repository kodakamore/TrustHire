import { query } from '../config/database.js';
import { checkEmailDomainMatch, checkDirectorMatch } from '../utils/domainHelper.js';

/**
 * TrustHire Ideal 4-Pillar Verification Decision Engine:
 * 1. Recruiter Personal Identity (Email, Phone, NIN/BVN, Live Biometric Face)
 * 2. Corporate Legitimacy (CAC Registration & Status)
 * 3. Domain Safety & Reputation (WhoisXML Domain Age + APIVoid Threat Screening)
 * 4. Recruiter-to-Domain Linkage (Corporate Email Match OR CAC Director Match)
 *
 * Outcome:
 * - If all 4 pillars pass cleanly with zero flags → AUTO-APPROVED ('approved')
 * - If flags are raised (e.g. personal email used, new domain, threat score) → ADMIN MANUAL REVIEW ('pending')
 */
export const processJobVerification = async (jobAd, recruiter, company) => {
  const flags = [];

  // =========================================================================
  // PILLAR 1: RECRUITER PERSONAL IDENTITY CHECKS
  // =========================================================================
  if (!recruiter.is_email_verified) {
    flags.push({
      type: 'recruiter_email_not_verified',
      severity: 'critical',
      reason: 'Recruiter email has not been verified.'
    });
  }
  if (!recruiter.is_phone_verified) {
    flags.push({
      type: 'recruiter_phone_not_verified',
      severity: 'critical',
      reason: 'Recruiter phone number has not been verified.'
    });
  }
  if (!recruiter.is_identity_verified) {
    flags.push({
      type: 'recruiter_identity_not_verified',
      severity: 'critical',
      reason: 'Recruiter government identity (NIN/BVN) has not been verified.'
    });
  }
  if (!recruiter.is_face_verified) {
    flags.push({
      type: 'recruiter_face_not_verified',
      severity: 'critical',
      reason: 'Recruiter has not completed biometric facial verification / liveness check.'
    });
  }

  // Check face match score threshold
  const minFaceScore = parseFloat(process.env.MIN_FACE_MATCH_SCORE || '85.0');
  const faceCheck = await query(
    'SELECT * FROM verification_checks WHERE target_id = $1 AND check_type = $2 ORDER BY created_at DESC LIMIT 1',
    [recruiter.id, 'face_match']
  );
  if (faceCheck.rows[0]?.raw_response?.match_score !== undefined) {
    const matchScore = faceCheck.rows[0].raw_response.match_score;
    if (matchScore < minFaceScore) {
      flags.push({
        type: 'low_face_match_score',
        severity: 'warning',
        reason: `Face match confidence score (${matchScore}%) is below minimum threshold (${minFaceScore}%).`
      });
    }
  }

  // =========================================================================
  // PILLAR 2: CORPORATE LEGITIMACY (CAC REGISTRATION)
  // =========================================================================
  if (!company.is_cac_verified) {
    if (company.verification_status === 'manual_review') {
      flags.push({
        type: 'company_cac_manual_review',
        severity: 'warning',
        reason: 'Company CAC registration could not be auto-verified against Corporate Affairs Commission records.'
      });
    } else {
      flags.push({
        type: 'company_cac_not_verified',
        severity: 'critical',
        reason: 'Company CAC registration has not been verified.'
      });
    }
  }

  // =========================================================================
  // PILLAR 3: DOMAIN SAFETY & THREAT REPUTATION (WhoisXML + APIVoid)
  // =========================================================================
  if (!company.is_domain_verified) {
    flags.push({
      type: 'company_website_not_verified',
      severity: 'warning',
      reason: 'Company website domain has not been verified via WhoisXML & APIVoid.'
    });
  }

  // Fetch detailed WhoisXML and APIVoid checks for this company
  const [whoisCheck, apivoidCheck, cacCheck] = await Promise.all([
    query(
      'SELECT * FROM verification_checks WHERE target_id = $1 AND check_type = $2 ORDER BY created_at DESC LIMIT 1',
      [company.id, 'whois']
    ),
    query(
      'SELECT * FROM verification_checks WHERE target_id = $1 AND check_type = $2 ORDER BY created_at DESC LIMIT 1',
      [company.id, 'domain_reputation']
    ),
    query(
      'SELECT * FROM verification_checks WHERE target_id = $1 AND check_type = $2 ORDER BY created_at DESC LIMIT 1',
      [company.id, 'cac']
    )
  ]);

  const whoisData = whoisCheck.rows[0]?.raw_response;
  const apivoidData = apivoidCheck.rows[0]?.raw_response;
  const cacData = cacCheck.rows[0]?.raw_response;

  // Evaluate WhoisXML Domain Age
  if (whoisData) {
    const minDomainAge = parseInt(process.env.MIN_DOMAIN_AGE_DAYS || '30', 10);
    const domainAge = whoisData.domainAgeDays ?? whoisData.domain_age_days;

    if (domainAge !== undefined && domainAge < minDomainAge) {
      flags.push({
        type: 'domain_too_new',
        severity: domainAge < 7 ? 'critical' : 'warning',
        reason: `Company website domain is only ${domainAge} days old (minimum requirement: ${minDomainAge} days). Newly created domains have high fraud probability.`
      });
    }

    if (whoisData.isPrivacyProtected) {
      flags.push({
        type: 'domain_privacy_protected',
        severity: 'info',
        reason: 'Domain registrant details are masked by WHOIS privacy protection.'
      });
    }
  }

  // Evaluate APIVoid Threat & Blacklist Screening
  if (apivoidData) {
    const maxRiskScore = parseInt(process.env.MAX_DOMAIN_RISK_SCORE || '20', 10);

    if (apivoidData.isBlacklisted || apivoidData.blacklistsDetected > 0) {
      flags.push({
        type: 'domain_threat_blacklisted',
        severity: 'critical',
        reason: `Company website is flagged on ${apivoidData.blacklistsDetected} cybersecurity blacklists for malicious or deceptive activity.`
      });
    } else if (apivoidData.threatScore > maxRiskScore) {
      flags.push({
        type: 'domain_elevated_risk_score',
        severity: 'warning',
        reason: `Company website threat risk score (${apivoidData.threatScore}/100) exceeds safety threshold (${maxRiskScore}/100).`
      });
    }

    if (apivoidData.sslValid === false) {
      flags.push({
        type: 'no_ssl_certificate',
        severity: 'warning',
        reason: 'Company website does not possess a valid SSL/TLS certificate.'
      });
    }
  }

  // =========================================================================
  // PILLAR 4: RECRUITER-TO-DOMAIN LINKAGE & ANTI-IMPERSONATION
  // =========================================================================
  // Track 1: Recruiter verified an official corporate email (@company.com) via OTP
  const isCorporateEmailVerified = company.is_corporate_email_verified === true;

  // Track 2: Recruiter's primary registration email directly matches company domain
  const emailMatch = checkEmailDomainMatch(recruiter.email, company.website_url);

  // Track 3: Recruiter matched CAC corporate executive / director filings
  const isCacExecutive = company.is_cac_director_match === true;
  const affiliates = cacData?.data?.entity?.affiliates || cacData?.data?.entity?.directors || [];
  const directorMatch = checkDirectorMatch(recruiter.first_name, recruiter.last_name, affiliates);

  const isDirectAffiliate = isCorporateEmailVerified || emailMatch.isMatch || isCacExecutive || directorMatch.isMatch;

  if (!isDirectAffiliate) {
    if (emailMatch.isPublicEmail) {
      flags.push({
        type: 'unverified_company_affiliation',
        severity: 'warning',
        reason: `Recruiter registered with a personal/public email (${recruiter.email}) for corporate domain (${emailMatch.websiteDomain}). Neither an official work email (@${emailMatch.websiteDomain}) nor CAC executive match has been verified. Manual authorization review required.`
      });
    } else {
      flags.push({
        type: 'unverified_company_affiliation',
        severity: 'warning',
        reason: `Recruiter email domain (@${emailMatch.emailDomain}) does not match the company website domain (@${emailMatch.websiteDomain}). Manual authorization review required.`
      });
    }
  }

  // =========================================================================
  // DECISION ENGINE: AUTO-APPROVE VS ADMIN REVIEW QUEUE
  // =========================================================================
  // Auto-approve ONLY if there are zero critical and zero warning flags.
  // Info flags (like domain privacy proxy) do not block auto-approval.
  const hasCritical = flags.some(f => f.severity === 'critical');
  const hasWarning = flags.some(f => f.severity === 'warning');

  let status;
  if (!hasCritical && !hasWarning) {
    status = 'approved';  // 100% verified across all 4 pillars
  } else {
    status = 'pending';   // Sent to Admin Review Queue with exact flag details
  }

  return { status, flags };
};
