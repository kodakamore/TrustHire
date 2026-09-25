# TrustHire — Job Advertisement Verification Platform

A trusted verification layer between legitimate recruiters and job seekers. Recruiters voluntarily verify their identity, company, and job advertisements. Verified ads receive a QR code and PIN that job seekers can use to check authenticity.

## Architecture

```
┌─────────────────────┐  ┌──────────────────────┐  ┌─────────────────────┐
│  Recruiter Portal   │  │  Job Seeker App      │  │  Admin Dashboard    │
│  (React + Vite)     │  │  (React + Vite)      │  │  (React + Vite)     │
│  Port 3000          │  │  Port 3001           │  │  Port 3002          │
└──────────┬──────────┘  └──────────┬───────────┘  └──────────┬──────────┘
           └────────────────┬───────┴──────────────────────────┘
                            ▼
               ┌────────────────────────┐
               │   Express.js API       │
               │   Port 5000            │
               ├────────────────────────┤
               │  PostgreSQL · Dojah    │
               │  WhoisJSON · QR Gen    │
               └────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS, React Router v6 |
| Backend | Node.js, Express.js |
| Database | PostgreSQL |
| Identity Verification | Dojah API (sandbox) |
| Website Verification | WhoisJSON API |
| QR Code Generation | qrcode (npm) |
| Authentication | JWT (jsonwebtoken + bcrypt) |

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Dojah API credentials (sandbox)
- WhoisJSON API key

### 1. Database Setup

```bash
# Create the database
createdb trusthire

# Run migrations
psql -d trusthire -f backend/db/migrations/001_initial_schema.sql
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your database URL, Dojah keys, and WhoisJSON key
npm install
npm run dev
```

### 3. Recruiter Portal

```bash
cd recruiter-portal
npm install
npm run dev
```

### 4. Job Seeker App

```bash
cd seeker-app
npm install
npm run dev
```

### 5. Admin Dashboard

```bash
cd admin-dashboard
npm install
npm run dev
```

## Verification Flow

```
Recruiter Registers
    → Email verified (Dojah)
    → Phone verified (Dojah)
    → NIN/BVN verified (Dojah)
    → Face liveness + match (Dojah)
    → Company registered
        → CAC verified (Dojah)
        → TIN verified (Dojah, optional)
        → Website verified (WhoisJSON)
    → Job advertisement submitted
        → Auto-verified or sent to admin review
        → QR code + PIN generated
        → Recruiter shares verified ad

Job Seeker Receives Ad
    → Scans QR code or enters PIN
    → Sees verification status:
        ✅ Verified and Valid
        ⏰ Verified but Expired
        🚫 Verification Revoked
        ❓ Code Not Found
    → Compares details with ad received
    → Reports mismatches if needed
```

## API Endpoints

### Public (No Auth)
- `GET /health` — Health check
- `GET /api/public/verify/:pin` — Verify by PIN
- `GET /api/public/verify/qr/:pin` — Verify by QR
- `POST /api/public/report` — Submit report

### Recruiter (JWT Auth)
- `POST /api/auth/register` — Register
- `POST /api/auth/login` — Login
- `POST /api/verify/email` — Verify email
- `POST /api/verify/phone` — Verify phone
- `POST /api/verify/identity` — Verify NIN/BVN
- `POST /api/verify/face` — Face verification
- `POST /api/company` — Add company
- `POST /api/company/:id/verify/cac` — Verify CAC
- `POST /api/company/:id/verify/website` — Verify website
- `POST /api/job` — Submit job
- `GET /api/job` — List jobs
- `GET /api/job/:id/verification` — Get QR/PIN

### Admin (Admin JWT Auth)
- `GET /api/admin/queue` — Review queue
- `POST /api/admin/job/:id/approve` — Approve job
- `POST /api/admin/job/:id/reject` — Reject job
- `POST /api/admin/job/:id/revoke` — Revoke verification
- `GET /api/admin/reports` — View reports
- `GET /api/admin/audit-logs` — Audit trail
- `GET /api/admin/stats` — Dashboard stats

## Project Structure

```
trusthire/
├── backend/              # Express.js API
│   ├── config/           # Database, Dojah, WhoisJSON config
│   ├── controllers/      # Route handlers
│   ├── db/migrations/    # SQL schema
│   ├── middleware/        # Auth, rate limiting, audit logging
│   ├── models/           # Database queries
│   ├── routes/           # Express routes
│   ├── services/         # Business logic (Dojah, WHOIS, QR, etc.)
│   └── utils/            # PIN generation, validators
├── recruiter-portal/     # React app for recruiters
├── seeker-app/           # React app for job seekers
├── admin-dashboard/      # React app for admins
└── README.md
```

## External APIs

| API | Purpose | Environment |
|-----|---------|-------------|
| Dojah | Email, phone, NIN/BVN, face, CAC, TIN verification | Sandbox: `sandbox.dojah.io` |
| WhoisJSON | Website/domain WHOIS lookup | Production (free tier) |

## License

This project is part of a final-year Computer Science project.
