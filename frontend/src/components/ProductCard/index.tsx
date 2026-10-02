import type { Product } from '../../types/product'
import { FiHeart } from 'react-icons/fi'

export function ProductCard({ product }: { product: Product }) {
  return <article className="product-card"><div className="product-image"><img src={product.image} alt={product.name} loading="lazy" /><button aria-label={`Save ${product.name}`}><FiHeart /></button></div><div className="product-details"><p className="eyebrow">{product.category} {product.condition ? `· ${product.condition}` : ''}</p><h3>{product.name}</h3><p className="price">Rp {product.price.toLocaleString('id-ID')}</p>{product.seller && <p className="seller">by {product.seller}{product.location ? ` · ${product.location}` : ''}</p>}</div></article>
}
