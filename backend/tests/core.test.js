import assert from 'assert';
import { generatePIN } from '../utils/pinGenerator.js';
import { hashJobData, verifyJobHash } from '../services/hash.service.js';
import { validateEmail, validatePhone, validateRCNumber, validateNIN, validateBVN } from '../utils/validators.js';

console.log('====================================================');
console.log('🚀 TRUSTHIRE BACKEND TEST SUITE (OFFLINE / UNIT)');
console.log('====================================================\n');

// ----------------------------------------------------
// 1. PIN Generator Tests
// ----------------------------------------------------
console.log('--- [1/4] Testing PIN Generation & Formatting ---');
const pin1 = generatePIN();
const pin2 = generatePIN();
console.log('Generated PIN 1:', pin1);
console.log('Generated PIN 2:', pin2);

assert.match(pin1, /^VRF-[A-Z0-9]{4}-[A-Z0-9]{4}$/, 'PIN must match format VRF-XXXX-XXXX');
assert.match(pin2, /^VRF-[A-Z0-9]{4}-[A-Z0-9]{4}$/, 'PIN must match format VRF-XXXX-XXXX');
assert.notStrictEqual(pin1, pin2, 'Consecutive PINs must be distinct');
assert.strictEqual(/[01OIL]/.test(pin1), false, 'PIN must not contain ambiguous characters (0, 1, O, I, L)');
console.log('✔ PIN generator formatting & randomness passed!\n');

// ----------------------------------------------------
// 2. Cryptographic Data Hashing & Anti-Tamper Tests
// ----------------------------------------------------
console.log('--- [2/4] Testing SHA-256 Hashing & Anti-Tampering ---');
const originalAd = {
  title: 'Full Stack Node.js & React Engineer',
  description: 'Building verification layers and API integrations.',
  company_id: '1111-2222-3333-4444',
  location: 'Lagos, Nigeria',
  employment_type: 'Full-time',
  salary_range: '₦700,000 - ₦950,000'
};

const hashOriginal = hashJobData(originalAd);
console.log('Ad SHA-256 Hash:', hashOriginal);
assert.strictEqual(hashOriginal.length, 64, 'SHA-256 hash must be 64 characters long');
assert.strictEqual(verifyJobHash(originalAd, hashOriginal), true, 'Hash verification must succeed for unaltered ad');

// Simulated tampering by a malicious actor
const tamperedAd = {
  ...originalAd,
  salary_range: '₦2,500,000 - ₦3,000,000' // Changed salary in forged ad
};
const hashTampered = hashJobData(tamperedAd);
assert.notStrictEqual(hashOriginal, hashTampered, 'Tampered ad data must produce a different hash');
assert.strictEqual(verifyJobHash(tamperedAd, hashOriginal), false, 'Verification must detect tampered content');
console.log('✔ Cryptographic hashing & tamper-detection passed!\n');

// ----------------------------------------------------
// 3. Input Validation Tests
// ----------------------------------------------------
console.log('--- [3/4] Testing Recruiter Input Validators ---');
// Email
assert.strictEqual(validateEmail('recruiter@acme.com').valid, true);
assert.strictEqual(validateEmail('invalid-email').valid, false);

// Phone (Nigeria format support)
assert.strictEqual(validatePhone('+2348012345678').valid, true);
assert.strictEqual(validatePhone('08012345678').valid, true);
assert.strictEqual(validatePhone('123').valid, false);

// CAC RC Number
assert.strictEqual(validateRCNumber('RC123456').valid, true);
assert.strictEqual(validateRCNumber('123456').valid, true);
assert.strictEqual(validateRCNumber('R').valid, false);

// NIN (11 digits) & BVN (11 digits)
assert.strictEqual(validateNIN('12345678901').valid, true);
assert.strictEqual(validateNIN('123').valid, false);
assert.strictEqual(validateBVN('22345678901').valid, true);
assert.strictEqual(validateBVN('not-a-number').valid, false);
console.log('✔ All field validators passed!\n');

// ----------------------------------------------------
// 4. Verification Logic Rule Simulation
// ----------------------------------------------------
console.log('--- [4/4] Testing Automated Rule Evaluation ---');
function evaluateVerificationRules({ emailVerified, phoneVerified, idVerified, faceVerified, cacVerified, domainAgeDays }) {
  const flags = [];
  if (!emailVerified) flags.push('recruiter_email_not_verified');
  if (!phoneVerified) flags.push('recruiter_phone_not_verified');
  if (!idVerified) flags.push('recruiter_identity_not_verified');
  if (!faceVerified) flags.push('recruiter_face_not_verified');
  if (!cacVerified) flags.push('company_cac_not_verified');
  if (domainAgeDays < 30) flags.push('domain_too_new');

  return {
    status: flags.length === 0 ? 'approved' : 'pending',
    flags
  };
}

// Case A: Everything verified and established domain
const resApproved = evaluateVerificationRules({
  emailVerified: true,
  phoneVerified: true,
  idVerified: true,
  faceVerified: true,
  cacVerified: true,
  domainAgeDays: 365
});
assert.strictEqual(resApproved.status, 'approved');
assert.strictEqual(resApproved.flags.length, 0);

// Case B: Unverified face & new domain (7 days)
const resFlagged = evaluateVerificationRules({
  emailVerified: true,
  phoneVerified: true,
  idVerified: true,
  faceVerified: false,
  cacVerified: true,
  domainAgeDays: 7
});
assert.strictEqual(resFlagged.status, 'pending');
assert.ok(resFlagged.flags.includes('recruiter_face_not_verified'));
assert.ok(resFlagged.flags.includes('domain_too_new'));

console.log('✔ Rule evaluation logic passed!\n');

// ----------------------------------------------------
// 5. Domain Helper & Recruiter Linkage Tests
// ----------------------------------------------------
console.log('--- [5/5] Testing Domain Extraction & Recruiter Linkage ---');
import { extractDomain, isPublicEmailDomain, checkEmailDomainMatch, checkDirectorMatch } from '../utils/domainHelper.js';

// Domain extraction
assert.strictEqual(extractDomain('https://www.flutterwave.com/careers/jobs?ref=1'), 'flutterwave.com');
assert.strictEqual(extractDomain('http://paystack.co/about'), 'paystack.co');
assert.strictEqual(extractDomain('company.ng'), 'company.ng');

// Public webmail detection
assert.strictEqual(isPublicEmailDomain('recruiter@gmail.com'), true);
assert.strictEqual(isPublicEmailDomain('hr@yahoo.com'), true);
assert.strictEqual(isPublicEmailDomain('careers@paystack.com'), false);

// Recruiter-to-company email linkage
const corporateMatch = checkEmailDomainMatch('ade@flutterwave.com', 'https://www.flutterwave.com');
assert.strictEqual(corporateMatch.isMatch, true);
assert.strictEqual(corporateMatch.linkType, 'corporate_match');

const publicMismatch = checkEmailDomainMatch('ade@gmail.com', 'https://www.flutterwave.com');
assert.strictEqual(publicMismatch.isMatch, false);
assert.strictEqual(publicMismatch.linkType, 'public_webmail');

const otherDomainMismatch = checkEmailDomainMatch('ade@consulting-agency.com', 'https://www.flutterwave.com');
assert.strictEqual(otherDomainMismatch.isMatch, false);
assert.strictEqual(otherDomainMismatch.linkType, 'domain_mismatch');

// CAC Director Matching
const directors = [
  { name: 'Oluwaseun Babatunde' },
  { name: 'Chioma Okonkwo' }
];
assert.strictEqual(checkDirectorMatch('Oluwaseun', 'Babatunde', directors).isMatch, true);
assert.strictEqual(checkDirectorMatch('John', 'Doe', directors).isMatch, false);

console.log('✔ Domain extraction & recruiter linkage verification passed!\n');

// ----------------------------------------------------
// 6. Audit hardening: public-suffix bypass + SSRF guard
// ----------------------------------------------------
console.log('--- [6/6] Testing Public-Suffix Bypass & SSRF Guard ---');
import { PUBLIC_SUFFIXES } from '../utils/domainHelper.js';
import { assertPublicUrl } from '../services/whois.service.js';

// C8: a bare public suffix is not a registrable company domain — matching
// against it must never count as corporate linkage.
assert.strictEqual(PUBLIC_SUFFIXES.has('com.ng'), true);
assert.strictEqual(PUBLIC_SUFFIXES.has('co.uk'), true);
assert.strictEqual(PUBLIC_SUFFIXES.has('github.io'), true);

const suffixEmailBypass = checkEmailDomainMatch('hr@com.ng', 'https://shop.com.ng');
assert.strictEqual(suffixEmailBypass.isMatch, false, 'bare public suffix email must not match');

const suffixWebsiteBypass = checkEmailDomainMatch('hr@shop.co.uk', 'https://co.uk');
assert.strictEqual(suffixWebsiteBypass.isMatch, false, 'bare public suffix website must not match');

const subdomainStillWorks = checkEmailDomainMatch('hr@mail.flutterwave.com', 'https://www.flutterwave.com');
assert.strictEqual(subdomainStillWorks.isMatch, true, 'legit subdomain linkage must still match');

const oneLabelEmail = checkEmailDomainMatch('hr@intranet', 'https://shop.com.ng');
assert.strictEqual(oneLabelEmail.isMatch, false, 'dotless email domain must not match');

// C4: SSRF guard rejects loopback / link-local / RFC1918 / metadata targets
const rejects = ['http://127.0.0.1/admin', 'http://10.1.2.3/', 'http://192.168.1.1:8080/',
  'http://169.254.169.254/latest/meta-data/', 'http://[::1]/', 'http://[fd00::1]/',
  'file:///etc/passwd', 'ftp://example.com/', 'http://user:pass@example.com/'];
for (const u of rejects) {
  await assert.rejects(() => assertPublicUrl(u), `SSRF guard must reject: ${u}`);
}

// A public IP literal (EXAMPLE domain's address) must be allowed — proves
// the guard isn't just "reject everything".
await assertPublicUrl('http://93.184.216.34/');
console.log('✔ Public-suffix bypass & SSRF guard passed!\n');

console.log('====================================================');
console.log('✅ ALL BACKEND UNIT TESTS EXECUTED AND PASSED!');
console.log('====================================================');
