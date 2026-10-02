import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { prisma } from './lib/prisma.js'
import { requireAdmin } from './middleware/adminAuth.js'
import { adminRouter } from './routes/admin.js'

const app = express()
const port = Number(process.env.PORT) || 4000
const currentDirectory = dirname(fileURLToPath(import.meta.url))
const adminUiDirectory = join(currentDirectory, '../admin-ui')
type StorefrontProduct = {
  id: string; handle: string; name: string; description: string
  category: { name: string }; variants: Array<{ price: number }>; media: Array<{ url: string }>
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

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }))
app.use(express.json())
app.use('/api/admin', requireAdmin, adminRouter)
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ok', database: 'connected' })
  } catch {
    res.status(503).json({ status: 'unavailable', database: 'disconnected' })
  }
})
app.get('/api/products', async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim()
    const category = String(req.query.category || '').trim()
    const products = await prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        ...(category ? { category: { handle: category } } : {}),
        ...(query ? { OR: [{ name: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }] } : {}),
      },
      include: { category: true, variants: { take: 1, orderBy: { price: 'asc' } }, media: { take: 1, orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    })
    res.json(products.map((product: StorefrontProduct) => ({
      id: product.id,
      handle: product.handle,
      name: product.name,
      category: product.category.name,
      price: product.variants[0]?.price ?? 0,
      image: product.media[0]?.url ?? '',
      description: product.description,
    })))
  } catch (error) { next(error) }
})
app.get('/api/products/:handle', async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { handle: req.params.handle, status: 'ACTIVE' },
      include: { category: true, variants: { include: { inventory: true }, orderBy: { price: 'asc' } }, media: { orderBy: { position: 'asc' } } },
    })
    if (!product) { res.status(404).json({ message: 'Product not found' }); return }
    res.json({
      ...product,
      category: product.category.name,
      image: product.media[0]?.url ?? '',
    })
  } catch (error) { next(error) }
})
app.use(express.static(adminUiDirectory))
app.get('/', (_req, res) => res.sendFile(join(adminUiDirectory, 'index.html')))
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
