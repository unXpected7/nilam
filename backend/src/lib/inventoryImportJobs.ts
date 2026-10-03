import { InventoryImportJobOperation, InventoryImportJobStatus, Prisma } from '@prisma/client'
import { prisma } from './prisma.js'

const staleJobMilliseconds = 10 * 60 * 1000
const failureMessage = (error: unknown) => (error instanceof Error ? error.message : 'Unknown inventory import job failure').slice(0, 1000)
async function serializableTransaction<T>(callback: (transaction: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await prisma.$transaction(callback, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }) } catch (error) {
      if (!(typeof error === 'object' && error && 'code' in error && error.code === 'P2034') || attempt === 2) throw error
    }
  }
  throw new Error('Inventory import transaction retry limit exceeded')
}

async function applyImport(importId: string, actor: string) {
  return serializableTransaction(async transaction => {
    const claimed = await transaction.inventoryImport.updateMany({ where: { id: importId, status: 'VALIDATED' }, data: { status: 'UPLOADED' } })
    if (!claimed.count) throw new Error('Only validated imports can be applied')
    const imported = await transaction.inventoryImport.findUniqueOrThrow({ where: { id: importId }, include: { rows: true } })
    if (imported.rows.some(row => row.error || row.quantity === null)) throw new Error('Imports with invalid rows cannot be applied')
    for (const row of imported.rows) {
      const variant = await transaction.productVariant.findUnique({ where: { sku: row.sku }, include: { inventory: true } })
      if (!variant) throw new Error(`SKU ${row.sku} no longer exists`)
      const inventory = variant.inventory || await transaction.inventory.create({ data: { variantId: variant.id, quantity: 0 } })
      const quantity = row.quantity!
      const delta = quantity - inventory.quantity
      if (delta !== 0) {
        const updated = await transaction.inventory.update({ where: { id: inventory.id }, data: { quantity } })
        await transaction.inventoryMovement.create({ data: { inventoryId: updated.id, previousQuantity: inventory.quantity, quantity, delta, reason: `import:${imported.id}:${row.reason}`, actor } })
      }
    }
    return transaction.inventoryImport.update({ where: { id: imported.id }, data: { status: 'APPLIED' } })
  })
}

async function rollbackImport(importId: string, actor: string) {
  return serializableTransaction(async transaction => {
    const claimed = await transaction.inventoryImport.updateMany({ where: { id: importId, status: 'APPLIED' }, data: { status: 'UPLOADED' } })
    if (!claimed.count) throw new Error('Only applied imports can be rolled back')
    const imported = await transaction.inventoryImport.findUniqueOrThrow({ where: { id: importId } })
    const rollbackHours = Number(process.env.INVENTORY_IMPORT_ROLLBACK_HOURS || 24)
    if (!Number.isInteger(rollbackHours) || rollbackHours < 1 || rollbackHours > 168) throw new Error('Invalid inventory import rollback window')
    if (imported.createdAt.getTime() + rollbackHours * 60 * 60 * 1000 < Date.now()) throw new Error('The import rollback window has expired')
    const movements = await transaction.inventoryMovement.findMany({ where: { reason: { startsWith: `import:${imported.id}:` } } })
    for (const movement of movements) {
      const inventory = await transaction.inventory.findUnique({ where: { id: movement.inventoryId } })
      if (!inventory || inventory.quantity !== movement.quantity) throw new Error(`Inventory changed after import for movement ${movement.id}; it cannot be safely rolled back`)
      const restored = await transaction.inventory.update({ where: { id: inventory.id }, data: { quantity: movement.previousQuantity } })
      await transaction.inventoryMovement.create({ data: { inventoryId: restored.id, previousQuantity: inventory.quantity, quantity: restored.quantity, delta: restored.quantity - inventory.quantity, reason: `rollback:${imported.id}`, actor } })
    }
    return transaction.inventoryImport.update({ where: { id: imported.id }, data: { status: 'ROLLED_BACK' } })
  })
}

export async function enqueueInventoryImportJob(importId: string, operation: InventoryImportJobOperation, actor: string) {
  const imported = await prisma.inventoryImport.findUnique({ where: { id: importId }, select: { id: true, status: true } })
  if (!imported) return null
  const expectedStatus = operation === InventoryImportJobOperation.APPLY ? 'VALIDATED' : 'APPLIED'
  if (imported.status !== expectedStatus) throw new Error(operation === InventoryImportJobOperation.APPLY ? 'Only validated imports can be applied' : 'Only applied imports can be rolled back')
  try { return await prisma.inventoryImportJob.create({ data: { importId, operation, actor } }) } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') throw new Error('An inventory import job is already in progress')
    throw error
  }
}

export async function processInventoryImportJob(jobId: string) {
  const claimed = await prisma.inventoryImportJob.updateMany({ where: { id: jobId, status: InventoryImportJobStatus.QUEUED }, data: { status: InventoryImportJobStatus.PROCESSING, attempts: { increment: 1 }, startedAt: new Date(), error: null } })
  if (!claimed.count) return null
  const job = await prisma.inventoryImportJob.findUniqueOrThrow({ where: { id: jobId } })
  try {
    const imported = job.operation === InventoryImportJobOperation.APPLY ? await applyImport(job.importId, job.actor) : await rollbackImport(job.importId, job.actor)
    return await prisma.inventoryImportJob.update({ where: { id: job.id }, data: { status: InventoryImportJobStatus.SUCCEEDED, finishedAt: new Date(), error: null, importId: imported.id } })
  } catch (error) {
    return prisma.inventoryImportJob.update({ where: { id: job.id }, data: { status: InventoryImportJobStatus.FAILED, finishedAt: new Date(), error: failureMessage(error) } })
  }
}

export async function processNextInventoryImportJob() {
  const staleBefore = new Date(Date.now() - staleJobMilliseconds)
  await prisma.inventoryImportJob.updateMany({ where: { status: InventoryImportJobStatus.PROCESSING, startedAt: { lt: staleBefore } }, data: { status: InventoryImportJobStatus.QUEUED, startedAt: null, error: 'Recovered after worker interruption' } })
  const candidate = await prisma.inventoryImportJob.findFirst({ where: { status: InventoryImportJobStatus.QUEUED }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  return candidate ? processInventoryImportJob(candidate.id) : null
}
