import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultRolePermissions, staffPermissionKeys } from './staffPermissions.js'

test('Super Admin has every stable permission exactly once', () => {
  assert.deepEqual(new Set(defaultRolePermissions['Super Admin']), new Set(staffPermissionKeys))
  assert.equal(defaultRolePermissions['Super Admin'].length, staffPermissionKeys.length)
})

test('least-privilege role bundles do not gain staff or payment authority', () => {
  const catalogue = new Set(defaultRolePermissions.Catalogue)
  const inventory = new Set(defaultRolePermissions.Inventory)
  const fulfilment = new Set(defaultRolePermissions.Fulfilment)
  assert.ok(catalogue.has('catalogue.write'))
  assert.ok(!catalogue.has('inventory.adjust') && !catalogue.has('staff.manage'))
  assert.ok(inventory.has('inventory.import'))
  assert.ok(!inventory.has('orders.manage') && !inventory.has('staff.manage'))
  assert.ok(fulfilment.has('shipping.manage'))
  assert.ok(!fulfilment.has('staff.manage') && !fulfilment.has('inventory.adjust'))
})
