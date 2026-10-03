import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const encryptionKey = () => {
  const value = process.env.ERP_MFA_ENCRYPTION_KEY || ''
  const key = Buffer.from(value, 'base64')
  if (key.length !== 32) throw new Error('ERP_MFA_ENCRYPTION_KEY must be a base64-encoded 32-byte key')
  return key
}

export function createTotpSecret() {
  const bytes = randomBytes(20); let bits = 0; let value = 0; let result = ''
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { result += base32Alphabet[(value >>> (bits - 5)) & 31]; bits -= 5 } }
  if (bits > 0) result += base32Alphabet[(value << (5 - bits)) & 31]
  return result
}

function decodeBase32(value: string) {
  const clean = value.toUpperCase().replace(/[^A-Z2-7]/g, ''); let bits = 0; let accumulator = 0; const bytes: number[] = []
  for (const character of clean) { accumulator = (accumulator << 5) | base32Alphabet.indexOf(character); bits += 5; if (bits >= 8) { bytes.push((accumulator >>> (bits - 8)) & 255); bits -= 8 } }
  return Buffer.from(bytes)
}

function totp(secret: string, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30_000); const buffer = Buffer.alloc(8); buffer.writeBigUInt64BE(BigInt(counter)); const digest = createHmac('sha1', decodeBase32(secret)).update(buffer).digest(); const offset = digest[digest.length - 1]! & 15; const code = ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0'); return code
}

export function verifyTotp(secret: string, code: string) {
  if (!/^\d{6}$/.test(code)) return false
  return [-30_000, 0, 30_000].some(offset => { const expected = totp(secret, Date.now() + offset); return timingSafeEqual(Buffer.from(code), Buffer.from(expected)) })
}

export function encryptMfaSecret(secret: string) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv); const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')
}

export function decryptMfaSecret(value: string) {
  const data = Buffer.from(value, 'base64'); const iv = data.subarray(0, 12); const tag = data.subarray(12, 28); const encrypted = data.subarray(28); const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv); decipher.setAuthTag(tag); return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
