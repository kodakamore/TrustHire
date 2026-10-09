import express from "express";
import {
  verifyEmail,
  sendPhoneOTP,
  verifyPhoneOTP,
  verifyIdentity,
  verifyFace,
  getVerificationStatus,
} from "../controllers/verify.controller.js";
import {
  startFaceSession,
  getFaceStatus,
  completeMockSession,
  getFacePhoto,
} from "../controllers/face.controller.js";
import { authenticateRecruiter } from "../middleware/auth.js";
import { auditLogger } from "../middleware/auditLogger.js";
import { otpRateLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

router.use(authenticateRecruiter);

router.post("/email", verifyEmail, auditLogger("VERIFY_EMAIL"));
router.post(
  "/phone/send-otp",
  otpRateLimiter,
  sendPhoneOTP,
  auditLogger("SEND_PHONE_OTP"),
);
router.post(
  "/phone/verify-otp",
  verifyPhoneOTP,
  auditLogger("VERIFY_PHONE_OTP"),
);
router.post("/identity", verifyIdentity, auditLogger("VERIFY_IDENTITY"));
// Legacy frame-capture path (Dojah). Kept for compatibility; the portal's
// Step 4 now uses the Didit session flow below.
router.post("/face", verifyFace, auditLogger("VERIFY_FACE"));

// Didit-powered face/liveness verification (hosted real-camera capture).
router.post("/face/session", startFaceSession, auditLogger("FACE_SESSION_CREATED"));
router.get("/face/status", getFaceStatus);
router.get("/face/photo", getFacePhoto);
router.post("/face/mock/complete", completeMockSession, auditLogger("VERIFY_FACE_MOCK"));
router.get("/status", getVerificationStatus);

export default router;
