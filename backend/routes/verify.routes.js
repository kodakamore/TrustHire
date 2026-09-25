import express from 'express';
import { 
  verifyEmail, verifyPhone, sendPhoneOTP, verifyPhoneOTP, 
  verifyIdentity, verifyFace, getVerificationStatus 
} from '../controllers/verify.controller.js';
import { authenticateRecruiter } from '../middleware/auth.js';
import { auditLogger } from '../middleware/auditLogger.js';

const router = express.Router();

router.use(authenticateRecruiter);

router.post('/email', verifyEmail, auditLogger('VERIFY_EMAIL'));
router.post('/phone', verifyPhone, auditLogger('VERIFY_PHONE'));
router.post('/phone/send-otp', sendPhoneOTP, auditLogger('SEND_PHONE_OTP'));
router.post('/phone/verify-otp', verifyPhoneOTP, auditLogger('VERIFY_PHONE_OTP'));
router.post('/identity', verifyIdentity, auditLogger('VERIFY_IDENTITY'));
router.post('/face', verifyFace, auditLogger('VERIFY_FACE'));
router.get('/status', getVerificationStatus);

export default router;
