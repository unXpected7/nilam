import { useEffect, useState } from 'react'
import { FiArrowRight, FiSearch } from 'react-icons/fi'
import { Link, Route, Routes, useNavigate } from 'react-router-dom'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { ProductCard } from './components/ProductCard'
import { fallbackProducts, getProducts } from './lib/products'
import type { Product } from './types/product'
import { CollectionPage, SearchPage } from './pages/Catalogue'
import { ProductPage } from './pages/ProductPage'
import { ContentPage, StoresPage } from './pages/ContentPages'
import { CartPage } from './pages/CartPage'
import { AccountPage } from './pages/AccountPage'
import { FaqAccordion, ProductPrinciples, StoryCard, StyleExplorer } from './components/EditorialModules'
import './App.css'
import './media-placeholders.css'

function HomePage() {
  const [products, setProducts] = useState<Product[]>(fallbackProducts)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()
  useEffect(() => { getProducts().then(setProducts).catch(() => undefined) }, [])
  const categories = [{ name: 'New arrival', handle: 'new-arrival' }, { name: 'Scarves', handle: 'scarves' }, { name: 'Modest apparel', handle: 'modest-apparel' }, { name: 'Family sets', handle: 'sarimbit' }, { name: 'Umrah & hajj', handle: 'umrah-and-hajj' }]
  return <><Header /><main><section className="hero"><div><p className="eyebrow">Everyday modesty, considered</p><h1>Feel at home in<br /><em>your own style.</em></h1><p className="hero-copy">Made to move with you—soft silhouettes, considered details, and colours that feel like you.</p><Link to="/collections/new-arrival" className="button">Shop the new collection <FiArrowRight /></Link></div><div className="hero-art" aria-hidden="true"><div className="hero-shape" /><div className="hero-media-placeholder">Nilam</div><span className="hero-tag">New season<br /><b>Keana Voal</b></span></div></section><form className="search-row" onSubmit={event => { event.preventDefault(); navigate(`/search?q=${encodeURIComponent(search)}`) }}><FiSearch /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="What are you looking for?" aria-label="Search products" /><button>Search</button></form><section id="categories" className="categories"><p className="eyebrow">Shop by category</p><div>{categories.map(({ name, handle }, i) => <Link to={`/collections/${handle}`} key={name}><span>0{i + 1}</span>{name}<FiArrowRight /></Link>)}</div></section><section id="discover" className="collection"><div className="section-heading"><div><p className="eyebrow">Just arrived</p><h2>Made for your every day</h2></div><Link to="/collections/all">View all <FiArrowRight /></Link></div><div className="grid">{products.map(product => <ProductCard key={product.id} product={product} />)}</div></section><section className="editorial"><div className="stories"><StoryCard eyebrow="A softer pace" title="Made for the in-between." copy="Small details, easy layers, and pieces that meet you wherever the day changes shape." /><StoryCard reverse eyebrow="A thoughtful wardrobe" title="The art of returning." copy="A considered wardrobe gives you familiar comfort and new ways to make it your own." /></div><ProductPrinciples /><StyleExplorer products={products} /><FaqAccordion /></section><section className="mission"><p className="eyebrow">Softly, surely, you</p><h2>Pieces for every version<br />of your day.</h2><p>Nilam celebrates the beauty in getting dressed with ease—where comfort, care, and confidence meet.</p><Link to="/pages/about" className="text-link">Discover the Nilam way <FiArrowRight /></Link></section></main><Footer /></>
}

function App() {
  return <Routes><Route path="/" element={<HomePage />} /><Route path="/collections/:handle" element={<CollectionPage />} /><Route path="/products/:handle" element={<ProductPage />} /><Route path="/search" element={<SearchPage />} /><Route path="/cart" element={<CartPage />} /><Route path="/account" element={<AccountPage />} /><Route path="/account/login" element={<AccountPage />} /><Route path="/account/register" element={<AccountPage />} /><Route path="/pages/stores" element={<StoresPage />} /><Route path="/pages/about" element={<ContentPage page="about" />} /><Route path="/pages/terms" element={<ContentPage page="terms" />} /><Route path="/pages/privacy" element={<ContentPage page="privacy" />} /><Route path="*" element={<HomePage />} /></Routes>
}
export default App
