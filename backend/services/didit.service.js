import crypto from 'node:crypto';

// ===========================================================================
// Didit — recruiter face/liveness verification (https://docs.didit.me)
//
// Flow: we create a session server-side, the recruiter completes REAL
// camera-based liveness in Didit's hosted capture UI, and the verdict comes
// back as an HMAC-SHA256-signed webhook (with GET polling as a fallback).
//
// Mock mode (DIDIT_MOCK=true, or missing/placeholder keys outside
// production) exercises the exact same controller/state-machine path with
// locally generated sessions — mirroring the USE_MOCK_API pattern used for
// Dojah. In production a missing key is a hard failure, never a silent mock.
// ===========================================================================

export const diditConfig = {
  apiKey: process.env.DIDIT_API_KEY,
  webhookSecret: process.env.DIDIT_WEBHOOK_SECRET,
  workflowId: process.env.DIDIT_WORKFLOW_ID,
  // The environment the API key belongs to ('sandbox' | 'live') — recorded
  // on every session so audit rows are always honest about which it was.
  environment: process.env.DIDIT_ENV || 'sandbox',
  baseUrl: process.env.DIDIT_BASE_URL || 'https://verification.didit.me',
};

const isPlaceholder = (v) => !v || v.startsWith('your-');

// --- X-Signature-V2 canonical JSON (Didit signs this exact form) ------------
// Recursively sorted keys, compact separators, Unicode preserved, and
// whole-valued floats normalised to ints (Python's json.dumps defaults that
// Didit's signing side uses).
const shortenFloats = (data) => {
  if (Array.isArray(data)) return data.map(shortenFloats);
  if (data !== null && typeof data === 'object') {
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, shortenFloats(v)]),
    );
  }
  if (typeof data === 'number' && !Number.isInteger(data) && data % 1 === 0) {
    return Math.trunc(data);
  }
  return data;
};

const sortKeys = (data) => {
  if (Array.isArray(data)) return data.map(sortKeys);
  if (data !== null && typeof data === 'object') {
    return Object.keys(data)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeys(data[key]);
        return acc;
      }, {});
  }
  return data;
};

const canonicalJson = (obj) => JSON.stringify(sortKeys(shortenFloats(obj)));

export const isMockMode = () => {
  if (process.env.DIDIT_MOCK === 'true') return true;
  if (process.env.DIDIT_MOCK === 'false') return false;
  // Unset: mock only when keys are absent AND we are not in production.
  const keysMissing =
    isPlaceholder(diditConfig.apiKey) || isPlaceholder(diditConfig.workflowId);
  return keysMissing && process.env.NODE_ENV !== 'production';
};

/**
 * Create a hosted verification session. Returns the URL the recruiter's
 * browser must open (real camera capture happens there) plus the session id
 * we will later match the webhook against.
 */
export const createSession = async ({ recruiterId, callbackUrl }) => {
  if (isMockMode()) {
    return {
      success: true,
      mode: 'mock',
      environment: 'mock',
      sessionId: `mock_${crypto.randomUUID()}`,
      url: null, // mock flow never leaves the portal
    };
  }

  if (isPlaceholder(diditConfig.apiKey) || isPlaceholder(diditConfig.webhookSecret)) {
    return {
      success: false,
      error:
        'Didit is not configured. Set DIDIT_API_KEY / DIDIT_WEBHOOK_SECRET / DIDIT_WORKFLOW_ID in backend/.env, or set DIDIT_MOCK=true for local flow testing.',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${diditConfig.baseUrl}/v3/session/`, {
      method: 'POST',
      headers: {
        'X-Api-Key': diditConfig.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflow_id: diditConfig.workflowId,
        vendor_data: String(recruiterId), // maps the webhook back to the recruiter
        callback: callbackUrl,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.session_id) {
      console.warn(`Didit session create failed (HTTP ${res.status}):`, JSON.stringify(data).slice(0, 300));
      return {
        success: false,
        error:
          data.detail || data.error || `Didit returned HTTP ${res.status} while creating the session.`,
      };
    }
    return {
      success: true,
      mode: 'live',
      environment: diditConfig.environment,
      sessionId: data.session_id,
      url: data.url,
    };
  } catch (err) {
    clearTimeout(timeout);
    const msg = err.name === 'AbortError' ? 'Didit API timed out' : err.message;
    console.error('Didit createSession error:', msg);
    return { success: false, error: 'The verification service is temporarily unavailable. Please try again shortly.' };
  }
};

/** Poll a session's current state (fallback when webhooks are delayed). */
export const getSession = async (sessionId) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${diditConfig.baseUrl}/v3/session/${sessionId}/`, {
      headers: { 'X-Api-Key': diditConfig.apiKey },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json().catch(() => ({}));
    return { success: res.ok, data, status: res.status };
  } catch (err) {
    clearTimeout(timeout);
    console.error('Didit getSession error:', err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Verify a Didit webhook request against the current spec
 * (https://docs.didit.me/integration/webhooks):
 *
 *   X-Signature-V2   HMAC-SHA256 over sorted, Unicode-preserved canonical
 *                    JSON — recommended, survives middleware re-encoding
 *   X-Signature      HMAC-SHA256 over the exact raw bytes (we read the raw
 *                    body via express.raw, so this path is also exact)
 *   X-Timestamp      epoch seconds; reject deliveries older than 5 minutes
 *
 * Fails closed: no secret, no timestamp, or a stale timestamp = rejected.
 * X-Signature-Simple (envelope-only, deprecated) is deliberately NOT
 * accepted — it does not authenticate the decision body.
 */
export const verifyWebhookRequest = (rawBody, parsedBody, { signatureV2, signature, timestamp } = {}) => {
  const secret = diditConfig.webhookSecret;
  if (!secret || isPlaceholder(secret)) return false;

  // Replay window: Didit stamps every delivery (and re-stamps each retry).
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) return false;

  const hmac = (input) =>
    crypto.createHmac('sha256', secret).update(input, 'utf8').digest('hex');
  const safeEqual = (a, b) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
    } catch {
      return false;
    }
  };

  // 1. X-Signature-V2 — canonical JSON (sorted keys, compact, Unicode kept,
  //    whole-valued floats normalised to ints, exactly as Python would emit).
  if (signatureV2 && parsedBody && typeof parsedBody === 'object') {
    if (safeEqual(hmac(canonicalJson(parsedBody)), String(signatureV2).replace(/^sha256=/i, ''))) {
      return true;
    }
  }

  // 2. X-Signature — exact raw bytes.
  if (signature && rawBody) {
    return safeEqual(hmac(rawBody), String(signature).replace(/^sha256=/i, ''));
  }

  return false;
};

/**
 * Poll a session's current decision (fallback when webhooks are delayed or
 * cannot reach localhost during development). V3 returns plural arrays.
 */
export const getDecision = async (sessionId) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${diditConfig.baseUrl}/v3/session/${sessionId}/decision/`, {
      headers: { 'X-Api-Key': diditConfig.apiKey },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json().catch(() => ({}));
    return { success: res.ok, data, status: res.status };
  } catch (err) {
    clearTimeout(timeout);
    console.error('Didit getDecision error:', err.message);
    return { success: false, error: err.message };
  }
};

/** Test helper — sign a payload exactly as Didit would. */
export const signPayload = (rawBody, secret = diditConfig.webhookSecret) =>
  crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
