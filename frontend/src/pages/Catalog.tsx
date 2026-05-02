import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCatalogProducts, getCatalogProduct, updateCatalogProduct, getVariantHistory, getKeywords, createKeyword, deleteKeyword } from '../api'
import type { CatalogProduct, CatalogVariant } from '../types/extended'
import { SourcePicker } from '../components/SourcePicker'
import { PriceTrendBadge } from '../components/PriceTrendBadge'

interface VariantHistory {
  id: string
  price: number
  timestamp: string
}

interface VariantRowProps {
  variant: CatalogVariant
}

function VariantRow({ variant }: VariantRowProps): React.ReactElement {
  const { data: history = [] } = useQuery({
    queryKey: ['variantHistory', variant.id],
    queryFn: () => getVariantHistory(String(variant.id || '')),
    staleTime: 60_000,
  }) as { data: VariantHistory[] }

  const minEver = history.length > 0 ? Math.min(...history.map(h => h.price)) : (variant.price ?? 0)
  const aboveMin = minEver > 0 ? (((variant.price ?? 0) - minEver) / minEver * 100) : 0
  const isAtMin = (variant.price ?? 0) <= minEver && history.length > 1

  return (
    <div className="py-2 px-3 bg-gray-800 rounded">
      <div className="flex items-center gap-3">
        {variant.image_url && <img src={variant.image_url} alt="" className="w-10 h-10 object-contain bg-white rounded flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-300 truncate">{variant.title}</p>
          <p className="text-xs text-gray-500">{variant.source} {variant.variant_label && `| ${variant.variant_label}`}</p>
        </div>
        {/* Sparkline inline */}
        {history.length > 2 && (
          <div className="flex gap-px items-end h-6 w-16 flex-shrink-0">
            {history.slice(-12).map((h, i) => {
              const max = Math.max(...history.slice(-12).map(x => x.price))
              const min = Math.min(...history.slice(-12).map(x => x.price))
              const range = max - min || 1
              const pct = ((h.price - min) / range) * 100
              return <div key={i} className="flex-1 bg-green-800 rounded-t" style={{ height: `${Math.max(15, pct)}%` }} />
            })}
          </div>
        )}
        <div className="text-right flex-shrink-0 space-y-1">
          <div className="flex items-center gap-2 justify-end">
            <span className="text-green-400 text-sm font-medium whitespace-nowrap">R$ {(variant.price ?? 0).toFixed(2).replace('.', ',')}</span>
            {variant.id && <PriceTrendBadge variantId={Number(variant.id)} window="90d" />}
          </div>
          {history.length > 1 && (
            <p className={`text-xs ${isAtMin ? 'text-green-400' : aboveMin > 20 ? 'text-red-400' : 'text-gray-500'}`}>
              {isAtMin ? 'menor preco!' : `+${aboveMin.toFixed(0)}% do min`}
            </p>
          )}
        </div>
        <a href={variant.url} target="_blank" rel="noreferrer" className="text-xs text-gray-500 hover:text-green-400 transition-colors">🔗</a>
      </div>
    </div>
  )
}

interface ProductRowProps {
  product: CatalogProduct
}

function ProductRow({ product }: ProductRowProps): React.ReactElement {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)

  const { data: detail } = useQuery({
    queryKey: ['catalogDetail', product.id],
    queryFn: () => getCatalogProduct(String(product.id || '')),
    enabled: expanded,
  }) as { data?: CatalogProduct }

  const tags = useMemo(() => {
    try { return JSON.parse(product.tags || '[]') } catch { return [] }
  }, [product.tags])

  // Badge "novo" — produto criado nas últimas 24h
  const isNew = product.created_at && (Date.now() - new Date(product.created_at).getTime()) < 86400_000

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="p-4 flex items-start gap-3 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        {product.image_url && <img src={String(product.image_url)} alt="" className="w-16 h-16 object-contain bg-white rounded flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">
            {product.canonical_name}
            {isNew && <span className="ml-2 text-xs bg-green-900 text-green-300 px-1.5 py-0.5 rounded-full">novo</span>}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {product.brand && <span className="text-xs bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded">{String(product.brand || '')}</span>}
            {product.weight && <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{String(product.weight || '')}</span>}
            {tags.map((t: string) => <span key={t} className="text-xs bg-purple-900 text-purple-300 px-1.5 py-0.5 rounded">#{t}</span>)}
            <span className="text-xs text-gray-500">{product.variant_count} variante{product.variant_count !== 1 ? 's' : ''}</span>
            {product.lowest_price_source && detail?.variants?.some((v: CatalogVariant) => v.source !== String(product.lowest_price_source)) && (
              <span className="text-xs bg-cyan-900 text-cyan-300 px-1.5 py-0.5 rounded">multi-source</span>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-lg font-bold text-green-400">R$ {(typeof product.lowest_price === 'number' ? product.lowest_price : 0).toFixed(2).replace('.', ',')}</p>
          <p className="text-xs text-gray-500">{String(product.lowest_price_source || '')}</p>
        </div>
        <span className="text-gray-500 text-sm">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && detail && (
        <div className="px-4 pb-4 border-t border-gray-800 pt-3 space-y-2">
          {(detail.variants || []).map((v: CatalogVariant) => <VariantRow key={v.id} variant={v} />)}
        </div>
      )}
    </div>
  )
}

interface CatalogParams {
  limit: number
  offset: number
  search?: string
  tag?: string
  brand?: string
  source?: string
}

interface NewKeywordForm {
  keyword: string
  tag: string
}

export default function Catalog(): React.ReactElement {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string[]>([])
  const [page, setPage] = useState(0)
  const [showKeywords, setShowKeywords] = useState(false)
  const [newKw, setNewKw] = useState<NewKeywordForm>({ keyword: '', tag: '' })
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearchDebounced(search), 400)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [search])

  useEffect(() => { setPage(0) }, [searchDebounced, tagFilter, brandFilter, sourceFilter])

  const params: CatalogParams = {
    limit: 30, offset: page * 30,
    ...(searchDebounced && { search: searchDebounced }),
    ...(tagFilter && { tag: tagFilter }),
    ...(brandFilter && { brand: brandFilter }),
    ...(sourceFilter.length > 0 && { source: sourceFilter.join(',') }),
  }

  const { data: pageData, isLoading } = useQuery({
    queryKey: ['catalog', params],
    queryFn: async () => {
      const result = await getCatalogProducts(params) as any
      return { items: result.items || result, total: result.total || (Array.isArray(result) ? result.length : 0) }
    },
    refetchInterval: 30_000,
    placeholderData: prev => prev,
  }) as { data?: { items: CatalogProduct[]; total: number }; isLoading: boolean }

  const products = pageData?.items ?? []
  const total = pageData?.total ?? 0
  const totalPages = Math.ceil(total / 30)

  // Keywords
  const { data: keywords = [] } = useQuery({ queryKey: ['keywords'], queryFn: getKeywords })
  const addKw = useMutation({
    mutationFn: createKeyword,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['keywords'] }); setNewKw({ keyword: '', tag: '' }) },
  })
  const delKw = useMutation({
    mutationFn: deleteKeyword,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['keywords'] }),
  })

  const field = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors'
  const btnBadge = 'text-xs px-3 py-1.5 rounded-lg font-medium transition-colors'
  const active = 'bg-green-700 text-white'
  const inactive = 'bg-gray-800 text-gray-400 hover:bg-gray-700'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Catalogo</h1>
          <p className="text-gray-400 text-sm mt-1">{total} produto{total !== 1 ? 's' : ''} canonico{total !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowKeywords(s => !s)} className="text-gray-400 hover:text-white text-sm transition-colors">
          🏷️ Keywords
        </button>
      </div>

      {/* Keywords panel */}
      {showKeywords && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 space-y-3">
          <h3 className="text-sm font-medium text-gray-300">Palavras agrupadoras</h3>
          <div className="flex gap-2 flex-wrap">
            {keywords.map((kw: any) => (
              <div key={kw.id} className="flex items-center gap-1 bg-gray-800 px-2 py-1 rounded text-xs">
                <span className="text-gray-300">"{kw.keyword}"</span>
                <span className="text-gray-500">→</span>
                <span className="text-purple-300">#{kw.tag}</span>
                <button onClick={() => delKw.mutate(kw.id)} className="text-gray-500 hover:text-red-400 ml-1">×</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input className={`${field} flex-1`} placeholder="palavra (ex: profit)" value={newKw.keyword} onChange={e => setNewKw(f => ({ ...f, keyword: e.target.value }))} />
            <input className={`${field} flex-1`} placeholder="tag (ex: profit)" value={newKw.tag} onChange={e => setNewKw(f => ({ ...f, tag: e.target.value }))} />
            <button onClick={() => addKw.mutate(newKw)} disabled={!newKw.keyword.trim() || !newKw.tag.trim()}
              className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs px-3 py-2 rounded-lg transition-colors">+</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 space-y-3">
        <div className="flex gap-3 flex-wrap">
          <input className={`${field} flex-1 min-w-[200px]`} placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
          <input className={`${field} w-32`} placeholder="Tag" value={tagFilter} onChange={e => setTagFilter(e.target.value)} />
          <input className={`${field} w-32`} placeholder="Marca" value={brandFilter} onChange={e => setBrandFilter(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-2">Filtrar por Source</label>
          <SourcePicker value={sourceFilter} onChange={setSourceFilter} />
        </div>
      </div>

      {isLoading && <p className="text-gray-500 text-sm">Carregando...</p>}

      <div className="space-y-3">
        {products.map((p: CatalogProduct) => <ProductRow key={p.id} product={p} />)}
      </div>

      {!isLoading && products.length === 0 && (
        <div className="text-center py-16 bg-gray-900 border border-gray-800 rounded-xl">
          <p className="text-4xl mb-3">📦</p>
          <p className="text-gray-400">Nenhum produto no catalogo.</p>
          <p className="text-gray-500 text-sm mt-1">Execute um crawl para popular o catalogo.</p>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-800">
          <button onClick={() => setPage(p => p - 1)} disabled={page === 0}
            className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg transition-colors">← Anterior</button>
          <span className="text-sm text-gray-400">{page + 1} / {totalPages} <span className="text-gray-600">({total})</span></span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}
            className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg transition-colors">Proximo →</button>
        </div>
      )}
    </div>
  )
}
