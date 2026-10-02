import { timingSafeEqual } from 'node:crypto'

function config() {
  const token = process.env.BITESHIP_API_TOKEN
  if (!token) throw new Error('Biteship is not configured')
  return { token, baseUrl: process.env.BITESHIP_API_BASE_URL || 'https://api.biteship.com' }
}

async function request<T>(path: string, body: unknown) {
  const { token, baseUrl } = config()
  const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { authorization: token, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) })
  const result = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(result.error || 'Biteship request failed')
  return result
}

export function getBiteshipRates(payload: Record<string, unknown>) { return request('/v1/rates/couriers', payload) }
export function createBiteshipOrder(payload: Record<string, unknown>) { return request('/v1/orders', payload) }

export function verifyBiteshipWebhook(received: string | undefined) {
  const expected = process.env.BITESHIP_WEBHOOK_SIGNATURE_SECRET
  if (!expected || !received || expected.length !== received.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received))
}
