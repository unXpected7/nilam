import { createHash, randomBytes } from 'node:crypto'
import { prisma } from './prisma.js'

export const staffSessionCookie = 'nilam_staff'
const lifetimeSeconds = 60 * 60 * 8
const hash = (token: string) => createHash('sha256').update(token).digest('hex')

export function readStaffToken(cookieHeader: string | undefined) {
  return cookieHeader?.match(/(?:^|;\s*)nilam_staff=([^;]+)/)?.[1]
}

export function clearStaffSessionCookie(response: { append: (field: string, value: string) => unknown }) {
  response.append('Set-Cookie', `${staffSessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`)
}

export function writeStaffSessionCookie(response: { append: (field: string, value: string) => unknown }, token: string) {
  response.append('Set-Cookie', `${staffSessionCookie}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${lifetimeSeconds}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`)
}

export async function createStaffSession(staffId: string) {
  const token = randomBytes(32).toString('base64url')
  await prisma.staffSession.create({ data: { staffId, tokenHash: hash(token), expiresAt: new Date(Date.now() + lifetimeSeconds * 1000) } })
  return token
}

export async function currentStaff(cookieHeader: string | undefined) {
  const token = readStaffToken(cookieHeader)
  if (!token) return null
  const session = await prisma.staffSession.findUnique({ where: { tokenHash: hash(token) }, include: { staff: { include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } } } })
  if (!session || !session.staff.active || session.expiresAt <= new Date()) return null
  return { staff: session.staff, permissions: new Set(session.staff.roles.flatMap(item => item.role.permissions.map(grant => grant.permission.key))) }
}
