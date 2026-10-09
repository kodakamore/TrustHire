// Prevents base64 image payloads (selfies, ID photos) from ever landing in
// application logs — logs are routinely shipped to third parties and outlive
// retention policy, so a photo in a log is a photo in a data breach.
//
// Redacts the most common ways request bodies leak: our own console.* calls
// and Express's default error logging (server.js error handler).

const IMAGE_B64 = /(data:image\/[a-z+.-]+;base64,|(?<=["'\s])\/9j\/)[A-Za-z0-9+/=]{64,}/gi;
const DATA_URL = /data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]{16,}/gi;
// Bare base64 JPEG/PNG (no data: prefix) — the shape Dojah returns photos in.
const BARE_B64_IMG = /"(?:photo|image)"\s*:\s*"[A-Za-z0-9+/]{256,}={0,2}"/g;
// NIN/BVN are 11 digits — keep them out of logs too.
const LONG_DIGITS = /(?<!\d)\d{11}(?!\d)/g;

export const redactImages = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.replace(DATA_URL, '[REDACTED_IMAGE]').replace(IMAGE_B64, '[REDACTED_IMAGE]');
  }
  if (typeof value === 'object') {
    try {
      return JSON.parse(
        JSON.stringify(value).replace(DATA_URL, '[REDACTED_IMAGE]').replace(IMAGE_B64, '[REDACTED_IMAGE]').replace(BARE_B64_IMG, '"[REDACTED_IMAGE]"'),
      );
    } catch {
      return '[REDACTED_UNSERIALIZABLE]';
    }
  }
  return value;
};

export const redactSensitive = (value) => {
  const imagesRedacted = redactImages(value);
  if (typeof imagesRedacted === 'string') {
    return imagesRedacted.replace(LONG_DIGITS, '[REDACTED_ID]');
  }
  if (imagesRedacted && typeof imagesRedacted === 'object') {
    try {
      return JSON.parse(JSON.stringify(imagesRedacted).replace(LONG_DIGITS, '[REDACTED_ID]'));
    } catch {
      return '[REDACTED_UNSERIALIZABLE]';
    }
  }
  return imagesRedacted;
};

const originalLog = console.log.bind(console);
const originalWarn = console.warn.bind(console);
const originalError = console.error.bind(console);

let installed = false;

/** Install once at boot (server.js). Wraps console output so any future
 *  logging of request bodies, frames, or IDs is scrubbed automatically. */
export const installLogRedaction = () => {
  if (installed) return;
  installed = true;
  console.log = (...args) => originalLog(...args.map(redactSensitive));
  console.warn = (...args) => originalWarn(...args.map(redactSensitive));
  console.error = (...args) => originalError(...args.map(redactSensitive));
};

/** Express error middleware: scrub the error/stack before it is logged or
 *  serialized into a response (stack traces can embed request payloads). */
export const redactedErrorLogger = (err, req, res, next) => {
  const safeMessage = redactSensitive(err?.message || 'Unknown error');
  const safeStack = redactSensitive(err?.stack || '');
  console.error(`[${req.method} ${req.originalUrl}] ${safeMessage}\n${safeStack}`);
  if (res.headersSent) return next(err);
  res.status(500).json({ success: false, error: 'Internal Server Error', message: safeMessage });
};

// ---------------------------------------------------------------------------
// Response-body sanitizer: scrubs base64 images from every JSON payload
// leaving the API. Photos/selfies are never a legitimate response body (they
// are served via GET /api/admin/photo/:id, which uses res.end, not res.json).
// EXCEPTION: `qr_code_data_url` is a legitimate small PNG — the recruiter
// portal renders it directly for the ad flyer. Redacting it broke the QR
// display entirely.
// Deliberately does NOT redact 11-digit numbers here: phone numbers are
// legitimately displayed by clients. ID stripping happens at its own seams
// (recruiter.model.toPublicRecruiter, verificationCheck.model.create).
// ---------------------------------------------------------------------------
const SAFE_IMAGE_KEYS = new Set(['qr_code_data_url']);

export const sanitizeResponses = (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    // Hold whitelisted image fields aside as placeholders, scrub everything
    // else, then restore them verbatim.
    const stash = [];
    let tagged;
    try {
      tagged = JSON.parse(
        JSON.stringify(payload, (key, value) => {
          if (SAFE_IMAGE_KEYS.has(key) && typeof value === 'string' && value.startsWith('data:image/')) {
            stash.push(value);
            return `__KEEP_IMAGE_${stash.length - 1}__`;
          }
          return value;
        }),
      );
    } catch {
      return originalJson(payload); // non-serializable — let Express handle it
    }
    const scrubbed = stash.length
      ? JSON.stringify(redactImages(tagged)).replace(/"__KEEP_IMAGE_(\d+)__"/g, (_, i) => JSON.stringify(stash[Number(i)]))
      : redactImages(tagged);
    return originalJson(typeof scrubbed === 'string' ? JSON.parse(scrubbed) : scrubbed);
  };
  next();
};
