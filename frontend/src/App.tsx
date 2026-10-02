import { useEffect, useState } from 'react'
import { FiArrowRight, FiSearch } from 'react-icons/fi'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { ProductCard } from './components/ProductCard'
import type { Product } from './types/product'
import './App.css'

const fallback: Product[] = [
  { id: '1', name: 'Handwoven rattan bowl', category: 'Home & living', price: 285000, seller: 'Rumah Rupa', location: 'Bandung', image: 'https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=800&q=80', condition: 'New', description: 'Made by hand from natural rattan.' },
  { id: '2', name: 'Linen camp collar shirt', category: 'Fashion', price: 420000, seller: 'Kolektif', location: 'Jakarta', image: 'https://images.unsplash.com/photo-1626497764746-6dc36546b388?auto=format&fit=crop&w=800&q=80', condition: 'New', description: 'Easy, breathable linen shirt.' },
  { id: '3', name: 'Vintage teak side table', category: 'Furniture', price: 850000, seller: 'Second Sunday', location: 'Yogyakarta', image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80', condition: 'Pre-loved', description: 'A finely aged solid-teak piece.' },
  { id: '4', name: 'Stoneware coffee set', category: 'Home & living', price: 325000, seller: 'Bumi Studio', location: 'Malang', image: 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=800&q=80', condition: 'New', description: 'A four-piece ceramic coffee set.' },
]

function App() {
  const [products, setProducts] = useState<Product[]>(fallback)
  useEffect(() => { fetch('/api/products').then(r => r.ok ? r.json() : Promise.reject()).then(setProducts).catch(() => undefined) }, [])
  return <><Header /><main><section className="hero"><div><p className="eyebrow">Everyday modesty, considered</p><h1>Feel at home in<br /><em>your own style.</em></h1><p className="hero-copy">Made to move with you—soft silhouettes, considered details, and colours that feel like you.</p><a href="#discover" className="button">Shop the new collection <FiArrowRight /></a></div><div className="hero-art"><div className="hero-shape" /><span className="hero-tag">New season<br /><b>Keana Voal</b></span><img src="https://images.unsplash.com/photo-1581044777550-4cfa60707c03?auto=format&fit=crop&w=1200&q=85" alt="A model in a soft modest outfit" /></div></section><section className="search-row"><FiSearch /><input placeholder="What are you looking for?" aria-label="Search products" /><button>Search</button></section><section id="categories" className="categories"><p className="eyebrow">Shop by category</p><div>{['New arrival', 'Scarves', 'Modest apparel', 'Family sets', 'Umrah & hajj'].map((name, i) => <a href="#discover" key={name}><span>0{i + 1}</span>{name}<FiArrowRight /></a>)}</div></section><section id="discover" className="collection"><div className="section-heading"><div><p className="eyebrow">Just arrived</p><h2>Made for your every day</h2></div><a href="#discover">View all <FiArrowRight /></a></div><div className="grid">{products.map(product => <ProductCard key={product.id} product={product} />)}</div></section><section className="mission"><p className="eyebrow">Softly, surely, you</p><h2>Pieces for every version<br />of your day.</h2><p>Nilam celebrates the beauty in getting dressed with ease—where comfort, care, and confidence meet.</p><a href="#discover" className="text-link">Discover the Nilam way <FiArrowRight /></a></section></main><Footer /></>
}
export default App
