/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from 'react'

export type Cart = {
  id: string
  itemCount: number
  subtotal: number
  items: Array<{ id: string; quantity: number; variant: { id: string; name: string; sku: string; price: number; available: number }; product: { name: string; handle: string; image: string } }>
}

type CartContextValue = { cart: Cart | null; loading: boolean; addItem: (variantId: string) => Promise<void>; updateItem: (id: string, quantity: number) => Promise<void>; removeItem: (id: string) => Promise<void> }
const CartContext = createContext<CartContextValue | undefined>(undefined)

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`/api/cart${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const body = await response.json()
  if (!response.ok) throw new Error(body.message || 'Unable to update your bag')
  return body as Cart
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { request('').then(setCart).catch(() => setCart(null)).finally(() => setLoading(false)) }, [])
  const addItem = useCallback(async (variantId: string) => setCart(await request('/items', { method: 'POST', body: JSON.stringify({ variantId, quantity: 1 }) })), [])
  const updateItem = useCallback(async (id: string, quantity: number) => setCart(await request(`/items/${id}`, { method: 'PATCH', body: JSON.stringify({ quantity }) })), [])
  const removeItem = useCallback(async (id: string) => setCart(await request(`/items/${id}`, { method: 'DELETE' })), [])
  return <CartContext.Provider value={{ cart, loading, addItem, updateItem, removeItem }}>{children}</CartContext.Provider>
}

export function useCart() {
  const value = useContext(CartContext)
  if (!value) throw new Error('useCart must be used inside CartProvider')
  return value
}
