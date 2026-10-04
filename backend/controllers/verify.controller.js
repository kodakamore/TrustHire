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
      return res
        .status(400)
        .json({
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

export const sendPhoneOTP = async (req, res) => {
  try {
    const recruiter = await Recruiter.findById(req.user.id);
    const phoneNumber = req.body.phoneNumber || recruiter?.phone_number;

    if (!phoneNumber) {
      return res
        .status(400)
        .json({ success: false, error: "Phone number is required." });
    }

    const digitsOnly = phoneNumber.replace(/\D/g, "");
    if (digitsOnly.length < 10) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Please enter a valid phone number (at least 10 digits).",
        });
    }

    // 1. Cross-reference with Dojah phone carrier & validity screening
    let dojahResult = { success: true };
    try {
      dojahResult = await DojahService.verifyPhone(phoneNumber);
      await VerificationCheck.create({
        targetId: req.user.id,
        targetType: "recruiter",
        checkType: "phone_screening",
        provider: "dojah",
        referenceId: dojahResult.data?.entity?.reference_id || "N/A",
        rawResponse: dojahResult,
        isSuccessful: dojahResult.success !== false,
      });
    } catch (e) {
      console.warn("Dojah phone screening warning:", e.message);
    }

    // 2. Generate 6-digit OTP and 10-minute expiry
    const phoneOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const phoneOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await Recruiter.update(req.user.id, {
      phone_number: phoneNumber,
      phone_otp: phoneOtp,
      phone_otp_expires_at: phoneOtpExpiresAt,
    });

    // 3. Attempt sending OTP via Dojah SMS service
    let smsResult = { success: true };
    try {
      smsResult = await DojahService.sendSMSOTP(phoneNumber, phoneOtp);
      console.log(`[TrustHire Phone OTP] Sent to ${phoneNumber}: ${phoneOtp}`);
    } catch (e) {
      console.warn("Dojah SMS send warning:", e.message);
    }

    res.json({
      success: true,
      message: `Verification code sent to ${phoneNumber}. Please enter the 6-digit code.`,
      data: {
        phoneNumber,
        dojahScreening: dojahResult.data?.entity || null,
        debugOtp: process.env.NODE_ENV !== "production" ? phoneOtp : undefined,
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
      return res
        .status(400)
        .json({
          success: false,
          error: "6-digit verification code is required.",
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

    if (
      !recruiter.phone_otp ||
      recruiter.phone_otp.trim() !== otp.toString().trim()
    ) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Invalid verification code. Please check and try again.",
        });
    }

    if (
      recruiter.phone_otp_expires_at &&
      new Date(recruiter.phone_otp_expires_at) < new Date()
    ) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Verification code has expired. Please request a new code.",
        });
    }

    await Recruiter.update(req.user.id, {
      is_phone_verified: true,
      phone_otp: null,
      phone_otp_expires_at: null,
    });

    await VerificationCheck.create({
      targetId: req.user.id,
      targetType: "recruiter",
      checkType: "phone_otp",
      provider: "dojah",
      referenceId: `phone_otp_verified_${Date.now()}`,
      rawResponse: { verified: true },
      isSuccessful: true,
    });

    res.json({
      success: true,
      message: "Phone number successfully verified!",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

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
      return res
        .status(400)
        .json({
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
      return res
        .status(400)
        .json({
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
      return res
        .status(400)
        .json({
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
      return res
        .status(400)
        .json({
          success: false,
          error: "One or more captured frames were invalid.",
        });
    }

    // Anti-replay: if we received multiple frames, they must not all be the
    // exact same image — that indicates a static photo held up to the
    // camera rather than a live capture across the challenge sequence.
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

    // 1. Run Dojah Liveness & Anti-spoof check on EVERY captured frame, not
    // just the last one. A spoof attempt (e.g. a printed photo, or a phone
    // playing a video) might get lucky and pass the check on one frame
    // (motion blur, glare, angle) but is much less likely to pass on all
    // three independently-captured frames across ~3 seconds. We require
    // every frame to individually clear the bar, and use the WORST
    // (minimum) score across frames as the representative liveness score.
    const minLiveness = parseFloat(process.env.MIN_LIVENESS_SCORE || 80.0);
    const livenessResults = await Promise.all(
      frameList.map((f) => DojahService.verifyLiveness(f)),
    );

    const perFrame = livenessResults.map((r) => ({
      score: r.data?.entity?.liveness_score,
      isLive: r.data?.entity?.is_live,
      faceDetected: r.data?.entity?.face_detected,
      apiSuccess: r.success !== false,
    }));

    const numericScores = perFrame
      .map((f) => f.score)
      .filter((s) => typeof s === "number");
    // Worst-case score across all frames — a single weak frame should drag
    // the whole capture down, not be averaged away by two good ones.
    const livenessScore =
      numericScores.length === frameList.length
        ? Math.min(...numericScores)
        : undefined; // any frame missing a real score fails the whole batch closed

    const allFramesPassed = perFrame.every(
      (f) =>
        f.apiSuccess &&
        f.faceDetected !== false &&
        f.isLive !== false &&
        typeof f.score === "number" &&
        f.score >= minLiveness,
    );

    const livenessPassed =
      allFramesPassed &&
      typeof livenessScore === "number" &&
      livenessScore >= minLiveness;
    // Kept for the response payload below (primary/last-frame result).
    const livenessResult = livenessResults[livenessResults.length - 1];

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
        frameCount: frameList.length,
      },
      isSuccessful: livenessPassed,
    });

    if (!livenessPassed) {
      return res.status(400).json({
        success: false,
        error:
          livenessResult.error ||
          `Liveness check failed${typeof livenessScore === "number" ? ` (worst frame score ${livenessScore}%, minimum ${minLiveness}%)` : " (could not obtain a reliable liveness score from the verification provider)"}. Please position your face clearly in the camera frame, ensure good lighting, and try again.`,
      });
    }

    // 2. Face Match — resolved SERVER-SIDE against the recruiter's own
    // government-ID photo captured earlier during NIN/BVN lookup. We
    // deliberately IGNORE any reference photo the client might try to send;
    // trusting a client-supplied "reference" would let the frontend pick
    // whatever image it wants to "match" against, defeating the point.
    const idCheckRes = await query(
      `SELECT raw_response FROM verification_checks
       WHERE target_id = $1 AND target_type = 'recruiter' AND check_type IN ('nin', 'bvn') AND is_successful = true
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id],
    );
    const idPhoto =
      idCheckRes.rows[0]?.raw_response?.data?.entity?.photo || null;

    const matchResult = await DojahService.matchFace(selfie, idPhoto);
    const minMatchScore = parseFloat(process.env.MIN_FACE_MATCH_SCORE || 85.0);
    const confidence = matchResult.data?.entity?.confidence_value;
    const matchAttempted = !matchResult.noReference;
    const matchPassed =
      matchAttempted &&
      matchResult.success !== false &&
      typeof confidence === "number" &&
      confidence >= minMatchScore;

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

    // A face-match failure (real mismatch against the ID photo) blocks
    // verification outright. A face match that could not be *attempted*
    // (no ID photo on file yet) does not block — liveness alone is enough
    // to mark this step done — but it is recorded truthfully as unmatched
    // rather than a fabricated pass, and downstream job-verification logic
    // (see verification.service.js) flags it for manual review.
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
// into an explicit Pending / Verified / Failed status per step, per
// requirement: each verification needs a clear backend-owned status rather
// than the frontend inferring it. This is additive — the existing boolean
// fields on `recruiter` are left untouched for backward compatibility.
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
