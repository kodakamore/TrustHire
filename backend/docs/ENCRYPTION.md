# TrustHire — Encryption Architecture (NDPR)

How National ID numbers (NIN/BVN) and photos are protected at rest, how keys
are managed, and exactly how to run the migration.

**Status:** Phases 0–4 complete and verified against the live database.
**Phase 5 (dropping plaintext) is deliberately NOT run** — see below.

---

## 1. Cryptographic design

| Concern | Decision | Rationale |
|---|---|---|
| Algorithm | **AES-256-GCM**, 96-bit random IV, 128-bit tag | Authenticated encryption: tampering fails loudly instead of decrypting to garbage |
| Mode for NIN/BVN | **Randomized (non-deterministic)** | Same plaintext → different ciphertext every write. You never query by NIN/BVN (verified: zero `WHERE nin =` call sites), so nothing is lost |
| Searchability | **Not supported — by design** | If ever needed, add a separate blind-index column (HMAC-SHA256, separate key). Do **not** switch to deterministic encryption |
| Photo storage | AES-256-GCM per blob | Binary-safe; identical scheme |

### Ciphertext format

```
v1:<key_id>:<iv_b64>:<tag_b64>:<ciphertext_b64>
```

The `v1:` prefix is the **"is this encrypted?" sentinel** used by the dual-read
migration shim, and `key_id` makes every row independently rotatable.

## 2. Key management — envelope encryption (self-managed)

```
ENCRYPTION_MASTER_KEY   (.env only, 32 bytes base64, NEVER in the database)
      └── wraps ►  DEKs         (table: encryption_keys, stored wrapped)
                    └── wraps ►  NIN/BVN ciphertext · photo blobs
```

- **Master key**: `backend/.env` → `ENCRYPTION_MASTER_KEY`. Back it up
  **offline**. Losing it makes all encrypted data permanently unreadable.
  Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- **DEKs**: one per `key_id`, wrapped by the master key before hitting the DB.
  A full database dump alone yields no usable key material.
- **No fallbacks.** A missing or malformed key is a hard boot failure
  (`server.js` → `assertKeyConfigured()`). The old code fell back to
  `JWT_SECRET` and then a **hardcoded literal** — both removed.
- **Rotation**: `createDEK()` mints a new active DEK; old rows still decrypt
  via their embedded `key_id`. Then re-encrypt with the backfill script and
  retire the old key.

| Layer | Where it lives | Compromise of DB gives you |
|---|---|---|
| Master key | `.env` | nothing |
| DEK | `encryption_keys` (wrapped) | nothing unwrappable |
| Data | app tables / `storage/photos` | ciphertext only |

## 3. Photo storage

- Blobs live at `STORAGE_ROOT` (default `storage/photos/`), **outside `public/`**
  — never served by static middleware. Gitignored.
- File name = `sha256(plaintext)` sharded (`ab/ab…cd.enc`). Server-generated
  only, so path traversal is structurally impossible (`SAFE_KEY_RE` rejects
  anything else).
- Manifest: `media_objects` table (owner, purpose, key_id, sha256, size, mime).
  Images are **sniffed by magic number**, never by client-declared MIME.
- Access: `GET /api/admin/photo/:id` (admin JWT) → decrypt **in memory** →
  stream once with `Cache-Control: no-store` and `X-Robots-Tag: noindex`.
  Photos are **never** embedded in JSON payloads or logs.
- `raw_response` stores only a `photo://<uuid>` pointer.

## 4. Where PII is stopped (the seams)

| Seam | File | What it guarantees |
|---|---|---|
| Model write | `models/recruiter.model.js` | `nin`/`bvn` plaintext in → `*_enc` ciphertext stored |
| Model read | `models/recruiter.model.js` | `READ_MODE=encrypted` decrypts; callers see plaintext, never ciphertext |
| Response serialize | `recruiter.model.toPublicRecruiter` | NIN/BVN/OTP/password never leave the server |
| Check write | `models/verificationCheck.model.js` | Every `raw_response` sanitized before INSERT (single choke point) |
| Provider payload | `utils/piiRedactor.js` | Masks `entity.nin`/`entity.bvn`, extracts or drops images |
| HTTP response | `middleware/logRedaction.js` | `res.json` wrapped → no base64 image in any JSON body |
| Logs | `middleware/logRedaction.js` | `console.*` scrubbed of images + 11-digit IDs |
| Errors | `redactedErrorLogger` | Stack traces scrubbed before logging/serializing |

Response bodies deliberately do **not** redact 11-digit numbers (clients
legitimately display phone numbers); ID stripping happens at the seams above.

## 5. Migration runbook

```bash
cd backend
npm run migrate              # applies 001 + 002 (003 is excluded, see below)

npm run pii:inventory        # BASELINE — record this output first
npm run pii:backfill         # encrypt existing NIN/BVN (batched, idempotent)
npm run pii:photos           # dry-run: what would be extracted
npm run pii:photos:apply     # move photos out of raw_response
npm run pii:verify           # ← GATE: must exit 0 before Phase 5
```

All four scripts are **idempotent and resumable** — their scan conditions are
the cursor (`… AND nin_enc IS NULL`, rows still matching the PII scan).

### Phase 5 — dropping plaintext (MANUAL, NOT AUTOMATED)

`db/migrations/003_drop_plaintext.sql` is intentionally **excluded from
`npm run migrate`**. Run it by hand only when *all* are true:

1. `npm run pii:verify` exits 0 ✅ *(currently passing)*
2. `READ_MODE=encrypted` has run ≥ 7 days with zero decrypt errors in logs
3. Rollback window closed
4. **Old unencrypted DB backups expired/destroyed** — plaintext survives in
   backups long after it's gone from the tables (most-missed step)

**Soak log:** `READ_MODE=encrypted` set on **2026-10-08** (read path
verified by `npm run test:all`, exit 0, incl. 21-assertion E2E that decrypts
from the live read path). → **Phase 5 eligible no earlier than 2026-10-15**,
and only after checking server logs for decrypt errors on each day of the
soak, plus criterion 4 (backup destruction).

```bash
psql "$DATABASE_URL" -f db/migrations/003_drop_plaintext.sql
```

It contains its own `DO $$` guard that **aborts if any unencrypted row
remains**. After it runs: remove the `READ_MODE` plaintext branch in
`models/recruiter.model.js`.

### Rollback

Before Phase 5: set `READ_MODE=plaintext` (nothing has been destroyed).
After Phase 5: restore from the pre-Phase-5 backup. There is no undo.

## 6. Residual risks (documented, out of current scope)

- `email_otp` / `phone_otp` / `corporate_email_otp` still plaintext — short-lived,
  but worth hashing or encrypting later.
- CAC/registry documents in company `raw_response` images are **not** extracted
  (scoped decision: registry filings, not biometrics).
- Photos are encrypted **at rest on the same host**; consider offline/remote
  backup of `storage/` with its own key custody.
- Dojah receives plaintext NIN/photos in transit by necessity (TLS required).
