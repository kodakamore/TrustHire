// Shared PII redaction for provider responses BEFORE they are persisted to
// verification_checks.raw_response.
//
// Why this exists: encrypting recruiters.nin is meaningless if the same NIN
// is stored verbatim inside verification_checks.raw_response (the Dojah
// response echoes entity.nin/entity.bvn). Same for embedded base64 photos.
// Every write path must pass through here.

import { maskIdentifier } from './cryptoHelper.js';

const ID_FIELDS = new Set(['nin', 'bvn', 'nin_number', 'bvn_number']);

/**
 * Deep-clone `obj`, replacing identifier values with a masked form
 * (123*****901). Keeps enough for humans to eyeball-match an audit entry
 * without storing the full number. reference_id remains the authoritative
 * link back to the provider's own record.
 */
export const redactIdentifiers = (obj) => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactIdentifiers);

  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (ID_FIELDS.has(key) && typeof value === 'string' && value.length >= 6) {
      out[key] = maskIdentifier(value);
    } else if (value && typeof value === 'object') {
      out[key] = redactIdentifiers(value);
    } else {
      out[key] = value;
    }
  }
  return out;
};

/** True when a value looks like a full base64 image (data URL or bare). */
export const looksLikeImage = (value) =>
  typeof value === 'string' &&
  value.length >= 256 &&
  (value.startsWith('data:image/') || /^[A-Za-z0-9+/]+={0,2}$/.test(value));

/**
 * Strip base64 image payloads from a provider response (defense in depth for
 * any path that does not go through storage.service.putImage). Returns
 * { clean, dropped } where dropped is the number of image fields removed.
 */
export const stripImages = (obj) => {
  let dropped = 0;
  const walk = (node) => {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(walk);
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if ((key === 'photo' || key === 'image') && looksLikeImage(value)) {
        dropped += 1;
        continue; // drop: bytes should live in encrypted object storage
      }
      out[key] = value && typeof value === 'object' ? walk(value) : value;
    }
    return out;
  };
  return { clean: walk(obj), dropped };
};

/** One-stop sanitizer for anything heading into raw_response. */
export const sanitizeProviderResponse = (payload) => {
  const noIds = redactIdentifiers(payload);
  const { clean, dropped } = stripImages(noIds);
  return { clean, imagesDropped: dropped };
};
