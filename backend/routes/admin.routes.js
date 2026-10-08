import express from 'express';
import { 
    getReviewQueue, getReviewDetails, approveJob, rejectJob, 
    revokeVerification, getReports, getReport, updateReport, escalateReport,
    compromiseCode, setRecruiterAccountStatus,
    getAuditLogs, getStats, getRecruiters, getRecruiter, getMedia
} from '../controllers/admin.controller.js';
import { authenticateAdmin } from '../middleware/adminAuth.js';
import { requireSuperAdmin } from '../middleware/roles.js';
import { auditLogger } from '../middleware/auditLogger.js';

const router = express.Router();

router.use(authenticateAdmin);

router.get('/queue', getReviewQueue);
router.get('/queue/:id', getReviewDetails);
router.post('/job/:id/approve', approveJob, auditLogger('ADMIN_APPROVE_JOB'));
router.post('/job/:id/reject', rejectJob, auditLogger('ADMIN_REJECT_JOB'));

router.post('/job/:id/revoke', revokeVerification, auditLogger('ADMIN_REVOKE_VERIFICATION'));

// Reports workflow: Admin reviews/escalates/compromises; Super Admin is
// required only for account-level sanctions (requireSuperAdmin below).
router.get('/reports', getReports);
router.get('/reports/:id', getReport);
router.put('/report/:id', updateReport, auditLogger('ADMIN_UPDATE_REPORT'));
router.post('/reports/:id/escalate', escalateReport, auditLogger('REPORT_ESCALATED'));
router.post('/reports/:id/compromise', compromiseCode, auditLogger('VERIFICATION_CODE_COMPROMISED'));

router.get('/audit-logs', getAuditLogs);
router.get('/stats', getStats);
router.get('/recruiters', getRecruiters);
router.get('/recruiters/:id', getRecruiter);
// Super Admin only: suspend / remove recruiter accounts (sanctions).
router.post('/recruiters/:id/status', requireSuperAdmin, setRecruiterAccountStatus, auditLogger('RECRUITER_ACCOUNT_STATUS'));
// Encrypted-photo access: decrypted in memory, streamed once, no-store.
// Place BEFORE /recruiters/:id is irrelevant (different path shape) but keep
// it explicit so future route reordering can't shadow it.
router.get('/photo/:id', getMedia);

export default router;
