import 'dotenv/config'
import assert from 'node:assert/strict'
import test from 'node:test'
import { InventoryImportJobOperation, InventoryImportJobStatus } from '@prisma/client'
import { enqueueInventoryImportJob, processInventoryImportJob } from '../lib/inventoryImportJobs.js'
import { prisma } from '../lib/prisma.js'

test('a failed import job is durable, records its error, and does not create movements', async () => {
  const marker = `integration-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const imported = await prisma.inventoryImport.create({ data: { sourceReference: marker, checksum: marker, actor: 'integration-test', status: 'VALIDATED', rows: { create: { rowNumber: 2, sku: `UNKNOWN-${marker}`, quantity: 1, warehouse: 'MAIN', reason: 'integration test' } } } })
  try {
    const queued = await enqueueInventoryImportJob(imported.id, InventoryImportJobOperation.APPLY, 'integration-test')
    assert.ok(queued)
    const processed = await processInventoryImportJob(queued.id)
    assert.equal(processed?.status, InventoryImportJobStatus.FAILED)
    assert.match(processed?.error || '', /no longer exists/)
    const [unchanged, movements] = await Promise.all([
      prisma.inventoryImport.findUniqueOrThrow({ where: { id: imported.id } }),
      prisma.inventoryMovement.count({ where: { reason: { startsWith: `import:${imported.id}:` } } }),
    ])
    assert.equal(unchanged.status, 'VALIDATED')
    assert.equal(movements, 0)
  } finally {
    await prisma.inventoryImport.delete({ where: { id: imported.id } }).catch(() => undefined)
  }
})

test('apply and rollback jobs write compensating movements and restore absolute on-hand stock', async () => {
  const marker = `integration-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const category = await prisma.category.create({ data: { name: marker, handle: marker } })
  const product = await prisma.product.create({ data: { name: marker, handle: marker, description: 'Integration test product', categoryId: category.id, variants: { create: { name: 'Default', sku: marker.toUpperCase(), price: 10_000, inventory: { create: { quantity: 3 } } } } }, include: { variants: { include: { inventory: true } } } })
  const variant = product.variants[0]!
  const imported = await prisma.inventoryImport.create({ data: { sourceReference: marker, checksum: marker, actor: 'integration-test', status: 'VALIDATED', rows: { create: { rowNumber: 2, sku: variant.sku, quantity: 8, warehouse: 'MAIN', reason: 'integration test' } } } })
  try {
    const applyJob = await enqueueInventoryImportJob(imported.id, InventoryImportJobOperation.APPLY, 'integration-test')
    assert.ok(applyJob)
    const applied = await processInventoryImportJob(applyJob.id)
    assert.equal(applied?.status, InventoryImportJobStatus.SUCCEEDED)
    const afterApply = await prisma.inventory.findUniqueOrThrow({ where: { variantId: variant.id } })
    assert.equal(afterApply.quantity, 8)
    const rollbackJob = await enqueueInventoryImportJob(imported.id, InventoryImportJobOperation.ROLLBACK, 'integration-test')
    assert.ok(rollbackJob)
    const rolledBack = await processInventoryImportJob(rollbackJob.id)
    assert.equal(rolledBack?.status, InventoryImportJobStatus.SUCCEEDED)
    const [afterRollback, appliedImport, movements] = await Promise.all([
      prisma.inventory.findUniqueOrThrow({ where: { variantId: variant.id } }),
      prisma.inventoryImport.findUniqueOrThrow({ where: { id: imported.id } }),
      prisma.inventoryMovement.findMany({ where: { inventoryId: afterApply.id }, orderBy: { createdAt: 'asc' } }),
    ])
    assert.equal(afterRollback.quantity, 3)
    assert.equal(appliedImport.status, 'ROLLED_BACK')
    assert.deepEqual(movements.map(movement => [movement.previousQuantity, movement.quantity, movement.delta]), [[3, 8, 5], [8, 3, -5]])
  } finally {
    await prisma.inventoryImport.delete({ where: { id: imported.id } }).catch(() => undefined)
    await prisma.product.delete({ where: { id: product.id } }).catch(() => undefined)
    await prisma.category.delete({ where: { id: category.id } }).catch(() => undefined)
  }
})

test('rollback fails closed when stock changed after the import was applied', async () => {
  const marker = `integration-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const category = await prisma.category.create({ data: { name: marker, handle: marker } })
  const product = await prisma.product.create({ data: { name: marker, handle: marker, description: 'Integration test product', categoryId: category.id, variants: { create: { name: 'Default', sku: marker.toUpperCase(), price: 10_000, inventory: { create: { quantity: 3 } } } } }, include: { variants: { include: { inventory: true } } } })
  const variant = product.variants[0]!
  const imported = await prisma.inventoryImport.create({ data: { sourceReference: marker, checksum: marker, actor: 'integration-test', status: 'VALIDATED', rows: { create: { rowNumber: 2, sku: variant.sku, quantity: 8, warehouse: 'MAIN', reason: 'integration test' } } } })
  try {
    const applyJob = await enqueueInventoryImportJob(imported.id, InventoryImportJobOperation.APPLY, 'integration-test')
    assert.ok(applyJob)
    assert.equal((await processInventoryImportJob(applyJob.id))?.status, InventoryImportJobStatus.SUCCEEDED)
    await prisma.inventory.update({ where: { variantId: variant.id }, data: { quantity: 9 } })
    const rollbackJob = await enqueueInventoryImportJob(imported.id, InventoryImportJobOperation.ROLLBACK, 'integration-test')
    assert.ok(rollbackJob)
    const result = await processInventoryImportJob(rollbackJob.id)
    assert.equal(result?.status, InventoryImportJobStatus.FAILED)
    assert.match(result?.error || '', /cannot be safely rolled back/)
    const [inventory, unchangedImport, rollbackMovements] = await Promise.all([
      prisma.inventory.findUniqueOrThrow({ where: { variantId: variant.id } }),
      prisma.inventoryImport.findUniqueOrThrow({ where: { id: imported.id } }),
      prisma.inventoryMovement.count({ where: { reason: `rollback:${imported.id}` } }),
    ])
    assert.equal(inventory.quantity, 9)
    assert.equal(unchangedImport.status, 'APPLIED')
    assert.equal(rollbackMovements, 0)
  } finally {
    await prisma.inventoryImport.delete({ where: { id: imported.id } }).catch(() => undefined)
    await prisma.product.delete({ where: { id: product.id } }).catch(() => undefined)
    await prisma.category.delete({ where: { id: category.id } }).catch(() => undefined)
  }
})
