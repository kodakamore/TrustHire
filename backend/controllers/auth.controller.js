import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import * as Recruiter from "../models/recruiter.model.js";
import * as Admin from "../models/admin.model.js";
import { validateEmail } from "../utils/validators.js";
import { isPublicEmailDomain } from "../utils/domainHelper.js";
import { sendRegistrationVerificationLink } from "../services/email.service.js";
import dotenv from "dotenv";
dotenv.config();

// SECURITY (audit C5): registration/resend OTPs must come from a CSPRNG.
const generateEmailOtp = () => crypto.randomInt(100000, 1000000).toString();

// SECURITY (audit C6): per-account guess limit for the registration OTP.
const MAX_EMAIL_OTP_ATTEMPTS = 5;

// SECURITY (audit C10): echoing the OTP/link back in an API response is a
// dev-only affordance. It requires an EXPLICIT flag — NODE_ENV alone is no
// longer enough (a misconfigured deploy would leak codes silently).
const debugAffordancesEnabled = () => process.env.EXPOSE_DEBUG_OTP === "true";

export const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, phoneNumber } =
      req.body;

    if (!firstName || !lastName) {
      return res
        .status(400)
        .json({
          success: false,
          error: "First name and last name are required",
        });
    }
    if (!validateEmail(email).valid) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid email address" });
    }
    // SECURITY (audit C8 / product rule): a recruiter onboarding identity
    // must not be a free/public webmail address (gmail, yahoo, outlook...)
    // — those can never prove a company-domain linkage. Existing accounts
    // (e.g. yprecious526@gmail.com) are unaffected: this gate only guards
    // NEW registrations.
    if (isPublicEmailDomain(email)) {
      return res.status(400).json({
        success: false,
        error:
          "Please use your official company email address — free email providers (Gmail, Yahoo, Outlook, etc.) are not accepted for recruiter onboarding.",
      });
    }
    if (!password || password.length < 6) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Password must be at least 6 characters",
        });
    }

    const existing = await Recruiter.findByEmail(email);
    if (existing) {
      return res
        .status(400)
        .json({ success: false, error: "Email already in use" });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const emailOtp = generateEmailOtp();
    const emailOtpExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const recruiter = await Recruiter.create({
      email,
      passwordHash,
      firstName,
      lastName,
      phoneNumber: phone || phoneNumber || null,
      emailOtp,
      emailOtpExpiresAt,
    });

    // Generate 24-hour verification token & link
    const verificationToken = jwt.sign(
      {
        recruiterId: recruiter.id,
        email: recruiter.email,
        action: "verify_email",
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );
    const baseUrl =
      process.env.FRONTEND_URL ||
      process.env.FRONTEND_RECRUITER_URL ||
      "http://localhost:3000";
    const verificationLink = `${baseUrl}/verify-email?token=${verificationToken}`;

    // Send welcome / activation email via Resend
    await sendRegistrationVerificationLink({
      to: recruiter.email,
      verificationLink,
      otp: emailOtp,
      recruiterName: `${firstName} ${lastName}`,
    });

    res.status(201).json({
      success: true,
      message:
        "Account created! Please check your email for the verification link or enter your 6-digit code.",
      data: {
        email: recruiter.email,
        requiresVerification: true,
        verificationLink: debugAffordancesEnabled()
          ? verificationLink
          : undefined,
        debugOtp: debugAffordancesEnabled() ? emailOtp : undefined,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const verifyEmailToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res
        .status(400)
        .json({ success: false, error: "Verification token is required." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.action !== "verify_email" || !decoded.recruiterId) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid verification token." });
    }

    const recruiter = await Recruiter.findById(decoded.recruiterId);
    if (!recruiter) {
      return res
        .status(404)
        .json({ success: false, error: "Recruiter account not found." });
    }

    // SECURITY: A verification link/token is single-use. If this email has
    // already been verified (e.g. the link was reused, forwarded, or opened
    // twice), do NOT silently mint a fresh login token from it — that would
    // let anyone holding an old link log in without a password, indefinitely
    // until the 24h JWT itself expires. Instead, tell the caller to log in.
    if (recruiter.is_email_verified) {
      return res.json({
        success: true,
        alreadyVerified: true,
        message:
          "This email is already verified. Please sign in with your password to continue.",
        data: { recruiter: { email: recruiter.email }, token: null },
      });
    }

    await Recruiter.update(recruiter.id, {
      is_email_verified: true,
      email_otp: null,
      email_otp_expires_at: null,
    });

    const authToken = jwt.sign(
      { id: recruiter.id, email: recruiter.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
    );

    delete recruiter.password_hash;

    res.json({
      success: true,
      message:
        "Email verified successfully! Your recruiter account is now activated.",
      data: {
        token: authToken,
        recruiter: { ...Recruiter.toPublicRecruiter(recruiter), is_email_verified: true },
      },
    });
  } catch (err) {
    res
      .status(400)
      .json({
        success: false,
        error: "Verification link is invalid or has expired.",
      });
  }
};

export const verifyEmailOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Email and 6-digit verification code are required.",
        });
    }

    const recruiter = await Recruiter.findByEmail(email);
    if (!recruiter) {
      return res
        .status(404)
        .json({ success: false, error: "Recruiter account not found." });
    }

    // SECURITY: previously this branch issued a brand-new login JWT for
    // *any* already-verified email without checking the OTP at all — i.e.
    // knowing a recruiter's email address alone was enough to log into
    // their account with no password. An already-verified email must not
    // be re-verifiable, and this endpoint must never hand out a session
    // token without a correct, unexpired, unused OTP.
    if (recruiter.is_email_verified) {
      return res.json({
        success: true,
        alreadyVerified: true,
        message:
          "Email is already verified. Please sign in with your password.",
        data: { token: null },
      });
    }

    // SECURITY (audit C6): lock the code after repeated wrong guesses so
    // the 6-digit space cannot be brute-forced over this endpoint. The
    // counter is per-account (the per-IP rate limiter on the route is a
    // separate, bypassable layer) and resets whenever a new code is issued.
    if ((recruiter.email_otp_attempts || 0) >= MAX_EMAIL_OTP_ATTEMPTS) {
      return res.status(429).json({
        success: false,
        error:
          "Too many incorrect attempts. Please request a new verification code.",
      });
    }

    if (
      !recruiter.email_otp ||
      recruiter.email_otp.trim() !== otp.toString().trim()
    ) {
      await Recruiter.update(recruiter.id, {
        email_otp_attempts: (recruiter.email_otp_attempts || 0) + 1,
      });
      return res
        .status(400)
        .json({
          success: false,
          error: "Invalid verification code. Please check your email.",
        });
    }

    if (
      recruiter.email_otp_expires_at &&
      new Date(recruiter.email_otp_expires_at) < new Date()
    ) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Verification code has expired. Please request a new one.",
        });
    }

    await Recruiter.update(recruiter.id, {
      is_email_verified: true,
      email_otp: null,
      email_otp_expires_at: null,
      email_otp_attempts: 0,
    });

    const authToken = jwt.sign(
      { id: recruiter.id, email: recruiter.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
    );

    delete recruiter.password_hash;

    res.json({
      success: true,
      message:
        "Email verified successfully! You can now proceed with your onboarding.",
      data: {
        token: authToken,
        recruiter: { ...Recruiter.toPublicRecruiter(recruiter), is_email_verified: true },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res
        .status(400)
        .json({ success: false, error: "Email is required." });
    }

    const recruiter = await Recruiter.findByEmail(email);
    if (!recruiter) {
      return res
        .status(404)
        .json({ success: false, error: "Recruiter account not found." });
    }

    if (recruiter.is_email_verified) {
      return res.json({ success: true, message: "Email is already verified." });
    }

    const emailOtp = generateEmailOtp();
    const emailOtpExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await Recruiter.update(recruiter.id, {
      email_otp: emailOtp,
      email_otp_expires_at: emailOtpExpiresAt,
      email_otp_attempts: 0,
    });

    const verificationToken = jwt.sign(
      {
        recruiterId: recruiter.id,
        email: recruiter.email,
        action: "verify_email",
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );
    const baseUrl =
      process.env.FRONTEND_URL ||
      process.env.FRONTEND_RECRUITER_URL ||
      "http://localhost:3000";
    const verificationLink = `${baseUrl}/verify-email?token=${verificationToken}`;

    await sendRegistrationVerificationLink({
      to: recruiter.email,
      verificationLink,
      otp: emailOtp,
      recruiterName: `${recruiter.first_name} ${recruiter.last_name}`,
    });

    res.json({
      success: true,
      message: "A new verification link and code have been sent to your email.",
      debugOtp: debugAffordancesEnabled() ? emailOtp : undefined,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, error: "Email and password are required" });
    }

    const recruiter = await Recruiter.findByEmail(email);
    if (!recruiter) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, recruiter.password_hash);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid email or password" });
    }

    // Account-level sanctions (Super Admin) block login outright.
    if (recruiter.account_status && recruiter.account_status !== "active") {
      return res.status(403).json({
        success: false,
        error:
          recruiter.account_status === "removed"
            ? "This TrustHire account has been permanently removed."
            : "Your TrustHire account has been suspended. Please contact support@trusthire.ng if you believe this is a mistake.",
        accountStatus: recruiter.account_status,
      });
    }

    // Backend-enforced gate: a recruiter must have completed email
    // verification before they can obtain a session token at all. This
    // cannot be bypassed from the frontend — the check lives here, not in
    // any client-side route guard.
    if (!recruiter.is_email_verified) {
      return res.status(403).json({
        success: false,
        error: "Please verify your email address before logging in.",
        requiresVerification: true,
        data: { email: recruiter.email },
      });
    }

    const token = jwt.sign(
      { id: recruiter.id, email: recruiter.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
    );

    delete recruiter.password_hash;
    res.json({ success: true, data: { recruiter: Recruiter.toPublicRecruiter(recruiter), token } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, error: "Email and password are required" });
    }

    const admin = await Admin.findByEmail(email);
    if (!admin) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid email or password" });
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
    );

    delete admin.password_hash;
    res.json({ success: true, data: { admin, token } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const adminRegister = async (req, res) => {
  try {
    const { email, password, role, bootstrapToken } = req.body;

    if (!validateEmail(email).valid)
      return res.status(400).json({ success: false, error: "Invalid email" });
    if (!password || password.length < 6)
      return res
        .status(400)
        .json({
          success: false,
          error: "Password must be at least 6 characters",
        });

    // SECURITY (audit C3): this endpoint was unauthenticated — anyone who
    // could reach it could mint themselves a Super Admin. It now only works
    // when (a) NO admins exist yet (first-run bootstrap of a fresh install),
    // or (b) the caller presents the ADMIN_BOOTSTRAP_TOKEN configured on the
    // server. Without one of those, admin accounts can only be created by an
    // existing authenticated super admin via the CLI (scripts/create-admin.js).
    const existingAdmins = await Admin.count();
    if (existingAdmins > 0) {
      const configured = process.env.ADMIN_BOOTSTRAP_TOKEN;
      const presented = req.get("x-bootstrap-token") || bootstrapToken;
      if (!configured || !presented || presented !== configured) {
        return res.status(403).json({
          success: false,
          error:
            "Admin registration is locked. An existing super admin must create accounts (see scripts/create-admin.js), or a valid bootstrap token must be supplied.",
        });
      }
    }

    const existing = await Admin.findByEmail(email);
    if (existing)
      return res
        .status(400)
        .json({ success: false, error: "Admin email already exists" });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const admin = await Admin.create({
      email,
      passwordHash,
      role: role || "admin",
    });
    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN },
    );

    res.status(201).json({ success: true, data: { admin, token } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
