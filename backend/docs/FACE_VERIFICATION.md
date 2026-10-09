# Recruiter Face & Liveness Verification — Didit

## Why Didit

Recruiter face verification is a **security control**: it must resist printed
photos, screen replays, and deepfakes. A hand-rolled TensorFlow.js classifier
has no PAD (Presentation Attack Detection) certification and can be spoofed
with a phone photo, so it cannot back a trust decision. TrustHire therefore
uses **Didit** for real, guided, camera-based liveness:

- **500 free checks/month** on the free tier — enough for the project's whole
  demo and early production usage.
- **No company registration (CAC) required** to sign up; self-serve sandbox
  **and live** API keys from the Business Console.
- Hosted capture UI (blink / head-turn challenges) — liveness anti-spoofing
  runs on Didit's side; our code never handles raw biometrics.
- Verdicts arrive as **HMAC-SHA256-signed webhooks**; we verify the signature
  over the raw request bytes and fail closed.

> Note: Didit's published pricing changes on **2026-11-01** (liveness ~$0.10,
> face match ~$0.05 per check). Confirm current free-tier terms at signup.

## Architecture

```
Recruiter portal                TrustHire backend                 Didit
────────────────                ─────────────────                 ─────
POST /api/verify/face/session → create session record (pending)
                                POST /v3/session/  ────────────→ hosted session
              ← session.url ── return URL
[opens Didit tab] ────────────────────────────────────────────→ real-camera
                                                                liveness
                                ←──── POST /api/webhooks/didit ─┘ (signed)
                                verify HMAC (raw body, fail closed)
                                UPDATE record (once) + audit row
GET /api/verify/face/status  ←  latest record for this recruiter
```

Key property: **the webhook and the local mock completer share
`processDiditEvent`** — one state machine, one audit trail, regardless of how
the verdict arrives.

## Files

| File | Role |
| --- | --- |
| `db/migrations/005_face_verification.sql` | `recruiter_face_verifications` table |
| `models/faceVerification.model.js` | one row per session; `markDecision` is guarded to non-terminal rows (idempotent) |
| `services/didit.service.js` | session creation, polling, HMAC verification, mock mode |
| `controllers/face.controller.js` | session/status/mock/webhook handlers + shared event processor |
| `routes/webhooks.routes.js` | `POST /api/webhooks/didit` on **raw** body (mounted before `express.json`) |
| `recruiter-portal/src/components/DiditFaceVerification.jsx` | Step 4 UI (hosted flow + mock fallback) |

## Configuration (backend/.env)

```bash
DIDIT_API_KEY=...            # X-Api-Key from the Didit console
DIDIT_WEBHOOK_SECRET=...     # HMAC secret; webhooks fail closed without it
DIDIT_WORKFLOW_ID=...        # workflow that includes the liveness check
DIDIT_ENV=sandbox            # or 'live' — matches the key's environment
DIDIT_MOCK=                  # unset: mock when keys missing (never in prod)
API_URL=http://localhost:5000   # deployed origin — Didit posts webhooks here
```

**Mock mode** mirrors the `USE_MOCK_API` pattern used for Dojah: with no keys
(and `NODE_ENV !== 'production'`), sessions are generated locally and the
portal captures with the in-browser webcam component, driving the exact same
backend flow. In production, missing keys are a hard error — never a silent
mock. Adding real keys flips the portal to Didit's hosted camera flow with
**no code changes**.

## Data & privacy posture (NDPA 2023)

- TrustHire stores the **decision**, not the biometrics. Face images/video
  stay on Didit for its retention window.
- The raw provider event is stored **encrypted at rest** in
  `recruiter_face_verifications.raw_result` (envelope AES-256-GCM) as an audit
  record; it contains metadata/scores, not images.
- An approved verdict writes a `verification_checks` row
  (`check_type='liveness'`, `provider='didit'`) and sets
  `recruiters.is_face_verified`, feeding the existing status derivation.
- Purpose is limited to recruiter identity assurance; no secondary use.

## Enabling production (checklist)

1. Sign up at didit.me → create a **Sandbox** workflow with the liveness check.
2. Put sandbox key/secret/workflow into `backend/.env`, restart, run one real
   verification end-to-end (screenshots double as report evidence).
3. Create a **Live** workflow + Live key; set `DIDIT_ENV=live`.
4. Set `API_URL` to the deployed backend origin so webhooks reach
   `/api/webhooks/didit`; confirm the webhook URL in the Didit console matches.
5. Run 3–5 real verifications inside the 500/month free allowance.

## Tests

`npm run test:face` (part of `npm run test:all`) — 11 steps against the real
server + DB: session creation, pending → approved transitions, recruiter flag
and audit-row effects, signed webhook approval, **401 on bad signature**,
**idempotent replay** (no duplicate audit rows), declined verdicts, and
unknown-session acknowledgement.
