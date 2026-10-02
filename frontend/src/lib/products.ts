import type { Product } from '../types/product'

export const fallbackProducts: Product[] = [
  { id: '1', handle: 'keana-voal-scarf', name: 'Keana Voal Scarf', category: 'Scarves', price: 169000, image: '', condition: 'New', description: 'A lightweight voal scarf designed for comfortable, everyday styling.' },
  { id: '2', handle: 'naya-buttoned-tunic', name: 'Naya Buttoned Tunic', category: 'Modest apparel', price: 359000, image: '', condition: 'New', description: 'A soft, flowing tunic with a clean buttoned finish.' },
  { id: '3', handle: 'raya-family-set', name: 'Raya Family Set', category: 'Sarimbit', price: 699000, image: '', condition: 'New', description: 'Thoughtfully coordinated pieces for meaningful occasions.' },
  { id: '4', handle: 'amara-prayer-set', name: 'Amara Prayer Set', category: 'Umrah & hajj', price: 449000, image: '', condition: 'New', description: 'A practical and refined travel companion for worship.' },
]

export async function getProducts(query = ''): Promise<Product[]> {
  return (await getProductPage(query)).items
}

export type ProductPage = { items: Product[]; pagination: { page: number; limit: number; total: number; totalPages: number } }
export type ProductFacets = { categories: Array<{ value: string; label: string; count: number }>; colours: Array<{ value: string; count: number }> }

export async function getProductPage(query = ''): Promise<ProductPage> {
  const response = await fetch(`/api/products${query ? `?${query}` : ''}`)
  if (!response.ok) throw new Error('Unable to load products')
  const body = await response.json() as Product[] | ProductPage
  return Array.isArray(body) ? { items: body, pagination: { page: 1, limit: body.length, total: body.length, totalPages: 1 } } : body
}

export async function getProductFacets(): Promise<ProductFacets> {
  const response = await fetch('/api/products/facets')
  if (!response.ok) throw new Error('Unable to load product filters')
  return response.json() as Promise<ProductFacets>
}

export async function getCollection(handle: string): Promise<{ id: string; name: string; handle: string; description: string | null; items: Product[] }> {
  const response = await fetch(`/api/collections/${encodeURIComponent(handle)}`)
  if (!response.ok) throw new Error('Unable to load collection')
  return response.json() as Promise<{ id: string; name: string; handle: string; description: string | null; items: Product[] }>
}
