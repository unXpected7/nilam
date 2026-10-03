import type { NextFunction, Request, Response } from 'express'
import { currentStaff } from '../lib/staffAuth.js'

export async function requireAdmin(request: Request, response: Response, next: NextFunction) {
  const staff = await currentStaff(request.header('cookie'))
  if (staff) { response.locals.staff = staff; next(); return }
  response.status(401).json({ message: 'Staff authentication required' })
}
