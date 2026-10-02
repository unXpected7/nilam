import { scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { Router } from 'express'
import { clearStaffSessionCookie, createStaffSession, currentStaff, readStaffToken, writeStaffSessionCookie } from '../lib/staffAuth.js'
import { prisma } from '../lib/prisma.js'

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

staffAuthRouter.post('/login', async (request, response, next) => {
  try {
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''
    const password = typeof request.body?.password === 'string' ? request.body.password : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length > 256) { response.status(401).json({ message: 'Invalid email or password' }); return }
    const staff = await prisma.staffUser.findUnique({ where: { email }, include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } })
    if (!staff || !staff.active || !await verifyPassword(password, staff.passwordHash)) { response.status(401).json({ message: 'Invalid email or password' }); return }
    writeStaffSessionCookie(response, await createStaffSession(staff.id))
    response.json({ staff: { id: staff.id, email: staff.email, firstName: staff.firstName, lastName: staff.lastName }, permissions: [...new Set(staff.roles.flatMap(item => item.role.permissions.map(grant => grant.permission.key)))].sort() })
  } catch (error) { next(error) }
})

staffAuthRouter.get('/session', async (request, response, next) => {
  try {
    const current = await currentStaff(request.header('cookie'))
    if (!current) { response.json({ staff: null, permissions: [] }); return }
    const { staff } = current
    response.json({ staff: { id: staff.id, email: staff.email, firstName: staff.firstName, lastName: staff.lastName }, permissions: [...current.permissions].sort() })
  } catch (error) { next(error) }
})

staffAuthRouter.post('/logout', async (request, response, next) => {
  try {
    const token = readStaffToken(request.header('cookie'))
    if (token) await prisma.staffSession.deleteMany({ where: { tokenHash: (await import('node:crypto')).createHash('sha256').update(token).digest('hex') } })
    clearStaffSessionCookie(response)
    response.status(204).end()
  } catch (error) { next(error) }
})
