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

### Session start is idempotent

Didit's `POST /v3/session/` is idempotent per `(workflow_id, vendor_data)`:
while an **unfinished** session exists it returns *that* session (still 201)
instead of creating a duplicate; terminal sessions (`Approved`, `Declined`,
`Expired`, …) are never reused, so every retry after a finished verdict gets a
fresh session. The local store mirrors this — `FaceVerification.create` is an
upsert on the unique `session_id`, so a repeated "Start Liveness Check"
(double-tap, slow network) attaches to the existing pending row instead of
raising `duplicate key value violates unique constraint
recruiter_face_verifications_session_id_key`. The row's status and decision
fields are never rewritten by the conflict (only `updated_at`).

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

### Liveness method: active vs passive

The workflow's liveness block may be configured `ACTIVE_3D` (guided
blink/head-turn challenges) or `PASSIVE`. **Didit substitutes passive liveness
whenever the desktop fallback is enabled and the user is on a desktop** — the
recruiter just looks at the camera for a moment, no challenges. This is not a
malfunction: passive liveness is deepfake/injection detection rather than
challenge-response. To force interactive challenges, either disable the
desktop fallback on the workflow (mobile-only) or configure the liveness
method explicitly in the Didit console. The returned `method`
(`ACTIVE_3D` / `FLASHING` / `PASSIVE`) is recorded in the encrypted raw event
for the audit trail.

## Data & privacy posture (NDPA 2023)

- TrustHire stores the **decision** plus (for dashboard display) the
  verified **face image** — downloaded at approval time from Didit's
  short-validity presigned URLs (`liveness_checks[].reference_image`).
  The raw document images and videos stay on Didit.
- The face image is persisted in the **AES-256-GCM encrypted photo store**
  (same object storage as NIN/BVN photos); the DB holds only a
  `photo://<uuid>` pointer (`recruiter_face_verifications.face_photo_ref`).
- It is served **only** to the authenticated recruiter themselves via
  `GET /api/verify/face/photo` (owner-checked, `no-store`, decrypted in
  memory). Never in list payloads, never cached, never public.
- In mock mode the in-portal webcam capture fills the same slot, so the
  dashboard behaves identically with and without Didit keys.
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
