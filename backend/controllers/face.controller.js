import * as Didit from '../services/didit.service.js';
import * as FaceVerification from '../models/faceVerification.model.js';
import * as Recruiter from '../models/recruiter.model.js';
import * as VerificationCheck from '../models/verificationCheck.model.js';
import { encryptField } from '../utils/cryptoHelper.js';
import { putImage, getImageById } from '../services/storage.service.js';

// ===========================================================================
// Recruiter face/liveness verification via Didit.
//
//   POST /api/verify/face/session        create a hosted camera session
//   GET  /api/verify/face/status         latest verdict for this recruiter
//   POST /api/verify/face/mock/complete  local mock flow (no keys configured)
//   POST /api/webhooks/didit             signed async verdict (see webhooks route)
//
// The webhook receiver and the mock completer share processDiditEvent, so
// both paths drive the exact same state machine and audit trail.
// ===========================================================================

const TERMINAL = new Set(['approved', 'declined']);

// ---------------------------------------------------------------------------
// Verified face image: the V3 decision carries presigned media URLs
// (liveness_checks[].reference_image preferred — it is the liveness face crop;
// face_matches[].target_image as fallback). Didit's docs are explicit that
// these URLs are short-validity and must be downloaded promptly, never
// persisted — so we fetch the bytes at approval time and move them into the
// AES-256-GCM photo store, keeping only a photo:// pointer on the record.
// Download failures never block the verdict (the decision is the contract).
// ---------------------------------------------------------------------------
const MAX_FACE_IMAGE_BYTES = 5 * 1024 * 1024;

const extractFaceImageUrl = (event) => {
  const s = event?.session && typeof event.session === 'object' ? event.session : event || {};
  const decision = s.decision && typeof s.decision === 'object' ? s.decision : s;
  const firstOf = (arr) => (Array.isArray(arr) && arr.length ? arr[0] : null);
  const live = firstOf(decision.liveness_checks) || firstOf(s.liveness_checks);
  const match = firstOf(decision.face_matches) || firstOf(s.face_matches);
  const url = live?.reference_image || match?.target_image || null;
  return typeof url === 'string' && url.startsWith('http') ? url : null;
};

const storeFaceImage = async (record, event) => {
  const url = extractFaceImageUrl(event);
  if (!url) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn(`Face image download failed (HTTP ${res.status}) — verdict unaffected`);
      return false;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_FACE_IMAGE_BYTES) {
      console.warn(`Face image rejected (size ${buf.length}) — verdict unaffected`);
      return false;
    }
    const mimeType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
    const dataUrl = `data:${mimeType};base64,${buf.toString('base64')}`;
    const media = await putImage({
      payload: dataUrl,
      ownerType: 'recruiter',
      ownerId: record.recruiter_id,
      purpose: 'face_liveness',
    });
    await FaceVerification.setFacePhotoRef(record.id, `photo://${media.id}`);
    return true;
  } catch (err) {
    clearTimeout(timeout);
    console.warn(`Face image store error: ${err.message} — verdict unaffected`);
    return false;
  }
};

/**
 * Map any Didit status/decision string onto our lifecycle. V3 labels are
 * exact and case-sensitive on the wire ("Approved", "In Review", "Kyc
 * Expired" with a single capital K), so this normalises first. Terminal-but-
 * unsuccessful labels (Declined, Abandoned, Expired) all map to 'declined'
 * so the recruiter simply gets a retry — none of them mean "passed".
 */
const mapStatus = (raw) => {
  const v = String(raw || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (v.includes('approv')) return 'approved';
  if (
    v.includes('declin') || v.includes('reject') || v.includes('fail') ||
    v.includes('abandon') || v.includes('expired')
  ) return 'declined';
  if (v.includes('review')) return 'in_review';
  return 'pending'; // not_started / in_progress / awaiting_user / resubmitted
};

/**
 * Defensive event parser for the V3 webhook envelope
 * (docs.didit.me/integration/webhooks):
 *
 *   { event_id, session_id, status: "Approved"|..., webhook_type,
 *     vendor_data, decision: { liveness_checks[], face_matches[], ... } }
 *
 * Status labels are exact ("In Review", "Kyc Expired" — single capital K),
 * so mapping is done case-insensitively. Per-feature results live in plural
 * arrays (a workflow can include several instances of a feature); we read
 * the first item of each. Legacy/defensive shapes are still accepted.
 */
const parseEvent = (event) => {
  const s = event?.session && typeof event.session === 'object' ? event.session : event || {};
  const decision = s.decision && typeof s.decision === 'object' ? s.decision : {};
  const sessionId = s.session_id || s.id || null;
  const decisionRaw = s.status || s.decision || null;

  const firstOf = (arr) => (Array.isArray(arr) && arr.length ? arr[0] : null);
  const livenessItem = firstOf(decision.liveness_checks) || firstOf(s.liveness_checks);
  const faceMatchItem = firstOf(decision.face_matches) || firstOf(s.face_matches);
  // Legacy defensive shape from earlier iterations / mock payloads
  const checks = s.checks && typeof s.checks === 'object' ? s.checks : {};

  const livenessRaw = livenessItem?.status ?? checks?.liveness?.status ?? checks?.liveness_faceauth?.status ?? null;
  const faceMatchRaw = faceMatchItem?.status ?? checks?.face_match?.status ?? checks?.facematch?.status ?? null;
  const scoreRaw = faceMatchItem?.score ?? checks?.face_match?.confidence ?? checks?.face_match?.score ?? null;
  const score = typeof scoreRaw === 'number' ? scoreRaw : parseFloat(scoreRaw);

  return {
    eventId: s.event_id || null,
    sessionId,
    decisionRaw,
    vendorData: s.vendor_data || null,
    liveness: livenessRaw ? mapStatus(livenessRaw) === 'approved' : null,
    faceMatch: faceMatchRaw && mapStatus(faceMatchRaw) !== 'pending' ? mapStatus(faceMatchRaw) === 'approved' : null,
    faceMatchScore: Number.isFinite(score) ? score : null,
  };
};

/**
 * Drive one Didit event into our records. Idempotent: a terminal record is
 * never overwritten, and a no-decision progress event is a no-op.
 */
export const processDiditEvent = async (event, source = 'webhook') => {
  const parsed = parseEvent(event);
  if (!parsed.sessionId) {
    console.warn(`Didit ${source}: event carried no session id — ignored`);
    return { ok: false, reason: 'no_session_id' };
  }

  const record = await FaceVerification.findBySessionId(parsed.sessionId);
  if (!record) {
    // Not one of ours (or already cleaned up) — acknowledge and move on so
    // Didit does not retry forever.
    console.warn(`Didit ${source}: unknown session ${parsed.sessionId} — ignored`);
    return { ok: false, reason: 'unknown_session' };
  }
  if (TERMINAL.has(record.status)) {
    return { ok: true, duplicate: true, status: record.status };
  }

  const status = mapStatus(parsed.decisionRaw);
  if (status === 'pending') {
    return { ok: true, status: 'pending' }; // progress ping, nothing to record
  }

  // Full provider event into the audit trail, encrypted at rest. The event
  // carries metadata (scores, timestamps, reasons) — not biometric images.
  let rawEncrypted = null;
  try {
    rawEncrypted = await encryptField(JSON.stringify(event));
  } catch (err) {
    console.error('Face verification: could not encrypt raw event:', err.message);
  }

  const updated = await FaceVerification.markDecision({
    id: record.id,
    status,
    livenessResult: parsed.liveness,
    faceMatch: parsed.faceMatch,
    faceMatchScore: parsed.faceMatchScore,
    method: `${Didit.diditConfig.environment === 'mock' || record.environment === 'mock' ? 'mock' : 'didit'}_${source}`,
    rawEncrypted,
    verifiedAt: status === 'approved' ? new Date() : null,
  });
  if (!updated) {
    // Lost a race with a concurrent delivery — already terminal.
    const current = await FaceVerification.findBySessionId(parsed.sessionId);
    return { ok: true, duplicate: true, status: current?.status };
  }

  // Mirror into verification_checks so the existing per-step status
  // derivation (getVerificationStatus) sees this check like any other.
  await VerificationCheck.create({
    targetId: record.recruiter_id,
    targetType: 'recruiter',
    checkType: 'liveness',
    provider: 'didit',
    referenceId: parsed.sessionId,
    rawResponse: {
      decision: status,
      source,
      liveness: parsed.liveness,
      faceMatch: parsed.faceMatch,
      faceMatchScore: parsed.faceMatchScore,
      decisionRaw: parsed.decisionRaw,
    },
    isSuccessful: status === 'approved',
  });

  if (status === 'approved') {
    const recruiter = await Recruiter.findById(record.recruiter_id);
    if (recruiter) {
      const allVerified =
        recruiter.is_email_verified &&
        recruiter.is_phone_verified &&
        recruiter.is_identity_verified;
      await Recruiter.update(record.recruiter_id, {
        is_face_verified: true,
        verification_status: allVerified ? 'verified' : 'partially_verified',
      });
    }
    // Capture the verified face image into encrypted storage (best-effort —
    // a failed download never reverses the approval).
    await storeFaceImage(updated, event);
  }

  return { ok: true, status };
};

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

const publicBaseUrl = () =>
  process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;

export const startFaceSession = async (req, res) => {
  try {
    const recruiter = await Recruiter.findById(req.user.id);
    if (!recruiter) {
      return res.status(404).json({ success: false, error: 'Recruiter not found' });
    }
    if (recruiter.is_face_verified) {
      return res.json({ success: true, data: { alreadyVerified: true } });
    }

    const session = await Didit.createSession({
      recruiterId: recruiter.id,
      callbackUrl: `${publicBaseUrl()}/api/webhooks/didit`,
    });
    if (!session.success) {
      return res.status(502).json({ success: false, error: session.error });
    }

    // Upsert, not insert: Didit returns the same unfinished session for the
    // same (workflow, vendor_data), so a repeated Start must attach to the
    // existing pending row rather than crash on the unique session_id.
    const record = await FaceVerification.create({
      recruiterId: recruiter.id,
      provider: 'didit',
      environment: session.environment,
      sessionId: session.sessionId,
    });

    // Defensive: if the attached record already carries a terminal approval
    // (flags out of sync), don't hand back a verification URL.
    if (record.status === 'approved') {
      return res.json({ success: true, data: { alreadyVerified: true } });
    }

    res.json({
      success: true,
      data: {
        mode: session.mode,
        environment: session.environment,
        sessionId: session.sessionId,
        url: session.url, // null in mock mode — the portal keeps capture local
      },
    });
  } catch (error) {
    // Raw driver errors (constraint names, SQL) must not reach the client.
    console.error('startFaceSession error:', error);
    res.status(500).json({
      success: false,
      error: 'Could not start the liveness check. Please try again.',
    });
  }
};

export const getFaceStatus = async (req, res) => {
  try {
    let record = await FaceVerification.findLatestByRecruiterId(req.user.id);

    // Reconciliation fallback: Didit blocks webhooks to private/localhost
    // URLs, so during local development the verdict often only arrives here.
    // If our record is still pending on a real (non-mock) session, ask Didit
    // for the decision directly and run it through the same state machine.
    if (
      record &&
      record.status === 'pending' &&
      record.environment !== 'mock' &&
      Date.now() - new Date(record.created_at).getTime() > 5000 && // give the webhook a head start
      !Didit.isMockMode()
    ) {
      const decision = await Didit.getDecision(record.session_id);
      if (decision.success && decision.data && (decision.data.status || decision.data.session_id)) {
        await processDiditEvent(
          { ...decision.data, session_id: decision.data.session_id || record.session_id },
          'poll',
        );
        record = await FaceVerification.findLatestByRecruiterId(req.user.id);
      }
    }

    const recruiter = await Recruiter.findById(req.user.id);
    res.json({
      success: true,
      data: {
        faceVerified: !!recruiter?.is_face_verified,
        mode: Didit.isMockMode() ? 'mock' : 'live',
        // raw_result (encrypted audit blob) is deliberately NOT exposed.
        faceVerification: record
          ? {
              sessionId: record.session_id,
              status: record.status,
              environment: record.environment,
              livenessResult: record.liveness_result,
              faceMatch: record.face_match,
              faceMatchScore: record.face_match_score,
              verifiedAt: record.verified_at,
              createdAt: record.created_at,
              hasFacePhoto: !!record.face_photo_ref,
            }
          : null,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Recruiter's own verified face image — decrypted from the photo store and
 * streamed once (same hardening as the admin media endpoint: no-store,
 * noindex, never cached). Scoped to the authenticated recruiter's OWN latest
 * approved verification; there is no id parameter to enumerate.
 */
export const getFacePhoto = async (req, res) => {
  try {
    const record = await FaceVerification.findLatestByRecruiterId(req.user.id);
    if (!record?.face_photo_ref || !record.face_photo_ref.startsWith('photo://')) {
      return res.status(404).json({ success: false, error: 'No verified face photo on file' });
    }
    const mediaId = record.face_photo_ref.slice('photo://'.length);
    const { buffer, mimeType, row } = await getImageById(mediaId);
    if (row.owner_type !== 'recruiter' || row.owner_id !== req.user.id) {
      // Pointer must belong to the authenticated recruiter (defense in depth).
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    res.set({
      'Content-Type': mimeType,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'X-Robots-Tag': 'noindex, nofollow',
      'Content-Disposition': 'inline',
    });
    return res.end(buffer);
  } catch (error) {
    if (/not found/i.test(error.message)) {
      return res.status(404).json({ success: false, error: 'Face photo not found' });
    }
    return res.status(500).json({ success: false, error: 'Unable to load face photo' });
  }
};

/**
 * Local development shortcut: with no Didit keys configured, the portal
 * completes the capture in-browser (still a real webcam capture via the
 * existing FaceLivenessCapture component) and calls this to drive the SAME
 * state machine a webhook would. Hard-disabled when Didit is configured.
 */
export const completeMockSession = async (req, res) => {
  try {
    if (!Didit.isMockMode()) {
      return res.status(403).json({
        success: false,
        error: 'Mock completion is disabled — Didit is configured. Complete the verification in the Didit window.',
      });
    }

    const record = await FaceVerification.findLatestByRecruiterId(req.user.id);
    if (!record || record.environment !== 'mock') {
      return res.status(400).json({ success: false, error: 'No mock verification session in progress. Start a new one.' });
    }

    await processDiditEvent(
      {
        session_id: record.session_id,
        vendor_data: String(req.user.id),
        decision: 'APPROVED',
        mock: true,
        checks: { liveness: { status: 'APPROVED' } },
        completed_at: new Date().toISOString(),
      },
      'mock',
    );

    // Mock mode has no Didit media URLs — the portal's webcam capture IS the
    // verified face image. Store it through the same encrypted photo path so
    // the dashboard behaves identically in both modes.
    const selfieBase64 = req.body?.selfieBase64;
    if (typeof selfieBase64 === 'string' && selfieBase64.length > 0) {
      try {
        const latest = await FaceVerification.findLatestByRecruiterId(req.user.id);
        if (latest?.status === 'approved' && !latest.face_photo_ref) {
          const media = await putImage({
            payload: selfieBase64,
            ownerType: 'recruiter',
            ownerId: req.user.id,
            purpose: 'face_liveness',
          });
          await FaceVerification.setFacePhotoRef(latest.id, `photo://${media.id}`);
        }
      } catch (err) {
        console.warn(`Mock face photo store error: ${err.message} — verdict unaffected`);
      }
    }

    res.json({ success: true, message: 'Mock liveness verification recorded.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Didit webhook receiver — mounted on RAW body (see routes/webhooks.routes.js)
 * because the HMAC signature covers the exact bytes that arrived.
 *
 * Didit signs every delivery three ways (X-Signature-V2 recommended,
 * X-Signature raw, X-Signature-Simple deprecated); we verify V2 first then
 * raw, and always enforce the 5-minute X-Timestamp replay window.
 */
export const diditWebhook = async (req, res) => {
  const raw = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(JSON.stringify(req.body ?? {}));

  let parsed = null;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).send('invalid json');
  }

  const verified = Didit.verifyWebhookRequest(raw, parsed, {
    signatureV2: req.headers['x-signature-v2'],
    signature: req.headers['x-signature'],
    timestamp: req.headers['x-timestamp'],
  });
  if (!verified) {
    console.warn('Didit webhook rejected: missing/invalid signature or stale timestamp');
    return res.status(401).send('invalid signature');
  }

  try {
    const result = await processDiditEvent(parsed, 'webhook');
    // Always 200 for anything we understood (including duplicates/unknown
    // sessions) so Didit does not retry-loop on our own bookkeeping.
    if (!result.ok && result.reason !== 'unknown_session') {
      return res.status(400).send(result.reason);
    }
    res.sendStatus(200);
  } catch (error) {
    console.error('Didit webhook processing error:', error.message);
    res.status(500).send('processing error');
  }
};
