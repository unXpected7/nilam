import assert from 'node:assert/strict'
import { createHmac, randomBytes } from 'node:crypto'
import test from 'node:test'
import { createTotpSecret, decryptMfaSecret, encryptMfaSecret, verifyTotp } from './staffMfa.js'

test('generates a valid TOTP secret and encrypts it without retaining plaintext', () => {
  process.env.ERP_MFA_ENCRYPTION_KEY = randomBytes(32).toString('base64')
  const secret = createTotpSecret()
  assert.match(secret, /^[A-Z2-7]{32}$/)
  const encrypted = encryptMfaSecret(secret)
  assert.notEqual(encrypted, secret)
  assert.equal(decryptMfaSecret(encrypted), secret)
})

test('rejects invalid TOTP codes', () => {
  assert.equal(verifyTotp(createTotpSecret(), 'not-a-code'), false)
  assert.equal(verifyTotp(createTotpSecret(), '12345'), false)
})

test('accepts a current RFC 6238 SHA-1 TOTP code', () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const secret = createTotpSecret()
  let bits = 0; let value = 0; const bytes: number[] = []
  for (const character of secret) { value = (value << 5) | alphabet.indexOf(character); bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8 } }
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest(); const offset = digest[digest.length - 1]! & 15
  const code = ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0')
  assert.equal(verifyTotp(secret, code), true)
})
