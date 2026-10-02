export type Product = {
  id: string
  handle?: string
  name: string
  category: string
  price: number
  seller?: string
  location?: string
  image: string
  condition: string
  description: string
  colourFamily?: string | null
  undertone?: string | null
}

export type ProductDetail = Product & {
  media?: Array<{ id: string; url: string; alt: string }>
  variants?: Array<{ id: string; name: string; sku: string; price: number; inventory?: { quantity: number } }>
}
