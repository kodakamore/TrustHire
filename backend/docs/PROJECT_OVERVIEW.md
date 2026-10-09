# TrustHire — Complete Project Overview

> **Purpose of this document.** A single, self-contained reference that explains
> what TrustHire is, how every part works, and how the parts connect — written so
> that a human reader (examiner, teammate) or an AI agent can fully understand
> the system without reading the source code first. Every claim here matches the
> code as of commit `0d66856`; file paths are given for deeper reading.
>
> **Sandbox honesty statement.** All third-party integrations currently run in
> sandbox/mock mode (see §9). Live-mode code paths are implemented but require
> real credentials. Nothing in this system pretends a mock result is a live one.

---

## 1. What TrustHire Is

TrustHire is a **job-advertisement verification platform**. Legitimate recruiters
voluntarily verify themselves (person, company, domain) and their job ads. Each
approved ad receives a **QR code and PIN** that anyone — a job seeker scanning a
poster or entering a PIN on the website — can use to confirm the ad is genuine.
A public **reporting channel** lets seekers flag suspicious ads, feeding an admin
investigation and takedown workflow.

**Problem addressed:** fraudulent job ads impersonate real companies. TrustHire
inserts a trust layer between recruiters and seekers: identity + corporate +
domain evidence is collected, scored by a decision engine, and distilled into a
verifiable artifact (QR/PIN) with an auditable lifecycle (issue → detect abuse →
compromise → revoke → reissue).

---

## 2. System Architecture

```
 ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
 │ recruiter-portal │  │    seeker-app    │  │  admin-dashboard │  │ frontend (legacy)│
 │  React SPA :3003 │  │  React SPA :3001 │  │  React SPA :3002 │  │  combined SPA    │
 └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  └──────────────────┘
          │  /api proxy         │                     │
          └──────────┬──────────┴─────────────────────┘
                     ▼
          ┌─────────────────────────┐        ┌───────────────────────────────┐
          │  Express API  :5000     │◀──────▶│ Third-party providers         │
          │  (backend/, ESM)        │        │ Dojah · Didit · WhoisXML ·    │
          │  ├─ JWT auth (2 roles)  │        │ APIVoid · Resend · public DNS │
          │  ├─ 4-pillar engine     │        └───────────────────────────────┘
          │  ├─ AES-256-GCM at rest │
          │  ├─ audit log middleware│        ┌───────────────────────────────┐
          │  └─ signed webhooks     │        │ PostgreSQL (trusthire)        │
          └─────────────────────────┘        └───────────────────────────────┘
```

| App | Path | Role | Dev port |
|---|---|---|---|
| Backend API | `backend/` | All business logic, providers, DB | 5000 |
| Recruiter Portal | `recruiter-portal/` | Recruiter onboarding + job posting | 3003 (Vite `host:true`, `/api`→5000 proxy; phone-LAN testable) |
| Seeker App | `seeker-app/` | Public PIN/QR verification + reporting | 3001 |
| Admin Dashboard | `admin-dashboard/` | Review queue, reports, sanctions, audit | 3002 |
| Legacy SPA | `frontend/` | Original combined UI — superseded by the three apps above | — |

**Stack:** Node.js ≥18 (ESM) · Express · `pg` (PostgreSQL 14+) · JWT +
bcrypt · React 18 + Vite + Tailwind + React Router v6 · `qrcode` (npm) ·
`resend` (email) · native `crypto` (AES-256-GCM, HMAC-SHA256) · Node DNS resolver.

---

## 3. Repository Map

```
backend/
  server.js               # app wiring, raw-body webhook mount, prod boot asserts
  routes/                 # auth, company, job, verify, public, admin, webhooks
  controllers/            # auth, company, job, verify, face, public, admin
  services/               # dojah, didit, whois(+DNS+SSRF guard), apivoid,
                          # email(resend), qrcode, verification(engine),
                          # storage(encrypted media), hash, audit
  middleware/             # auth(JWT), adminAuth, roles(super-admin), auditLogger,
                          # rateLimiter, logRedaction
  models/                 # recruiter, company, job, verificationCheck,
                          # verificationCode, faceVerification, media, report,
                          # admin, auditLog  (all with SQL-injection-safe column
                          # guards: SAFE_COLUMN allowlist regex)
  utils/                  # cryptoHelper(envelope encryption), domainHelper(PSL),
                          # piiRedactor, pinGenerator, validators
  db/migrations/          # 001 schema → 007 hardening (see §5)
  docs/                   # ENCRYPTION.md, FACE_VERIFICATION.md, this file
  scripts/                # seed-defense-recruiter, create-admin, apply-007,
                          # purge-test-recruiters, verify-migration
  tests/                  # unit, crypto, redaction, e2e, e2e.security,
                          # e2e.workflow, e2e.face + PII migration verification
recruiter-portal/src/     # pages: Register, VerifyEmail, Login, Dashboard,
                          #   VerifyIdentity(4 steps), AddCompany, CompanyDetails,
                          #   SubmitJob, JobDetails
                          # components: DiditFaceVerification, FaceLivenessCapture,
                          #   VerifiedFacePhoto, VerificationProgress, ...
seeker-app/src/           # pages: Home, VerificationResult, Report
admin-dashboard/src/      # pages: AdminLogin, Dashboard, ReviewQueue,
                          #   ReviewDetails, Reports, AuditLog
```

---

## 4. Data Model (PostgreSQL)

Base schema `001_initial_schema.sql`, extended by later migrations:

| Table | Purpose | Added/changed by |
|---|---|---|
| `recruiters` | Person accounts; four boolean verification flags (`is_email/phone/identity/face_verified`), `verification_status`, `account_status` (active/suspended…), OTP columns (`email_otp`, attempts, expiry; `phone_otp`, `phone_otp_sent_at` cooldown), encrypted `nin_enc`/`bvn_enc` + key ids | 001, 002, 004, 007 |
| `companies` | Recruiter's company; `is_cac_verified`, `is_tin_verified`, `is_domain_verified`, `is_corporate_email_verified` (+ OTP columns/attempts), `is_cac_director_match`, **`is_dns_verified`**, `verification_status` | 001, 007 |
| `job_advertisements` | Job ads; `status` (pending/approved/rejected/…), `flags` JSONB (engine output), `data_hash`, editable-field allowlist enforced in code | 001 |
| `verification_codes` | One row per issued QR/PIN: `pin` (unique), `qr_code_url/path`, `is_active`, `expires_at`, **lifecycle** (`status` active/compromised/revoked/deactivated, `compromised_at`, `revoked_reason`, `reissued_from` chain) | 001, 004 |
| `verification_lookups` | Every public PIN/QR check: IP, user-agent, timestamp | 001 |
| `reports` | Seeker reports: reason/description/category, severity, `observed_content` JSONB, `finding`, assignment/escalation/resolution fields, linked `verification_code_id` | 001, 004 |
| `verification_checks` | Append-only evidence log for every provider call (target recruiter/company, check_type, provider, reference_id, encrypted `raw_response`, `is_successful`) — the audit backbone the engine reads | 001 |
| `admins` | Admin accounts; `role` (admin / super_admin) | 001 |
| `audit_logs` | Every mutating request (via `auditLogger(event)` middleware): event_type, actor, target, redacted details, IP, UA | 001 |
| `settings` | Tunable thresholds (min domain age 30d, min face match 85%, min liveness 80%, verification validity 90d) | 001 |
| `encryption_keys` | Data-key registry: `dek_*` key ids, active/retired state (rotation) | 002 |
| `media_objects` | Encrypted binary store (ID-photo extracts, verified face photos): ciphertext + SHA-256 integrity + owner scoping | 002 |
| `recruiter_face_verifications` | One row per liveness session (Didit or legacy): session_id (unique, upsert), provider, environment, status (pending/in_review/approved/declined), liveness/face-match results, encrypted `raw_result`, `face_photo_ref` → `media_objects` | 005, 006 |

**Encryption at rest (details in `backend/docs/ENCRYPTION.md`):** NIN/BVN and
provider raw payloads are stored as AES-256-GCM ciphertext with per-value keys
tracked in `encryption_keys` (rotation = new `dek_YYYYMMDD_*`, old keys retired,
transparent re-encryption). Binaries (photos) are encrypted in `media_objects`
with SHA-256 integrity checks. Migration phases: dual-write/dual-read → backfill
→ verify (`scripts/verify-migration.js`) → **Phase 5 (drop plaintext columns,
`003_drop_plaintext.sql`) deliberately gated until after 2026-10-15**.

---

## 5. Core Concept — The 4-Pillar Decision Engine

`backend/services/verification.service.js → processJobVerification(job, recruiter, company)`
runs on every job create (and re-runs on edit). It inspects the recruiter's
boolean flags plus the latest `verification_checks` rows and emits **flags with
severities**:

| Pillar | Signals checked | Example flags |
|---|---|---|
| **1. Recruiter identity** | email/phone/NIN/face verified; face-match score vs `MIN_FACE_MATCH_SCORE` (85%); liveness | `recruiter_*_not_verified` (critical), `low_face_match_score` (warning), `face_match_no_reference_photo` (warning) |
| **2. Corporate legitimacy** | CAC registration verified (or in manual review) | `company_cac_not_verified` (critical), `company_cac_manual_review` (warning) |
| **3. Domain safety & reputation** | WHOIS domain age ≥ `MIN_DOMAIN_AGE_DAYS` (30; <7 days ⇒ critical), privacy-proxy info; APIVoid blacklist/threat score ≤ `MAX_DOMAIN_RISK_SCORE` (20), SSL presence; homepage-content company-name match; **or** cryptographic DNS TXT ownership | `domain_too_new`, `domain_threat_blacklisted` (critical), `domain_elevated_risk_score`, `website_content_mismatch`, `company_website_not_verified` (warning), `dns_ownership_verified` (info, positive) |
| **4. Recruiter↔company linkage** (anti-impersonation) | Any **one** of: corporate work-email OTP verified · registration email domain matches company website domain · recruiter is a CAC director/executive match | `unverified_company_affiliation` (warning) if none hold |

**Decision rule:**
```
zero critical flags AND zero warning flags  →  status = "approved"   (auto-approve)
any critical or warning flag                →  status = "pending"   (admin review queue,
                                                                     carrying the exact flag list)
info flags never block auto-approval.
```

On approval the job receives a **verification code**: PIN `VRF-XXXX-XXXX`
(CSPRNG), QR PNG (error-correction H) encoding `{FRONTEND_URL}/v/{pin}`, saved
to `backend/public/qrcodes/qr_{pin}.png`, valid **90 days**
(`settings.verification_validity_days`). On job **edit**, the engine re-runs and
the job is **always forced back to `pending`** — editing never silently
re-approves (audit fix C1), and a changed `application_email` on a public domain
is re-rejected.

---

## 6. End-to-End Flows

### A. Recruiter registration → email activation
1. `POST /api/auth/register` (rate-limited 10/15 min/IP). **New signups may not
   use free webmail** (gmail/yahoo… blocked via a public-suffix list in
   `utils/domainHelper.js`) — recruiters must use a corporate-domain address.
2. Password bcrypt-hashed; a 6-digit OTP (`crypto.randomInt`) and a **24-hour
   single-use JWT link** (`{recruiterId, email, action:"verify_email"}`) are minted.
3. Email sent via Resend (both OTP and link). If delivery fails, the service
   **falls back to a local console log** — delivery is best-effort, never fatal.
4. Activation by **either** path (both are proofs of inbox possession, both single-use):
   - `POST /api/auth/verify-email` `{token}` — signature, action, expiry, and
     already-verified checks; a reused link never mints a new login token.
   - `POST /api/auth/verify-email-otp` `{otp}` — 5 wrong attempts ⇒ 429; expiry;
     resend rotates the OTP; consumption is one-time.
5. `POST /api/auth/resend-verification` rotates and re-sends (per-account cooldown).
6. `POST /api/auth/login` → JWT (recruiter sessions). Unverified users can log
   in but cannot pass downstream gates.

### B. Recruiter identity verification (`/verify/*`, all JWT-protected)
1. **Phone** — `POST /verify/phone/send-otp` (per-IP limiter **and** per-account
   60s cooldown) → sandbox OTP `1234` → `POST /verify/phone/verify-otp`
   (attempt-capped). Changing the phone number later resets `is_phone_verified`.
2. **Identity (NIN/BVN)** — `POST /verify/identity` → Dojah lookup → the
   response's ID photo is pulled into encrypted `media_objects`; NIN stored only
   as ciphertext (`nin_enc`), audit row written.
3. **Face / liveness (Didit, preferred)** —
   `POST /verify/face/session` creates a Didit hosted session (idempotent: Didit
   reuses the unfinished session for the same `vendor_data`=recruiter id; the
   DB row upserts on `session_id`). The portal opens `https://verify.didit.me/…`
   (popup-safe: placeholder tab opens inside the user gesture, then navigates).
   Verdicts arrive by **HMAC-signed webhook** (`POST /api/webhooks/didit`,
   raw-body route, V2 canonical-JSON signature + 5-min timestamp replay window)
   with a **poll fallback** (`GET /verify/face/status` → `/v3/session/{id}/decision/`)
   because webhooks cannot reach localhost. Approval flips `is_face_verified`,
   mirrors into `verification_checks`, and best-effort downloads the provider's
   reference image into the encrypted photo store. With no keys configured
   (mock mode) capture happens in-portal via webcam and completes through
   `POST /verify/face/mock/complete` — same state machine.
   *(Legacy `POST /verify/face` frame path remains: 3-frame anti-replay
   liveness via Dojah + face-match vs the ID photo; it now also stores the
   final frame + an approved audit record so the dashboard photo works.)*
4. `GET /verify/status` reports per-step state; four booleans → recruiter
   `verification_status` = `verified`.

### C. Company onboarding (`/api/company`, JWT)
1. `POST /api/company` — create profile (field-allowlisted).
2. **CAC** — `POST /:id/verify/cac` → Dojah company lookup (mock returns
   verified + director/affiliate list used later for pillar-4 matching).
3. **Corporate work email** — `POST /:id/corporate-email/send-otp` (IP-limited +
   per-account attempt cap) → recipient must hold an address on the **company's
   own domain** → verify-otp sets `is_corporate_email_verified`.
4. **Website** — `POST /:id/verify/website` → WhoisXML age/privacy + APIVoid
   threat/blacklist/SSL + homepage content company-name match (all fetched
   through an **SSRF guard**: `assertPublicUrl` blocks private/loopback/link-local
   targets incl. redirects, ≤3 redirect hops re-validated per hop) → sets
   `is_domain_verified`.
5. **Optional DNS TXT ownership (cryptographic)** — `GET /:id/dns-verification-instructions`
   returns a deterministic HMAC token (`trusthire-verify=…`, input
   `companyId:domain`, so proof dies with the domain it proved); the recruiter
   publishes it as a TXT record at the apex or `_trusthire-verify.{domain}`;
   `POST /:id/verify/dns` performs a **real public-DNS TXT lookup**, matches the
   token, sets `is_dns_verified`. Website changes reset domain/DNS/corporate flags.
6. `GET /:id/status` — per-pillar company state.

### D. Job submission → decision → artifact
1. `POST /api/jobs` (JWT) — `JOB_EDITABLE_FIELDS` allowlist; `company_id` re-gated
   to the recruiter's own company; `application_email` must not be free webmail.
2. `processJobVerification` (§5) → `approved` (auto) or `pending` (queue) with
   `flags` JSONB stored on the job.
3. If approved: verification code issued (PIN + QR + 90-day expiry). Recruiter
   sees the QR/PIN in `JobDetails`; seekers scan/enter it.
4. `PUT /api/jobs/:id` — allowlist + full re-verification + forced `pending`.
5. `GET /api/jobs/:id/verification` — the recruiter's own view of the decision.

### E. Public verification (seeker side, no auth)
- `GET /api/public/verify/:pin` (also `/verify/pin/:pin`, `/verify/qr/:pin`),
  IP-limited 30/15 min, logs IP/UA/time into `verification_lookups`.
- Returns a truthful status payload: **verified** (ad title/company, expiry),
  `not_found`, `expired`, `compromised`/`revoked` (with the published reason).
  Seeker app: `Home` → enter PIN or scan (QR encodes `/v/{pin}`) →
  `VerificationResult`.

### F. Reporting & takedown workflow
1. Seeker submits `POST /api/public/report` (reason/category/severity,
   optional description, observed content, reporter contact) from `Report` page.
2. Admin investigates in `admin-dashboard` (`Reports` page): assign, record a
   `finding`, escalate (`POST /admin/reports/:id/escalate`).
3. Takedown: `POST /admin/reports/:id/compromise` flips the code to
   **compromised** (public lookups now say so), optionally with reissue (new
   PIN chained via `reissued_from`). Job-level `POST /admin/job/:id/revoke`
   withdraws verification.
4. Account sanctions (`POST /admin/recruiters/:id/status`) require
   **super_admin**.

### G. Admin operations
- **Bootstrap:** the very first admin may self-register; afterwards
  `POST /api/auth/admin/register` requires `ADMIN_BOOTSTRAP_TOKEN` (body or
  `x-bootstrap-token` header). `scripts/create-admin.js` is the supported CLI path.
- **Review queue:** `GET /admin/queue` (+ `/:id` details incl. decrypted-on-demand
  evidence photos streamed once with `no-store`); `POST /admin/job/:id/approve|reject`
  with notes. *(Deferred item: an explicit critical-flag override gate on approve.)*
- **Visibility:** recruiters, per-recruiter detail, stats, and the full
  `audit-logs` trail — every mutating API call in the system is recorded by
  `auditLogger` middleware with actor/target/IP and redacted details.

---

## 7. Security Architecture (summary; each item is test-covered)

| Area | Mechanism |
|---|---|
| Authentication | bcrypt passwords; JWT bearer (recruiter + admin sessions); email activation required before substantive verification |
| Admin lockdown | First-run bootstrap + token-gated registration; `requireSuperAdmin` for sanctions; `scripts/create-admin.js` |
| Mass assignment | Explicit per-endpoint field allowlists (`COMPANY_EDITABLE_FIELDS`, `JOB_EDITABLE_FIELDS`) + model-level `SAFE_COLUMN` regex so unknown columns can never be written |
| OTP hardening | CSPRNG codes; expiry; 5-attempt caps → 429; rotation on resend; per-account 60s phone cooldown; per-IP limiters on send endpoints; phone change resets verification |
| Rate limiting | Global 100/15min; auth 10; public lookups 30; OTP sends limited per-IP; `DISABLE_RATE_LIMIT` honored **only outside production** |
| Injection & XSS | Parameterized SQL everywhere; column-name allowlists; output encoding in React |
| SSRF | `assertPublicUrl` + `safeFetch` (DNS-resolve-and-check private ranges, redirect re-validation, timeouts) on all outbound URL fetches (website content; documented TOCTOU note) |
| Encryption at rest | AES-256-GCM envelope for NIN/BVN and provider raw payloads; key rotation registry; encrypted media store with SHA-256 integrity; plaintext-drop phase gated to 2026-10-15 |
| PII hygiene | `piiRedactor` + log-redaction middleware; NIN/BVN stripped from every client payload; OTP columns stripped from all company responses; encrypted audit blobs never returned |
| Webhooks | Raw-body HMAC (V2 canonical JSON + deprecated fallbacks), 5-minute timestamp window, idempotent terminal-state guard, unknown-session acknowledged-and-ignored |
| Media exposure | Verified photos served only to their owner/admin, decrypted in memory, `no-store`/`noindex`, no enumerable ids |
| Verification integrity | Job edits never auto-re-approve; DNS proof domain-bound and unforgeable via API; face sessions idempotent; engine flags surfaced verbatim to admins |
| Public surface | Rate-limited, truthful statuses (expired/compromised are first-class), lookup logging for investigations |

**Provider sandbox matrix** (`USE_MOCK_API=true`; `DIDIT_MOCK` or missing keys):
Dojah (OTP always `1234`; NIN format-gated then synthetic identity + photo;
liveness requires ≥5 KB realistic frames and rejects blanks; phone/NIN
references prefixed `sandbox_*`) · Didit (sandbox keys; mock fallback outside
production; hard-fail in production without keys) · WhoisXML mock (flags
`new`/`temp` domains) · APIVoid mock (flags `.xyz`/`.top`, synthetic threat
scores) · content mock (flags `unrelated`/`mismatch` homepages) · **DNS TXT =
real public resolver even locally** · Resend is *live but test-mode*: the key can
only deliver to the account owner's address; every other recipient 403s and the
mailer falls back to console logging (see §10).

---

## 8. Observability & Audit

- **`audit_logs`** — every state-changing endpoint wrapped by
  `auditLogger(EVENT_TYPE)` (login, register, verify steps, company/job mutations,
  admin decisions, sanctions, compromises).
- **`verification_checks`** — the provider-evidence trail the engine and admins
  read; raw payloads encrypted at rest.
- **`verification_lookups`** — who checked which PIN, when, from where.
- Admin `AuditLog` page + `/admin/audit-logs` API; `services/audit.service.js`
  helpers; log redaction prevents secrets/PII leaking into console output.

---

## 9. Testing Architecture (`npm run test:all`)

Self-contained suites spin up throwaway servers on private ports against
dedicated test DBs, run, and verify **zero fixture residue** (recruiters, admins,
orphan checks, media objects) afterwards. Latest full run: all green.

| Suite | Coverage highlights |
|---|---|
| unit + crypto + redaction | envelope encrypt/rotate/decrypt, PII redactor, domain/PSL helper, PIN format, SSRF guard, DNS token binding |
| `e2e.test.js` (22) | register→activate→login, OTP expiry/rotation/attempt caps, admin lockdown + bootstrap token, account states |
| `e2e.security.test.js` (28) | mass-assignment (company/job), public-webmail rejection at register and edit, OTP secret non-leakage, email/phone/corporate OTP abuse paths, DNS failure path + forged-flag resistance, job-edit forgery, **full funnel → auto-approved job + QR/PIN + public lookup** |
| `e2e.workflow.test.js` (25) | company onboarding, job lifecycle, admin approve/reject, revoke/reports/compromise/reissue, seeker lookup statuses |
| `e2e.face.test.js` (17) | Didit session, signed webhook accept/reject (V2, stale timestamp, bad signature), replay idempotency, declined path, mock-complete gating, encrypted face-photo store + self-view endpoint |
| `pii:verify` | migration integrity: ciphertext coverage, round-trip decrypt, no plaintext/photo leakage, active DEK loads |

Tests cover **success and failure paths** deliberately (rejected generic
domains, wrong/expired/reused/rotated OTPs, DNS misses, SSRF/bypass attempts).

---

## 10. Configuration Reference (`.env`)

| Key | Meaning |
|---|---|
| `DATABASE_URL` / `PG*` | PostgreSQL connection (local db `trusthire`, 5432) |
| `PORT` (5000), `API_URL` | Backend port; **public** base URL used in webhook callbacks |
| `FRONTEND_URL` / `FRONTEND_RECRUITER_URL` | Base URLs for emailed links + QR payload |
| `JWT_SECRET` | Session + email-link signing key |
| `ADMIN_BOOTSTRAP_TOKEN` | Required after first admin exists |
| `EXPOSE_DEBUG_OTP` | Dev affordance: API returns `debugOtp`/`verificationLink`. **Must be off in production** |
| `USE_MOCK_API` | Provider mock switch (Dojah/WhoisXML/APIVoid/content) |
| `DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET`, `DIDIT_WORKFLOW_ID`, `DIDIT_ENV`, `DIDIT_MOCK` | Liveness integration; missing keys ⇒ mock (non-prod); production requires real keys |
| `DNS_VERIFY_SECRET` | HMAC secret for DNS TXT tokens; **production boot refuses to start unless set (≥16 chars)**; locally falls back to `JWT_SECRET` |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Email delivery; current key is test-mode (delivery restricted to the account owner's address) |
| `MIN_DOMAIN_AGE_DAYS` (30), `MAX_DOMAIN_RISK_SCORE` (20), `MIN_FACE_MATCH_SCORE` (85), `MIN_LIVENESS_SCORE` (80), validity 90d | Engine thresholds |
| `PURGE_KEEP_EMAILS` | Never-delete list for `scripts/purge-test-recruiters.js` (demo + real recruiter protected) |
| `DISABLE_RATE_LIMIT` | CI-only escape hatch; ignored when `NODE_ENV=production` |

---

## 11. Demo & Defense Assets

- **`scripts/seed-defense-recruiter.js`** (idempotent, `--skip-face` optional):
  wipes and re-seeds the demo account through the real HTTP API —
  `hr@acmeskills.ng` / `AcmeSkills@2026` (company "Acme Skills Nigeria
  Limited") — passing **all seven phases** (email OTP, phone OTP, NIN, face,
  corporate email OTP, CAC, website) and ending with an **auto-approved job +
  QR/PIN**. The seeder prints the defense dashboard (current PIN, QR URL,
  expiry) and asserts every phase.
- Demo + the protected real account live in `PURGE_KEEP_EMAILS`; the purge
  script never touches them.
- Debug affordances (`EXPOSE_DEBUG_OTP=true`, local only) surface OTPs/links so
  demos don't depend on email delivery.

---

## 12. Known Limitations & Production Gates (honest list)

1. **All providers are in sandbox/mock mode** (§7 matrix). Live behavior = same
   code paths with real credentials; Dojah/WhoisXML/APIVoid/Didit need keys,
   Resend needs a **verified sending domain** (its test key can only email the
   account owner — everything else 403s and falls back to console logging).
2. **DNS TXT success path** requires a domain you control (the lookup itself is
   real public DNS and works locally); the failure path and token binding are
   fully tested.
3. **Before any production deploy:** set `DNS_VERIFY_SECRET` (≥16 chars — boot
   assert), unset `EXPOSE_DEBUG_OTP`, run real keys for every provider, never run
   the purge without the keep-list, and execute **Phase 5** (drop plaintext ID
   columns) only after its soak date (≥ 2026-10-15).
4. **Deferred (optional):** explicit critical-flag override gate on admin
   approve; SMTP fallback for email.
5. `yprecious526@gmail.com` is a real recruiter account intentionally left in
   its original state (protected by the purge keep-list).

---

## 13. The Story in One Paragraph

A recruiter registers with a corporate-domain email and activates via a signed
one-time link or OTP; proves phone, government identity (NIN, stored only as
AES-GCM ciphertext), and a live biometric face check through Didit's hosted
capture (signed webhooks + polling fallback, liveness photo captured to an
encrypted store); onboards a company with CAC verification, a corporate-email
OTP proving work-email control, and website verification via WHOIS age, threat
screening, content matching — or a cryptographic DNS TXT proof. Submitting a job
runs the four-pillar engine: only ads that are clean across identity, corporate
legitimacy, domain reputation, and recruiter↔company linkage are auto-approved
and issued a 90-day QR/PIN; everything else lands in an admin queue with exact,
evidence-backed flags. Job seekers verify ads by scanning or typing the PIN;
 anyone can report a suspicious ad, feeding an admin investigation workflow that
can compromise codes, revoke verifications, reissue fresh codes, and suspend
accounts — with every action, provider payload, and public lookup recorded in
tamper-evident audit trails. All of it is exercised end-to-end by automated
suites that verify both the happy paths and the abuse paths, in an
honestly-labeled sandbox that documents precisely what changes when live
credentials are added.
