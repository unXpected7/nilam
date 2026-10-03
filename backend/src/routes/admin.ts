import { Router } from 'express'
import { createHash, randomBytes } from 'node:crypto'
import { InventoryImportJobOperation, Prisma, ProductStatus } from '@prisma/client'
import multer from 'multer'
import { prisma } from '../lib/prisma.js'
import { convertAndStoreProductImage, deleteStoredMedia } from '../lib/mediaStorage.js'
import { parseStockImportCsv } from '../lib/stockImport.js'
import { sendTransactionalEmail } from '../lib/brevo.js'
import { enqueueInventoryImportJob } from '../lib/inventoryImportJobs.js'
import { requiredAdminPermission } from '../lib/adminPermissions.js'

export const adminRouter = Router()
const mfaGatedPermissions = new Set(['inventory.import', 'orders.manage', 'shipping.manage', 'staff.manage'])
const auditActor = (response: any) => {
  if (!response.locals.staff) throw new Error('Staff authentication required')
  return response.locals.staff.staff.email
}
function staffIdentityExpiry() {
  const hours = Number(process.env.ERP_IDENTITY_TOKEN_EXPIRY_HOURS || 24)
  if (!Number.isInteger(hours) || hours < 1 || hours > 168) throw new Error('ERP_IDENTITY_TOKEN_EXPIRY_HOURS must be between 1 and 168')
  return { hours, expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000) }
}
async function serializableTransaction<T>(callback: (transaction: Prisma.TransactionClient) => Promise<T>) {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await prisma.$transaction(callback, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }) } catch (error) {
      lastError = error
      if (!(typeof error === 'object' && error && 'code' in error && error.code === 'P2034') || attempt === 2) throw error
    }
  }
  throw lastError
}
adminRouter.use((request, response, next) => {
  const staff = response.locals.staff
  if (!staff) { response.status(401).json({ message: 'Staff authentication required' }); return }
  const permission = requiredAdminPermission(request.path, request.method)
  if (!staff.permissions.has(permission)) { response.status(403).json({ message: 'You do not have permission for this action' }); return }
  if (process.env.NODE_ENV === 'production' && process.env.ERP_REQUIRE_MFA_FOR_PRIVILEGED !== 'false' && mfaGatedPermissions.has(permission) && (!staff.staff.mfaEnabledAt || !staff.staff.mfaSecretEncrypted)) {
    response.status(403).json({ message: 'Multi-factor authentication enrollment is required for this privileged ERP action' })
    return
  }
  next()
})

adminRouter.post('/inventory/imports/preview', async (request, response, next) => {
  try {
    const csv = typeof request.body?.csv === 'string' ? request.body.csv : ''
    if (!csv || csv.length > 5 * 1024 * 1024) { response.status(400).json({ message: 'Provide a CSV file no larger than 5 MB' }); return }
    const parsed = parseStockImportCsv(csv)
    const skus = [...new Set(parsed.rows.map(row => row.sku))]
    const variants = await prisma.productVariant.findMany({ where: { sku: { in: skus } }, select: { sku: true, inventory: { select: { quantity: true } }, product: { select: { status: true } } } })
    const variantBySku = new Map(variants.map(variant => [variant.sku, variant]))
    const rowError = (row: typeof parsed.rows[number]) => {
      const variant = variantBySku.get(row.sku)
      if (!variant) return `Unknown SKU: ${row.sku}`
      if (variant.product.status === ProductStatus.ARCHIVED) return `Archived SKU: ${row.sku}`
      if (row.warehouse !== 'MAIN') return 'Only the MAIN warehouse is currently approved'
      return null
    }
    const errors = [...parsed.errors, ...parsed.rows.map(rowError).filter((error): error is string => Boolean(error))]
    const rows = parsed.rows.map(row => { const variant = variantBySku.get(row.sku); const error = rowError(row); const previousQuantity = variant?.inventory?.quantity ?? null; return { ...row, knownSku: Boolean(variant), previousQuantity, changed: !error && previousQuantity !== Number(row.quantity), error } })
    const sourceReference = typeof request.body?.sourceReference === 'string' ? request.body.sourceReference.trim().slice(0, 160) : ''
    if (!sourceReference) { response.status(400).json({ message: 'sourceReference is required' }); return }
    const checksum = createHash('sha256').update(csv).digest('hex')
    const existing = await prisma.inventoryImport.findFirst({ where: { sourceReference, checksum, status: { in: ['UPLOADED', 'VALIDATED', 'APPLIED'] } }, select: { id: true, status: true } })
    if (existing) { response.status(409).json({ message: 'This source file has already been staged', importId: existing.id, status: existing.status }); return }
    const actor = auditActor(response)
    const imported = await prisma.inventoryImport.create({ data: { sourceReference, checksum, actor, status: errors.length ? 'REJECTED' : 'VALIDATED', rows: { create: rows.map((row, index) => ({ rowNumber: index + 2, sku: row.sku, quantity: Number(row.quantity), warehouse: row.warehouse, reason: row.reason, error: row.error })) } } })
    const accepted = rows.filter(row => !row.error)
    response.status(201).json({ importId: imported.id, status: imported.status, rows, errors, summary: { total: parsed.rows.length + parsed.errors.length, accepted: accepted.length, rejected: errors.length, changed: accepted.filter(row => row.changed).length, unchanged: accepted.filter(row => !row.changed).length, conflicts: rows.filter(row => Boolean(row.error)).length } })
  } catch (error) { next(error) }
})

adminRouter.get('/inventory/imports', async (request, response, next) => {
  try {
    const status = typeof request.query.status === 'string' ? request.query.status : ''
    if (status && !['UPLOADED', 'VALIDATED', 'APPLIED', 'REJECTED', 'ROLLED_BACK'].includes(status)) { response.status(400).json({ message: 'Invalid import status' }); return }
    const page = Math.max(1, Number(request.query.page) || 1); const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 25))
    const where = status ? { status: status as 'UPLOADED' | 'VALIDATED' | 'APPLIED' | 'REJECTED' | 'ROLLED_BACK' } : undefined
    const [items, total] = await Promise.all([prisma.inventoryImport.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' }, include: { _count: { select: { rows: true } } } }), prisma.inventoryImport.count({ where })])
    response.json({ items: items.map(item => ({ ...item, rowCount: item._count.rows, _count: undefined })), pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } })
  } catch (error) { next(error) }
})

adminRouter.get('/inventory/imports/:id', async (request, response, next) => {
  try {
    const imported = await prisma.inventoryImport.findUnique({ where: { id: request.params.id }, include: { rows: { orderBy: { rowNumber: 'asc' } }, jobs: { orderBy: { createdAt: 'desc' } } } })
    if (!imported) { response.status(404).json({ message: 'Inventory import not found' }); return }
    response.json(imported)
  } catch (error) { next(error) }
})

adminRouter.get('/inventory/imports/:id/jobs', async (request, response, next) => {
  try {
    const imported = await prisma.inventoryImport.findUnique({ where: { id: request.params.id }, select: { id: true } })
    if (!imported) { response.status(404).json({ message: 'Inventory import not found' }); return }
    response.json({ items: await prisma.inventoryImportJob.findMany({ where: { importId: imported.id }, orderBy: { createdAt: 'desc' } }) })
  } catch (error) { next(error) }
})

adminRouter.post('/inventory/imports/:id/apply', async (request, response, next) => {
  try {
    const actor = auditActor(response)
    const job = await enqueueInventoryImportJob(request.params.id, InventoryImportJobOperation.APPLY, actor)
    if (!job) { response.status(404).json({ message: 'Inventory import not found' }); return }
    response.status(202).json(job)
  } catch (error) { next(error) }
})

adminRouter.post('/inventory/imports/:id/rollback', async (request, response, next) => {
  try {
    const actor = auditActor(response)
    if (!response.locals.staff!.staff.roles.some(assignment => assignment.role.name === 'Super Admin')) { response.status(403).json({ message: 'Only Super Admin can roll back an import' }); return }
    const job = await enqueueInventoryImportJob(request.params.id, InventoryImportJobOperation.ROLLBACK, actor)
    if (!job) { response.status(404).json({ message: 'Inventory import not found' }); return }
    response.status(202).json(job)
  } catch (error) { next(error) }
})
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } })
type AdminProductRow = Record<string, unknown> & {
  category: { name: string }
  variants: Array<{ inventory: { quantity: number } | null }>
  media: Array<{ url: string }>
}
type InventoryRow = { id: string; quantity: number; lowStockThreshold: number; variant: { sku: string; name: string; product: { name: string; id: string } } }
type ProductPayload = {
  name?: unknown; handle?: unknown; description?: unknown; categoryId?: unknown; status?: unknown
  sku?: unknown; price?: unknown; quantity?: unknown; image?: unknown; collectionIds?: unknown; seoTitle?: unknown; seoDescription?: unknown
}
type CategoryPayload = { name?: unknown; handle?: unknown }
type CollectionPayload = { name?: unknown; handle?: unknown; description?: unknown }
type VariantPayload = { name?: unknown; sku?: unknown; price?: unknown; quantity?: unknown }

function stringField(value: unknown, field: string, required = true) {
  const result = typeof value === 'string' ? value.trim() : ''
  if (required && !result) throw new Error(`${field} is required`)
  return result
}

function categoryFields(body: CategoryPayload) {
  return {
    name: stringField(body.name, 'name'),
    handle: stringField(body.handle, 'handle').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, ''),
  }
}

function collectionFields(body: CollectionPayload) {
  return {
    name: stringField(body.name, 'name'),
    handle: stringField(body.handle, 'handle').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, ''),
    description: stringField(body.description, 'description', false) || null,
  }
}

function productFields(body: ProductPayload) {
  const status = stringField(body.status, 'status')
  if (!Object.values(ProductStatus).includes(status as ProductStatus)) throw new Error('status is invalid')
  return {
    name: stringField(body.name, 'name'),
    handle: stringField(body.handle, 'handle').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, ''),
    description: stringField(body.description, 'description'),
    categoryId: stringField(body.categoryId, 'categoryId'),
    status: status as ProductStatus,
    seoTitle: stringField(body.seoTitle, 'seoTitle', false) || null,
    seoDescription: stringField(body.seoDescription, 'seoDescription', false) || null,
  }
}

function variantFields(body: VariantPayload) {
  const name = stringField(body.name, 'name')
  const sku = stringField(body.sku, 'sku')
  const price = Number(body.price)
  if (!Number.isInteger(price) || price < 0) throw new Error('price must be a non-negative integer')
  return { name, sku, price }
}

async function assertCategory(categoryId: string) {
  if (!await prisma.category.findUnique({ where: { id: categoryId } })) throw new Error('category does not exist')
}

async function collectionIds(value: unknown) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some(id => typeof id !== 'string' || !id.trim())) throw new Error('collectionIds must be an array of collection IDs')
  const ids = [...new Set(value.map(id => id.trim()))]
  const count = await prisma.collection.count({ where: { id: { in: ids } } })
  if (count !== ids.length) throw new Error('one or more collections do not exist')
  return ids
}

adminRouter.get('/dashboard', async (_request, response, next) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const [productCount, orderCount, pendingOrders, lowStock, managedMedia, legacyMedia, failedLogins, validatedImports, rejectedImports, rolledBackImports, shipmentEvents] = await Promise.all([
      prisma.product.count({ where: { status: 'ACTIVE' } }),
      prisma.order.count(),
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.inventory.count({ where: { quantity: { lte: 5 } } }),
      prisma.productMedia.count({ where: { objectKey: { not: null } } }),
      prisma.productMedia.count({ where: { objectKey: null } }),
      prisma.staffAccessEvent.count({ where: { event: 'staff.login_failed', createdAt: { gte: since } } }),
      prisma.inventoryImport.count({ where: { status: 'VALIDATED' } }),
      prisma.inventoryImport.count({ where: { status: 'REJECTED', createdAt: { gte: since } } }),
      prisma.inventoryImport.count({ where: { status: 'ROLLED_BACK', updatedAt: { gte: since } } }),
      prisma.orderEvent.count({ where: { event: { startsWith: 'fulfillment.' }, createdAt: { gte: since } } }),
    ])
    response.json({ productCount, orderCount, pendingOrders, lowStock, netSales: 0, media: { managed: managedMedia, legacy: legacyMedia, total: managedMedia + legacyMedia }, operations24h: { failedLogins, rejectedImports, rolledBackImports, shipmentEvents }, pendingImportApply: validatedImports })
  } catch (error) { next(error) }
})

adminRouter.get('/staff/access-events', async (request, response, next) => {
  try {
    const staffId = typeof request.query.staffId === 'string' ? request.query.staffId.trim() : ''
    const event = typeof request.query.event === 'string' ? request.query.event.trim().slice(0, 100) : ''
    const page = Math.max(1, Number(request.query.page) || 1); const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 50))
    const where = { ...(staffId ? { staffId } : {}), ...(event ? { event } : {}) }
    const [items, total] = await Promise.all([
      prisma.staffAccessEvent.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' }, include: { staff: { select: { id: true, email: true, firstName: true, lastName: true } } } }),
      prisma.staffAccessEvent.count({ where }),
    ])
    response.json({ items, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } })
  } catch (error) { next(error) }
})

adminRouter.get('/staff', async (_request, response, next) => {
  try {
    const staff = await prisma.staffUser.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, email: true, firstName: true, lastName: true, active: true, createdAt: true, updatedAt: true, roles: { select: { role: { select: { id: true, name: true } } } } } })
    response.json({ items: staff.map(item => ({ ...item, roles: item.roles.map(assignment => assignment.role) })) })
  } catch (error) { next(error) }
})

adminRouter.get('/staff/roles', async (_request, response, next) => {
  try {
    const roles = await prisma.staffRole.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, description: true, permissions: { select: { permission: { select: { key: true, description: true } } } } } })
    response.json({ items: roles.map(role => ({ ...role, permissions: role.permissions.map(grant => grant.permission) })) })
  } catch (error) { next(error) }
})

adminRouter.post('/staff/invitations', async (request, response, next) => {
  try {
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''
    const firstName = typeof request.body?.firstName === 'string' ? request.body.firstName.trim().slice(0, 80) || null : null
    const lastName = typeof request.body?.lastName === 'string' ? request.body.lastName.trim().slice(0, 80) || null : null
    const requestedRoleIds: unknown[] = Array.isArray(request.body?.roleIds) ? request.body.roleIds : []
    const roleIds: string[] = [...new Set(requestedRoleIds.filter((value): value is string => typeof value === 'string' && value.length > 0))]
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !roleIds.length) { response.status(400).json({ message: 'A valid email and at least one role are required' }); return }
    const roles = await prisma.staffRole.findMany({ where: { id: { in: roleIds } }, select: { id: true } })
    if (roles.length !== roleIds.length) { response.status(400).json({ message: 'One or more selected roles do not exist' }); return }
    const actor = auditActor(response)
    const token = randomBytes(32).toString('base64url')
    const { hours: expiryHours, expiresAt } = staffIdentityExpiry()
    const result = await prisma.$transaction(async transaction => {
      const existing = await transaction.staffUser.findUnique({ where: { email } })
      if (existing?.active) throw new Error('An active staff account already uses this email')
      const staff = existing ? await transaction.staffUser.update({ where: { id: existing.id }, data: { firstName, lastName, passwordHash: null, active: false, roles: { deleteMany: {}, create: roleIds.map(roleId => ({ roleId })) } } }) : await transaction.staffUser.create({ data: { email, firstName, lastName, active: false, roles: { create: roleIds.map(roleId => ({ roleId })) } } })
      await transaction.staffInvitation.deleteMany({ where: { staffId: staff.id, acceptedAt: null } })
      await transaction.staffInvitation.create({ data: { staffId: staff.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt } })
      await transaction.staffAccessEvent.create({ data: { staffId: staff.id, event: 'staff.invited', requestId: response.locals.requestId, metadata: { actor, roleIds } } })
      await transaction.adminAuditLog.create({ data: { actor, action: 'staff.invite', entity: 'StaffUser', entityId: staff.id, payload: { roleIds, requestId: response.locals.requestId } } })
      return staff
    })
    const base = process.env.ERP_PUBLIC_URL?.trim().replace(/\/$/, '')
    if (!base || !/^https?:\/\//.test(base)) throw new Error('ERP_PUBLIC_URL must be configured before inviting staff')
    await sendTransactionalEmail({ to: [{ email: result.email, ...(result.firstName ? { name: result.firstName } : {}) }], subject: 'You are invited to Nilam ERP', textContent: `Set your one-time Nilam ERP password: ${base}/erp/accept-invitation?token=${encodeURIComponent(token)}\n\nThis link expires in ${expiryHours} hours.` })
    response.status(201).json({ id: result.id, email: result.email, expiresAt })
  } catch (error) { next(error) }
})

adminRouter.patch('/staff/:id/active', async (request, response, next) => {
  try {
    const active = request.body?.active
    if (typeof active !== 'boolean') { response.status(400).json({ message: 'active must be a boolean' }); return }
    if (response.locals.staff!.staff.id === request.params.id && !active) { response.status(409).json({ message: 'You cannot deactivate your own account' }); return }
    const actor = auditActor(response)
    const updated = await prisma.$transaction(async transaction => {
      const staff = await transaction.staffUser.findUnique({ where: { id: request.params.id } })
      if (!staff) return null
      const changed = await transaction.staffUser.update({ where: { id: staff.id }, data: { active } })
      if (!active) await transaction.staffSession.deleteMany({ where: { staffId: staff.id } })
      await transaction.staffAccessEvent.create({ data: { staffId: staff.id, event: active ? 'staff.activated' : 'staff.deactivated', requestId: response.locals.requestId, metadata: { actor, previousActive: staff.active, active } } })
      await transaction.adminAuditLog.create({ data: { actor, action: active ? 'staff.activate' : 'staff.deactivate', entity: 'StaffUser', entityId: staff.id, payload: { previousActive: staff.active, active, requestId: response.locals.requestId } } })
      return changed
    })
    if (!updated) { response.status(404).json({ message: 'Staff account not found' }); return }
    response.json({ id: updated.id, email: updated.email, active: updated.active })
  } catch (error) { next(error) }
})

adminRouter.patch('/staff/:id/roles', async (request, response, next) => {
  try {
    const roleIds = request.body?.roleIds
    if (!Array.isArray(roleIds) || !roleIds.length || roleIds.some(id => typeof id !== 'string' || !id)) { response.status(400).json({ message: 'roleIds must be a non-empty array of role IDs' }); return }
    const uniqueRoleIds = [...new Set(roleIds)]
    const actor = auditActor(response)
    const updated = await prisma.$transaction(async transaction => {
      const staff = await transaction.staffUser.findUnique({ where: { id: request.params.id }, include: { roles: { select: { roleId: true, role: { select: { id: true, name: true, permissions: { select: { permission: { select: { key: true } } } } } } } } } })
      if (!staff) return null
      const roles = await transaction.staffRole.findMany({ where: { id: { in: uniqueRoleIds } }, select: { id: true, name: true, permissions: { select: { permission: { select: { key: true } } } } } })
      if (roles.length !== uniqueRoleIds.length) throw new Error('One or more roles do not exist')
      const previousRoleIds = staff.roles.map(assignment => assignment.roleId)
      const previousPermissions = [...new Set(staff.roles.flatMap(assignment => assignment.role.permissions.map(grant => grant.permission.key)))].sort()
      const permissions = [...new Set(roles.flatMap(role => role.permissions.map(grant => grant.permission.key)))].sort()
      await transaction.staffUserRole.deleteMany({ where: { staffUserId: staff.id } })
      await transaction.staffUserRole.createMany({ data: uniqueRoleIds.map(roleId => ({ staffUserId: staff.id, roleId })) })
      await transaction.staffAccessEvent.create({ data: { staffId: staff.id, event: 'staff.roles_replaced', requestId: response.locals.requestId, metadata: { actor, previousRoleIds, roleIds: uniqueRoleIds, previousPermissions, permissions } } })
      await transaction.adminAuditLog.create({ data: { actor, action: 'staff.roles.replace', entity: 'StaffUser', entityId: staff.id, payload: { previousRoleIds, roleIds: uniqueRoleIds, previousPermissions, permissions, requestId: response.locals.requestId } } })
      return transaction.staffUser.findUniqueOrThrow({ where: { id: staff.id }, select: { id: true, email: true, roles: { select: { role: { select: { id: true, name: true } } } } } })
    })
    if (!updated) { response.status(404).json({ message: 'Staff account not found' }); return }
    response.json({ ...updated, roles: updated.roles.map(assignment => assignment.role) })
  } catch (error) { next(error) }
})

adminRouter.post('/staff/:id/revoke-sessions', async (request, response, next) => {
  try {
    const actor = auditActor(response)
    const result = await prisma.$transaction(async transaction => {
      const staff = await transaction.staffUser.findUnique({ where: { id: request.params.id }, select: { id: true, email: true } })
      if (!staff) return null
      const deleted = await transaction.staffSession.deleteMany({ where: { staffId: staff.id } })
      await transaction.staffAccessEvent.create({ data: { staffId: staff.id, event: 'staff.sessions_revoked', requestId: response.locals.requestId, metadata: { actor, count: deleted.count } } })
      await transaction.adminAuditLog.create({ data: { actor, action: 'staff.sessions.revoke', entity: 'StaffUser', entityId: staff.id, payload: { count: deleted.count, requestId: response.locals.requestId } } })
      return { id: staff.id, sessionsRevoked: deleted.count }
    })
    if (!result) { response.status(404).json({ message: 'Staff account not found' }); return }
    response.json(result)
  } catch (error) { next(error) }
})

adminRouter.post('/staff/:id/reset-mfa', async (request, response, next) => {
  try {
    const actor = auditActor(response)
    const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim() : ''
    if (reason.length < 10 || reason.length > 500) { response.status(400).json({ message: 'A 10 to 500 character recovery reason is required' }); return }
    if (response.locals.staff!.staff.id === request.params.id) { response.status(409).json({ message: 'Use your own MFA settings to manage your authenticator' }); return }
    if (!response.locals.staff!.staff.roles.some(assignment => assignment.role.name === 'Super Admin')) { response.status(403).json({ message: 'Only Super Admin can reset another staff member’s MFA' }); return }
    const reset = await prisma.$transaction(async transaction => {
      const staff = await transaction.staffUser.findUnique({ where: { id: request.params.id }, select: { id: true, email: true, mfaEnabledAt: true } })
      if (!staff) return null
      if (!staff.mfaEnabledAt) throw new Error('This staff account does not have MFA enabled')
      await transaction.staffUser.update({ where: { id: staff.id }, data: { mfaSecretEncrypted: null, mfaPendingSecretEncrypted: null, mfaEnabledAt: null } })
      await transaction.staffSession.deleteMany({ where: { staffId: staff.id } })
      await transaction.staffMfaChallenge.deleteMany({ where: { staffId: staff.id } })
      await transaction.staffAccessEvent.create({ data: { staffId: staff.id, event: 'staff.mfa_reset_by_super_admin', requestId: response.locals.requestId, metadata: { actor, reason } } })
      await transaction.adminAuditLog.create({ data: { actor, action: 'staff.mfa.reset', entity: 'StaffUser', entityId: staff.id, payload: { reason, requestId: response.locals.requestId } } })
      return staff
    })
    if (!reset) { response.status(404).json({ message: 'Staff account not found' }); return }
    response.status(204).end()
  } catch (error) { next(error) }
})

adminRouter.get('/orders', async (request, response, next) => {
  try {
    const q = String(request.query.q || '').trim()
    const status = typeof request.query.status === 'string' ? request.query.status : ''
    const paymentStatus = typeof request.query.paymentStatus === 'string' ? request.query.paymentStatus : ''
    const fulfillmentStatus = typeof request.query.fulfillmentStatus === 'string' ? request.query.fulfillmentStatus : ''
    const from = typeof request.query.from === 'string' ? new Date(request.query.from) : undefined
    const to = typeof request.query.to === 'string' ? new Date(request.query.to) : undefined
    if (status && !['PENDING', 'PAID', 'FULFILLED', 'CANCELLED', 'REFUNDED'].includes(status)) { response.status(400).json({ message: 'Invalid order status' }); return }
    if (paymentStatus && !['PENDING', 'PAID', 'FAILED', 'REFUNDED'].includes(paymentStatus)) { response.status(400).json({ message: 'Invalid payment status' }); return }
    if (fulfillmentStatus && !['UNFULFILLED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'].includes(fulfillmentStatus)) { response.status(400).json({ message: 'Invalid fulfilment status' }); return }
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) { response.status(400).json({ message: 'from and to must be valid ISO dates' }); return }
    const page = Math.max(1, Number(request.query.page) || 1); const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 25))
    const where = { ...(status ? { status: status as 'PENDING' | 'PAID' | 'FULFILLED' | 'CANCELLED' | 'REFUNDED' } : {}), ...(paymentStatus ? { paymentStatus: paymentStatus as 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' } : {}), ...(fulfillmentStatus ? { fulfillmentStatus: fulfillmentStatus as 'UNFULFILLED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' } : {}), ...((from || to) ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}), ...(q ? { OR: [{ orderNumber: { contains: q, mode: 'insensitive' as const } }, { email: { contains: q, mode: 'insensitive' as const } }, { items: { some: { sku: { contains: q, mode: 'insensitive' as const } } } }, { shipment: { is: { trackingNumber: { contains: q, mode: 'insensitive' as const } } } }] } : {}) }
    const [items, total, totals] = await Promise.all([prisma.order.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' }, select: { id: true, orderNumber: true, email: true, status: true, paymentStatus: true, fulfillmentStatus: true, total: true, createdAt: true, items: { select: { sku: true, quantity: true } } } }), prisma.order.count({ where }), prisma.order.aggregate({ where, _sum: { total: true } })])
    response.json({ items, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }, summary: { total: totals._sum.total || 0 } })
  } catch (error) { next(error) }
})

adminRouter.get('/orders/:id', async (request, response, next) => {
  try {
    const order = await prisma.order.findUnique({ where: { id: request.params.id }, include: { user: { select: { email: true, firstName: true, lastName: true } }, items: true, paymentAttempts: { orderBy: { createdAt: 'desc' }, select: { id: true, provider: true, providerOrderId: true, providerPaymentId: true, amount: true, status: true, paymentType: true, verifiedAt: true, createdAt: true } }, shipment: { select: { provider: true, service: true, trackingNumber: true, status: true, shippedAt: true, deliveredAt: true, createdAt: true, updatedAt: true } }, events: { orderBy: { createdAt: 'asc' }, select: { id: true, event: true, actor: true, requestId: true, createdAt: true } }, internalNotes: { orderBy: { createdAt: 'asc' } } } })
    if (!order) { response.status(404).json({ message: 'Order not found' }); return }
    response.json(order)
  } catch (error) { next(error) }
})

adminRouter.post('/orders/:id/notes', async (request, response, next) => {
  try {
    const body = typeof request.body?.body === 'string' ? request.body.body.trim() : ''
    if (!body || body.length > 2_000) { response.status(400).json({ message: 'An internal note must be between 1 and 2,000 characters' }); return }
    const author = auditActor(response)
    const note = await prisma.$transaction(async transaction => {
      const order = await transaction.order.findUnique({ where: { id: request.params.id }, select: { id: true } })
      if (!order) return null
      const created = await transaction.orderInternalNote.create({ data: { orderId: order.id, author, body } })
      await transaction.orderEvent.create({ data: { orderId: order.id, event: 'order.internal_note_added', actor: author, requestId: response.locals.requestId, payload: { noteId: created.id } } })
      return created
    })
    if (!note) { response.status(404).json({ message: 'Order not found' }); return }
    response.status(201).json(note)
  } catch (error) { next(error) }
})

adminRouter.patch('/orders/:id/fulfillment', async (request, response, next) => {
  try {
    const status = typeof request.body?.status === 'string' ? request.body.status : ''
    if (!['PROCESSING', 'SHIPPED', 'DELIVERED'].includes(status)) { response.status(400).json({ message: 'status must be PROCESSING, SHIPPED, or DELIVERED' }); return }
    const actor = auditActor(response)
    const order = await prisma.$transaction(async transaction => {
      const current = await transaction.order.findUnique({ where: { id: request.params.id }, include: { shipment: true } })
      if (!current) return null
      if (current.paymentStatus !== 'PAID') throw new Error('A paid payment status is required before fulfilment can progress')
      const trackingNumber = typeof request.body?.trackingNumber === 'string' ? request.body.trackingNumber.trim() : ''
      const provider = typeof request.body?.provider === 'string' ? request.body.provider.trim().toLowerCase() : ''
      const service = typeof request.body?.service === 'string' ? request.body.service.trim() : ''
      const allowedProviders = ['jne', 'jnt']
      if (status === 'SHIPPED' && (!trackingNumber || !provider || !service)) throw new Error('A tracking number, approved carrier, and service are required before shipping')
      if (trackingNumber.length > 160 || provider.length > 60 || service.length > 100) throw new Error('Shipment carrier, service, or tracking number is too long')
      if (status === 'SHIPPED' && !allowedProviders.includes(provider)) throw new Error('This carrier is not approved for shipment')
      if (current.fulfillmentStatus === status) {
        if (status === 'SHIPPED' && ((trackingNumber && trackingNumber !== current.shipment?.trackingNumber) || (provider && provider !== current.shipment?.provider) || (service && service !== current.shipment?.service))) throw new Error('The order is already shipped with different shipment details')
        return transaction.order.findUniqueOrThrow({ where: { id: current.id }, include: { shipment: true, events: { orderBy: { createdAt: 'asc' } } } })
      }
      const expected = status === 'PROCESSING' ? 'UNFULFILLED' : status === 'SHIPPED' ? 'PROCESSING' : 'SHIPPED'
      if (current.fulfillmentStatus !== expected) throw new Error('This fulfilment transition is not allowed')
      const claimed = await transaction.order.updateMany({ where: { id: current.id, fulfillmentStatus: expected }, data: { fulfillmentStatus: status as 'PROCESSING' | 'SHIPPED' | 'DELIVERED', ...(status === 'DELIVERED' ? { status: 'FULFILLED' } : {}) } })
      if (claimed.count !== 1) throw new Error('This fulfilment transition was already processed; refresh the order')
      if (status !== 'PROCESSING') await transaction.shipment.upsert({ where: { orderId: current.id }, update: { ...(trackingNumber ? { trackingNumber } : {}), ...(provider ? { provider } : {}), ...(service ? { service } : {}), status, ...(status === 'SHIPPED' ? { shippedAt: new Date() } : { deliveredAt: new Date() }) }, create: { orderId: current.id, trackingNumber: trackingNumber || null, provider: provider || null, service: service || null, status, ...(status === 'SHIPPED' ? { shippedAt: new Date() } : { deliveredAt: new Date() }) } })
      await transaction.orderEvent.create({ data: { orderId: current.id, event: `fulfillment.${status.toLowerCase()}`, actor, requestId: response.locals.requestId, payload: { status, ...(provider ? { provider } : {}), ...(service ? { service } : {}), ...(trackingNumber ? { trackingNumber } : {}) } } })
      return transaction.order.findUniqueOrThrow({ where: { id: current.id }, include: { shipment: true, events: { orderBy: { createdAt: 'asc' } } } })
    })
    if (!order) { response.status(404).json({ message: 'Order not found' }); return }
    response.json(order)
  } catch (error) { next(error) }
})

adminRouter.get('/media/audit', async (_request, response, next) => {
  try {
    const [managed, legacy] = await Promise.all([
      prisma.productMedia.count({ where: { objectKey: { not: null } } }),
      prisma.productMedia.count({ where: { objectKey: null } }),
    ])
    response.json({ managed, legacy, total: managed + legacy, migrationComplete: legacy === 0 })
  } catch (error) { next(error) }
})

adminRouter.get('/products', async (request, response, next) => {
  try {
    const query = String(request.query.q || '').trim()
    const products = await prisma.product.findMany({
      where: query ? { OR: [{ name: { contains: query, mode: 'insensitive' } }, { handle: { contains: query, mode: 'insensitive' } }] } : undefined,
      include: { category: true, collections: { include: { collection: true } }, variants: { include: { inventory: true }, orderBy: { price: 'asc' } }, media: { orderBy: { position: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
    })
    response.json(products.map((product: AdminProductRow) => ({ ...product, category: product.category.name, image: product.media[0]?.url ?? '', stock: product.variants.reduce((total, variant) => total + (variant.inventory?.quantity ?? 0), 0) })))
  } catch (error) { next(error) }
})

adminRouter.get('/categories', async (_request, response, next) => {
  try {
    response.json(await prisma.category.findMany({ include: { _count: { select: { products: true } } }, orderBy: { name: 'asc' } }))
  } catch (error) { next(error) }
})

adminRouter.post('/categories', async (request, response, next) => {
  try {
    const category = await prisma.category.create({ data: categoryFields(request.body as CategoryPayload) })
    await prisma.adminAuditLog.create({ data: { actor: auditActor(response), action: 'category.create', entity: 'Category', entityId: category.id, payload: { handle: category.handle } } })
    response.status(201).json(category)
  } catch (error) { next(error) }
})

adminRouter.patch('/categories/:id', async (request, response, next) => {
  try {
    const existing = await prisma.category.findUnique({ where: { id: request.params.id } })
    if (!existing) { response.status(404).json({ message: 'Category not found' }); return }
    const category = await prisma.category.update({ where: { id: existing.id }, data: categoryFields(request.body as CategoryPayload) })
    await prisma.adminAuditLog.create({ data: { actor: auditActor(response), action: 'category.update', entity: 'Category', entityId: category.id, payload: { handle: category.handle } } })
    response.json(category)
  } catch (error) { next(error) }
})

adminRouter.delete('/categories/:id', async (request, response, next) => {
  try {
    const category = await prisma.category.findUnique({ where: { id: request.params.id }, include: { _count: { select: { products: true } } } })
    if (!category) { response.status(404).json({ message: 'Category not found' }); return }
    if (category._count.products > 0) { response.status(409).json({ message: 'Move or archive its products before deleting this category' }); return }
    await prisma.category.delete({ where: { id: category.id } })
    await prisma.adminAuditLog.create({ data: { actor: auditActor(response), action: 'category.delete', entity: 'Category', entityId: category.id, payload: { handle: category.handle } } })
    response.status(204).end()
  } catch (error) { next(error) }
})

adminRouter.get('/collections', async (_request, response, next) => {
  try {
    response.json(await prisma.collection.findMany({ include: { _count: { select: { products: true } } }, orderBy: { name: 'asc' } }))
  } catch (error) { next(error) }
})

adminRouter.post('/collections', async (request, response, next) => {
  try {
    const collection = await prisma.collection.create({ data: collectionFields(request.body as CollectionPayload) })
    await prisma.adminAuditLog.create({ data: { actor: auditActor(response), action: 'collection.create', entity: 'Collection', entityId: collection.id, payload: { handle: collection.handle } } })
    response.status(201).json(collection)
  } catch (error) { next(error) }
})

adminRouter.patch('/collections/:id', async (request, response, next) => {
  try {
    const existing = await prisma.collection.findUnique({ where: { id: request.params.id } })
    if (!existing) { response.status(404).json({ message: 'Collection not found' }); return }
    const collection = await prisma.collection.update({ where: { id: existing.id }, data: collectionFields(request.body as CollectionPayload) })
    await prisma.adminAuditLog.create({ data: { actor: auditActor(response), action: 'collection.update', entity: 'Collection', entityId: collection.id, payload: { handle: collection.handle } } })
    response.json(collection)
  } catch (error) { next(error) }
})

adminRouter.delete('/collections/:id', async (request, response, next) => {
  try {
    const collection = await prisma.collection.findUnique({ where: { id: request.params.id }, include: { _count: { select: { products: true } } } })
    if (!collection) { response.status(404).json({ message: 'Collection not found' }); return }
    if (collection._count.products > 0) { response.status(409).json({ message: 'Remove its products before deleting this collection' }); return }
    await prisma.collection.delete({ where: { id: collection.id } })
    await prisma.adminAuditLog.create({ data: { actor: auditActor(response), action: 'collection.delete', entity: 'Collection', entityId: collection.id, payload: { handle: collection.handle } } })
    response.status(204).end()
  } catch (error) { next(error) }
})

adminRouter.get('/products/:id/media', async (request, response, next) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: request.params.id }, include: { media: { orderBy: { position: 'asc' } } } })
    if (!product) { response.status(404).json({ message: 'Product not found' }); return }
    response.json(product.media)
  } catch (error) { next(error) }
})

adminRouter.post('/products/:id/media', upload.single('file'), async (request, response, next) => {
  let stored: Awaited<ReturnType<typeof convertAndStoreProductImage>> | undefined
  try {
    const productId = typeof request.params.id === 'string' ? request.params.id : ''
    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product) { response.status(404).json({ message: 'Product not found' }); return }
    if (!request.file) { response.status(400).json({ message: 'An image file is required' }); return }
    stored = await convertAndStoreProductImage(product.id, request.file)
    const last = await prisma.productMedia.aggregate({ where: { productId: product.id }, _max: { position: true } })
    const media = await prisma.productMedia.create({ data: { productId: product.id, ...stored, alt: stringField(request.body?.alt, 'alt', false) || product.name, position: (last._max.position ?? -1) + 1 } })
    await prisma.adminAuditLog.create({ data: { actor: auditActor(response), action: 'product-media.create', entity: 'ProductMedia', entityId: media.id, payload: { productId: product.id, objectKey: media.objectKey } } })
    response.status(201).json(media)
  } catch (error) {
    if (stored) await deleteStoredMedia(stored.objectKey).catch(() => undefined)
    next(error)
  }
})

adminRouter.patch('/products/:productId/media/:mediaId', async (request, response, next) => {
  try {
    const media = await prisma.productMedia.findFirst({ where: { id: request.params.mediaId, productId: request.params.productId } })
    if (!media) { response.status(404).json({ message: 'Product media not found' }); return }
    const alt = stringField(request.body?.alt, 'alt', false)
    const position = request.body?.position === undefined ? undefined : Number(request.body.position)
    if (position !== undefined && (!Number.isInteger(position) || position < 0)) throw new Error('position must be a non-negative integer')
    if (!alt && position === undefined) throw new Error('alt or position is required')
    if (position !== undefined) {
      const ordered = await prisma.productMedia.findMany({ where: { productId: media.productId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] })
      const withoutCurrent = ordered.filter(item => item.id !== media.id)
      withoutCurrent.splice(Math.min(position, withoutCurrent.length), 0, media)
      await prisma.$transaction(withoutCurrent.map((item, index) => prisma.productMedia.update({ where: { id: item.id }, data: { position: index, ...(item.id === media.id && alt ? { alt } : {}) } })))
    } else if (alt) await prisma.productMedia.update({ where: { id: media.id }, data: { alt } })
    const saved = await prisma.productMedia.findUniqueOrThrow({ where: { id: media.id } })
    await prisma.adminAuditLog.create({ data: { actor: auditActor(response), action: 'product-media.update', entity: 'ProductMedia', entityId: saved.id, payload: { productId: saved.productId, alt: saved.alt, position: saved.position } } })
    response.json(saved)
  } catch (error) { next(error) }
})

adminRouter.delete('/products/:productId/media/:mediaId', async (request, response, next) => {
  try {
    const media = await prisma.productMedia.findFirst({ where: { id: request.params.mediaId, productId: request.params.productId } })
    if (!media) { response.status(404).json({ message: 'Product media not found' }); return }
    await deleteStoredMedia(media.objectKey)
    await prisma.productMedia.delete({ where: { id: media.id } })
    const remaining = await prisma.productMedia.findMany({ where: { productId: media.productId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] })
    await prisma.$transaction(remaining.map((item, index) => prisma.productMedia.update({ where: { id: item.id }, data: { position: index } })))
    await prisma.adminAuditLog.create({ data: { actor: auditActor(response), action: 'product-media.delete', entity: 'ProductMedia', entityId: media.id, payload: { productId: media.productId, objectKey: media.objectKey } } })
    response.status(204).end()
  } catch (error) { next(error) }
})

adminRouter.post('/products', async (request, response, next) => {
  try {
    const body = request.body as ProductPayload
    const fields = productFields(body)
    await assertCategory(fields.categoryId)
    const assignedCollections = await collectionIds(body.collectionIds)
    const sku = stringField(body.sku, 'sku')
    const price = Number(body.price)
    const quantity = Number(body.quantity)
    if (stringField(body.image, 'image', false)) throw new Error('Upload product media after creating the product; external image URLs are not accepted')
    if (!Number.isInteger(price) || price < 0) throw new Error('price must be a non-negative integer')
    if (!Number.isInteger(quantity) || quantity < 0) throw new Error('quantity must be a non-negative integer')
    const product = await prisma.product.create({
      data: {
        ...fields,
        ...(fields.status === ProductStatus.ARCHIVED ? { archivedAt: new Date() } : {}),
        ...(assignedCollections?.length ? { collections: { create: assignedCollections.map(collectionId => ({ collectionId })) } } : {}),
        variants: { create: { name: 'Default', sku, price, inventory: { create: { quantity } } } },
      },
    })
    await prisma.adminAuditLog.create({ data: { actor: auditActor(response), action: 'product.create', entity: 'Product', entityId: product.id, payload: { handle: product.handle, sku } } })
    response.status(201).json(product)
  } catch (error) { next(error) }
})

adminRouter.patch('/products/:id', async (request, response, next) => {
  try {
    const fields = productFields(request.body as ProductPayload)
    await assertCategory(fields.categoryId)
    const assignedCollections = await collectionIds((request.body as ProductPayload).collectionIds)
    const existing = await prisma.product.findUnique({ where: { id: request.params.id } })
    if (!existing) { response.status(404).json({ message: 'Product not found' }); return }
    const product = await prisma.product.update({ where: { id: existing.id }, data: { ...fields, archivedAt: fields.status === ProductStatus.ARCHIVED ? existing.archivedAt || new Date() : null, ...(assignedCollections ? { collections: { deleteMany: {}, ...(assignedCollections.length ? { create: assignedCollections.map(collectionId => ({ collectionId })) } : {}) } } : {}) } })
    await prisma.adminAuditLog.create({ data: { actor: auditActor(response), action: 'product.update', entity: 'Product', entityId: product.id, payload: { handle: product.handle, status: product.status } } })
    response.json(product)
  } catch (error) { next(error) }
})

adminRouter.post('/products/:id/variants', async (request, response, next) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: request.params.id } })
    if (!product) { response.status(404).json({ message: 'Product not found' }); return }
    const fields = variantFields(request.body as VariantPayload)
    const quantity = Number((request.body as VariantPayload).quantity ?? 0)
    if (!Number.isInteger(quantity) || quantity < 0) throw new Error('quantity must be a non-negative integer')
    const variant = await prisma.productVariant.create({ data: { ...fields, productId: product.id, inventory: { create: { quantity } } }, include: { inventory: true } })
    await prisma.adminAuditLog.create({ data: { actor: auditActor(response), action: 'variant.create', entity: 'ProductVariant', entityId: variant.id, payload: { productId: product.id, sku: variant.sku, quantity } } })
    response.status(201).json(variant)
  } catch (error) { next(error) }
})

adminRouter.patch('/products/:productId/variants/:variantId', async (request, response, next) => {
  try {
    const fields = variantFields(request.body as VariantPayload)
    const variant = await prisma.productVariant.findFirst({ where: { id: request.params.variantId, productId: request.params.productId } })
    if (!variant) { response.status(404).json({ message: 'Variant not found' }); return }
    const saved = await prisma.productVariant.update({ where: { id: variant.id }, data: fields, include: { inventory: true } })
    await prisma.adminAuditLog.create({ data: { actor: auditActor(response), action: 'variant.update', entity: 'ProductVariant', entityId: saved.id, payload: { productId: saved.productId, sku: saved.sku, price: saved.price } } })
    response.json(saved)
  } catch (error) { next(error) }
})

adminRouter.delete('/products/:productId/variants/:variantId', async (request, response, next) => {
  try {
    const [variant, count] = await Promise.all([
      prisma.productVariant.findFirst({ where: { id: request.params.variantId, productId: request.params.productId }, include: { _count: { select: { cartItems: true, orderItems: true } } } }),
      prisma.productVariant.count({ where: { productId: request.params.productId } }),
    ])
    if (!variant) { response.status(404).json({ message: 'Variant not found' }); return }
    if (count <= 1) { response.status(409).json({ message: 'A product must retain at least one variant' }); return }
    if (variant._count.cartItems || variant._count.orderItems) { response.status(409).json({ message: 'This variant has cart or order references and cannot be deleted' }); return }
    await prisma.productVariant.delete({ where: { id: variant.id } })
    await prisma.adminAuditLog.create({ data: { actor: auditActor(response), action: 'variant.delete', entity: 'ProductVariant', entityId: variant.id, payload: { productId: request.params.productId, sku: variant.sku } } })
    response.status(204).end()
  } catch (error) { next(error) }
})

adminRouter.get('/inventory', async (_request, response, next) => {
  try {
    const inventory = await prisma.inventory.findMany({ include: { variant: { include: { product: true } } }, orderBy: { quantity: 'asc' } })
    response.json(inventory.map((item: InventoryRow) => ({ id: item.id, quantity: item.quantity, lowStockThreshold: item.lowStockThreshold, lowStock: item.quantity <= item.lowStockThreshold, sku: item.variant.sku, variant: item.variant.name, product: item.variant.product.name, productId: item.variant.product.id })))
  } catch (error) { next(error) }
})

adminRouter.patch('/inventory/:variantId', async (request, response, next) => {
  try {
    const quantity = Number(request.body?.quantity)
    const lowStockThreshold = Number(request.body?.lowStockThreshold ?? 5)
    const reason = stringField(request.body?.reason, 'reason')
    if (!Number.isInteger(quantity) || quantity < 0) { response.status(400).json({ message: 'quantity must be a non-negative integer' }); return }
    if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) { response.status(400).json({ message: 'lowStockThreshold must be a non-negative integer' }); return }
    const variant = await prisma.productVariant.findUnique({ where: { id: request.params.variantId } })
    if (!variant) { response.status(404).json({ message: 'Variant not found' }); return }
    const actor = auditActor(response)
    const inventory = await serializableTransaction(async transaction => {
      const previous = await transaction.inventory.findUnique({ where: { variantId: variant.id } })
      const previousQuantity = previous?.quantity ?? 0
      const saved = await transaction.inventory.upsert({ where: { variantId: variant.id }, update: { quantity, lowStockThreshold }, create: { variantId: variant.id, quantity, lowStockThreshold } })
      await transaction.inventoryMovement.create({ data: { inventoryId: saved.id, previousQuantity, quantity, delta: quantity - previousQuantity, reason, actor } })
      await transaction.adminAuditLog.create({ data: { actor, action: 'inventory.adjust', entity: 'ProductVariant', entityId: variant.id, payload: { previousQuantity, quantity, lowStockThreshold, reason, requestId: response.locals.requestId } } })
      return saved
    })
    response.json(inventory)
  } catch (error) { next(error) }
})

adminRouter.get('/inventory/:variantId/movements', async (request, response, next) => {
  try {
    const variant = await prisma.productVariant.findUnique({ where: { id: request.params.variantId }, include: { inventory: true } })
    if (!variant?.inventory) { response.status(404).json({ message: 'Inventory record not found' }); return }
    const from = typeof request.query.from === 'string' ? new Date(request.query.from) : undefined
    const to = typeof request.query.to === 'string' ? new Date(request.query.to) : undefined
    const reason = typeof request.query.reason === 'string' ? request.query.reason.trim().slice(0, 160) : ''
    const limit = Math.min(250, Math.max(1, Number(request.query.limit) || 100))
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) { response.status(400).json({ message: 'from and to must be valid ISO dates' }); return }
    const movements = await prisma.inventoryMovement.findMany({ where: { inventoryId: variant.inventory.id, ...(reason ? { reason: { contains: reason, mode: 'insensitive' } } : {}), ...((from || to) ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) }, orderBy: { createdAt: 'desc' }, take: limit })
    response.json(movements)
  } catch (error) { next(error) }
})

adminRouter.get('/inventory/:variantId/detail', async (request, response, next) => {
  try {
    const variant = await prisma.productVariant.findUnique({ where: { id: request.params.variantId }, include: { product: { select: { id: true, name: true } }, inventory: true } })
    if (!variant?.inventory) { response.status(404).json({ message: 'Inventory record not found' }); return }
    response.json({ inventory: { id: variant.inventory.id, quantity: variant.inventory.quantity, availableQuantity: variant.inventory.quantity, reservedQuantity: 0, lowStockThreshold: variant.inventory.lowStockThreshold, warehouse: 'MAIN', updatedAt: variant.inventory.updatedAt }, variant: { id: variant.id, name: variant.name, sku: variant.sku }, product: variant.product })
  } catch (error) { next(error) }
})
