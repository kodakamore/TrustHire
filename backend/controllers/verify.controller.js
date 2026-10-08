import * as Recruiter from "../models/recruiter.model.js";
import * as VerificationCheck from "../models/verificationCheck.model.js";
import * as DojahService from "../services/dojah.service.js";
import { query } from "../config/database.js";

export const verifyEmail = async (req, res) => {
  try {
    const recruiter = await Recruiter.findById(req.user.id);
    if (!recruiter)
      return res
        .status(404)
        .json({ success: false, error: "Recruiter not found" });

    const result = await DojahService.verifyEmail(recruiter.email);

    await VerificationCheck.create({
      targetId: recruiter.id,
      targetType: "recruiter",
      checkType: "email",
      provider: "dojah",
      referenceId: result.data?.entity?.reference_id || "N/A",
      rawResponse: result,
      isSuccessful: result.success,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || "Email verification failed",
      });
    }

    await Recruiter.update(recruiter.id, { is_email_verified: true });
    res.json({ success: true, data: result.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ---------------------------------------------------------------------------
// PHONE OTP (real verification)
// Dojah generates and sends the code. We only store the reference_id Dojah
// returns, and later ask Dojah whether the code the user typed is valid.
// ---------------------------------------------------------------------------

const MAX_OTP_ATTEMPTS = 5;

export const sendPhoneOTP = async (req, res) => {
  try {
    const recruiter = await Recruiter.findById(req.user.id);
    const phoneNumber = req.body.phoneNumber || recruiter?.phone_number;

    if (!phoneNumber) {
      return res
        .status(400)
        .json({ success: false, error: "Phone number is required." });
    }

    if (phoneNumber.replace(/\D/g, "").length < 10) {
      return res.status(400).json({
        success: false,
        error: "Please enter a valid phone number (at least 10 digits).",
      });
    }

    // Optional carrier/validity screening (does not block sending)
    try {
      const screening = await DojahService.verifyPhone(phoneNumber);
      await VerificationCheck.create({
        targetId: req.user.id,
        targetType: "recruiter",
        checkType: "phone_screening",
        provider: "dojah",
        referenceId: screening.data?.entity?.reference_id || "N/A",
        rawResponse: screening,
        isSuccessful: screening.success !== false,
      });
    } catch (e) {
      console.warn("Dojah phone screening warning:", e.message);
    }

    // Dojah generates and delivers the code; we only keep its reference.
    const smsResult = await DojahService.sendSMSOTP(phoneNumber);
    if (!smsResult.success) {
      return res.status(502).json({
        success: false,
        error:
          "We couldn't send a verification code right now. Please try again shortly.",
      });
    }

    await Recruiter.update(req.user.id, {
      phone_number: phoneNumber,
      phone_otp_reference_id: smsResult.data.entity.reference_id,
      phone_otp_expires_at: new Date(Date.now() + 10 * 60 * 1000),
      phone_otp_attempts: 0,
    });

    res.json({
      success: true,
      message: `Verification code sent to ${phoneNumber}. Please enter the code.`,
      data: {
        phoneNumber,
        // Only shown in explicit mock mode (never keyed off NODE_ENV)
        debugOtp: process.env.USE_MOCK_API === "true" ? "1234" : undefined,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const verifyPhoneOTP = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) {
      return res.status(400).json({
        success: false,
        error: "Verification code is required.",
      });
    }

    const recruiter = await Recruiter.findById(req.user.id);
    if (!recruiter) {
      return res
        .status(404)
        .json({ success: false, error: "Recruiter not found." });
    }

    if (recruiter.is_phone_verified) {
      return res.json({
        success: true,
        message: "Phone number is already verified.",
      });
    }

    if (!recruiter.phone_otp_reference_id) {
      return res.status(400).json({
        success: false,
        error: "No code was requested. Please request a new code.",
      });
    }

    if (
      recruiter.phone_otp_expires_at &&
      new Date(recruiter.phone_otp_expires_at) < new Date()
    ) {
      return res.status(400).json({
        success: false,
        error: "Verification code has expired. Please request a new code.",
      });
    }

    if ((recruiter.phone_otp_attempts || 0) >= MAX_OTP_ATTEMPTS) {
      return res.status(429).json({
        success: false,
        error: "Too many incorrect attempts. Please request a new code.",
      });
    }

    const result = await DojahService.validateOTP(
      otp.toString().trim(),
      recruiter.phone_otp_reference_id,
    );

    // Network/server trouble is not the user's fault: don't count an attempt.
    if (!result.success && (!result.status || result.status >= 500)) {
      return res.status(502).json({
        success: false,
        error: "Couldn't verify the code right now. Please try again.",
      });
    }

    const valid = result.success && result.data?.entity?.valid === true;

    await VerificationCheck.create({
      targetId: req.user.id,
      targetType: "recruiter",
      checkType: "phone_otp",
      provider: "dojah",
      referenceId: recruiter.phone_otp_reference_id,
      rawResponse: { valid, status: result.status ?? null }, // never store the code itself
      isSuccessful: valid,
    });

    if (!valid) {
      await Recruiter.update(req.user.id, {
        phone_otp_attempts: (recruiter.phone_otp_attempts || 0) + 1,
      });
      return res.status(400).json({
        success: false,
        error: "Invalid verification code. Please check and try again.",
      });
    }

    await Recruiter.update(req.user.id, {
      is_phone_verified: true,
      phone_otp_reference_id: null,
      phone_otp_expires_at: null,
      phone_otp_attempts: 0,
    });

    res.json({
      success: true,
      message: "Phone number successfully verified!",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// NOTE: this route marks the phone as verified from a carrier lookup alone,
// with no OTP. Make sure it is NOT exposed in your routes file, or remove it.
export const verifyPhone = async (req, res) => {
  try {
    const recruiter = await Recruiter.findById(req.user.id);
    const phoneNumber = req.body.phoneNumber || recruiter?.phone_number;

    if (!phoneNumber) {
      return res
        .status(400)
        .json({ success: false, error: "Phone number is required" });
    }

    const result = await DojahService.verifyPhone(phoneNumber);

    await VerificationCheck.create({
      targetId: req.user.id,
      targetType: "recruiter",
      checkType: "phone",
      provider: "dojah",
      referenceId: result.data?.entity?.reference_id || "N/A",
      rawResponse: result,
      isSuccessful: result.success,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || "Phone verification failed",
      });
    }

    await Recruiter.update(req.user.id, {
      phone_number: phoneNumber,
      is_phone_verified: true,
    });
    res.json({ success: true, data: result.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const verifyIdentity = async (req, res) => {
  try {
    const { type, number } = req.body; // type: 'nin' or 'bvn'
    let result;
    if (type === "nin") result = await DojahService.lookupNIN(number);
    else if (type === "bvn") result = await DojahService.lookupBVN(number);
    else
      return res.status(400).json({
        success: false,
        error: "Invalid identity type. Must be NIN or BVN.",
      });

    await VerificationCheck.create({
      targetId: req.user.id,
      targetType: "recruiter",
      checkType: type,
      provider: "dojah",
      referenceId: result.data?.entity?.reference_id || "N/A",
      rawResponse: result,
      isSuccessful: result.success,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || "Identity verification failed",
      });
    }

    const updateData = { is_identity_verified: true };
    if (type === "nin") updateData.nin = number;
    if (type === "bvn") updateData.bvn = number;
    await Recruiter.update(req.user.id, updateData);

    res.json({ success: true, data: result.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Cheap, dependency-free "did the scene actually change between frames"
// check. Real webcam frames always differ slightly frame-to-frame (sensor
// noise, natural micro-movement); a data: URL re-submitted for every frame
// (e.g. a saved/static image, or a frozen screenshot) will be byte-identical.
// This does not prove liveness on its own, but it closes the most naive
// bypass: capturing once and replaying the same still image three times.
const framesLookIdentical = (frames) => {
  const distinct = new Set(frames.map((f) => `${f.length}:${f.slice(-64)}`));
  return distinct.size === 1;
};

export const verifyFace = async (req, res) => {
  try {
    // Preferred: an array of 3 frames captured across the on-screen liveness
    // challenge. Legacy fallback: a single selfieBase64 (older clients).
    const { frames, selfieBase64 } = req.body;
    const frameList =
      Array.isArray(frames) && frames.length > 0
        ? frames
        : selfieBase64
          ? [selfieBase64]
          : [];

    if (frameList.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "Face selfie capture is required." });
    }
    if (
      frameList.some(
        (f) => typeof f !== "string" || !f.startsWith("data:image/"),
      )
    ) {
      return res.status(400).json({
        success: false,
        error: "One or more captured frames were invalid.",
      });
    }

    // Anti-replay: if we received multiple frames, they must not all be the
    // exact same image.
    if (frameList.length > 1 && framesLookIdentical(frameList)) {
      return res.status(400).json({
        success: false,
        error:
          "No movement was detected between captures. Please ensure you are in front of a live camera, not a static photo or image, and try again.",
      });
    }

    // Use the last (final) frame — the "hold still" capture — as the
    // primary image for face-matching against the ID photo.
    const selfie = frameList[frameList.length - 1];

    // 1. Liveness / anti-spoof check on every captured frame. Every frame
    // must individually clear the bar.
    const minLiveness = parseFloat(process.env.MIN_LIVENESS_SCORE || 80.0);

    const framePassed = (r) => {
      const e = r.data?.entity;
      return (
        r.success !== false &&
        e?.face_detected !== false &&
        e?.is_live !== false &&
        typeof e?.liveness_score === "number" &&
        e.liveness_score >= minLiveness
      );
    };

    // Sequential (uploads are slow), and stop at the first failing frame:
    // each call is billed and can take up to 30s, so there's no point
    // checking the remaining frames once the capture has already failed.
    const livenessResults = [];
    let failedResult = null;
    for (const frame of frameList) {
      const r = await DojahService.verifyLiveness(frame);
      livenessResults.push(r);
      if (!framePassed(r)) {
        failedResult = r;
        break;
      }
    }

    const perFrame = livenessResults.map((r) => ({
      score: r.data?.entity?.liveness_score,
      isLive: r.data?.entity?.is_live,
      faceDetected: r.data?.entity?.face_detected,
      apiSuccess: r.success !== false,
    }));

    const numericScores = perFrame
      .map((f) => f.score)
      .filter((s) => typeof s === "number");
    // Worst-case score among the frames that were checked
    const livenessScore = numericScores.length
      ? Math.min(...numericScores)
      : undefined;

    // Passed only if no frame failed AND every submitted frame was checked
    const livenessPassed =
      !failedResult && livenessResults.length === frameList.length;

    // The failing frame if there was one, otherwise the final frame
    const livenessResult =
      failedResult || livenessResults[livenessResults.length - 1];

    await VerificationCheck.create({
      targetId: req.user.id,
      targetType: "recruiter",
      checkType: "liveness",
      provider: "dojah",
      referenceId:
        livenessResult.data?.entity?.reference_id || `liveness_${Date.now()}`,
      rawResponse: {
        liveness: livenessResults,
        perFrame,
        worstScore: livenessScore,
        framesSubmitted: frameList.length,
        framesChecked: livenessResults.length,
      },
      isSuccessful: livenessPassed,
    });

    if (!livenessPassed) {
      const scoreText =
        typeof livenessScore === "number"
          ? ` (lowest frame score ${livenessScore.toFixed(1)}%, minimum ${minLiveness}%)`
          : " (could not obtain a reliable liveness score from the verification provider)";
      return res.status(400).json({
        success: false,
        error:
          failedResult?.error ||
          `Liveness check failed${scoreText}. Please position your face clearly in the camera frame, ensure good lighting, and try again.`,
      });
    }

    // 2. Face Match — resolved SERVER-SIDE against the recruiter's own
    // government-ID photo captured earlier during NIN/BVN lookup. We
    // deliberately IGNORE any reference photo the client might send.
    const idCheckRes = await query(
      `SELECT raw_response FROM verification_checks
       WHERE target_id = $1 AND target_type = 'recruiter' AND check_type IN ('nin', 'bvn') AND is_successful = true
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id],
    );
    // Dojah's NIN lookup returns the photo under entity.photo, but the BVN
    // endpoint has been observed to use entity.image instead for the same
    // purpose. Checking only `photo` meant a BVN-only recruiter silently
    // never got a reference photo at all — face-match would always report
    // "unavailable" even though a usable photo was sitting right there
    // under a different key. Check both, in all-caps/field-naming-agnostic
    // order: photo first (more common), then image as a fallback.
    const idEntity = idCheckRes.rows[0]?.raw_response?.data?.entity;
    const idPhoto = idEntity?.photo || idEntity?.image || null;

    const matchResult = await DojahService.matchFace(selfie, idPhoto);
    const minMatchScore = parseFloat(process.env.MIN_FACE_MATCH_SCORE || 85.0);
    const confidence = matchResult.data?.entity?.confidence_value;
    const dojahMatchVerdict = matchResult.data?.entity?.match; // Dojah's own boolean
    const matchAttempted = !matchResult.noReference;
    // Prefer Dojah's own match verdict when present; fall back to our own
    // threshold comparison only if that boolean is missing.
    const matchPassed =
      matchAttempted &&
      matchResult.success !== false &&
      (typeof dojahMatchVerdict === "boolean"
        ? dojahMatchVerdict
        : typeof confidence === "number" && confidence >= minMatchScore);

    await VerificationCheck.create({
      targetId: req.user.id,
      targetType: "recruiter",
      checkType: "face_match",
      provider: "dojah",
      referenceId:
        matchResult.data?.entity?.reference_id || `face_match_${Date.now()}`,
      rawResponse: {
        match: matchResult,
        matchSource: idPhoto ? "government_id_photo" : "unavailable",
      },
      isSuccessful: matchAttempted ? matchPassed : null,
    });

    // A real mismatch against the ID photo blocks verification. A match that
    // could not be attempted (no ID photo on file) does not block, but is
    // recorded truthfully rather than as a fabricated pass.
    if (matchAttempted && !matchPassed) {
      return res.status(400).json({
        success: false,
        error:
          matchResult.error ||
          `Facial match against your government ID photo (${confidence}%) is below the minimum threshold (${minMatchScore}%). This may indicate the live capture does not belong to the ID holder.`,
      });
    }

    // Check if other steps are already verified to set overall verified status
    const recruiter = await Recruiter.findById(req.user.id);
    const allVerified =
      recruiter.is_email_verified &&
      recruiter.is_phone_verified &&
      recruiter.is_identity_verified;

    await Recruiter.update(req.user.id, {
      is_face_verified: true,
      verification_status: allVerified ? "verified" : "partially_verified",
    });

    res.json({
      success: true,
      message: matchAttempted
        ? "Facial biometric verification passed successfully!"
        : "Liveness verification passed. Face-match against your ID photo will be finalized once your NIN/BVN lookup includes a photo.",
      data: { livenessResult, matchResult, matchAttempted, isSuccessful: true },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Turns the raw boolean columns + the most recent verification_checks rows
// into an explicit Pending / Verified / Failed status per step.
const deriveCheckStatus = (isVerifiedFlag, checks, checkType) => {
  if (isVerifiedFlag) return "verified";
  const latest = checks.find((c) => c.check_type === checkType);
  if (latest && latest.is_successful === false) return "failed";
  return "pending";
};

export const getVerificationStatus = async (req, res) => {
  try {
    const recruiter = await Recruiter.findById(req.user.id);
    if (!recruiter)
      return res
        .status(404)
        .json({ success: false, error: "Recruiter not found" });

    const checks = await VerificationCheck.findByRecruiterId(req.user.id);

    res.json({
      success: true,
      data: {
        ...recruiter,
        checks: {
          email: deriveCheckStatus(
            recruiter.is_email_verified,
            checks,
            "email",
          ),
          phone: deriveCheckStatus(
            recruiter.is_phone_verified,
            checks,
            "phone_otp",
          ),
          identity: deriveCheckStatus(
            recruiter.is_identity_verified,
            checks,
            recruiter.nin ? "nin" : "bvn",
          ),
          face: deriveCheckStatus(
            recruiter.is_face_verified,
            checks,
            "liveness",
          ),
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
