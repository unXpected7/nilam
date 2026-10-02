import { timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

export function requireAdmin(request: Request, response: Response, next: NextFunction) {
  const expected = process.env.ADMIN_API_TOKEN
  const received = request.header('x-admin-token')
  if (!expected) { response.status(503).json({ message: 'Admin API is not configured' }); return }
  if (!received || expected.length !== received.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(received))) { response.status(401).json({ message: 'Admin authentication required' }); return }
  next()
}
