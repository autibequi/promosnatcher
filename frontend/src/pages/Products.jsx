import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAllProducts, getGroups } from '../api'
import ProductCard from '../components/ProductCard'

const PAGE_SIZE = 30

function ProductFamily({ products }) {
  const [expanded, setExpanded] = useState(false)
  const cheapest = products[0]
  const others = products.slice(1)
  return (
    <div className="border border-gray-700 rounded-xl overflow-hidden">
      <ProductCard product={cheapest} showGroup />
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full bg-gray-800 hover:bg-gray-750 text-gray-400 text-xs py-2 border-t border-gray-700 transition-colors"
      >
        {expanded ? '▲ Ocultar' : '▼'} +{others.length} variante{others.length > 1 ? 's' : ''} (mesmo produto)
      </button>
      {expanded && (
        <div className="space-y-px bg-gray-800">
          {others.map(p => <ProductCard key={p.id} product={p} showGroup />)}
        </div>
      )}
    </div>
  )
}

export default function Products() {
  const [groupFilter, setGroupFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [sentFilter, setSentFilter] = useState('')
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [page, setPage] = useState(0)
  const searchTimer = useRef(null)

  // Debounce search 400ms
  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearchDebounced(search), 400)
    return () => clearTimeout(searchTimer.current)
  }, [search])

  // Reset page on filter change
  useEffect(() => { setPage(0) }, [groupFilter, sourceFilter, sentFilter, searchDebounced])

  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: getGroups })

  const params = {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    ...(groupFilter && { group_id: groupFilter }),
    ...(sourceFilter && { source: sourceFilter }),
    ...(sentFilter !== '' && { sent: sentFilter }),
    ...(searchDebounced && { search: searchDebounced }),
  }

  const { data: page_data, isLoading } = useQuery({
    queryKey: ['allProducts', groupFilter, sourceFilter, sentFilter, searchDebounced, page],
    queryFn: () => getAllProducts(params),
    refetchInterval: 15_000,
    placeholderData: prev => prev,
  })

  const products = page_data?.items ?? []
  const total = page_data?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const grouped = useMemo(() => {
    const map = new Map()
    for (const p of products) {
      const key = p.family_key || `solo_${p.id}`
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(p)
    }
    for (const [, items] of map) items.sort((a, b) => a.price - b.price)
    return [...map.values()]
  }, [products])

  const badge = 'text-xs px-3 py-1.5 rounded-lg font-medium transition-colors'
  const active = 'bg-green-700 text-white'
  const inactive = 'bg-gray-800 text-gray-400 hover:bg-gray-700'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Produtos</h1>
          <p className="text-gray-400 text-sm mt-1">
            {total} produto{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 space-y-3">
        {/* Busca + Grupo */}
        <div className="flex gap-3 flex-wrap">
          <input
            className="flex-1 min-w-[200px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors"
            placeholder="Buscar por título..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500 transition-colors"
            value={groupFilter}
            onChange={e => setGroupFilter(e.target.value)}
          >
            <option value="">Todos os grupos</option>
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>

        {/* Source + Sent */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setSourceFilter('')} className={`${badge} ${!sourceFilter ? active : inactive}`}>Todos</button>
          <button onClick={() => setSourceFilter('mercadolivre')} className={`${badge} ${sourceFilter === 'mercadolivre' ? active : inactive}`}>ML</button>
          <button onClick={() => setSourceFilter('amazon')} className={`${badge} ${sourceFilter === 'amazon' ? active : inactive}`}>AMZ</button>
          <span className="w-px bg-gray-700 mx-1" />
          <button onClick={() => setSentFilter('')} className={`${badge} ${sentFilter === '' ? active : inactive}`}>Todos</button>
          <button onClick={() => setSentFilter('false')} className={`${badge} ${sentFilter === 'false' ? active : inactive}`}>Pendentes</button>
          <button onClick={() => setSentFilter('true')} className={`${badge} ${sentFilter === 'true' ? active : inactive}`}>Enviados</button>
        </div>
      </div>

      {/* Lista */}
      {isLoading && <div className="text-gray-400 text-sm">Carregando...</div>}

      {!isLoading && products.length === 0 && (
        <div className="text-center py-16 bg-gray-900 border border-gray-800 rounded-xl">
          <p className="text-4xl mb-3">📦</p>
          <p className="text-gray-400">Nenhum produto encontrado.</p>
          {(search || groupFilter || sourceFilter || sentFilter) && (
            <p className="text-gray-500 text-sm mt-1">Tente limpar os filtros.</p>
          )}
        </div>
      )}

      <div className="space-y-3">
        {grouped.map(group =>
          group.length === 1
            ? <ProductCard key={group[0].id} product={group[0]} showGroup />
            : <ProductFamily key={group[0].family_key || group[0].id} products={group} />
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-800">
          <button
            onClick={() => setPage(p => p - 1)}
            disabled={page === 0}
            className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            ← Anterior
          </button>
          <span className="text-sm text-gray-400">
            {page + 1} / {totalPages}
            <span className="text-gray-600 ml-2">({total} produtos)</span>
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page >= totalPages - 1}
            className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Próximo →
          </button>
        </div>
      )}
    </div>
  )
}
