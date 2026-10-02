import { createHash, timingSafeEqual } from 'node:crypto'

type MidtransTransaction = { token: string; redirect_url: string }
type MidtransNotification = { order_id?: string; status_code?: string; gross_amount?: string; signature_key?: string; transaction_status?: string; fraud_status?: string; transaction_id?: string; payment_type?: string }

function config() {
  const serverKey = process.env.MIDTRANS_SERVER_KEY
  const clientKey = process.env.MIDTRANS_CLIENT_KEY
  if (!serverKey || !clientKey) throw new Error('Midtrans is not configured')
  return { serverKey, clientKey, snapUrl: process.env.MIDTRANS_SNAP_API_URL || 'https://app.sandbox.midtrans.com/snap/v1' }
}

export async function createMidtransSnap(orderId: string, grossAmount: number, customer: { firstName?: string; lastName?: string; email: string; phone?: string }) {
  if (!Number.isSafeInteger(grossAmount) || grossAmount < 1) throw new Error('Midtrans gross amount must be a positive IDR integer')
  const { serverKey, snapUrl } = config()
  const response = await fetch(`${snapUrl}/transactions`, { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ transaction_details: { order_id: orderId, gross_amount: grossAmount }, customer_details: customer }) })
  const body = await response.json() as MidtransTransaction & { status_message?: string }
  if (!response.ok || !body.token) throw new Error(body.status_message || 'Midtrans could not create a payment transaction')
  return body
}

export function verifyMidtransNotification(notification: MidtransNotification) {
  const { serverKey } = config()
  const { order_id: orderId, status_code: statusCode, gross_amount: grossAmount, signature_key: signature } = notification
  if (!orderId || !statusCode || !grossAmount || !signature) return false
  const expected = createHash('sha512').update(`${orderId}${statusCode}${grossAmount}${serverKey}`).digest('hex')
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))
}
