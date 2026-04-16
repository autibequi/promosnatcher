import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCatalogProducts, getCatalogProduct, updateCatalogProduct, getVariantHistory, getKeywords, createKeyword, deleteKeyword } from '../api'

function VariantRow({ variant }) {
  const [showHistory, setShowHistory] = useState(false)
  const { data: history = [] } = useQuery({
    queryKey: ['variantHistory', variant.id],
    queryFn: () => getVariantHistory(variant.id),
    enabled: showHistory,
  })

  return (
    <div className="py-2 px-3 bg-gray-800 rounded">
      <div className="flex items-center gap-3">
        {variant.image_url && <img src={variant.image_url} alt="" className="w-10 h-10 object-contain bg-white rounded flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-300 truncate">{variant.title}</p>
          <p className="text-xs text-gray-500">{variant.source} {variant.variant_label && `| ${variant.variant_label}`}</p>
        </div>
        <span className="text-green-400 text-sm font-medium whitespace-nowrap">R$ {variant.price.toFixed(2).replace('.', ',')}</span>
        <button onClick={() => setShowHistory(h => !h)} className="text-xs text-gray-500 hover:text-white transition-colors">
          {showHistory ? '▲' : '📈'}
        </button>
        <a href={variant.url} target="_blank" rel="noreferrer" className="text-xs text-gray-500 hover:text-green-400 transition-colors">🔗</a>
      </div>
      {showHistory && history.length > 1 && (
        <div className="mt-2 flex gap-1 items-end h-12">
          {history.map((h, i) => {
            const max = Math.max(...history.map(x => x.price))
            const min = Math.min(...history.map(x => x.price))
            const range = max - min || 1
            const pct = ((h.price - min) / range) * 100
            return (
              <div key={i} className="flex-1 bg-green-800 rounded-t" style={{ height: `${Math.max(10, pct)}%` }}
                title={`R$ ${h.price.toFixed(2)} — ${new Date(h.recorded_at).toLocaleDateString('pt-BR')}`} />
            )
          })}
        </div>
      )}
    </div>
  )
}

function ProductRow({ product }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)

  const { data: detail } = useQuery({
    queryKey: ['catalogDetail', product.id],
    queryFn: () => getCatalogProduct(product.id),
    enabled: expanded,
  })

  const tags = useMemo(() => {
    try { return JSON.parse(product.tags || '[]') } catch { return [] }
  }, [product.tags])

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="p-4 flex items-start gap-3 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        {product.image_url && <img src={product.image_url} alt="" className="w-16 h-16 object-contain bg-white rounded flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">{product.canonical_name}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {product.brand && <span className="text-xs bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded">{product.brand}</span>}
            {product.weight && <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{product.weight}</span>}
            {tags.map(t => <span key={t} className="text-xs bg-purple-900 text-purple-300 px-1.5 py-0.5 rounded">#{t}</span>)}
            <span className="text-xs text-gray-500">{product.variant_count} variante{product.variant_count !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-lg font-bold text-green-400">R$ {(product.lowest_price || 0).toFixed(2).replace('.', ',')}</p>
          <p className="text-xs text-gray-500">{product.lowest_price_source}</p>
        </div>
        <span className="text-gray-500 text-sm">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && detail && (
        <div className="px-4 pb-4 border-t border-gray-800 pt-3 space-y-2">
          {detail.variants.map(v => <VariantRow key={v.id} variant={v} />)}
        </div>
      )}
    </div>
  )
}

export default function Catalog() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [page, setPage] = useState(0)
  const [showKeywords, setShowKeywords] = useState(false)
  const [newKw, setNewKw] = useState({ keyword: '', tag: '' })
  const searchTimer = useRef(null)

  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearchDebounced(search), 400)
    return () => clearTimeout(searchTimer.current)
  }, [search])

  useEffect(() => { setPage(0) }, [searchDebounced, tagFilter, brandFilter, sourceFilter])

  const params = {
    limit: 30, offset: page * 30,
    ...(searchDebounced && { search: searchDebounced }),
    ...(tagFilter && { tag: tagFilter }),
    ...(brandFilter && { brand: brandFilter }),
    ...(sourceFilter && { source: sourceFilter }),
  }

  const { data: pageData, isLoading } = useQuery({
    queryKey: ['catalog', params],
    queryFn: () => getCatalogProducts(params),
    refetchInterval: 30_000,
    placeholderData: prev => prev,
  })

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
            {keywords.map(kw => (
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
        <div className="flex gap-2">
          <button onClick={() => setSourceFilter('')} className={`${btnBadge} ${!sourceFilter ? active : inactive}`}>Todos</button>
          <button onClick={() => setSourceFilter('mercadolivre')} className={`${btnBadge} ${sourceFilter === 'mercadolivre' ? active : inactive}`}>ML</button>
          <button onClick={() => setSourceFilter('amazon')} className={`${btnBadge} ${sourceFilter === 'amazon' ? active : inactive}`}>AMZ</button>
        </div>
      </div>

      {isLoading && <p className="text-gray-500 text-sm">Carregando...</p>}

      <div className="space-y-3">
        {products.map(p => <ProductRow key={p.id} product={p} />)}
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
