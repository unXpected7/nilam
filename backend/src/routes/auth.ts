import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { Router } from 'express'
import type { Response } from 'express'
import { prisma } from '../lib/prisma.js'

const scrypt = promisify(scryptCallback)
export const customerSessionCookie = 'nilam_customer'
const sessionLifetimeSeconds = 60 * 60 * 24 * 30
export const authRouter = Router()

function emailField(value: unknown) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Enter a valid email address')
  return email
}

function passwordField(value: unknown) {
  const password = typeof value === 'string' ? value : ''
  if (password.length < 12 || password.length > 256) throw new Error('Password must be 12 to 256 characters')
  return password
}

function optionalNameField(value: unknown, label: string) {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`${label} must be text`)
  const name = value.trim()
  if (name.length > 80) throw new Error(`${label} must be 80 characters or fewer`)
  return name || null
}

function addressField(value: unknown, label: string, maximum = 120) {
  if (typeof value !== 'string') throw new Error(`${label} is required`)
  const text = value.trim()
  if (!text || text.length > maximum) throw new Error(`${label} is required and must be ${maximum} characters or fewer`)
  return text
}

function optionalAddressField(value: unknown, label: string, maximum = 120) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw new Error(`${label} must be text`)
  const text = value.trim()
  if (text.length > maximum) throw new Error(`${label} must be ${maximum} characters or fewer`)
  return text || null
}

async function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const derived = await scrypt(password, salt, 64) as Buffer
  return `${salt}:${derived.toString('hex')}`
}

async function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false
  const [salt, expected] = stored.split(':')
  if (!salt || !expected) return false
  const actual = await hashPassword(password, salt)
  const actualHash = actual.split(':')[1]
  if (!actualHash || actualHash.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(actualHash, 'hex'), Buffer.from(expected, 'hex'))
}

function tokenHash(token: string) { return createHash('sha256').update(token).digest('hex') }

function readCookie(cookieHeader: string | undefined, name: string) {
  const match = cookieHeader?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return match?.[1]
}

function writeSessionCookie(response: Response, token: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  response.append('Set-Cookie', `${customerSessionCookie}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionLifetimeSeconds}${secure}`)
}

function clearSessionCookie(response: Response) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  response.append('Set-Cookie', `${customerSessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`)
}

async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url')
  await prisma.customerSession.create({ data: { userId, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + sessionLifetimeSeconds * 1000) } })
  return token
}

export async function currentAuthenticatedUser(cookieHeader: string | undefined) {
  const token = readCookie(cookieHeader, customerSessionCookie)
  if (!token) return null
  const session = await prisma.customerSession.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: true } })
  if (!session) return null
  if (session.expiresAt <= new Date()) { await prisma.customerSession.delete({ where: { id: session.id } }); return null }
  return session.user
}

async function mergeAnonymousCart(userId: string, cookieHeader: string | undefined) {
  const sessionId = readCookie(cookieHeader, 'nilam_cart')
  if (!sessionId) return { unavailable: 0 }
  const anonymous = await prisma.cart.findUnique({ where: { sessionId }, include: { items: { include: { variant: { include: { inventory: true } } } } } })
  if (!anonymous || anonymous.userId) return { unavailable: 0 }
  let unavailable = 0
  await prisma.$transaction(async transaction => {
    const target = await transaction.cart.findFirst({ where: { userId }, orderBy: { updatedAt: 'desc' } }) || await transaction.cart.create({ data: { userId } })
    for (const item of anonymous.items) {
      const available = item.variant.inventory?.quantity ?? 0
      const existing = await transaction.cartItem.findUnique({ where: { cartId_variantId: { cartId: target.id, variantId: item.variantId } } })
      const quantity = Math.min(available, (existing?.quantity ?? 0) + item.quantity)
      if (quantity < (existing?.quantity ?? 0) + item.quantity) unavailable += (existing?.quantity ?? 0) + item.quantity - quantity
      if (quantity > 0) await transaction.cartItem.upsert({ where: { cartId_variantId: { cartId: target.id, variantId: item.variantId } }, update: { quantity }, create: { cartId: target.id, variantId: item.variantId, quantity } })
    }
    await transaction.cart.delete({ where: { id: anonymous.id } })
  })
  return { unavailable }
}

function customer(user: { id: string; email: string; firstName: string | null; lastName: string | null }) {
  return { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName }
}

authRouter.post('/register', async (request, response, next) => {
  try {
    const email = emailField(request.body?.email)
    const password = passwordField(request.body?.password)
    const firstName = typeof request.body?.firstName === 'string' ? request.body.firstName.trim().slice(0, 80) || null : null
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) { response.status(409).json({ message: 'An account already exists for this email' }); return }
    const user = await prisma.user.create({ data: { email, passwordHash: await hashPassword(password), firstName } })
    const cartMerge = await mergeAnonymousCart(user.id, request.header('cookie'))
    writeSessionCookie(response, await createSession(user.id))
    response.status(201).json({ user: customer(user), cartMerge })
  } catch (error) { next(error) }
})

authRouter.post('/login', async (request, response, next) => {
  try {
    const email = emailField(request.body?.email)
    const password = typeof request.body?.password === 'string' ? request.body.password : ''
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !await verifyPassword(password, user.passwordHash)) { response.status(401).json({ message: 'Invalid email or password' }); return }
    const cartMerge = await mergeAnonymousCart(user.id, request.header('cookie'))
    writeSessionCookie(response, await createSession(user.id))
    response.json({ user: customer(user), cartMerge })
  } catch (error) { next(error) }
})

authRouter.post('/logout', async (request, response, next) => {
  try {
    const token = readCookie(request.header('cookie'), customerSessionCookie)
    if (token) await prisma.customerSession.deleteMany({ where: { tokenHash: tokenHash(token) } })
    clearSessionCookie(response)
    response.status(204).end()
  } catch (error) { next(error) }
})

authRouter.get('/session', async (request, response, next) => {
  try {
    const user = await currentAuthenticatedUser(request.header('cookie'))
    response.json({ user: user ? customer(user) : null })
  } catch (error) { next(error) }
})

authRouter.patch('/profile', async (request, response, next) => {
  try {
    const user = await currentAuthenticatedUser(request.header('cookie'))
    if (!user) { response.status(401).json({ message: 'Please sign in to update your profile' }); return }
    const firstName = optionalNameField(request.body?.firstName, 'First name')
    const lastName = optionalNameField(request.body?.lastName, 'Last name')
    if (firstName === undefined && lastName === undefined) { response.status(400).json({ message: 'Provide a profile field to update' }); return }
    const updated = await prisma.user.update({ where: { id: user.id }, data: { ...(firstName !== undefined ? { firstName } : {}), ...(lastName !== undefined ? { lastName } : {}) } })
    response.json({ user: customer(updated) })
  } catch (error) { next(error) }
})

authRouter.post('/password', async (request, response, next) => {
  try {
    const user = await currentAuthenticatedUser(request.header('cookie'))
    if (!user) { response.status(401).json({ message: 'Please sign in to change your password' }); return }
    const currentPassword = typeof request.body?.currentPassword === 'string' ? request.body.currentPassword : ''
    const newPassword = passwordField(request.body?.newPassword)
    if (!await verifyPassword(currentPassword, user.passwordHash)) { response.status(401).json({ message: 'Your current password is incorrect' }); return }
    const token = randomBytes(32).toString('base64url')
    const updated = await prisma.$transaction(async transaction => {
      const changed = await transaction.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } })
      await transaction.customerSession.deleteMany({ where: { userId: user.id } })
      await transaction.customerSession.create({ data: { userId: user.id, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + sessionLifetimeSeconds * 1000) } })
      return changed
    })
    writeSessionCookie(response, token)
    response.json({ user: customer(updated) })
  } catch (error) { next(error) }
})

authRouter.get('/orders', async (request, response, next) => {
  try {
    const user = await currentAuthenticatedUser(request.header('cookie'))
    if (!user) { response.status(401).json({ message: 'Please sign in to view your orders' }); return }
    const orders = await prisma.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, status: true, paymentStatus: true, subtotal: true, shipping: true, total: true, createdAt: true, items: { select: { id: true, name: true, sku: true, price: true, quantity: true } } },
    })
    response.json({ items: orders, limit: 50 })
  } catch (error) { next(error) }
})

authRouter.get('/orders/:id', async (request, response, next) => {
  try {
    const user = await currentAuthenticatedUser(request.header('cookie'))
    if (!user) { response.status(401).json({ message: 'Please sign in to view your order' }); return }
    const order = await prisma.order.findFirst({ where: { id: request.params.id, userId: user.id }, select: { id: true, status: true, paymentStatus: true, subtotal: true, shipping: true, total: true, createdAt: true, items: { select: { id: true, name: true, sku: true, price: true, quantity: true } } } })
    if (!order) { response.status(404).json({ message: 'Order not found' }); return }
    response.json({ ...order, events: [] })
  } catch (error) { next(error) }
})

authRouter.get('/addresses', async (request, response, next) => {
  try {
    const user = await currentAuthenticatedUser(request.header('cookie'))
    if (!user) { response.status(401).json({ message: 'Please sign in to view saved addresses' }); return }
    response.json(await prisma.address.findMany({ where: { userId: user.id }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] }))
  } catch (error) { next(error) }
})

authRouter.post('/addresses', async (request, response, next) => {
  try {
    const user = await currentAuthenticatedUser(request.header('cookie'))
    if (!user) { response.status(401).json({ message: 'Please sign in to save an address' }); return }
    const phone = addressField(request.body?.phone, 'Phone number', 30)
    if (!/^\+?[0-9][0-9 .()-]{6,29}$/.test(phone)) throw new Error('Enter a valid phone number')
    const postalCode = addressField(request.body?.postalCode, 'Postal code', 10)
    if (!/^\d{5}$/.test(postalCode)) throw new Error('Enter a valid 5-digit Indonesian postal code')
    const address = await prisma.$transaction(async transaction => {
      const currentDefault = await transaction.address.findFirst({ where: { userId: user.id, isDefault: true }, select: { id: true } })
      return transaction.address.create({ data: {
        userId: user.id, label: optionalAddressField(request.body?.label, 'Label', 40), recipient: addressField(request.body?.recipient, 'Recipient'), phone,
        line1: addressField(request.body?.line1, 'Address line'), line2: optionalAddressField(request.body?.line2, 'Address line 2'), city: addressField(request.body?.city, 'City'), province: addressField(request.body?.province, 'Province'), postalCode, country: 'ID', isDefault: !currentDefault,
      } })
    })
    response.status(201).json(address)
  } catch (error) { next(error) }
})

authRouter.patch('/addresses/:id', async (request, response, next) => {
  try {
    const user = await currentAuthenticatedUser(request.header('cookie'))
    if (!user) { response.status(401).json({ message: 'Please sign in to update a saved address' }); return }
    const phone = addressField(request.body?.phone, 'Phone number', 30)
    if (!/^\+?[0-9][0-9 .()-]{6,29}$/.test(phone)) throw new Error('Enter a valid phone number')
    const postalCode = addressField(request.body?.postalCode, 'Postal code', 10)
    if (!/^\d{5}$/.test(postalCode)) throw new Error('Enter a valid 5-digit Indonesian postal code')
    const existing = await prisma.address.findFirst({ where: { id: request.params.id, userId: user.id } })
    if (!existing) { response.status(404).json({ message: 'Saved address not found' }); return }
    const address = await prisma.address.update({ where: { id: existing.id }, data: {
      label: optionalAddressField(request.body?.label, 'Label', 40), recipient: addressField(request.body?.recipient, 'Recipient'), phone,
      line1: addressField(request.body?.line1, 'Address line'), line2: optionalAddressField(request.body?.line2, 'Address line 2'), city: addressField(request.body?.city, 'City'), province: addressField(request.body?.province, 'Province'), postalCode,
    } })
    response.json(address)
  } catch (error) { next(error) }
})

authRouter.delete('/addresses/:id', async (request, response, next) => {
  try {
    const user = await currentAuthenticatedUser(request.header('cookie'))
    if (!user) { response.status(401).json({ message: 'Please sign in to remove a saved address' }); return }
    const deleted = await prisma.$transaction(async transaction => {
      const address = await transaction.address.findFirst({ where: { id: request.params.id, userId: user.id } })
      if (!address) return false
      await transaction.address.delete({ where: { id: address.id } })
      if (address.isDefault) {
        const replacement = await transaction.address.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } })
        if (replacement) await transaction.address.update({ where: { id: replacement.id }, data: { isDefault: true } })
      }
      return true
    })
    if (!deleted) { response.status(404).json({ message: 'Saved address not found' }); return }
    response.status(204).end()
  } catch (error) { next(error) }
})

authRouter.patch('/addresses/:id/default', async (request, response, next) => {
  try {
    const user = await currentAuthenticatedUser(request.header('cookie'))
    if (!user) { response.status(401).json({ message: 'Please sign in to update your saved address' }); return }
    const address = await prisma.$transaction(async transaction => {
      const existing = await transaction.address.findFirst({ where: { id: request.params.id, userId: user.id } })
      if (!existing) return null
      await transaction.address.updateMany({ where: { userId: user.id, isDefault: true }, data: { isDefault: false } })
      return transaction.address.update({ where: { id: existing.id }, data: { isDefault: true } })
    })
    if (!address) { response.status(404).json({ message: 'Saved address not found' }); return }
    response.json(address)
  } catch (error) { next(error) }
})
