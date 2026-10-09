import { query } from "../config/database.js";
import {
  checkEmailDomainMatch,
  checkDirectorMatch,
  extractDomain,
} from "../utils/domainHelper.js";

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
      type: "recruiter_email_not_verified",
      severity: "critical",
      reason: "Recruiter email has not been verified.",
    });
  }
  if (!recruiter.is_phone_verified) {
    flags.push({
      type: "recruiter_phone_not_verified",
      severity: "critical",
      reason: "Recruiter phone number has not been verified.",
    });
  }
  if (!recruiter.is_identity_verified) {
    flags.push({
      type: "recruiter_identity_not_verified",
      severity: "critical",
      reason: "Recruiter government identity (NIN/BVN) has not been verified.",
    });
  }
  if (!recruiter.is_face_verified) {
    flags.push({
      type: "recruiter_face_not_verified",
      severity: "critical",
      reason:
        "Recruiter has not completed biometric facial verification / liveness check.",
    });
  }

  // Check face match outcome (see verify.controller.js#verifyFace for how
  // this row is written — the confidence score lives under
  // raw_response.match.data.entity.confidence_value).
  const minFaceScore = parseFloat(process.env.MIN_FACE_MATCH_SCORE || "85.0");
  const faceCheck = await query(
    "SELECT * FROM verification_checks WHERE target_id = $1 AND check_type = $2 ORDER BY created_at DESC LIMIT 1",
    [recruiter.id, "face_match"],
  );
  const faceCheckRow = faceCheck.rows[0];
  if (faceCheckRow) {
    const matchScore =
      faceCheckRow.raw_response?.match?.data?.entity?.confidence_value;
    if (faceCheckRow.is_successful === null) {
      // Liveness passed but there was no government-ID photo on file yet to
      // match against — this is NOT the same as a verified identity match.
      flags.push({
        type: "face_match_no_reference_photo",
        severity: "warning",
        reason:
          "Live selfie passed the liveness check, but could not be matched against a government-ID photo (none available from the NIN/BVN lookup). Manual review recommended before treating identity as fully confirmed.",
      });
    } else if (typeof matchScore === "number" && matchScore < minFaceScore) {
      flags.push({
        type: "low_face_match_score",
        severity: "warning",
        reason: `Face match confidence score (${matchScore}%) is below minimum threshold (${minFaceScore}%).`,
      });
    }
  }

  // =========================================================================
  // PILLAR 2: CORPORATE LEGITIMACY (CAC REGISTRATION)
  // =========================================================================
  if (!company.is_cac_verified) {
    if (company.verification_status === "manual_review") {
      flags.push({
        type: "company_cac_manual_review",
        severity: "warning",
        reason:
          "Company CAC registration could not be auto-verified against Corporate Affairs Commission records.",
      });
    } else {
      flags.push({
        type: "company_cac_not_verified",
        severity: "critical",
        reason: "Company CAC registration has not been verified.",
      });
    }
  }

  // =========================================================================
  // PILLAR 3: DOMAIN SAFETY & THREAT REPUTATION (WhoisXML + APIVoid)
  // =========================================================================
  // NOTE: the "website not verified" warning is emitted further below, after
  // the DNS TXT lookup — a cryptographically-proven domain satisfies this
  // pillar even when the WHOIS/APIVoid heuristic run hasn't (audit C13).

  // Fetch detailed WhoisXML, APIVoid, CAC, website-content and DNS
  // ownership checks for this company
  const [whoisCheck, apivoidCheck, cacCheck, contentCheck, dnsCheck] =
    await Promise.all([
      query(
        "SELECT * FROM verification_checks WHERE target_id = $1 AND check_type = $2 ORDER BY created_at DESC LIMIT 1",
        [company.id, "whois"],
      ),
      query(
        "SELECT * FROM verification_checks WHERE target_id = $1 AND check_type = $2 ORDER BY created_at DESC LIMIT 1",
        [company.id, "domain_reputation"],
      ),
      query(
        "SELECT * FROM verification_checks WHERE target_id = $1 AND check_type = $2 ORDER BY created_at DESC LIMIT 1",
        [company.id, "cac"],
      ),
      query(
        "SELECT * FROM verification_checks WHERE target_id = $1 AND check_type = $2 ORDER BY created_at DESC LIMIT 1",
        [company.id, "website_content"],
      ),
      query(
        "SELECT * FROM verification_checks WHERE target_id = $1 AND check_type = $2 ORDER BY created_at DESC LIMIT 1",
        [company.id, "dns_ownership"],
      ),
    ]);

  const whoisData = whoisCheck.rows[0]?.raw_response;
  const apivoidData = apivoidCheck.rows[0]?.raw_response;
  const cacData = cacCheck.rows[0]?.raw_response;
  const contentData = contentCheck.rows[0]?.raw_response;
  // DNS TXT ownership is cryptographic proof, not a heuristic — if it's
  // verified, it outweighs the softer content/text-matching signal below.
  // SECURITY (audit C13): the proof must be for the domain the company
  // CURRENTLY claims — a stale dns_ownership row from before a website_url
  // change no longer proves anything about the new site.
  const dnsOwnershipVerified =
    dnsCheck.rows[0]?.raw_response?.verified === true &&
    dnsCheck.rows[0]?.raw_response?.domain === extractDomain(company.website_url);

  // Emit the pillar-3 warning only when NEITHER signal covers the website:
  // the WHOIS/APIVoid heuristic run (is_domain_verified) or a domain-bound
  // DNS TXT proof. DNS proof alone satisfies the pillar.
  if (!company.is_domain_verified && !dnsOwnershipVerified) {
    flags.push({
      type: "company_website_not_verified",
      severity: "warning",
      reason:
        "Company website domain has not been verified via WhoisXML & APIVoid, and no DNS TXT ownership proof is on file.",
    });
  }

  // Evaluate WhoisXML Domain Age
  if (whoisData) {
    const minDomainAge = parseInt(process.env.MIN_DOMAIN_AGE_DAYS || "30", 10);
    const domainAge = whoisData.domainAgeDays ?? whoisData.domain_age_days;

    if (domainAge !== undefined && domainAge < minDomainAge) {
      flags.push({
        type: "domain_too_new",
        severity: domainAge < 7 ? "critical" : "warning",
        reason: `Company website domain is only ${domainAge} days old (minimum requirement: ${minDomainAge} days). Newly created domains have high fraud probability.`,
      });
    }

    if (whoisData.isPrivacyProtected) {
      flags.push({
        type: "domain_privacy_protected",
        severity: "info",
        reason:
          "Domain registrant details are masked by WHOIS privacy protection.",
      });
    }
  }

  // Evaluate APIVoid Threat & Blacklist Screening
  if (apivoidData) {
    const maxRiskScore = parseInt(
      process.env.MAX_DOMAIN_RISK_SCORE || "20",
      10,
    );

    if (apivoidData.isBlacklisted || apivoidData.blacklistsDetected > 0) {
      flags.push({
        type: "domain_threat_blacklisted",
        severity: "critical",
        reason: `Company website is flagged on ${apivoidData.blacklistsDetected} cybersecurity blacklists for malicious or deceptive activity.`,
      });
    } else if (apivoidData.threatScore > maxRiskScore) {
      flags.push({
        type: "domain_elevated_risk_score",
        severity: "warning",
        reason: `Company website threat risk score (${apivoidData.threatScore}/100) exceeds safety threshold (${maxRiskScore}/100).`,
      });
    }

    if (apivoidData.sslValid === false) {
      flags.push({
        type: "no_ssl_certificate",
        severity: "warning",
        reason: "Company website does not possess a valid SSL/TLS certificate.",
      });
    }
  }

  // Evaluate whether the website's own homepage actually references the
  // claimed company — a reachable, aged, low-risk domain still proves
  // nothing about ownership if the page never mentions the company at all.
  // Skipped entirely when DNS ownership has already been cryptographically
  // verified — that's strictly stronger proof than homepage text-matching,
  // so there's nothing useful left for this heuristic to add.
  if (contentData && !dnsOwnershipVerified) {
    if (contentData.success === false) {
      flags.push({
        type: "website_content_unreadable",
        severity: "info",
        reason: `Company website content could not be inspected to confirm it belongs to the company (${contentData.error || "unreachable"}).`,
      });
    } else if (contentData.matched === false) {
      flags.push({
        type: "website_content_mismatch",
        severity: "warning",
        reason: `The company name "${company.name}" could not be found anywhere on the claimed website's homepage. This website may not actually belong to this company.`,
      });
    }
  }

  if (dnsOwnershipVerified) {
    flags.push({
      type: "dns_ownership_verified",
      severity: "info",
      reason:
        "Domain ownership was cryptographically confirmed via a DNS TXT record — the strongest available proof that this website belongs to the company.",
    });
  }

  // =========================================================================
  // PILLAR 4: RECRUITER-TO-DOMAIN LINKAGE & ANTI-IMPERSONATION
  // =========================================================================
  // Track 1: Recruiter verified an official corporate email (@company.com) via OTP
  const isCorporateEmailVerified = company.is_corporate_email_verified === true;

  // Track 2: Recruiter's primary registration email directly matches company domain
  const emailMatch = checkEmailDomainMatch(
    recruiter.email,
    company.website_url,
  );

  // Track 3: Recruiter matched CAC corporate executive / director filings
  const isCacExecutive = company.is_cac_director_match === true;
  const affiliates =
    cacData?.data?.entity?.affiliates || cacData?.data?.entity?.directors || [];
  const directorMatch = checkDirectorMatch(
    recruiter.first_name,
    recruiter.last_name,
    affiliates,
  );

  const isDirectAffiliate =
    isCorporateEmailVerified ||
    emailMatch.isMatch ||
    isCacExecutive ||
    directorMatch.isMatch;

  if (!isDirectAffiliate) {
    if (emailMatch.isPublicEmail) {
      flags.push({
        type: "unverified_company_affiliation",
        severity: "warning",
        reason: `Recruiter registered with a personal/public email (${recruiter.email}) for corporate domain (${emailMatch.websiteDomain}). Neither an official work email (@${emailMatch.websiteDomain}) nor CAC executive match has been verified. Manual authorization review required.`,
      });
    } else {
      flags.push({
        type: "unverified_company_affiliation",
        severity: "warning",
        reason: `Recruiter email domain (@${emailMatch.emailDomain}) does not match the company website domain (@${emailMatch.websiteDomain}). Manual authorization review required.`,
      });
    }
  }

  // =========================================================================
  // DECISION ENGINE: AUTO-APPROVE VS ADMIN REVIEW QUEUE
  // =========================================================================
  // Auto-approve ONLY if there are zero critical and zero warning flags.
  // Info flags (like domain privacy proxy) do not block auto-approval.
  const hasCritical = flags.some((f) => f.severity === "critical");
  const hasWarning = flags.some((f) => f.severity === "warning");

  let status;
  if (!hasCritical && !hasWarning) {
    status = "approved"; // 100% verified across all 4 pillars
  } else {
    status = "pending"; // Sent to Admin Review Queue with exact flag details
  }

  return { status, flags };
};
