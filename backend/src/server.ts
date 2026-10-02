import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { prisma } from './lib/prisma.js'

const app = express()
const port = Number(process.env.PORT) || 4000
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }))
app.use(express.json())
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
    res.json(products.map(product => ({
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
    res.json(product)
  } catch (error) { next(error) }
})
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error)
  res.status(500).json({ message: 'An unexpected error occurred' })
})
app.listen(port, () => console.log(`Nilam API listening on http://localhost:${port}`))
