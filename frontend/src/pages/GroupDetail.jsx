import { useState, useMemo, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getGroup, getProducts, deleteGroup, createWAGroup, updateGroup, getWAGroups } from '../api'
import ScanStatus from '../components/ScanStatus'
import ProductCard from '../components/ProductCard'

function ProductFamily({ products }) {
  const [expanded, setExpanded] = useState(false)
  const cheapest = products[0] // já ordenado por preço
  const others = products.slice(1)

  return (
    <div className="border border-gray-700 rounded-xl overflow-hidden">
      <ProductCard product={cheapest} />
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full bg-gray-800 hover:bg-gray-750 text-gray-400 text-xs py-2 border-t border-gray-700 transition-colors"
      >
        {expanded ? '▲ Ocultar' : '▼'} +{others.length} variante{others.length > 1 ? 's' : ''} (mesmo produto)
      </button>
      {expanded && (
        <div className="space-y-px bg-gray-800">
          {others.map(p => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </div>
  )
}

export default function GroupDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [sourceFilter, setSourceFilter] = useState('')
  const [sentFilter, setSentFilter] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 30

  // Reset page quando filtros mudam
  useEffect(() => { setPage(0) }, [sourceFilter, sentFilter])

  const { data: group, isLoading: loadingGroup } = useQuery({
    queryKey: ['group', id],
    queryFn: () => getGroup(id),
  })

  const { data: productsPage, isLoading: loadingProducts } = useQuery({
    queryKey: ['products', id, sourceFilter, sentFilter, page],
    queryFn: () => getProducts(id, {
      source: sourceFilter || undefined,
      sent: sentFilter === '' ? undefined : sentFilter === 'true',
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    enabled: Boolean(id),
    refetchInterval: 10_000,
    placeholderData: (prev) => prev,
  })

  const products = productsPage?.items ?? []
  const total = productsPage?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Agrupa produtos por family_key para colapsar variantes
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

  const del = useMutation({
    mutationFn: () => deleteGroup(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); navigate('/admin') },
  })

  const [showWAPicker, setShowWAPicker] = useState(false)

  const createWA = useMutation({
    mutationFn: () => createWAGroup(id, []),
    onSuccess: () => {
      setTimeout(() => qc.invalidateQueries({ queryKey: ['group', id] }), 35000)
    },
  })

  const { data: waGroups = [], isLoading: loadingWAGroups } = useQuery({
    queryKey: ['waGroups'],
    queryFn: getWAGroups,
    staleTime: 60000,
    retry: false,
    // sempre habilitado — falha silenciosa se WAHA offline
  })

  // Parseia o campo como array (pode ser JSON array ou ID único)
  const linkedIds = useMemo(() => {
    const raw = group?.whatsapp_group_id
    if (!raw) return []
    try {
      if (raw.startsWith('[')) return JSON.parse(raw)
    } catch { /* segue */ }
    return [raw]
  }, [group?.whatsapp_group_id])

  const linkGroup = useMutation({
    mutationFn: async (waGroupId) => {
      const newIds = [...linkedIds, waGroupId]
      const value = newIds.length === 1 ? newIds[0] : JSON.stringify(newIds)
      return updateGroup(id, { whatsapp_group_id: value })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group', id] })
      setShowWAPicker(false)
    },
  })

  const unlinkGroup = useMutation({
    mutationFn: async (removeId) => {
      const newIds = linkedIds.filter(i => i !== removeId)
      const value = newIds.length === 0 ? null : newIds.length === 1 ? newIds[0] : JSON.stringify(newIds)
      return updateGroup(id, {
        whatsapp_group_id: value,
        ...(newIds.length === 0 && { wa_group_status: null }),
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group', id] }),
  })

  if (loadingGroup) return <div className="text-center text-gray-400 py-16">Carregando...</div>
  if (!group) return <div className="text-center text-red-400 py-16">Canal não encontrado.</div>

  const badge = 'text-xs px-2.5 py-1 rounded-lg cursor-pointer transition-colors'
  const active = 'bg-green-700 text-white'
  const inactive = 'bg-gray-800 text-gray-400 hover:bg-gray-700'

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link to="/admin" className="text-gray-500 hover:text-gray-300 text-sm">← Canais</Link>
            <span className={`text-xs px-2 py-0.5 rounded-full ${group.active ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-500'}`}>
              {group.active ? 'Ativo' : 'Inativo'}
            </span>
          </div>
          <h1 className="text-3xl font-bold text-white">{group.name}</h1>
          {group.description && <p className="text-gray-400 mt-1">{group.description}</p>}
        </div>
        <div className="flex gap-2">
          <Link to={`/admin/groups/${id}/edit`} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm transition-colors">
            ✏️ Editar
          </Link>
          <button
            onClick={() => { if (confirm('Deletar canal e todos os produtos?')) del.mutate() }}
            className="bg-red-900 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
          >
            🗑️ Deletar
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Busca</p>
          <p className="text-sm text-gray-200 italic">"{group.search_prompt}"</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Faixa de preço</p>
          <p className="text-sm text-white">R$ {group.min_val.toFixed(2)} — R$ {group.max_val.toFixed(2)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-2">Grupo WhatsApp</p>

          {linkedIds.length > 0 && (
            /* Grupos vinculados */
            <div className="space-y-1.5 mb-2">
              {linkedIds.map(gid => {
                const waGroup = waGroups.find(g => g.id === gid)
                return (
                  <div key={gid} className="flex items-center justify-between bg-gray-800 px-2 py-1.5 rounded-lg">
                    <div className="min-w-0">
                      <p className="text-xs text-green-400 font-medium truncate">
                        {waGroup?.name || gid.slice(0, 20) + '...'}
                      </p>
                    </div>
                    <button
                      onClick={() => { if (confirm('Remover este grupo?')) unlinkGroup.mutate(gid) }}
                      disabled={unlinkGroup.isPending}
                      className="text-gray-500 hover:text-red-400 transition-colors ml-2 flex-shrink-0 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
              <button
                onClick={() => setShowWAPicker(true)}
                className="text-xs text-gray-500 hover:text-green-400 transition-colors"
              >
                + Adicionar grupo
              </button>
            </div>
          )}

          {(showWAPicker || (group.whatsapp_group_id && showWAPicker)) ? (
            /* Seletor de grupos */
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">Selecione um grupo:</p>
                <button onClick={() => setShowWAPicker(false)} className="text-xs text-gray-500 hover:text-white">✕</button>
              </div>
              {loadingWAGroups && <p className="text-xs text-gray-500">Carregando...</p>}
              {!loadingWAGroups && waGroups.length === 0 && (
                <p className="text-xs text-gray-500">Nenhum grupo com prefixo encontrado.</p>
              )}
              <div className="max-h-48 overflow-y-auto space-y-1">
                {waGroups.filter(g => !linkedIds.includes(g.id)).map(g => (
                  <button key={g.id}
                    onClick={() => linkGroup.mutate(g.id)}
                    disabled={linkGroup.isPending}
                    className="w-full text-left bg-gray-800 hover:bg-green-900 disabled:opacity-50 px-3 py-2 rounded-lg transition-colors"
                  >
                    <p className="text-xs text-white font-medium">{g.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{g.id.slice(0, 20)}...</p>
                  </button>
                ))}
              </div>
              <div className="pt-1 border-t border-gray-800">
                <button
                  onClick={() => createWA.mutate()}
                  disabled={createWA.isPending || createWA.isSuccess}
                  className="text-xs text-green-400 hover:text-green-300 disabled:opacity-50 transition-colors"
                >
                  {createWA.isPending ? '⏳ Criando...' : '+ Criar novo grupo'}
                </button>
                {createWA.isSuccess && (
                  <span className="text-xs text-yellow-400 ml-2">⏳ aguarde ~10s e reabra</span>
                )}
              </div>
            </div>
          ) : !group.whatsapp_group_id && (
            /* Nenhum grupo vinculado */
            <div className="space-y-2">
              <p className="text-xs text-gray-600">Nenhum grupo vinculado</p>
              <button
                onClick={() => setShowWAPicker(true)}
                className="text-xs bg-green-800 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors w-full"
              >
                📱 Selecionar / criar grupo WA
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Scan status */}
      <div className="mb-6">
        <ScanStatus groupId={id} />
      </div>

      {/* Products */}
      <div>
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <h2 className="text-lg font-semibold text-white">
            Produtos encontrados <span className="text-gray-500 font-normal text-base">({total})</span>
          </h2>
          <div className="flex gap-2 ml-auto flex-wrap">
            <button onClick={() => setSourceFilter('')} className={`${badge} ${!sourceFilter ? active : inactive}`}>Todos</button>
            <button onClick={() => setSourceFilter('mercadolivre')} className={`${badge} ${sourceFilter === 'mercadolivre' ? active : inactive}`}>ML</button>
            <button onClick={() => setSourceFilter('amazon')} className={`${badge} ${sourceFilter === 'amazon' ? active : inactive}`}>AMZ</button>
            <span className="w-px bg-gray-700 mx-1 hidden sm:block" />
            <button onClick={() => setSentFilter('')} className={`${badge} ${sentFilter === '' ? active : inactive}`}>Todos</button>
            <button onClick={() => setSentFilter('false')} className={`${badge} ${sentFilter === 'false' ? active : inactive}`}>Pendentes</button>
            <button onClick={() => setSentFilter('true')} className={`${badge} ${sentFilter === 'true' ? active : inactive}`}>Enviados</button>
          </div>
        </div>

        {loadingProducts && <div className="text-gray-400 text-sm">Carregando produtos...</div>}

        {!loadingProducts && products.length === 0 && (
          <div className="text-center py-16 bg-gray-900 border border-gray-800 rounded-xl">
            <p className="text-4xl mb-3">📦</p>
            <p className="text-gray-400">Nenhum produto encontrado ainda.</p>
            <p className="text-gray-500 text-sm mt-1">Clique em "Scan Now" para iniciar a busca.</p>
          </div>
        )}

        <div className="space-y-3">
          {grouped.map(group => (
            group.length === 1
              ? <ProductCard key={group[0].id} product={group[0]} />
              : <ProductFamily key={group[0].family_key || group[0].id} products={group} />
          ))}
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
    </div>
  )
}
