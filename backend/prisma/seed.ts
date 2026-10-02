import { PrismaClient, ProductStatus } from '@prisma/client'
import { randomBytes, scrypt as scryptCallback } from 'node:crypto'
import { promisify } from 'node:util'
import { defaultRolePermissions, staffPermissionKeys } from '../src/lib/staffPermissions.js'

const prisma = new PrismaClient()
const scrypt = promisify(scryptCallback)
const toHandle = (value: string) => value.toLowerCase().replace('&', 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const products = [
  { name: 'Keana Voal Scarf', handle: 'keana-voal-scarf', category: 'Scarves', description: 'A lightweight voal scarf designed for comfortable, everyday styling.', price: 169000, sku: 'NLM-KEANA-SAGE', colourFamily: 'sage', undertone: 'cool' },
  { name: 'Naya Buttoned Tunic', handle: 'naya-buttoned-tunic', category: 'Modest apparel', description: 'A soft, flowing tunic with a clean buttoned finish.', price: 359000, sku: 'NLM-NAYA-BLUSH', colourFamily: 'blush', undertone: 'warm' },
  { name: 'Raya Family Set', handle: 'raya-family-set', category: 'Sarimbit', description: 'Thoughtfully coordinated pieces for meaningful occasions.', price: 699000, sku: 'NLM-RAYA-OLIVE', colourFamily: 'olive', undertone: 'neutral' },
  { name: 'Amara Prayer Set', handle: 'amara-prayer-set', category: 'Umrah & Hajj', description: 'A practical and refined travel companion for worship.', price: 449000, sku: 'NLM-AMARA-CREAM', colourFamily: 'cream', undertone: 'warm' },
]

async function main() {
  const permissions = await Promise.all(staffPermissionKeys.map(key => prisma.permission.upsert({ where: { key }, update: {}, create: { key } })))
  const permissionByKey = new Map(permissions.map(permission => [permission.key, permission.id]))
  for (const [name, keys] of Object.entries(defaultRolePermissions)) {
    await prisma.staffRole.upsert({
      where: { name }, update: {}, create: { name, permissions: { create: keys.map(key => ({ permissionId: permissionByKey.get(key)! })) } },
    })
  }
  const bootstrapEmail = process.env.ERP_BOOTSTRAP_EMAIL?.trim().toLowerCase() || 'admin@admin.com'
  const bootstrapPassword = process.env.ERP_BOOTSTRAP_PASSWORD || 'P@55w0rd'
  if (bootstrapEmail && bootstrapPassword && process.env.NODE_ENV !== 'production') {
    if (bootstrapPassword.length < 8) throw new Error('ERP_BOOTSTRAP_PASSWORD must be at least 8 characters')
    const salt = randomBytes(16).toString('hex'); const derived = await scrypt(bootstrapPassword, salt, 64) as Buffer
    const passwordHash = `${salt}:${derived.toString('hex')}`
    const staff = await prisma.staffUser.upsert({ where: { email: bootstrapEmail }, update: { active: true, passwordHash }, create: { email: bootstrapEmail, passwordHash } })
    const role = await prisma.staffRole.findUniqueOrThrow({ where: { name: 'Super Admin' } })
    await prisma.staffUserRole.upsert({ where: { staffUserId_roleId: { staffUserId: staff.id, roleId: role.id } }, update: {}, create: { staffUserId: staff.id, roleId: role.id } })
  }
  for (const item of products) {
    const category = await prisma.category.upsert({ where: { handle: toHandle(item.category) }, update: {}, create: { name: item.category, handle: toHandle(item.category) } })
    await prisma.product.upsert({
      where: { handle: item.handle },
      update: { name: item.name, description: item.description, colourFamily: item.colourFamily, undertone: item.undertone, categoryId: category.id, status: ProductStatus.ACTIVE },
      create: { name: item.name, handle: item.handle, description: item.description, colourFamily: item.colourFamily, undertone: item.undertone, categoryId: category.id, status: ProductStatus.ACTIVE, variants: { create: { name: 'Default', sku: item.sku, price: item.price, inventory: { create: { quantity: 20 } } } } },
    })
  }
  await prisma.store.upsert({ where: { id: 'nilam-jakarta' }, update: {}, create: { id: 'nilam-jakarta', name: 'Nilam Jakarta', address: 'Jl. Kemang Raya No. 1', city: 'Jakarta Selatan', province: 'DKI Jakarta', phone: '+62 21 555 0101' } })
}

main().then(() => prisma.$disconnect()).catch(async (error: unknown) => { console.error(error); await prisma.$disconnect(); process.exit(1) })
