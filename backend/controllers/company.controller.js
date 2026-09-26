import * as Company from "../models/company.model.js";
import * as Recruiter from "../models/recruiter.model.js";
import * as VerificationCheck from "../models/verificationCheck.model.js";
import * as DojahService from "../services/dojah.service.js";
import * as WhoisService from "../services/whois.service.js";
import * as ApivoidService from "../services/apivoid.service.js";
import {
  checkEmailDomainMatch,
  checkDirectorMatch,
  isPublicEmailDomain,
} from "../utils/domainHelper.js";
import { sendCorporateEmailOTP as sendOTPEmail } from "../services/email.service.js";

export const createCompany = async (req, res) => {
  try {
    const data = {
      recruiterId: req.user.id,
      name: req.body.name,
      registrationNumber:
        req.body.registrationNumber || req.body.rcNumber || null,
      tinNumber: req.body.tinNumber || req.body.tin || null,
      websiteUrl: req.body.websiteUrl || req.body.website || null,
      address: req.body.address || "",
      industry: req.body.industry || "",
    };

    if (!data.name) {
      return res
        .status(400)
        .json({ success: false, error: "Company name is required" });
    }

    const company = await Company.create(data);
    res.status(201).json({ success: true, data: company });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getCompanies = async (req, res) => {
  try {
    const companies = await Company.findByRecruiterId(req.user.id);
    res.json({ success: true, data: companies });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const company = await Company.findById(id);
    if (!company)
      return res
        .status(404)
        .json({ success: false, error: "Company not found" });
    res.json({ success: true, data: company });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const company = await Company.findById(id);
    if (!company || company.recruiter_id !== req.user.id) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }
    if (company.verification_status === "verified") {
      return res
        .status(400)
        .json({ success: false, error: "Cannot update a verified company" });
    }

    const updated = await Company.update(id, req.body);
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const verifyCAC = async (req, res) => {
  try {
    const { id } = req.params;
    const company = await Company.findById(id);
    if (!company)
      return res
        .status(404)
        .json({ success: false, error: "Company not found" });

    const result = await DojahService.lookupCAC(company.registration_number);

    await VerificationCheck.create({
      targetId: id,
      targetType: "company",
      checkType: "cac",
      provider: "dojah",
      referenceId: result.data?.entity?.reference_id || "N/A",
      rawResponse: result,
      isSuccessful: result.success,
    });

    if (result.success) {
      // Cross-check recruiter's verified phone, email, and name against CAC corporate filings
      let isDirectorMatch = false;
      let linkageType = company.linkage_type || "unverified";
      try {
        const recruiter = await Recruiter.findById(req.user.id);
        const entity = result.data?.entity || {};
        const affiliates = entity.affiliates || entity.directors || [];
        const officialEmail = (entity.email || entity.company_email || "")
          .toLowerCase()
          .trim();
        const officialPhone = (
          entity.phone ||
          entity.company_phone ||
          entity.phone_number ||
          ""
        ).replace(/\D/g, "");
        const recPhone = (recruiter?.phone_number || "").replace(/\D/g, "");
        const recEmail = (recruiter?.email || "").toLowerCase().trim();

        const dirCheck = checkDirectorMatch(
          recruiter?.first_name,
          recruiter?.last_name,
          affiliates,
        );
        const emailMatchesCAC =
          officialEmail && recEmail && officialEmail === recEmail;
        const phoneMatchesCAC =
          officialPhone &&
          recPhone &&
          recPhone.length >= 7 &&
          (officialPhone.includes(recPhone) ||
            recPhone.includes(officialPhone));

        if (dirCheck.isMatch || emailMatchesCAC || phoneMatchesCAC) {
          isDirectorMatch = true;
          linkageType = "cac_executive_verified";
          console.log(
            `[TrustHire] 🏢 Recruiter matched CAC Executive/Director records for company ${company.name}`,
          );
        }
      } catch (e) {
        console.warn("CAC contact cross-check non-blocking error:", e);
      }

      await Company.update(id, {
        is_cac_verified: true,
        is_cac_director_match: isDirectorMatch,
        linkage_type: linkageType,
        verification_status: "verified",
      });
    } else {
      // Fallback: If CAC registration lookup fails or is not in registry, flag for manual review
      await Company.update(id, {
        is_cac_verified: false,
        verification_status: "manual_review",
      });
    }
    res.json({
      success: true,
      data: result,
      verificationStatus: result.success ? "verified" : "manual_review",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const verifyTIN = async (req, res) => {
  try {
    const { id } = req.params;
    const company = await Company.findById(id);
    if (!company)
      return res
        .status(404)
        .json({ success: false, error: "Company not found" });

    const result = await DojahService.verifyTIN(company.tin_number);

    await VerificationCheck.create({
      targetId: id,
      targetType: "company",
      checkType: "tin",
      provider: "dojah",
      referenceId: result.data?.entity?.reference_id || "N/A",
      rawResponse: result,
      isSuccessful: result.success,
    });

    if (result.success) {
      await Company.update(id, { is_tin_verified: true });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const verifyWebsite = async (req, res) => {
  try {
    const { id } = req.params;
    const company = await Company.findById(id);
    if (!company)
      return res
        .status(404)
        .json({ success: false, error: "Company not found" });

    if (!company.website_url) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Company has no website URL configured.",
        });
    }

    // 1. WhoisXML Domain Provenance & Age
    const whoisResult = await WhoisService.lookupDomain(company.website_url);

    // 2. APIVoid Threat Screening & Cybersecurity Blacklists
    const apivoidResult = await ApivoidService.checkUrlReputation(
      company.website_url,
    );

    // 3. Recruiter-to-Domain Linkage Evaluation
    const recruiter = await Recruiter.findById(req.user.id);
    const emailMatch = checkEmailDomainMatch(
      recruiter?.email,
      company.website_url,
    );

    // 4. Website CONTENT ownership check — a reachable site proves nothing
    // about who owns it, so also check whether the site's own homepage
    // actually mentions the claimed company name / corporate email domain.
    const contentMatch = await WhoisService.checkWebsiteContentMatch(
      company.website_url,
      company.name,
      [
        company.corporate_email ? company.corporate_email.split("@")[1] : null,
        emailMatch.emailDomain,
      ],
    );

    // Optional: check CAC directors if available
    let directorMatch = { isMatch: false, matchedDirector: null };
    try {
      const cacCheckRes = await VerificationCheck.findByCompanyId(id);
      const cacCheck = (cacCheckRes || []).find((c) => c.check_type === "cac");
      const affiliates = cacCheck?.raw_response?.data?.entity?.affiliates || [];
      directorMatch = checkDirectorMatch(
        recruiter?.first_name,
        recruiter?.last_name,
        affiliates,
      );
    } catch (e) {
      // Non-blocking
    }

    const isDirectAffiliate = emailMatch.isMatch || directorMatch.isMatch;
    const linkStatus = emailMatch.isMatch
      ? "corporate_email_verified"
      : directorMatch.isMatch
        ? "cac_director_verified"
        : emailMatch.isPublicEmail
          ? "public_email_unverified"
          : "domain_mismatch";

    // 4. Record Verification Checks in database
    await VerificationCheck.create({
      targetId: id,
      targetType: "company",
      checkType: "whois",
      provider: "whoisxml",
      referenceId: whoisResult.domainName || company.website_url,
      rawResponse: whoisResult,
      isSuccessful: whoisResult.success && !whoisResult.isSuspicious,
    });

    const maxRiskScore = parseInt(
      process.env.MAX_DOMAIN_RISK_SCORE || "20",
      10,
    );
    const isThreatClean =
      apivoidResult.success &&
      !apivoidResult.isBlacklisted &&
      apivoidResult.threatScore <= maxRiskScore;

    await VerificationCheck.create({
      targetId: id,
      targetType: "company",
      checkType: "domain_reputation",
      provider: "apivoid",
      referenceId: apivoidResult.url || company.website_url,
      rawResponse: apivoidResult,
      isSuccessful: isThreatClean,
    });

    await VerificationCheck.create({
      targetId: id,
      targetType: "company",
      checkType: "website_content",
      provider: contentMatch.provider || "website_content",
      referenceId: contentMatch.domain || company.website_url,
      rawResponse: contentMatch,
      isSuccessful: contentMatch.success ? contentMatch.matched : null,
    });

    await VerificationCheck.create({
      targetId: id,
      targetType: "company",
      checkType: "domain_linkage",
      provider: "trusthire_matcher",
      referenceId: recruiter?.email || "N/A",
      rawResponse: {
        recruiterEmail: recruiter?.email,
        companyWebsite: company.website_url,
        emailMatch,
        directorMatch,
        linkStatus,
        isDirectAffiliate,
      },
      isSuccessful: isDirectAffiliate,
    });

    const isDomainSafe =
      whoisResult.success && !whoisResult.isSuspicious && isThreatClean;

    if (isDomainSafe) {
      await Company.update(id, { is_domain_verified: true });
    }

    res.json({
      success: true,
      data: {
        whois: whoisResult,
        reputation: apivoidResult,
        contentMatch,
        linkage: {
          emailMatch,
          directorMatch,
          linkStatus,
          isDirectAffiliate,
          recruiterEmail: recruiter?.email,
          websiteDomain: emailMatch.websiteDomain,
        },
        isDomainSafe,
        isDomainVerified: isDomainSafe,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getVerificationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const company = await Company.findById(id);
    if (!company || company.recruiter_id !== req.user.id) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    // Explicit Pending / Verified / Failed per check, additive to the
    // existing boolean columns (see verify.controller.js#deriveCheckStatus
    // for the recruiter-side equivalent).
    const checks = await VerificationCheck.findByCompanyId(id);
    const derive = (flag, checkType) => {
      if (flag) return "verified";
      const latest = checks.find((c) => c.check_type === checkType);
      if (latest && latest.is_successful === false) return "failed";
      return "pending";
    };

    res.json({
      success: true,
      data: {
        ...company,
        checks: {
          cac: derive(company.is_cac_verified, "cac"),
          website: derive(company.is_domain_verified, "whois"),
          corporateEmail: derive(
            company.is_corporate_email_verified,
            "corporate_email_otp",
          ),
          websiteContentMatch: derive(false, "website_content"),
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Sends a 6-digit verification OTP to an official corporate email.
 * Rejects free/public webmail domains and ensures domain matches company website.
 */
export const sendCorporateEmailOTP = async (req, res) => {
  try {
    const { id } = req.params;
    const { corporateEmail } = req.body;

    if (!corporateEmail || !corporateEmail.includes("@")) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Please provide a valid corporate email address.",
        });
    }

    const company = await Company.findById(id);
    if (!company || company.recruiter_id !== req.user.id) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    if (!company.website_url) {
      return res
        .status(400)
        .json({
          success: false,
          error:
            "Company website URL must be configured before verifying corporate email.",
        });
    }

    const cleanEmail = corporateEmail.toLowerCase().trim();

    // 1. Reject public free webmail domains
    if (isPublicEmailDomain(cleanEmail)) {
      return res.status(400).json({
        success: false,
        error:
          "Personal/public email domains (e.g. Gmail, Yahoo, Outlook) cannot be used as official corporate email. Please provide your work email on your company domain.",
      });
    }

    // 2. Validate that email domain matches company website
    const matchResult = checkEmailDomainMatch(cleanEmail, company.website_url);
    if (!matchResult.isMatch) {
      return res.status(400).json({
        success: false,
        error: `Corporate email domain (@${matchResult.emailDomain}) does not match company website domain (@${matchResult.websiteDomain}).`,
      });
    }

    // 3. Generate 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    await Company.update(id, {
      corporate_email: cleanEmail,
      corporate_email_otp: otp,
      corporate_email_otp_expires_at: expiresAt,
      is_corporate_email_verified: false,
    });

    // Send email via Resend (or local fallback)
    await sendOTPEmail({
      to: cleanEmail,
      otp,
      companyName: company.name,
    });

    res.json({
      success: true,
      message: `Verification code sent to ${cleanEmail}. Please enter the 6-digit code to confirm corporate authorization.`,
      data: {
        corporateEmail: cleanEmail,
        expiresAt: expiresAt.toISOString(),
        debugOtp: process.env.NODE_ENV !== "production" ? otp : undefined,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Validates the corporate email OTP and confirms corporate employee linkage.
 */
export const verifyCorporateEmailOTP = async (req, res) => {
  try {
    const { id } = req.params;
    const { otp } = req.body;

    if (!otp) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Please enter the 6-digit verification code.",
        });
    }

    const company = await Company.findById(id);
    if (!company || company.recruiter_id !== req.user.id) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    if (!company.corporate_email_otp || !company.corporate_email) {
      return res
        .status(400)
        .json({
          success: false,
          error: "No active OTP found. Please request a new verification code.",
        });
    }

    if (new Date() > new Date(company.corporate_email_otp_expires_at)) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Verification code has expired. Please request a new code.",
        });
    }

    if (company.corporate_email_otp.trim() !== otp.toString().trim()) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Invalid verification code. Please check and try again.",
        });
    }

    // OTP matched! Mark corporate email as verified
    await Company.update(id, {
      is_corporate_email_verified: true,
      corporate_email_otp: null,
      linkage_type: "corporate_email_verified",
    });

    await VerificationCheck.create({
      targetId: id,
      targetType: "company",
      checkType: "corporate_email_otp",
      provider: "trusthire_email_verifier",
      referenceId: company.corporate_email,
      rawResponse: {
        corporateEmail: company.corporate_email,
        verifiedAt: new Date().toISOString(),
      },
      isSuccessful: true,
    });

    res.json({
      success: true,
      message: `Corporate email ${company.corporate_email} verified successfully! Your corporate authorization is confirmed.`,
      data: {
        corporateEmail: company.corporate_email,
        isCorporateEmailVerified: true,
        linkageType: "corporate_email_verified",
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
