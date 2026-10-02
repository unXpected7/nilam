const requiredHeaders = ['sku', 'quantity', 'warehouse', 'effective_at', 'source_reference', 'reason'] as const
export type StockImportRow = Record<typeof requiredHeaders[number], string> & { batch?: string; expiry_date?: string }
export function parseStockImportCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim())
  if (lines.length < 2) return { rows: [] as StockImportRow[], errors: ['The file needs a header and at least one row.'] }
  const headers = lines[0].split(',').map(value => value.trim())
  const missing = requiredHeaders.filter(header => !headers.includes(header))
  if (missing.length) return { rows: [] as StockImportRow[], errors: [`Missing required columns: ${missing.join(', ')}`] }
  const rows: StockImportRow[] = []; const errors: string[] = []; const seen = new Set<string>()
  lines.slice(1, 10001).forEach((line, index) => { const values = line.split(',').map(value => value.trim()); const row = Object.fromEntries(headers.map((header, column) => [header, values[column] || ''])) as StockImportRow; const label = `Row ${index + 2}`; if (Object.values(row).some(value => /^[=+\-@]/.test(value))) errors.push(`${label}: spreadsheet formulas are not allowed`); else if (requiredHeaders.some(header => !row[header])) errors.push(`${label}: required values are missing`); else if (!/^\d+$/.test(row.quantity)) errors.push(`${label}: quantity must be a non-negative whole number`); else if (seen.has(row.sku)) errors.push(`${label}: duplicate SKU ${row.sku}`); else { seen.add(row.sku); rows.push(row) } })
  if (lines.length > 10001) errors.push('The file exceeds the 10,000-row limit.')
  return { rows, errors }
}
