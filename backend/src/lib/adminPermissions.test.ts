import assert from 'node:assert/strict'
import test from 'node:test'
import { requiredAdminPermission } from './adminPermissions.js'

test('maps every protected ERP route family to its least-privilege permission', () => {
  const cases: Array<[string, string, string]> = [
    ['/dashboard', 'GET', 'dashboard.read'],
    ['/products', 'GET', 'catalogue.read'], ['/products', 'POST', 'catalogue.write'], ['/products/id', 'PATCH', 'catalogue.write'],
    ['/products/id/media', 'GET', 'catalogue.read'], ['/products/id/media', 'POST', 'media.write'], ['/products/id/media/id', 'PATCH', 'media.write'], ['/products/id/media/id', 'DELETE', 'media.write'],
    ['/categories', 'GET', 'catalogue.read'], ['/categories', 'POST', 'catalogue.write'], ['/collections/id', 'DELETE', 'catalogue.write'],
    ['/inventory', 'GET', 'inventory.read'], ['/inventory/id/detail', 'GET', 'inventory.read'], ['/inventory/id/movements', 'GET', 'inventory.read'], ['/inventory/id', 'PATCH', 'inventory.adjust'],
    ['/inventory/imports', 'GET', 'inventory.import'], ['/inventory/imports/preview', 'POST', 'inventory.import'], ['/inventory/imports/id/apply', 'POST', 'inventory.import'], ['/inventory/imports/id/rollback', 'POST', 'inventory.import'],
    ['/orders', 'GET', 'orders.read'], ['/orders/id', 'GET', 'orders.read'], ['/orders/id/notes', 'POST', 'orders.manage'], ['/orders/id/fulfillment', 'PATCH', 'shipping.manage'],
    ['/staff', 'GET', 'staff.manage'], ['/staff/id/roles', 'PATCH', 'staff.manage'], ['/staff/id/reset-mfa', 'POST', 'staff.manage'], ['/staff/access-events', 'GET', 'audit.read'],
    ['/media/audit', 'GET', 'catalogue.read'],
  ]
  for (const [path, method, expected] of cases) assert.equal(requiredAdminPermission(path, method), expected, `${method} ${path}`)
})
