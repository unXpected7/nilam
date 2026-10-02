import type { NextFunction, Request, Response } from 'express'
import { currentStaff } from '../lib/staffAuth.js'
import type { StaffPermissionKey } from '../lib/staffPermissions.js'

declare global { namespace Express { interface Locals { staff?: Awaited<ReturnType<typeof currentStaff>> } } }

export async function requireStaff(request: Request, response: Response, next: NextFunction) {
  try {
    const staff = await currentStaff(request.header('cookie'))
    if (!staff) { response.status(401).json({ message: 'Staff authentication required' }); return }
    response.locals.staff = staff
    next()
  } catch (error) { next(error) }
}

export function requirePermission(permission: StaffPermissionKey) {
  return (_request: Request, response: Response, next: NextFunction) => {
    if (!response.locals.staff?.permissions.has(permission)) { response.status(403).json({ message: 'You do not have permission for this action' }); return }
    next()
  }
}
