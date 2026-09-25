import express from 'express';
import { 
    getReviewQueue, getReviewDetails, approveJob, rejectJob, 
    revokeVerification, getReports, updateReport, getAuditLogs, getStats,
    getRecruiters, getRecruiter
} from '../controllers/admin.controller.js';
import { authenticateAdmin } from '../middleware/adminAuth.js';
import { auditLogger } from '../middleware/auditLogger.js';

const router = express.Router();

router.use(authenticateAdmin);

router.get('/queue', getReviewQueue);
router.get('/queue/:id', getReviewDetails);
router.post('/job/:id/approve', approveJob, auditLogger('ADMIN_APPROVE_JOB'));
router.post('/job/:id/reject', rejectJob, auditLogger('ADMIN_REJECT_JOB'));

router.post('/job/:id/revoke', revokeVerification, auditLogger('ADMIN_REVOKE_VERIFICATION'));

router.get('/reports', getReports);
router.put('/report/:id', updateReport, auditLogger('ADMIN_UPDATE_REPORT'));

router.get('/audit-logs', getAuditLogs);
router.get('/stats', getStats);
router.get('/recruiters', getRecruiters);
router.get('/recruiters/:id', getRecruiter);

export default router;
