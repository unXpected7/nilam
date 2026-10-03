import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { Router } from 'express'
import { clearStaffSessionCookie, createStaffSession, currentStaff, readStaffToken, writeStaffSessionCookie } from '../lib/staffAuth.js'
import { prisma } from '../lib/prisma.js'
import { sendTransactionalEmail } from '../lib/brevo.js'
import { createTotpSecret, decryptMfaSecret, encryptMfaSecret, verifyTotp } from '../lib/staffMfa.js'

export const staffAuthRouter = Router()
const scrypt = promisify(scryptCallback)

async function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false
  const [salt, expected] = stored.split(':')
  if (!salt || !expected) return false
  const derived = await scrypt(password, salt, 64) as Buffer
  const actual = derived.toString('hex')
  return actual.length === expected.length && timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))
}

function validEmail(value: unknown) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : ''
}

function validPassword(value: unknown) {
  const password = typeof value === 'string' ? value : ''
  if (password.length < 12 || password.length > 256) throw new Error('Password must be 12 to 256 characters')
  return password
}

async function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const derived = await scrypt(password, salt, 64) as Buffer
  return `${salt}:${derived.toString('hex')}`
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')
const tokenExpiryHours = Number(process.env.ERP_IDENTITY_TOKEN_EXPIRY_HOURS || 24)
function expiryDate() {
  if (!Number.isInteger(tokenExpiryHours) || tokenExpiryHours < 1 || tokenExpiryHours > 168) throw new Error('ERP_IDENTITY_TOKEN_EXPIRY_HOURS must be between 1 and 168')
  return new Date(Date.now() + tokenExpiryHours * 60 * 60 * 1000)
}
function identityUrl(path: string, token: string) {
  const base = process.env.ERP_PUBLIC_URL?.trim().replace(/\/$/, '')
  if (!base || !/^https?:\/\//.test(base)) throw new Error('ERP_PUBLIC_URL must be an absolute URL before sending staff identity email')
  return `${base}${path}?token=${encodeURIComponent(token)}`
}

function staffPayload(staff: { id: string, email: string, firstName: string | null, lastName: string | null, mfaEnabledAt: Date | null, roles: { role: { name: string, permissions: { permission: { key: string } }[] } }[] }) {
  return {
    staff: { id: staff.id, email: staff.email, firstName: staff.firstName, lastName: staff.lastName, mfaEnabled: Boolean(staff.mfaEnabledAt), roles: staff.roles.map(assignment => assignment.role.name).sort() },
    permissions: [...new Set(staff.roles.flatMap(item => item.role.permissions.map(grant => grant.permission.key)))].sort(),
  }
}

staffAuthRouter.post('/login', async (request, response, next) => {
  try {
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''
    const password = typeof request.body?.password === 'string' ? request.body.password : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length > 256) { response.status(401).json({ message: 'Invalid email or password' }); return }
    const staff = await prisma.staffUser.findUnique({ where: { email }, include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } })
    if (!staff || !staff.active || !await verifyPassword(password, staff.passwordHash)) { await prisma.staffAccessEvent.create({ data: { event: 'staff.login_failed', requestId: response.locals.requestId } }); response.status(401).json({ message: 'Invalid email or password' }); return }
    if (staff.mfaEnabledAt && staff.mfaSecretEncrypted) {
      const challengeToken = randomBytes(32).toString('base64url')
      await prisma.$transaction(async transaction => {
        await transaction.staffMfaChallenge.deleteMany({ where: { staffId: staff.id } })
        await transaction.staffMfaChallenge.create({ data: { staffId: staff.id, tokenHash: tokenHash(challengeToken), expiresAt: new Date(Date.now() + 5 * 60 * 1000) } })
        await transaction.staffAccessEvent.create({ data: { staffId: staff.id, event: 'staff.mfa_login_challenge_issued', requestId: response.locals.requestId } })
      })
      response.status(202).json({ mfaRequired: true, challengeToken })
      return
    }
    writeStaffSessionCookie(response, await createStaffSession(staff.id))
    await prisma.staffAccessEvent.create({ data: { staffId: staff.id, event: 'staff.login', requestId: response.locals.requestId } })
    response.json(staffPayload(staff))
  } catch (error) { next(error) }
})

staffAuthRouter.post('/verify-mfa-login', async (request, response, next) => {
  try {
    const challengeToken = typeof request.body?.challengeToken === 'string' ? request.body.challengeToken : ''
    const code = typeof request.body?.code === 'string' ? request.body.code.trim() : ''
    if (challengeToken.length < 32 || challengeToken.length > 256 || !/^\d{6}$/.test(code)) { response.status(401).json({ message: 'Invalid or expired verification code' }); return }
    const now = new Date()
    const challenge = await prisma.staffMfaChallenge.findUnique({ where: { tokenHash: tokenHash(challengeToken) }, include: { staff: { include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } } } })
    if (!challenge || challenge.expiresAt <= now || !challenge.staff.active || !challenge.staff.mfaEnabledAt || !challenge.staff.mfaSecretEncrypted || !verifyTotp(decryptMfaSecret(challenge.staff.mfaSecretEncrypted), code)) { response.status(401).json({ message: 'Invalid or expired verification code' }); return }
    const consumed = await prisma.staffMfaChallenge.deleteMany({ where: { id: challenge.id, expiresAt: { gt: now } } })
    if (consumed.count !== 1) { response.status(401).json({ message: 'Invalid or expired verification code' }); return }
    writeStaffSessionCookie(response, await createStaffSession(challenge.staffId))
    await prisma.staffAccessEvent.create({ data: { staffId: challenge.staffId, event: 'staff.mfa_login_verified', requestId: response.locals.requestId } })
    response.json(staffPayload(challenge.staff))
  } catch (error) { next(error) }
})

staffAuthRouter.post('/mfa/setup', async (request, response, next) => {
  try {
    const current = await currentStaff(request.header('cookie'))
    if (!current) { response.status(401).json({ message: 'Staff authentication required' }); return }
    if (current.staff.mfaEnabledAt) { response.status(409).json({ message: 'Multi-factor authentication is already enabled for this account' }); return }
    const secret = createTotpSecret()
    await prisma.staffUser.update({ where: { id: current.staff.id }, data: { mfaPendingSecretEncrypted: encryptMfaSecret(secret) } })
    const issuer = 'Nilam ERP'
    const label = `${issuer}:${current.staff.email}`
    await prisma.staffAccessEvent.create({ data: { staffId: current.staff.id, event: 'staff.mfa_setup_started', requestId: response.locals.requestId } })
    response.json({ secret, otpauthUrl: `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30` })
  } catch (error) { next(error) }
})

staffAuthRouter.post('/mfa/confirm', async (request, response, next) => {
  try {
    const current = await currentStaff(request.header('cookie'))
    const code = typeof request.body?.code === 'string' ? request.body.code.trim() : ''
    if (!current) { response.status(401).json({ message: 'Staff authentication required' }); return }
    if (!current.staff.mfaPendingSecretEncrypted || !verifyTotp(decryptMfaSecret(current.staff.mfaPendingSecretEncrypted), code)) { response.status(400).json({ message: 'Enter a valid six-digit authenticator code' }); return }
    const enabledAt = new Date()
    await prisma.$transaction(async transaction => {
      const enabled = await transaction.staffUser.updateMany({ where: { id: current.staff.id, mfaEnabledAt: null, mfaPendingSecretEncrypted: current.staff.mfaPendingSecretEncrypted }, data: { mfaSecretEncrypted: current.staff.mfaPendingSecretEncrypted, mfaPendingSecretEncrypted: null, mfaEnabledAt: enabledAt } })
      if (enabled.count !== 1) throw new Error('MFA enrollment could not be completed; start again')
      await transaction.staffMfaChallenge.deleteMany({ where: { staffId: current.staff.id } })
      await transaction.staffAccessEvent.create({ data: { staffId: current.staff.id, event: 'staff.mfa_enabled', requestId: response.locals.requestId } })
    })
    response.status(204).end()
  } catch (error) { next(error) }
})

staffAuthRouter.post('/mfa/disable', async (request, response, next) => {
  try {
    const current = await currentStaff(request.header('cookie'))
    const currentPassword = typeof request.body?.currentPassword === 'string' ? request.body.currentPassword : ''
    const code = typeof request.body?.code === 'string' ? request.body.code.trim() : ''
    if (!current) { response.status(401).json({ message: 'Staff authentication required' }); return }
    if (!current.staff.mfaSecretEncrypted || !await verifyPassword(currentPassword, current.staff.passwordHash) || !verifyTotp(decryptMfaSecret(current.staff.mfaSecretEncrypted), code)) { response.status(401).json({ message: 'Current password or verification code is incorrect' }); return }
    await prisma.$transaction(async transaction => {
      await transaction.staffUser.update({ where: { id: current.staff.id }, data: { mfaSecretEncrypted: null, mfaPendingSecretEncrypted: null, mfaEnabledAt: null } })
      await transaction.staffMfaChallenge.deleteMany({ where: { staffId: current.staff.id } })
      await transaction.staffAccessEvent.create({ data: { staffId: current.staff.id, event: 'staff.mfa_disabled', requestId: response.locals.requestId } })
    })
    response.status(204).end()
  } catch (error) { next(error) }
})

staffAuthRouter.post('/accept-invitation', async (request, response, next) => {
  try {
    const token = typeof request.body?.token === 'string' ? request.body.token : ''
    const password = validPassword(request.body?.password)
    if (token.length < 32 || token.length > 256) { response.status(400).json({ message: 'This invitation is invalid or has expired' }); return }
    const now = new Date()
    const invitation = await prisma.staffInvitation.findUnique({ where: { tokenHash: tokenHash(token) }, include: { staff: true } })
    if (!invitation || invitation.acceptedAt || invitation.expiresAt <= now) { response.status(400).json({ message: 'This invitation is invalid or has expired' }); return }
    const accepted = await prisma.$transaction(async transaction => {
      const claimed = await transaction.staffInvitation.updateMany({ where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: now } }, data: { acceptedAt: now } })
      if (claimed.count !== 1) return null
      await transaction.staffUser.update({ where: { id: invitation.staffId }, data: { passwordHash: await hashPassword(password), active: true } })
      await transaction.staffSession.deleteMany({ where: { staffId: invitation.staffId } })
      await transaction.staffAccessEvent.create({ data: { staffId: invitation.staffId, event: 'staff.invitation_accepted', requestId: response.locals.requestId } })
      return transaction.staffUser.findUniqueOrThrow({ where: { id: invitation.staffId }, select: { id: true, email: true, firstName: true, lastName: true } })
    })
    if (!accepted) { response.status(400).json({ message: 'This invitation is invalid or has expired' }); return }
    writeStaffSessionCookie(response, await createStaffSession(accepted.id))
    response.json({ staff: accepted })
  } catch (error) { next(error) }
})

staffAuthRouter.post('/request-password-reset', async (request, response, next) => {
  try {
    const email = validEmail(request.body?.email)
    // This response is intentionally enumeration-safe, including malformed input.
    if (!email) { response.status(202).json({ message: 'If that staff account exists, recovery instructions will be sent.' }); return }
    const staff = await prisma.staffUser.findFirst({ where: { email, active: true }, select: { id: true, email: true, firstName: true } })
    if (!staff) { response.status(202).json({ message: 'If that staff account exists, recovery instructions will be sent.' }); return }
    const token = randomBytes(32).toString('base64url')
    await prisma.$transaction(async transaction => {
      await transaction.staffPasswordReset.deleteMany({ where: { staffId: staff.id, usedAt: null } })
      await transaction.staffPasswordReset.create({ data: { staffId: staff.id, tokenHash: tokenHash(token), expiresAt: expiryDate() } })
      await transaction.staffAccessEvent.create({ data: { staffId: staff.id, event: 'staff.password_reset_requested', requestId: response.locals.requestId } })
    })
    try { await sendTransactionalEmail({ to: [{ email: staff.email, ...(staff.firstName ? { name: staff.firstName } : {}) }], subject: 'Reset your Nilam ERP password', textContent: `Use this one-time link to reset your ERP password: ${identityUrl('/erp/reset-password', token)}\n\nIt expires in ${tokenExpiryHours} hours. If you did not request this, you can ignore this email.` }) } catch (error) { console.error(JSON.stringify({ event: 'staff_password_reset_delivery_failed', requestId: response.locals.requestId, staffId: staff.id, message: error instanceof Error ? error.message : 'unknown' })) }
    response.status(202).json({ message: 'If that staff account exists, recovery instructions will be sent.' })
  } catch (error) { next(error) }
})

staffAuthRouter.post('/reset-password', async (request, response, next) => {
  try {
    const token = typeof request.body?.token === 'string' ? request.body.token : ''
    const password = validPassword(request.body?.password)
    if (token.length < 32 || token.length > 256) { response.status(400).json({ message: 'This reset link is invalid or has expired' }); return }
    const now = new Date()
    const reset = await prisma.staffPasswordReset.findUnique({ where: { tokenHash: tokenHash(token) }, include: { staff: true } })
    if (!reset || reset.usedAt || reset.expiresAt <= now || !reset.staff.active) { response.status(400).json({ message: 'This reset link is invalid or has expired' }); return }
    const changed = await prisma.$transaction(async transaction => {
      const consumed = await transaction.staffPasswordReset.updateMany({ where: { id: reset.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } })
      if (consumed.count !== 1) return null
      await transaction.staffUser.update({ where: { id: reset.staffId }, data: { passwordHash: await hashPassword(password) } })
      await transaction.staffSession.deleteMany({ where: { staffId: reset.staffId } })
      await transaction.staffAccessEvent.create({ data: { staffId: reset.staffId, event: 'staff.password_reset_completed', requestId: response.locals.requestId } })
      return reset.staff
    })
    if (!changed) { response.status(400).json({ message: 'This reset link is invalid or has expired' }); return }
    if (changed.mfaEnabledAt) { response.status(204).end(); return }
    writeStaffSessionCookie(response, await createStaffSession(changed.id))
    response.status(204).end()
  } catch (error) { next(error) }
})

staffAuthRouter.post('/change-password', async (request, response, next) => {
  try {
    const current = await currentStaff(request.header('cookie'))
    if (!current) { response.status(401).json({ message: 'Staff authentication required' }); return }
    const currentPassword = typeof request.body?.currentPassword === 'string' ? request.body.currentPassword : ''
    const password = validPassword(request.body?.password)
    if (!await verifyPassword(currentPassword, current.staff.passwordHash)) { response.status(401).json({ message: 'Your current password is incorrect' }); return }
    await prisma.$transaction(async transaction => {
      await transaction.staffUser.update({ where: { id: current.staff.id }, data: { passwordHash: await hashPassword(password) } })
      await transaction.staffSession.deleteMany({ where: { staffId: current.staff.id } })
      await transaction.staffAccessEvent.create({ data: { staffId: current.staff.id, event: 'staff.password_changed', requestId: response.locals.requestId } })
    })
    writeStaffSessionCookie(response, await createStaffSession(current.staff.id))
    response.status(204).end()
  } catch (error) { next(error) }
})

staffAuthRouter.get('/session', async (request, response, next) => {
  try {
    const current = await currentStaff(request.header('cookie'))
    if (!current) { response.json({ staff: null, permissions: [] }); return }
    const { staff } = current
    response.json(staffPayload(staff))
  } catch (error) { next(error) }
})

staffAuthRouter.post('/logout', async (request, response, next) => {
  try {
    const current = await currentStaff(request.header('cookie'))
    const token = readStaffToken(request.header('cookie'))
    if (token) await prisma.staffSession.deleteMany({ where: { tokenHash: (await import('node:crypto')).createHash('sha256').update(token).digest('hex') } })
    if (current) await prisma.staffAccessEvent.create({ data: { staffId: current.staff.id, event: 'staff.logout', requestId: response.locals.requestId } })
    clearStaffSessionCookie(response)
    response.status(204).end()
  } catch (error) { next(error) }
})
