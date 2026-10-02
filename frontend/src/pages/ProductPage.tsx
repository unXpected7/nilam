import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FiArrowLeft, FiCheck, FiShoppingBag } from 'react-icons/fi'
import { Footer } from '../components/Footer'
import { Header } from '../components/Header'
import { fallbackProducts } from '../lib/products'
import type { ProductDetail } from '../types/product'
import { useCart } from '../lib/cart'
import './catalogue.css'

export function ProductPage() {
  const { handle = '' } = useParams()
  const fallback = fallbackProducts.find(item => item.handle === handle)
  const [product, setProduct] = useState<ProductDetail | undefined>(fallback)
  const [selected, setSelected] = useState(0)
  const [message, setMessage] = useState('')
  const { addItem } = useCart()
  useEffect(() => { fetch(`/api/products/${handle}`).then(response => response.ok ? response.json() : Promise.reject()).then(setProduct).catch(() => undefined) }, [handle])
  if (!product) return <><Header /><main className="catalogue empty-state"><h1>Piece not found</h1><Link className="button" to="/collections/all">Browse the collection</Link></main><Footer /></>
  const images = product.media?.length ? product.media : [{ id: 'fallback', url: product.image, alt: product.name }]
  const variants = product.variants?.length ? product.variants : [{ id: 'default', name: 'One size', sku: '', price: product.price }]
  const variant = variants[selected] || variants[0]
  const available = variant.inventory?.quantity ?? 0
  const addToCart = async () => { try { await addItem(variant.id); setMessage('Added to your bag.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to add this piece') } }
  return <><Header /><main className="product-page"><Link className="back-link" to="/collections/all"><FiArrowLeft /> Continue browsing</Link><div className="product-layout"><section className="product-gallery"><img src={images[0].url} alt={images[0].alt} /><div>{images.slice(1).map(image => <img key={image.id} src={image.url} alt={image.alt} />)}</div></section><section className="product-summary"><p className="eyebrow">{product.category} · New arrival</p><h1>{product.name}</h1><p className="product-price">Rp {variant.price.toLocaleString('id-ID')}</p><p className="product-copy">{product.description}</p><fieldset><legend>Choose a style</legend><div className="variant-list">{variants.map((item, index) => <button className={selected === index ? 'selected' : ''} onClick={() => { setSelected(index); setMessage('') }} key={item.id}>{item.name}</button>)}</div></fieldset><p className="availability">{available > 0 ? `${available} available` : 'Currently unavailable'}</p><button className="add-cart" disabled={!variant.id || available < 1} onClick={addToCart}><FiShoppingBag /> {available > 0 ? 'Add to bag' : 'Out of stock'}</button>{message && <p className="cart-message" role="status">{message}</p>}<ul className="product-benefits"><li><FiCheck /> Comfortable for everyday wear</li><li><FiCheck /> Carefully selected material and finish</li><li><FiCheck /> Easy 7-day returns</li></ul></section></div></main><Footer /></>
}
