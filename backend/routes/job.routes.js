import express from 'express';
import { createJob, getJobs, getJob, updateJob, getVerificationDetails } from '../controllers/job.controller.js';
import { authenticateRecruiter } from '../middleware/auth.js';
import { auditLogger } from '../middleware/auditLogger.js';

const router = express.Router();

router.use(authenticateRecruiter);

router.post('/', createJob, auditLogger('CREATE_JOB'));
router.get('/', getJobs);
router.get('/:id', getJob);
router.put('/:id', updateJob, auditLogger('UPDATE_JOB'));
router.get('/:id/verification', getVerificationDetails);

export default router;
