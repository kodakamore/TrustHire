import express from 'express';
import { 
  register, login, adminLogin, adminRegister,
  verifyEmailToken, verifyEmailOtp, resendVerificationEmail 
} from '../controllers/auth.controller.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';
import { auditLogger } from '../middleware/auditLogger.js';

const router = express.Router();

router.post('/register', authRateLimiter, register, auditLogger('RECRUITER_REGISTER'));
router.post('/login', authRateLimiter, login, auditLogger('RECRUITER_LOGIN'));
router.post('/verify-email', authRateLimiter, verifyEmailToken, auditLogger('RECRUITER_VERIFY_EMAIL_TOKEN'));
router.post('/verify-email-otp', authRateLimiter, verifyEmailOtp, auditLogger('RECRUITER_VERIFY_EMAIL_OTP'));
router.post('/resend-verification', authRateLimiter, resendVerificationEmail, auditLogger('RESEND_VERIFICATION_EMAIL'));
router.post('/admin/register', authRateLimiter, adminRegister, auditLogger('ADMIN_REGISTER'));
router.post('/admin/login', authRateLimiter, adminLogin, auditLogger('ADMIN_LOGIN'));

export default router;
