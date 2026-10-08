import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { rateLimiter } from './middleware/rateLimiter.js';
import { installLogRedaction, redactedErrorLogger, sanitizeResponses } from './middleware/logRedaction.js';
import { assertKeyConfigured } from './config/keys.js';

import authRoutes from './routes/auth.routes.js';
import verifyRoutes from './routes/verify.routes.js';
import companyRoutes from './routes/company.routes.js';
import jobRoutes from './routes/job.routes.js';
import publicRoutes from './routes/public.routes.js';
import adminRoutes from './routes/admin.routes.js';

dotenv.config();

// Phase 0: fail fast on a missing/malformed encryption key. A server that
// boots without one would silently write plaintext PII.
try {
  assertKeyConfigured();
} catch (err) {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
}

// Phase 2: scrub base64 images and 11-digit IDs from all log output.
installLogRedaction();

import path from 'path';

const app = express();

const corsOptions = {
  origin: [
    'http://localhost:3000',
    process.env.FRONTEND_RECRUITER_URL,
    process.env.FRONTEND_SEEKER_URL,
    process.env.FRONTEND_ADMIN_URL,
  ].filter(Boolean),
  credentials: true,
};

app.use(cors(corsOptions));
// Allow cross-origin images to be embedded in canvases and downloaded
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(express.json({ limit: '10mb' }));
app.use(rateLimiter);

// Make public folder accessible
app.use('/public', express.static(path.join(process.cwd(), 'public')));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'trusthire-backend' });
});

// MUST wrap res.json BEFORE routes mount: route handlers call res.json during
// their own execution, so a downstream middleware would never get the chance
// to wrap it. Image scrubbing only works if the wrapper is installed first.
app.use(sanitizeResponses);

app.use('/api/auth', authRoutes);
app.use('/api/verify', verifyRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/job', jobRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/admin', adminRoutes);

app.use((err, req, res, next) => {
  redactedErrorLogger(err, req, res, next);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
