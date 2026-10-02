import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { FiArrowLeft } from 'react-icons/fi'
import { Footer } from '../components/Footer'
import { Header } from '../components/Header'
import { ProductCard } from '../components/ProductCard'
import { fallbackProducts, getProducts } from '../lib/products'
import type { Product } from '../types/product'
import './catalogue.css'

function ProductGrid({ title, query }: { title: string; query: string }) {
  const [products, setProducts] = useState<Product[]>(fallbackProducts)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  useEffect(() => { getProducts(query).then(items => { setProducts(items); setStatus('ready') }).catch(() => setStatus('error')) }, [query])
  return <><Header /><main className="catalogue"><Link className="back-link" to="/"><FiArrowLeft /> Back to home</Link><p className="eyebrow">Nilam collection</p><h1>{title}</h1><div className="catalogue-toolbar"><span>{status === 'loading' ? 'Finding pieces…' : `${products.length} pieces`}</span><span>Thoughtfully selected</span></div>{status === 'error' && <p className="catalogue-notice">Showing our editorial selection while the catalogue reconnects.</p>}{products.length ? <div className="grid catalogue-grid">{products.map(product => <ProductCard key={product.id} product={product} />)}</div> : <div className="empty-state"><h2>Nothing here just yet.</h2><p>Try another collection or return soon for new arrivals.</p><Link className="button" to="/collections/all">Browse all pieces</Link></div>}</main><Footer /></>
}

export function CollectionPage() {
  const { handle = 'all' } = useParams()
  const title = handle === 'all' ? 'All pieces' : handle.replaceAll('-', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
  return <ProductGrid title={title} query={handle === 'all' || handle === 'new-arrival' ? '' : `category=${encodeURIComponent(handle)}`} />
}

export function SearchPage() {
  const [params] = useSearchParams()
  const query = params.get('q') || ''
  return <ProductGrid title={query ? `Results for “${query}”` : 'Search Nilam'} query={query ? `q=${encodeURIComponent(query)}` : ''} />
}
