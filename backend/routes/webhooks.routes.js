import express from 'express';
import { diditWebhook } from '../controllers/face.controller.js';

const router = express.Router();

// Raw-body route (server.js mounts express.raw for /api/webhooks): the HMAC
// signature is computed over the exact bytes Didit sent, so this endpoint
// must run BEFORE the global express.json() parser.
router.post('/didit', diditWebhook);

export default router;
