import assert from 'node:assert/strict'
import test from 'node:test'
import { parseStockImportCsv } from './stockImport.js'

const header = 'sku,quantity,warehouse,effective_at,source_reference,reason'
const row = (overrides: Partial<Record<'sku' | 'quantity' | 'warehouse' | 'effective_at' | 'source_reference' | 'reason', string>> = {}) => [
  overrides.sku ?? 'NILAM-001', overrides.quantity ?? '12', overrides.warehouse ?? 'MAIN',
  overrides.effective_at ?? '2026-10-03T09:00:00+07:00', overrides.source_reference ?? 'stocktake-2026-10-03', overrides.reason ?? 'Stocktake',
].join(',')

test('accepts a valid UTF-8 inventory import row', () => {
  const result = parseStockImportCsv(`${header}\n${row()}`)
  assert.deepEqual(result.errors, [])
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0]?.sku, 'NILAM-001')
  assert.equal(result.rows[0]?.quantity, '12')
})

test('rejects malformed templates, duplicate SKUs, and unsafe formulas', () => {
  assert.match(parseStockImportCsv('sku,quantity\nNILAM-001,2').errors[0] || '', /Missing required columns/)
  const duplicate = parseStockImportCsv(`${header}\n${row()}\n${row()}`)
  assert.ok(duplicate.errors.some(error => error.includes('duplicate SKU NILAM-001')))
  const formula = parseStockImportCsv(`${header}\n${row({ reason: '=HYPERLINK("https://example.invalid")' })}`)
  assert.ok(formula.errors.some(error => error.includes('spreadsheet formulas are not allowed')))
})

test('rejects non-integer quantities and files beyond the row limit', () => {
  const invalidQuantity = parseStockImportCsv(`${header}\n${row({ quantity: '1.5' })}`)
  assert.ok(invalidQuantity.errors.some(error => error.includes('quantity must be a non-negative whole number')))
  const oversized = `${header}\n${Array.from({ length: 10001 }, (_, index) => row({ sku: `NILAM-${index}` })).join('\n')}`
  const result = parseStockImportCsv(oversized)
  assert.ok(result.errors.includes('The file exceeds the 10,000-row limit.'))
})
