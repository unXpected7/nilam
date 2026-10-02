import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import swaggerUi from 'swagger-ui-express'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { prisma } from './lib/prisma.js'
import { requireAdmin } from './middleware/adminAuth.js'
import { adminRouter } from './routes/admin.js'
import { authRouter, currentAuthenticatedUser } from './routes/auth.js'
import { openApiDocument } from './openapi.js'

const app = express()
const port = Number(process.env.PORT) || 4000
const currentDirectory = dirname(fileURLToPath(import.meta.url))
const adminUiDirectory = join(currentDirectory, '../admin-ui')
type StorefrontProduct = {
  id: string; handle: string; name: string; description: string
  colourFamily: string | null; undertone: string | null
  category: { name: string }; variants: Array<{ price: number }>; media: Array<{ objectKey: string | null }>
}

function managedMediaUrl(objectKey: string | null | undefined) {
  if (!objectKey) return ''
  const baseUrl = (process.env.MEDIA_PUBLIC_BASE_URL || 'https://media-topan.fluxorastudio.id').replace(/\/$/, '')
  const bucket = process.env.MEDIA_BUCKET || 'topan-media-prod'
  return `${baseUrl}/${bucket}/${objectKey}`
}

function displayDatabaseUrl(databaseUrl: string | undefined) {
  if (!databaseUrl) return 'DATABASE_URL is not set'

  try {
    const url = new URL(databaseUrl)
    if (url.password) url.password = '***'
    return url.toString()
  } catch {
    return '[invalid DATABASE_URL]'
  }
}

function pagination(query: express.Request['query']) {
  const requestedPage = Number(query.page ?? 1)
  const requestedLimit = Number(query.limit ?? 24)
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 48) : 24
  return { page, limit, skip: (page - 1) * limit }
}

function paged<T>(items: T[], total: number, page: number, limit: number) {
  return { items, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } }
}

function rateLimit(limit: number, windowMs: number) {
  const requests = new Map<string, { count: number; resetAt: number }>()
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = req.ip || 'unknown'; const now = Date.now(); const record = requests.get(key)
    const active = record && record.resetAt > now ? record : { count: 0, resetAt: now + windowMs }
    active.count += 1; requests.set(key, active)
    res.setHeader('RateLimit-Limit', String(limit)); res.setHeader('RateLimit-Reset', String(Math.ceil(active.resetAt / 1000)))
    if (active.count > limit) { res.status(429).json({ message: 'Too many requests. Please try again shortly.' }); return }
    next()
  }
}

app.set('trust proxy', 1)
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }))
app.use(express.json())
app.get('/swagger.json', (_request, response) => response.json(openApiDocument))
app.use('/swagger', swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: 'Nilam API documentation' }))
app.use('/api/admin', rateLimit(30, 60_000), requireAdmin, adminRouter)
app.use('/api/auth', rateLimit(10, 60_000), authRouter)
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ok', database: 'connected' })
  } catch {
    res.status(503).json({ status: 'unavailable', database: 'disconnected' })
  }
})
app.get('/api/products', rateLimit(120, 60_000), async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim()
    const category = String(req.query.category || '').trim()
    const colourFamily = String(req.query.colourFamily || '').trim()
    const availability = String(req.query.availability || '').trim()
    const minPrice = Number(req.query.minPrice)
    const maxPrice = Number(req.query.maxPrice)
    const { page, limit, skip } = pagination(req.query)
    const sort = String(req.query.sort || 'newest')
    const price = {
      ...(Number.isFinite(minPrice) && minPrice >= 0 ? { gte: Math.round(minPrice) } : {}),
      ...(Number.isFinite(maxPrice) && maxPrice >= 0 ? { lte: Math.round(maxPrice) } : {}),
    }
    const variantWhere = {
      ...(Object.keys(price).length ? { price } : {}),
      ...(availability === 'in-stock' ? { inventory: { is: { quantity: { gt: 0 } } } } : {}),
    }
    const where = {
      status: 'ACTIVE' as const,
      ...(category ? { category: { handle: category } } : {}),
      ...(colourFamily ? { colourFamily: { equals: colourFamily, mode: 'insensitive' as const } } : {}),
      ...(Object.keys(variantWhere).length ? { variants: { some: variantWhere } } : {}),
      ...(query ? { OR: [{ name: { contains: query, mode: 'insensitive' as const } }, { description: { contains: query, mode: 'insensitive' as const } }] } : {}),
    }
    const [products, total] = await Promise.all([prisma.product.findMany({
      where, skip, take: limit,
      include: { category: true, variants: { take: 1, orderBy: { price: 'asc' } }, media: { where: { objectKey: { not: null } }, take: 1, orderBy: { position: 'asc' } } },
      orderBy: sort === 'oldest' ? { createdAt: 'asc' } : sort === 'name' ? { name: 'asc' } : { createdAt: 'desc' },
    }), prisma.product.count({ where })])
    res.json(paged(products.map((product: StorefrontProduct) => ({
      id: product.id,
      handle: product.handle,
      name: product.name,
      category: product.category.name,
      price: product.variants[0]?.price ?? 0,
      image: managedMediaUrl(product.media[0]?.objectKey),
      description: product.description,
      colourFamily: product.colourFamily,
      undertone: product.undertone,
    })), total, page, limit))
  } catch (error) { next(error) }
})
app.get('/api/products/facets', rateLimit(120, 60_000), async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { status: 'ACTIVE' },
      select: { colourFamily: true, category: { select: { name: true, handle: true } } },
    })
    const categories = new Map<string, { label: string; count: number }>()
    const colours = new Map<string, number>()
    for (const product of products) {
      const category = categories.get(product.category.handle) || { label: product.category.name, count: 0 }
      category.count += 1; categories.set(product.category.handle, category)
      if (product.colourFamily) colours.set(product.colourFamily, (colours.get(product.colourFamily) || 0) + 1)
    }
    res.json({
      categories: Array.from(categories, ([value, { label, count }]) => ({ value, label, count })).sort((a, b) => a.label.localeCompare(b.label)),
      colours: Array.from(colours, ([value, count]) => ({ value, count })).sort((a, b) => a.value.localeCompare(b.value)),
    })
  } catch (error) { next(error) }
})
app.get('/api/products/:handle/recommendations', rateLimit(120, 60_000), async (req, res, next) => {
  try {
    const handle = typeof req.params.handle === 'string' ? req.params.handle : ''
    const product = await prisma.product.findFirst({ where: { handle, status: 'ACTIVE' }, select: { id: true, categoryId: true } })
    if (!product) { res.status(404).json({ message: 'Product not found' }); return }
    const recommendations = await prisma.product.findMany({
      where: { status: 'ACTIVE', categoryId: product.categoryId, id: { not: product.id } },
      take: 4,
      orderBy: { createdAt: 'desc' },
      include: { category: true, variants: { take: 1, orderBy: { price: 'asc' } }, media: { where: { objectKey: { not: null } }, take: 1, orderBy: { position: 'asc' } } },
    })
    res.json(recommendations.map((item: StorefrontProduct) => ({
      id: item.id, handle: item.handle, name: item.name, category: item.category.name,
      price: item.variants[0]?.price ?? 0, image: managedMediaUrl(item.media[0]?.objectKey), description: item.description,
      colourFamily: item.colourFamily, undertone: item.undertone,
    })))
  } catch (error) { next(error) }
})
app.get('/api/products/:handle', async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { handle: req.params.handle, status: 'ACTIVE' },
      include: { category: true, variants: { include: { inventory: true }, orderBy: { price: 'asc' } }, media: { where: { objectKey: { not: null } }, orderBy: { position: 'asc' } } },
    })
    if (!product) { res.status(404).json({ message: 'Product not found' }); return }
    res.json({ ...product, media: product.media.map(media => ({ ...media, url: managedMediaUrl(media.objectKey) })), category: product.category.name, image: managedMediaUrl(product.media[0]?.objectKey) })
  } catch (error) { next(error) }
})

function cartSessionId(req: express.Request, res: express.Response) {
  const match = req.header('cookie')?.match(/(?:^|;\s*)nilam_cart=([^;]+)/)
  const sessionId = match?.[1] || randomUUID()
  if (!match) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
    res.append('Set-Cookie', `nilam_cart=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`)
  }
  return sessionId
}

async function currentCart(req: express.Request, res: express.Response) {
  const include = { items: { include: { variant: { include: { product: { include: { media: { where: { objectKey: { not: null } }, take: 1, orderBy: { position: 'asc' as const } } } }, inventory: true } } }, orderBy: { id: 'asc' as const } } }
  const user = await currentAuthenticatedUser(req.header('cookie'))
  if (user) {
    const existing = await prisma.cart.findFirst({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' }, include })
    if (existing) return existing
    return prisma.cart.create({ data: { userId: user.id }, include })
  }
  const sessionId = cartSessionId(req, res)
  return prisma.cart.upsert({
    where: { sessionId }, create: { sessionId }, update: {},
    include,
  })
}

function cartResponse(cart: Awaited<ReturnType<typeof currentCart>>) {
  const items = cart.items.map(item => ({
    id: item.id, quantity: item.quantity,
    variant: { id: item.variant.id, name: item.variant.name, sku: item.variant.sku, price: item.variant.price, available: item.variant.inventory?.quantity ?? 0 },
    product: { name: item.variant.product.name, handle: item.variant.product.handle, image: managedMediaUrl(item.variant.product.media[0]?.objectKey) },
  }))
  return { id: cart.id, itemCount: items.reduce((total, item) => total + item.quantity, 0), subtotal: items.reduce((total, item) => total + item.quantity * item.variant.price, 0), items }
}

app.get('/api/collections', async (_req, res, next) => {
  try {
    const { page, limit, skip } = pagination(_req.query)
    const [collections, total] = await Promise.all([prisma.collection.findMany({ include: { _count: { select: { products: true } } }, orderBy: { name: 'asc' }, skip, take: limit }), prisma.collection.count()])
    res.json(paged(collections.map(collection => ({ ...collection, productCount: collection._count.products })), total, page, limit))
  } catch (error) { next(error) }
})

app.get('/api/collections/:handle', async (req, res, next) => {
  try {
    const { page, limit, skip } = pagination(req.query)
    const collection = await prisma.collection.findUnique({ where: { handle: req.params.handle } })
    if (!collection) { res.status(404).json({ message: 'Collection not found' }); return }
    const where = { collectionId: collection.id, product: { status: 'ACTIVE' as const } }
    const [memberships, total] = await Promise.all([prisma.productCollection.findMany({
      where, skip, take: limit, orderBy: { product: { createdAt: 'desc' } },
      include: { product: { include: { category: true, variants: { take: 1, orderBy: { price: 'asc' } }, media: { where: { objectKey: { not: null } }, take: 1, orderBy: { position: 'asc' } } } } },
    }), prisma.productCollection.count({ where })])
    res.json({
      id: collection.id, name: collection.name, handle: collection.handle, description: collection.description,
      ...paged(memberships.map(({ product }) => ({ id: product.id, handle: product.handle, name: product.name, category: product.category.name, price: product.variants[0]?.price ?? 0, image: managedMediaUrl(product.media[0]?.objectKey), description: product.description, colourFamily: product.colourFamily, undertone: product.undertone })), total, page, limit),
    })
  } catch (error) { next(error) }
})

app.get('/api/stores', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim()
    const { page, limit, skip } = pagination(req.query)
    const where = q ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { city: { contains: q, mode: 'insensitive' as const } }, { province: { contains: q, mode: 'insensitive' as const } }] } : undefined
    const [stores, total] = await Promise.all([prisma.store.findMany({ where, orderBy: [{ province: 'asc' }, { city: 'asc' }, { name: 'asc' }], skip, take: limit }), prisma.store.count({ where })])
    res.json(paged(stores, total, page, limit))
  } catch (error) { next(error) }
})

app.post('/api/newsletter', rateLimit(10, 60_000), async (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400).json({ message: 'A valid email address is required' }); return }
    await prisma.newsletterSubscriber.upsert({ where: { email }, update: {}, create: { email } })
    res.status(201).json({ message: 'You are subscribed' })
  } catch (error) { next(error) }
})

app.use('/api/cart', rateLimit(120, 60_000))
app.get('/api/cart', async (req, res, next) => {
  try { res.json(cartResponse(await currentCart(req, res))) } catch (error) { next(error) }
})

app.post('/api/cart/items', async (req, res, next) => {
  try {
    const variantId = typeof req.body?.variantId === 'string' ? req.body.variantId : ''
    const quantity = Number(req.body?.quantity ?? 1)
    if (!variantId || !Number.isInteger(quantity) || quantity < 1) { res.status(400).json({ message: 'A variant and positive whole quantity are required' }); return }
    const cart = await currentCart(req, res)
    const variant = await prisma.productVariant.findFirst({ where: { id: variantId, product: { status: 'ACTIVE' } }, include: { inventory: true } })
    if (!variant) { res.status(404).json({ message: 'Product variant not found' }); return }
    const existing = cart.items.find(item => item.variantId === variantId)
    const requested = (existing?.quantity ?? 0) + quantity
    if (requested > (variant.inventory?.quantity ?? 0)) { res.status(409).json({ message: 'This quantity is not available' }); return }
    await prisma.cartItem.upsert({ where: { cartId_variantId: { cartId: cart.id, variantId } }, update: { quantity: requested }, create: { cartId: cart.id, variantId, quantity } })
    res.status(201).json(cartResponse(await currentCart(req, res)))
  } catch (error) { next(error) }
})

app.patch('/api/cart/items/:id', async (req, res, next) => {
  try {
    const quantity = Number(req.body?.quantity)
    if (!Number.isInteger(quantity) || quantity < 0) { res.status(400).json({ message: 'quantity must be a non-negative whole number' }); return }
    const cart = await currentCart(req, res)
    const item = cart.items.find(value => value.id === req.params.id)
    if (!item) { res.status(404).json({ message: 'Cart item not found' }); return }
    if (quantity === 0) await prisma.cartItem.delete({ where: { id: item.id } })
    else {
      if (quantity > (item.variant.inventory?.quantity ?? 0)) { res.status(409).json({ message: 'This quantity is not available' }); return }
      await prisma.cartItem.update({ where: { id: item.id }, data: { quantity } })
    }
    res.json(cartResponse(await currentCart(req, res)))
  } catch (error) { next(error) }
})

app.delete('/api/cart/items/:id', async (req, res, next) => {
  try {
    const cart = await currentCart(req, res)
    const item = cart.items.find(value => value.id === req.params.id)
    if (!item) { res.status(404).json({ message: 'Cart item not found' }); return }
    await prisma.cartItem.delete({ where: { id: item.id } })
    res.json(cartResponse(await currentCart(req, res)))
  } catch (error) { next(error) }
})
app.use(express.static(adminUiDirectory))
app.get(['/', '/dashboard', '/products', '/categories', '/collections', '/inventory'], (_req, res) => res.sendFile(join(adminUiDirectory, 'index.html')))
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error)
  if (error instanceof Error) {
    res.status(400).json({ message: error.message })
    return
  }
  res.status(500).json({ message: 'An unexpected error occurred' })
})
app.listen(port, () => {
  console.log(`Nilam API listening on http://localhost:${port}`)
  console.log(`Database URL: ${displayDatabaseUrl(process.env.DATABASE_URL)}`)
})
