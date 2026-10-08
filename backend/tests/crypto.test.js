import assert from 'assert';
import crypto from 'node:crypto';
import {
  encryptWithKey,
  decryptWith,
  encryptField,
  decryptField,
  encryptBytes,
  decryptBytes,
  isEncrypted,
  maskIdentifier,
} from '../utils/cryptoHelper.js';
import {
  packCiphertext,
  unpackCiphertext,
  wrapKey,
  unwrapKey,
} from '../config/keys.js';

console.log('====================================================');
console.log('TRUSTHIRE CRYPTO SUITE (AES-256-GCM / envelope)');
console.log('====================================================\n');

const key = crypto.randomBytes(32);
const resolver = async (keyId) => {
  assert.strictEqual(keyId, 'test_key');
  return key;
};

// --- 1. Round trip ---------------------------------------------------------
{
  const secret = '12345678901'; // 11-digit NIN shape
  const packed = encryptWithKey(key, 'test_key', secret);
  assert.ok(isEncrypted(packed), 'output must be detected as ciphertext');
  assert.ok(!packed.includes(secret), 'plaintext must never appear in ciphertext');
  const out = await decryptWith(resolver, packed);
  assert.strictEqual(out, secret, 'round trip must return original');
  console.log('✓ [1/7] String round trip passed');
}

// --- 2. Non-determinism (randomized, not deterministic encryption) ---------
{
  const secret = '12345678901';
  const a = encryptWithKey(key, 'test_key', secret);
  const b = encryptWithKey(key, 'test_key', secret);
  assert.notStrictEqual(a, b, 'same plaintext must produce different ciphertext');
  assert.strictEqual(await decryptWith(resolver, a), secret);
  assert.strictEqual(await decryptWith(resolver, b), secret);
  console.log('✓ [2/7] Randomized encryption passed (IV uniqueness)');
}

// --- 3. Tamper detection (GCM auth tag) -----------------------------------
{
  const packed = encryptWithKey(key, 'test_key', 'sensitive');
  const parts = packed.split(':');
  const ct = Buffer.from(parts[4], 'base64');
  ct[0] ^= 0xff; // flip a bit
  parts[4] = ct.toString('base64');
  const tampered = parts.join(':');
  await assert.rejects(
    () => decryptWith(resolver, tampered),
    /authentication tag mismatch/,
    'tampered ciphertext must be rejected',
  );
  console.log('✓ [3/7] Tamper detection passed');
}

// --- 4. Wrong key must fail loudly ----------------------------------------
{
  const packed = encryptWithKey(key, 'test_key', 'sensitive');
  const wrongKey = crypto.randomBytes(32);
  await assert.rejects(
    () => decryptWith(async () => wrongKey, packed),
    /authentication tag mismatch/,
    'wrong key must be rejected',
  );
  console.log('✓ [4/7] Wrong-key rejection passed');
}

// --- 5. Envelope: master key wrap/unwrap ----------------------------------
{
  process.env.ENCRYPTION_MASTER_KEY = crypto.randomBytes(32).toString('base64');
  const dek = crypto.randomBytes(32);
  const wrapped = wrapKey(dek);
  assert.ok(wrapped.startsWith('v1:master:'), 'wrapped DEK must be packed');
  assert.ok(!Buffer.from(wrapped, 'base64').includes(dek), 'wrapped DEK not raw');
  const unwrapped = unwrapKey(wrapped);
  assert.deepStrictEqual(unwrapped, dek, 'DEK must survive wrap/unwrap');
  console.log('✓ [5/7] Envelope key wrap/unwrap passed');
}

// --- 6. Master key must FAIL (not fall back) when missing/malformed --------
{
  delete process.env.ENCRYPTION_MASTER_KEY;
  assert.throws(() => wrapKey(crypto.randomBytes(32)), /ENCRYPTION_MASTER_KEY is not set/);
  process.env.ENCRYPTION_MASTER_KEY = 'too-short';
  assert.throws(() => wrapKey(crypto.randomBytes(32)), /exactly 32 bytes/);
  process.env.ENCRYPTION_MASTER_KEY = crypto.randomBytes(32).toString('base64');
  console.log('✓ [6/7] Missing/malformed master key fails hard (no fallback)');
}

// --- 7. Packed format + sentinel + masking --------------------------------
{
  const packed = packCiphertext('k1', Buffer.alloc(12, 1), Buffer.alloc(16, 2), 'Y2lwaGVydGV4dA==');
  const parsed = unpackCiphertext(packed);
  assert.strictEqual(parsed.keyId, 'k1');
  assert.strictEqual(unpackCiphertext('not-encrypted'), null);
  assert.strictEqual(unpackCiphertext('v1:only:three'), null);
  assert.strictEqual(isEncrypted('12345678901'), false);
  assert.strictEqual(isEncrypted(packed), true);
  assert.strictEqual(maskIdentifier('12345678901'), '123*****901');
  assert.strictEqual(maskIdentifier(''), '');
  console.log('✓ [7/7] Packed format, sentinel, and masking passed');
}

console.log('\n🎉 All crypto tests passed.');
