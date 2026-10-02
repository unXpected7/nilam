import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FiArrowLeft, FiCheck, FiShoppingBag } from 'react-icons/fi'
import { Footer } from '../components/Footer'
import { Header } from '../components/Header'
import { ProductCard } from '../components/ProductCard'
import { fallbackProducts } from '../lib/products'
import type { Product, ProductDetail } from '../types/product'
import { useCart } from '../lib/cart'
import './catalogue.css'
import './product-recommendations.css'
import './product-media.css'

export function ProductPage() {
  const { handle = '' } = useParams()
  const fallback = fallbackProducts.find(item => item.handle === handle)
  const [product, setProduct] = useState<ProductDetail | undefined>(fallback)
  const [selected, setSelected] = useState(0)
  const [selectedImage, setSelectedImage] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [message, setMessage] = useState('')
  const [recommendations, setRecommendations] = useState<Product[]>([])
  const { addItem } = useCart()
  useEffect(() => { fetch(`/api/products/${handle}`).then(response => response.ok ? response.json() : Promise.reject()).then((result: ProductDetail) => { setProduct(result); document.title = `${result.name} — Nilam`; let description = document.querySelector('meta[name="description"]'); if (!description) { description = document.createElement('meta'); description.setAttribute('name', 'description'); document.head.append(description) }; description.setAttribute('content', result.description) }).catch(() => undefined) }, [handle])
  useEffect(() => { fetch(`/api/products/${handle}/recommendations`).then(response => response.ok ? response.json() : Promise.reject()).then(setRecommendations).catch(() => setRecommendations([])) }, [handle])
  if (!product) return <><Header /><main className="catalogue empty-state"><h1>Piece not found</h1><Link className="button" to="/collections/all">Browse the collection</Link></main><Footer /></>
  const images = product.media?.length ? product.media : [{ id: 'fallback', url: product.image, alt: product.name }]
  const variants = product.variants?.length ? product.variants : [{ id: 'default', name: 'One size', sku: '', price: product.price }]
  const variant = variants[selected] || variants[0]
  const available = variant.inventory?.quantity ?? 0
  const activeImage = images[Math.min(selectedImage, images.length - 1)]
  const addToCart = async () => { try { await addItem(variant.id, quantity); setMessage(`${quantity} ${quantity === 1 ? 'piece' : 'pieces'} added to your bag.`) } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to add this piece') } }
  return <><Header /><main className="product-page"><Link className="back-link" to="/collections/all"><FiArrowLeft /> Continue browsing</Link><div className="product-layout"><section className="product-gallery" aria-label={`${product.name} images`}>{activeImage.url ? <img src={activeImage.url} alt={activeImage.alt} width={activeImage.width || undefined} height={activeImage.height || undefined} /> : <div className="product-media-placeholder" role="img" aria-label={`${product.name} image will be added soon`}>Nilam</div>}{images.length > 1 && <div className="gallery-thumbnails" role="list">{images.map((image, index) => <button type="button" key={image.id} className={selectedImage === index ? 'selected' : ''} onClick={() => setSelectedImage(index)} aria-label={`Show image ${index + 1} of ${images.length}`} aria-current={selectedImage === index ? 'true' : undefined}>{image.url && <img src={image.url} alt="" />}</button>)}</div>}</section><section className="product-summary"><p className="eyebrow">{product.category} · New arrival</p><h1>{product.name}</h1><p className="product-price">Rp {variant.price.toLocaleString('id-ID')}</p><p className="product-copy">{product.description}</p><fieldset><legend>Choose a style</legend><div className="variant-list">{variants.map((item, index) => <button type="button" className={selected === index ? 'selected' : ''} onClick={() => { setSelected(index); setQuantity(1); setMessage('') }} key={item.id}>{item.name}</button>)}</div></fieldset><p className="availability">{available > 0 ? `${available} available` : 'Currently unavailable'}</p>{available > 0 && <div className="product-quantity"><span>Quantity</span><div><button type="button" onClick={() => setQuantity(current => Math.max(1, current - 1))} aria-label="Decrease quantity">−</button><output aria-live="polite">{quantity}</output><button type="button" onClick={() => setQuantity(current => Math.min(available, current + 1))} aria-label="Increase quantity" disabled={quantity >= available}>+</button></div></div>}<button className="add-cart" disabled={!variant.id || available < 1} onClick={addToCart}><FiShoppingBag /> {available > 0 ? 'Add to bag' : 'Out of stock'}</button>{message && <p className="cart-message" role="status">{message} <Link to="/cart">Review bag</Link></p>}<ul className="product-benefits"><li><FiCheck /> Comfortable for everyday wear</li><li><FiCheck /> Carefully selected material and finish</li><li><FiCheck /> Easy 7-day returns</li></ul></section></div>{recommendations.length > 0 && <section className="product-recommendations"><div className="section-heading"><div><p className="eyebrow">More to explore</p><h2>Pairs beautifully with</h2></div><Link to={`/collections/all?category=${encodeURIComponent(product.category.toLowerCase().replaceAll(' ', '-').replace('&-', 'and-'))}`}>View collection</Link></div><div className="grid">{recommendations.map(item => <ProductCard key={item.id} product={item} />)}</div></section>}</main><Footer /></>
}
