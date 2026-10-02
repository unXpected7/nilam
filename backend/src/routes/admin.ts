import { Router } from 'express'
import { ProductStatus } from '@prisma/client'
import { prisma } from '../lib/prisma.js'

export const adminRouter = Router()
type AdminProductRow = Record<string, unknown> & {
  category: { name: string }
  variants: Array<{ inventory: { quantity: number } | null }>
  media: Array<{ url: string }>
}
type InventoryRow = { id: string; quantity: number; variant: { sku: string; name: string; product: { name: string; id: string } } }
type ProductPayload = {
  name?: unknown; handle?: unknown; description?: unknown; categoryId?: unknown; status?: unknown
  sku?: unknown; price?: unknown; quantity?: unknown; image?: unknown
}
type CategoryPayload = { name?: unknown; handle?: unknown }
type CollectionPayload = { name?: unknown; handle?: unknown; description?: unknown }

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
  }
}

async function assertCategory(categoryId: string) {
  if (!await prisma.category.findUnique({ where: { id: categoryId } })) throw new Error('category does not exist')
}

adminRouter.get('/dashboard', async (_request, response, next) => {
  try {
    const [productCount, orderCount, pendingOrders, lowStock] = await Promise.all([
      prisma.product.count({ where: { status: 'ACTIVE' } }),
      prisma.order.count(),
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.inventory.count({ where: { quantity: { lte: 5 } } }),
    ])
    response.json({ productCount, orderCount, pendingOrders, lowStock, netSales: 0 })
  } catch (error) { next(error) }
})

adminRouter.get('/products', async (request, response, next) => {
  try {
    const query = String(request.query.q || '').trim()
    const products = await prisma.product.findMany({
      where: query ? { OR: [{ name: { contains: query, mode: 'insensitive' } }, { handle: { contains: query, mode: 'insensitive' } }] } : undefined,
      include: { category: true, variants: { include: { inventory: true }, orderBy: { price: 'asc' } }, media: { take: 1, orderBy: { position: 'asc' } } },
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
    await prisma.adminAuditLog.create({ data: { actor: 'token-admin', action: 'category.create', entity: 'Category', entityId: category.id, payload: { handle: category.handle } } })
    response.status(201).json(category)
  } catch (error) { next(error) }
})

adminRouter.patch('/categories/:id', async (request, response, next) => {
  try {
    const existing = await prisma.category.findUnique({ where: { id: request.params.id } })
    if (!existing) { response.status(404).json({ message: 'Category not found' }); return }
    const category = await prisma.category.update({ where: { id: existing.id }, data: categoryFields(request.body as CategoryPayload) })
    await prisma.adminAuditLog.create({ data: { actor: 'token-admin', action: 'category.update', entity: 'Category', entityId: category.id, payload: { handle: category.handle } } })
    response.json(category)
  } catch (error) { next(error) }
})

adminRouter.delete('/categories/:id', async (request, response, next) => {
  try {
    const category = await prisma.category.findUnique({ where: { id: request.params.id }, include: { _count: { select: { products: true } } } })
    if (!category) { response.status(404).json({ message: 'Category not found' }); return }
    if (category._count.products > 0) { response.status(409).json({ message: 'Move or archive its products before deleting this category' }); return }
    await prisma.category.delete({ where: { id: category.id } })
    await prisma.adminAuditLog.create({ data: { actor: 'token-admin', action: 'category.delete', entity: 'Category', entityId: category.id, payload: { handle: category.handle } } })
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
    await prisma.adminAuditLog.create({ data: { actor: 'token-admin', action: 'collection.create', entity: 'Collection', entityId: collection.id, payload: { handle: collection.handle } } })
    response.status(201).json(collection)
  } catch (error) { next(error) }
})

adminRouter.patch('/collections/:id', async (request, response, next) => {
  try {
    const existing = await prisma.collection.findUnique({ where: { id: request.params.id } })
    if (!existing) { response.status(404).json({ message: 'Collection not found' }); return }
    const collection = await prisma.collection.update({ where: { id: existing.id }, data: collectionFields(request.body as CollectionPayload) })
    await prisma.adminAuditLog.create({ data: { actor: 'token-admin', action: 'collection.update', entity: 'Collection', entityId: collection.id, payload: { handle: collection.handle } } })
    response.json(collection)
  } catch (error) { next(error) }
})

adminRouter.delete('/collections/:id', async (request, response, next) => {
  try {
    const collection = await prisma.collection.findUnique({ where: { id: request.params.id }, include: { _count: { select: { products: true } } } })
    if (!collection) { response.status(404).json({ message: 'Collection not found' }); return }
    if (collection._count.products > 0) { response.status(409).json({ message: 'Remove its products before deleting this collection' }); return }
    await prisma.collection.delete({ where: { id: collection.id } })
    await prisma.adminAuditLog.create({ data: { actor: 'token-admin', action: 'collection.delete', entity: 'Collection', entityId: collection.id, payload: { handle: collection.handle } } })
    response.status(204).end()
  } catch (error) { next(error) }
})

adminRouter.post('/products', async (request, response, next) => {
  try {
    const body = request.body as ProductPayload
    const fields = productFields(body)
    await assertCategory(fields.categoryId)
    const sku = stringField(body.sku, 'sku')
    const price = Number(body.price)
    const quantity = Number(body.quantity)
    const image = stringField(body.image, 'image', false)
    if (!Number.isInteger(price) || price < 0) throw new Error('price must be a non-negative integer')
    if (!Number.isInteger(quantity) || quantity < 0) throw new Error('quantity must be a non-negative integer')
    const product = await prisma.product.create({
      data: {
        ...fields,
        ...(image ? { media: { create: { url: image, alt: fields.name, position: 0 } } } : {}),
        variants: { create: { name: 'Default', sku, price, inventory: { create: { quantity } } } },
      },
    })
    await prisma.adminAuditLog.create({ data: { actor: 'token-admin', action: 'product.create', entity: 'Product', entityId: product.id, payload: { handle: product.handle, sku } } })
    response.status(201).json(product)
  } catch (error) { next(error) }
})

adminRouter.patch('/products/:id', async (request, response, next) => {
  try {
    const fields = productFields(request.body as ProductPayload)
    await assertCategory(fields.categoryId)
    const existing = await prisma.product.findUnique({ where: { id: request.params.id } })
    if (!existing) { response.status(404).json({ message: 'Product not found' }); return }
    const product = await prisma.product.update({ where: { id: existing.id }, data: fields })
    await prisma.adminAuditLog.create({ data: { actor: 'token-admin', action: 'product.update', entity: 'Product', entityId: product.id, payload: { handle: product.handle, status: product.status } } })
    response.json(product)
  } catch (error) { next(error) }
})

adminRouter.get('/inventory', async (_request, response, next) => {
  try {
    const inventory = await prisma.inventory.findMany({ include: { variant: { include: { product: true } } }, orderBy: { quantity: 'asc' } })
    response.json(inventory.map((item: InventoryRow) => ({ id: item.id, quantity: item.quantity, sku: item.variant.sku, variant: item.variant.name, product: item.variant.product.name, productId: item.variant.product.id })))
  } catch (error) { next(error) }
})

adminRouter.patch('/inventory/:variantId', async (request, response, next) => {
  try {
    const quantity = Number(request.body?.quantity)
    if (!Number.isInteger(quantity) || quantity < 0) { response.status(400).json({ message: 'quantity must be a non-negative integer' }); return }
    const variant = await prisma.productVariant.findUnique({ where: { id: request.params.variantId } })
    if (!variant) { response.status(404).json({ message: 'Variant not found' }); return }
    const previous = await prisma.inventory.findUnique({ where: { variantId: variant.id } })
    const inventory = await prisma.inventory.upsert({ where: { variantId: variant.id }, update: { quantity }, create: { variantId: variant.id, quantity } })
    await prisma.adminAuditLog.create({ data: { actor: 'token-admin', action: 'inventory.adjust', entity: 'ProductVariant', entityId: variant.id, payload: { previousQuantity: previous?.quantity ?? 0, quantity } } })
    response.json(inventory)
  } catch (error) { next(error) }
})
