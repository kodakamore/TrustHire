import express from 'express';
import { verifyByPin, verifyByQR, submitReport } from '../controllers/public.controller.js';
import { publicRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

router.use(publicRateLimiter);

router.get('/verify/:pin', verifyByPin);
router.get('/verify/pin/:pin', verifyByPin);
router.get('/verify/qr/:pin', verifyByQR);
router.post('/report', submitReport);

export default router;
