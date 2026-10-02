export const staffPermissionKeys = [
  'dashboard.read', 'catalogue.read', 'catalogue.write', 'media.write',
  'inventory.read', 'inventory.adjust', 'inventory.import',
  'orders.read', 'orders.manage', 'shipping.manage',
  'customers.read', 'staff.manage', 'audit.read',
] as const

export type StaffPermissionKey = typeof staffPermissionKeys[number]

export const defaultRolePermissions: Record<string, StaffPermissionKey[]> = {
  'Super Admin': [...staffPermissionKeys],
  Catalogue: ['dashboard.read', 'catalogue.read', 'catalogue.write', 'media.write'],
  Inventory: ['dashboard.read', 'inventory.read', 'inventory.adjust', 'inventory.import'],
  'Customer Service': ['dashboard.read', 'orders.read', 'customers.read'],
  Fulfilment: ['dashboard.read', 'orders.read', 'orders.manage', 'shipping.manage'],
  Finance: ['dashboard.read', 'orders.read', 'audit.read'],
  Auditor: ['dashboard.read', 'catalogue.read', 'inventory.read', 'orders.read', 'audit.read'],
}
