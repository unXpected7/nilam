export function requiredAdminPermission(path: string, method: string) {
  if (path.startsWith('/inventory/imports')) return 'inventory.import'
  if (path.startsWith('/inventory')) return method === 'GET' ? 'inventory.read' : 'inventory.adjust'
  if (path.startsWith('/orders')) return path.endsWith('/fulfillment') ? 'shipping.manage' : method === 'GET' ? 'orders.read' : 'orders.manage'
  if (path.startsWith('/staff/access-events')) return 'audit.read'
  if (path.startsWith('/staff')) return 'staff.manage'
  if (path.startsWith('/media') || path.includes('/media')) return method === 'GET' ? 'catalogue.read' : 'media.write'
  if (path.startsWith('/dashboard')) return 'dashboard.read'
  return method === 'GET' ? 'catalogue.read' : 'catalogue.write'
}
