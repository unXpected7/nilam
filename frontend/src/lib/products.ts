import type { Product } from '../types/product'

export const fallbackProducts: Product[] = [
  { id: '1', handle: 'keana-voal-scarf', name: 'Keana Voal Scarf', category: 'Scarves', price: 169000, image: 'https://images.unsplash.com/photo-1583391733981-84984022984a?auto=format&fit=crop&w=1000&q=80', condition: 'New', description: 'A lightweight voal scarf designed for comfortable, everyday styling.' },
  { id: '2', handle: 'naya-buttoned-tunic', name: 'Naya Buttoned Tunic', category: 'Modest apparel', price: 359000, image: 'https://images.unsplash.com/photo-1581044777550-4cfa60707c03?auto=format&fit=crop&w=1000&q=80', condition: 'New', description: 'A soft, flowing tunic with a clean buttoned finish.' },
  { id: '3', handle: 'raya-family-set', name: 'Raya Family Set', category: 'Sarimbit', price: 699000, image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1000&q=80', condition: 'New', description: 'Thoughtfully coordinated pieces for meaningful occasions.' },
  { id: '4', handle: 'amara-prayer-set', name: 'Amara Prayer Set', category: 'Umrah & hajj', price: 449000, image: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=1000&q=80', condition: 'New', description: 'A practical and refined travel companion for worship.' },
]

export async function getProducts(query = ''): Promise<Product[]> {
  const response = await fetch(`/api/products${query ? `?${query}` : ''}`)
  if (!response.ok) throw new Error('Unable to load products')
  const body = await response.json() as Product[] | { items: Product[] }
  return Array.isArray(body) ? body : body.items
}
