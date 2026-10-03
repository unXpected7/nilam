import 'dotenv/config'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import test, { after, before } from 'node:test'
import type { AddressInfo } from 'node:net'
import { app } from '../server.js'
import { createStaffSession } from '../lib/staffAuth.js'
import { prisma } from '../lib/prisma.js'

const marker = `erp-access-${Date.now()}-${Math.random().toString(36).slice(2)}`
let baseUrl = ''
let server: ReturnType<typeof app.listen>
let staffId = ''
let staffCookie = ''
let csrfToken = ''
let orderId = ''
let recoveryAdminId = ''
let recoveryTargetId = ''

before(async () => {
  const dashboardPermission = await prisma.permission.findUnique({ where: { key: 'dashboard.read' } })
  const staffPermission = await prisma.permission.findUnique({ where: { key: 'staff.manage' } })
  const ordersPermission = await prisma.permission.findUnique({ where: { key: 'orders.manage' } })
  const shippingPermission = await prisma.permission.findUnique({ where: { key: 'shipping.manage' } })
  assert.ok(dashboardPermission, 'The idempotent development seed must provide dashboard.read')
  assert.ok(staffPermission, 'The idempotent development seed must provide staff.manage')
  assert.ok(ordersPermission, 'The idempotent development seed must provide orders.manage')
  assert.ok(shippingPermission, 'The idempotent development seed must provide shipping.manage')
  const role = await prisma.staffRole.create({ data: { name: marker, permissions: { create: [{ permissionId: dashboardPermission.id }, { permissionId: staffPermission.id }, { permissionId: ordersPermission.id }, { permissionId: shippingPermission.id }] } } })
  const staff = await prisma.staffUser.create({ data: { email: `${marker}@example.test`, active: true, roles: { create: { roleId: role.id } } } })
  staffId = staff.id
  staffCookie = `nilam_staff=${await createStaffSession(staff.id)}`
  server = app.listen(0)
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const session = await fetch(`${baseUrl}/api/erp/auth/session`, { headers: { cookie: staffCookie } })
  const match = session.headers.get('set-cookie')?.match(/nilam_csrf=([^;]+)/)
  assert.ok(match, 'The ERP session endpoint must issue a CSRF cookie')
  csrfToken = match[1]!
  staffCookie += `; nilam_csrf=${csrfToken}`
})

after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
  if (orderId) await prisma.order.delete({ where: { id: orderId } }).catch(() => undefined)
  if (recoveryAdminId) await prisma.staffUser.delete({ where: { id: recoveryAdminId } }).catch(() => undefined)
  if (recoveryTargetId) await prisma.staffUser.delete({ where: { id: recoveryTargetId } }).catch(() => undefined)
  await prisma.staffUser.delete({ where: { id: staffId } }).catch(() => undefined)
  await prisma.staffRole.delete({ where: { name: marker } }).catch(() => undefined)
})

test('admin API rejects missing or retired shared-token authentication', async () => {
  const unauthenticated = await fetch(`${baseUrl}/api/admin/dashboard`)
  assert.equal(unauthenticated.status, 401)
  const retiredToken = await fetch(`${baseUrl}/api/admin/dashboard`, { headers: { 'x-admin-token': 'attempted-legacy-token' } })
  assert.equal(retiredToken.status, 401)
})

test('staff session is required and permissions remain server authoritative', async () => {
  const session = await fetch(`${baseUrl}/api/erp/auth/session`, { headers: { cookie: staffCookie } })
  assert.equal(session.status, 200)
  const dashboard = await fetch(`${baseUrl}/api/admin/dashboard`, { headers: { cookie: staffCookie } })
  assert.equal(dashboard.status, 200)
  const products = await fetch(`${baseUrl}/api/admin/products`, { headers: { cookie: staffCookie } })
  assert.equal(products.status, 403)
})

test('paid-order fulfilment is sequential, idempotent, shipment-backed, and event-backed', async () => {
  const order = await prisma.order.create({ data: { orderNumber: marker, email: `${marker}@example.test`, status: 'PAID', paymentStatus: 'PAID', subtotal: 10_000, total: 10_000, items: { create: { name: 'Integration order item', sku: marker, price: 10_000, quantity: 1 } } } })
  orderId = order.id
  const request = (body: Record<string, unknown>) => fetch(`${baseUrl}/api/admin/orders/${order.id}/fulfillment`, { method: 'PATCH', headers: { cookie: staffCookie, 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify(body) })
  assert.equal((await request({ status: 'SHIPPED', provider: 'jne', service: 'REG', trackingNumber: marker })).status, 400)
  assert.equal((await request({ status: 'PROCESSING' })).status, 200)
  assert.equal((await request({ status: 'SHIPPED', provider: 'jne', service: 'REG', trackingNumber: marker })).status, 200)
  assert.equal((await request({ status: 'SHIPPED', provider: 'jne', service: 'REG', trackingNumber: marker })).status, 200)
  assert.equal((await request({ status: 'DELIVERED' })).status, 200)
  const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { shipment: true, events: { orderBy: { createdAt: 'asc' } } } })
  assert.equal(saved.status, 'FULFILLED')
  assert.equal(saved.fulfillmentStatus, 'DELIVERED')
  assert.deepEqual(saved.events.map(event => event.event), ['fulfillment.processing', 'fulfillment.shipped', 'fulfillment.delivered'])
  assert.equal(saved.shipment?.trackingNumber, marker)
})

test('Super Admin MFA recovery revokes the target sessions and preserves an audit trail', async () => {
  const superAdmin = await prisma.staffRole.findUnique({ where: { name: 'Super Admin' } })
  assert.ok(superAdmin, 'The idempotent development seed must provide Super Admin')
  const [recoveryAdmin, target] = await Promise.all([
    prisma.staffUser.create({ data: { email: `recovery-admin-${marker}@example.test`, active: true, roles: { create: { roleId: superAdmin.id } } } }),
    prisma.staffUser.create({ data: { email: `recovery-target-${marker}@example.test`, active: true, mfaSecretEncrypted: 'test-only-encrypted-value', mfaEnabledAt: new Date() } }),
  ])
  recoveryAdminId = recoveryAdmin.id
  recoveryTargetId = target.id
  await createStaffSession(target.id)
  const recoveryCookie = `nilam_staff=${await createStaffSession(recoveryAdmin.id)}`
  const session = await fetch(`${baseUrl}/api/erp/auth/session`, { headers: { cookie: recoveryCookie } })
  const csrf = session.headers.get('set-cookie')?.match(/nilam_csrf=([^;]+)/)?.[1]
  assert.ok(csrf)
  const response = await fetch(`${baseUrl}/api/admin/staff/${target.id}/reset-mfa`, { method: 'POST', headers: { cookie: `${recoveryCookie}; nilam_csrf=${csrf}`, 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ reason: 'Authenticator was replaced after verified identity check.' }) })
  assert.equal(response.status, 204)
  const [resetTarget, sessions, event] = await Promise.all([
    prisma.staffUser.findUniqueOrThrow({ where: { id: target.id } }),
    prisma.staffSession.count({ where: { staffId: target.id } }),
    prisma.staffAccessEvent.findFirst({ where: { staffId: target.id, event: 'staff.mfa_reset_by_super_admin' }, orderBy: { createdAt: 'desc' } }),
  ])
  assert.equal(resetTarget.mfaEnabledAt, null)
  assert.equal(resetTarget.mfaSecretEncrypted, null)
  assert.equal(sessions, 0)
  assert.ok(event)
})

test('a revoked staff session cannot be used and production privileged MFA gate fails closed', async () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalMfaRequirement = process.env.ERP_REQUIRE_MFA_FOR_PRIVILEGED
  process.env.NODE_ENV = 'production'
  process.env.ERP_REQUIRE_MFA_FOR_PRIVILEGED = 'true'
  try {
    const mfaBlocked = await fetch(`${baseUrl}/api/admin/staff`, { headers: { cookie: staffCookie } })
    assert.equal(mfaBlocked.status, 403)
    await prisma.staffSession.deleteMany({ where: { staffId } })
    const revoked = await fetch(`${baseUrl}/api/admin/staff`, { headers: { cookie: staffCookie } })
    assert.equal(revoked.status, 401)
  } finally {
    process.env.NODE_ENV = originalNodeEnv
    if (originalMfaRequirement === undefined) delete process.env.ERP_REQUIRE_MFA_FOR_PRIVILEGED
    else process.env.ERP_REQUIRE_MFA_FOR_PRIVILEGED = originalMfaRequirement
  }
})
