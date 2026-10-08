// Live check: response sanitizer must scrub base64 images from JSON bodies.
import { redactImages, redactSensitive } from '../middleware/logRedaction.js';

const assert = (await import('node:assert')).strict;

const dataUrl = 'data:image/jpeg;base64,' + 'A'.repeat(500);
const bare = '/9j/'.padEnd(600, 'Q');
const nin = '12345678901';
const phone = '08012345678';

// 1. data URL scrubbed
const a = redactImages({ photo: dataUrl });
assert.ok(!a.photo.includes('A'.repeat(100)), 'data URL must be scrubbed');
assert.equal(a.photo, '[REDACTED_IMAGE]');

// 2. bare base64 under photo key scrubbed (keyed form)
const b = redactImages({ entity: { photo: bare } });
assert.ok(!b.entity.photo.includes('QQQQ'), 'bare base64 must be scrubbed');

// 3. nested in array
const c = redactImages({ frames: [{ image: dataUrl }] });
assert.equal(c.frames[0].image, '[REDACTED_IMAGE]');

// 4. phone numbers survive response scrubbing (legit UI data)
const d = redactImages({ phone_number: phone, phoneNumber: '+2348012345678' });
assert.equal(d.phone_number, phone, 'phones must NOT be redacted from responses');
assert.equal(d.phoneNumber, '+2348012345678');

// 5. ordinary fields untouched
const e = redactImages({ title: 'Senior Engineer', count: 42, ok: true });
assert.deepEqual(e, { title: 'Senior Engineer', count: 42, ok: true });

// 6. log variant ALSO scrubs 11-digit ids (logs are more sensitive than UI)
const f = redactSensitive(`submitted nin ${nin}`);
assert.ok(!f.includes(nin), 'logs must scrub 11-digit ids');
assert.ok(f.includes('[REDACTED_ID]'));

// 7. deep object with legit numbers that are NOT 11 digits untouched
const g = redactSensitive({ pin: 'VRF-833U-NDNA', salary: 500000 });
assert.equal(g.pin, 'VRF-833U-NDNA');

// 8. res.json wrapper semantics
let captured = null;
const fakeRes = { json(p) { captured = p; return p; } };
const middleware = (await import('../middleware/logRedaction.js')).sanitizeResponses;
middleware({}, fakeRes, () => {});
fakeRes.json({ entity: { photo: dataUrl } });
assert.ok(!JSON.stringify(captured).includes('A'.repeat(100)), 'res.json must be wrapped');

console.log('✅ Response/log redaction: 8/8 assertions passed');
