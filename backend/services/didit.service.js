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
 * Verify an HMAC-SHA256 webhook signature over the RAW request body.
 * Accepts `<hex>` or `sha256=<hex>` header formats. Fails closed: with no
 * secret configured, every webhook is rejected.
 */
export const verifyWebhookSignature = (rawBody, headerValue) => {
  const secret = diditConfig.webhookSecret;
  if (!secret || isPlaceholder(secret) || !headerValue) return false;
  const provided = String(headerValue).replace(/^sha256=/i, '');
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(provided, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  } catch {
    return false; // length mismatch / non-hex
  }
};

/** Test helper — sign a payload exactly as Didit would. */
export const signPayload = (rawBody, secret = diditConfig.webhookSecret) =>
  crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
