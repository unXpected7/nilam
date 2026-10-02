import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { FiArrowLeft, FiSliders } from 'react-icons/fi'
import { Footer } from '../components/Footer'
import { Header } from '../components/Header'
import { ProductCard } from '../components/ProductCard'
import { fallbackProducts, getProductFacets, getProductPage } from '../lib/products'
import type { ProductFacets } from '../lib/products'
import type { Product } from '../types/product'
import './catalogue.css'
import './catalogue-filters.css'

const fallbackFacets: ProductFacets = { categories: [{ label: 'Scarves', value: 'scarves', count: 0 }, { label: 'Modest apparel', value: 'modest-apparel', count: 0 }, { label: 'Family sets', value: 'sarimbit', count: 0 }, { label: 'Umrah & hajj', value: 'umrah-and-hajj', count: 0 }], colours: [] }

function ProductGrid({ title, fixedQuery = '' }: { title: string; fixedQuery?: string }) {
  const [products, setProducts] = useState<Product[]>(fallbackProducts)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [pagination, setPagination] = useState<{ page: number; total: number; totalPages: number } | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [facets, setFacets] = useState<ProductFacets>(fallbackFacets)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [params, setParams] = useSearchParams()
  const request = useMemo(() => {
    const next = new URLSearchParams(fixedQuery)
    params.forEach((value, key) => next.set(key, value))
    next.delete('page')
    return next.toString()
  }, [fixedQuery, params])

  useEffect(() => {
    getProductPage(request).then(result => { setProducts(result.items); setPagination(result.pagination); setStatus('ready') }).catch(() => setStatus('error'))
  }, [request])
  useEffect(() => { getProductFacets().then(setFacets).catch(() => undefined) }, [])

  const setFilter = (name: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value); else next.delete(name)
    setParams(next)
  }
  const clearFilters = () => setParams(params.has('q') ? { q: params.get('q') || '' } : {})
  const activeFilters = [
    ['category', facets.categories.find(category => category.value === params.get('category'))?.label || params.get('category')],
    ['colourFamily', params.get('colourFamily')], ['availability', params.get('availability') === 'in-stock' ? 'In stock' : ''],
    ['minPrice', params.get('minPrice') ? `From Rp ${Number(params.get('minPrice')).toLocaleString('id-ID')}` : ''],
    ['maxPrice', params.get('maxPrice') ? `Up to Rp ${Number(params.get('maxPrice')).toLocaleString('id-ID')}` : ''],
  ].filter((item): item is [string, string] => Boolean(item[1]))
  const activeFilterCount = activeFilters.length
  const removeFilter = (name: string) => setFilter(name, '')
  const loadMore = async () => {
    if (!pagination || pagination.page >= pagination.totalPages || loadingMore) return
    setLoadingMore(true)
    try {
      const next = new URLSearchParams(request)
      next.set('page', String(pagination.page + 1))
      const result = await getProductPage(next.toString())
      setProducts(current => [...current, ...result.items])
      setPagination(result.pagination)
    } finally { setLoadingMore(false) }
  }
  const filterControls = <div className="catalogue-filters"><label>Sort by<select value={params.get('sort') || 'newest'} onChange={event => setFilter('sort', event.target.value)}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="name">Name, A–Z</option></select></label><label>Category<select value={params.get('category') || ''} onChange={event => setFilter('category', event.target.value)}><option value="">All categories</option>{facets.categories.map(category => <option key={category.value} value={category.value}>{category.label}{category.count ? ` (${category.count})` : ''}</option>)}</select></label><label>Colour<select value={params.get('colourFamily') || ''} onChange={event => setFilter('colourFamily', event.target.value)}><option value="">All colours</option>{facets.colours.map(colour => <option key={colour.value} value={colour.value}>{colour.value} ({colour.count})</option>)}</select></label><label>Price range<div className="price-range"><input type="number" min="0" inputMode="numeric" placeholder="From" aria-label="Minimum price" value={params.get('minPrice') || ''} onChange={event => setFilter('minPrice', event.target.value)} /><input type="number" min="0" inputMode="numeric" placeholder="To" aria-label="Maximum price" value={params.get('maxPrice') || ''} onChange={event => setFilter('maxPrice', event.target.value)} /></div></label><label className="availability-filter"><input type="checkbox" checked={params.get('availability') === 'in-stock'} onChange={event => setFilter('availability', event.target.checked ? 'in-stock' : '')} /> In stock only</label><button type="button" className="clear-filters" onClick={clearFilters} disabled={!activeFilterCount}>Clear filters</button></div>

  return <><Header /><main className="catalogue"><Link className="back-link" to="/"><FiArrowLeft /> Back to home</Link><p className="eyebrow">Nilam collection</p><h1>{title}</h1><div className="catalogue-toolbar"><span>{status === 'loading' ? 'Finding pieces…' : `${pagination?.total ?? products.length} pieces`}</span><button type="button" className="filter-toggle" onClick={() => setFiltersOpen(open => !open)} aria-expanded={filtersOpen} aria-controls="catalogue-filters"><FiSliders /> Filter{activeFilterCount ? ` (${activeFilterCount})` : ''}</button></div>{activeFilters.length > 0 && <div className="active-filters" aria-label="Active filters">{activeFilters.map(([name, label]) => <button key={name} type="button" onClick={() => removeFilter(name)}>{label} <span aria-hidden="true">×</span><span className="sr-only">Remove filter</span></button>)}<button type="button" className="clear-all" onClick={clearFilters}>Clear all</button></div>}<div id="catalogue-filters" className={`catalogue-filter-panel ${filtersOpen ? 'is-open' : ''}`}>{filterControls}</div>{status === 'error' && <p className="catalogue-notice">Showing our editorial selection while the catalogue reconnects.</p>}{products.length ? <><div className="grid catalogue-grid">{products.map(product => <ProductCard key={product.id} product={product} />)}</div>{pagination && pagination.page < pagination.totalPages && <div className="load-more"><button type="button" className="button" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? 'Loading pieces…' : 'Load more pieces'}</button></div>}</> : <div className="empty-state"><h2>Nothing here just yet.</h2><p>Try clearing a filter or explore another collection.</p><button className="button" type="button" onClick={clearFilters}>Clear filters</button></div>}</main><Footer /></>
}

export function CollectionPage() {
  const { handle = 'all' } = useParams()
  const title = handle === 'all' ? 'All pieces' : handle.replaceAll('-', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
  const fixedQuery = handle === 'all' || handle === 'new-arrival' ? '' : `category=${encodeURIComponent(handle)}`
  return <ProductGrid title={title} fixedQuery={fixedQuery} />
}

export function SearchPage() {
  const [params] = useSearchParams()
  const query = params.get('q') || ''
  return <ProductGrid title={query ? `Results for “${query}”` : 'Search Nilam'} />
}
