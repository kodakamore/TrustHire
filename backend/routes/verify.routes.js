import express from "express";
import {
  verifyEmail,
  sendPhoneOTP,
  verifyPhoneOTP,
  verifyIdentity,
  verifyFace,
  getVerificationStatus,
} from "../controllers/verify.controller.js";
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
router.post("/face", verifyFace, auditLogger("VERIFY_FACE"));
router.get("/status", getVerificationStatus);

export default router;
