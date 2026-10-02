export function checkoutConfig() {
  const taxRateBasisPoints = Number(process.env.CHECKOUT_TAX_RATE_BASIS_POINTS || 1100)
  if (!Number.isInteger(taxRateBasisPoints) || taxRateBasisPoints < 0 || taxRateBasisPoints > 10000) throw new Error('Invalid checkout tax rate configuration')
  return { country: 'ID', originPostalCode: process.env.BITESHIP_ORIGIN_POSTAL_CODE || '52412', taxRateBasisPoints }
}

export function calculateTax(subtotal: number) {
  if (!Number.isSafeInteger(subtotal) || subtotal < 0) throw new Error('Subtotal must be a non-negative IDR integer')
  return Math.round(subtotal * checkoutConfig().taxRateBasisPoints / 10_000)
}

export function voucherDefaults() {
  return { percentage: Number(process.env.VOUCHER_DEFAULT_PERCENTAGE || 20), minimumSubtotal: Number(process.env.VOUCHER_DEFAULT_MINIMUM_SUBTOTAL || 200000), maximumDiscount: Number(process.env.VOUCHER_DEFAULT_MAXIMUM_DISCOUNT || 30000), durationDays: Number(process.env.VOUCHER_DEFAULT_DURATION_DAYS || 7), codeLengthMin: Number(process.env.VOUCHER_CODE_LENGTH_MIN || 4), codeLengthMax: Number(process.env.VOUCHER_CODE_LENGTH_MAX || 6) }
}
