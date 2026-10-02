import { PrismaClient, ProductStatus } from '@prisma/client'

const prisma = new PrismaClient()
const toHandle = (value: string) => value.toLowerCase().replace('&', 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const products = [
  { name: 'Keana Voal Scarf', handle: 'keana-voal-scarf', category: 'Scarves', description: 'A lightweight voal scarf designed for comfortable, everyday styling.', price: 169000, sku: 'NLM-KEANA-SAGE', colourFamily: 'sage', undertone: 'cool' },
  { name: 'Naya Buttoned Tunic', handle: 'naya-buttoned-tunic', category: 'Modest apparel', description: 'A soft, flowing tunic with a clean buttoned finish.', price: 359000, sku: 'NLM-NAYA-BLUSH', colourFamily: 'blush', undertone: 'warm' },
  { name: 'Raya Family Set', handle: 'raya-family-set', category: 'Sarimbit', description: 'Thoughtfully coordinated pieces for meaningful occasions.', price: 699000, sku: 'NLM-RAYA-OLIVE', colourFamily: 'olive', undertone: 'neutral' },
  { name: 'Amara Prayer Set', handle: 'amara-prayer-set', category: 'Umrah & Hajj', description: 'A practical and refined travel companion for worship.', price: 449000, sku: 'NLM-AMARA-CREAM', colourFamily: 'cream', undertone: 'warm' },
]

async function main() {
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
