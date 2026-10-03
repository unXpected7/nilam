import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Footer } from '../components/Footer'
import { Header } from '../components/Header'
import { useAuth } from '../lib/auth'
import './account.css'

type Order = { id: string; orderNumber: string | null; status: string; paymentStatus: string; fulfillmentStatus: string; subtotal: number; discount: number; shipping: number; tax: number; total: number; createdAt: string; items: Array<{ id: string; name: string; sku: string; price: number; quantity: number }>; events: Array<{ id: string; event: string; createdAt: string }> }
export function OrderDetailPage() {
  const { id = '' } = useParams(); const { user, loading } = useAuth(); const [order, setOrder] = useState<Order | null>(null); const [error, setError] = useState('')
  useEffect(() => { if (!user) return; fetch(`/api/auth/orders/${encodeURIComponent(id)}`).then(async response => { const body = await response.json() as Order | { message?: string }; if (!response.ok) throw new Error('message' in body ? body.message : 'Unable to load order'); return body as Order }).then(setOrder).catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to load order')) }, [id, user])
  if (loading) return <><Header /><main className="account-page"><p>Checking your account…</p></main><Footer /></>
  if (!user) return <Navigate to="/account/login?returnTo=%2Faccount" replace />
  return <><Header /><main className="account-page"><Link className="back-link" to="/account">Back to your account</Link><p className="eyebrow">Your Nilam order</p>{error ? <p className="account-error">{error}</p> : !order ? <p className="account-note">Loading your order…</p> : <><h1>Order {order.orderNumber || order.id.slice(-8).toUpperCase()}</h1><p className="account-copy">Order: {order.status.toLowerCase()} · Payment: {order.paymentStatus.toLowerCase()} · Fulfilment: {order.fulfillmentStatus.toLowerCase()}</p><ul className="order-detail-items">{order.items.map(item => <li key={item.id}>{item.name} · {item.sku} × {item.quantity} — Rp {(item.price * item.quantity).toLocaleString('id-ID')}</li>)}</ul><p><b>Total: Rp {order.total.toLocaleString('id-ID')}</b></p><section className="orders-section"><h2>Timeline</h2>{order.events.length ? <ul className="order-detail-items">{order.events.map(event => <li key={event.id}>{event.event.replaceAll('_', ' ').toLowerCase()} · {new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.createdAt))}</li>)}</ul> : <p className="account-note">No updates yet.</p>}</section></>}</main><Footer /></>
}
