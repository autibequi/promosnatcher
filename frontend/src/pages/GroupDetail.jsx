import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getGroup, getProducts, deleteGroup, createWAGroup } from '../api'
import ScanStatus from '../components/ScanStatus'
import ProductCard from '../components/ProductCard'

export default function GroupDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [sourceFilter, setSourceFilter] = useState('')
  const [sentFilter, setSentFilter] = useState('')

  const { data: group, isLoading: loadingGroup } = useQuery({
    queryKey: ['group', id],
    queryFn: () => getGroup(id),
  })

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['products', id, sourceFilter, sentFilter],
    queryFn: () => getProducts(id, {
      source: sourceFilter || undefined,
      sent: sentFilter === '' ? undefined : sentFilter === 'true',
    }),
    enabled: Boolean(id),
    refetchInterval: 10_000,
  })

  const del = useMutation({
    mutationFn: () => deleteGroup(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); navigate('/') },
  })

  const createWA = useMutation({
    mutationFn: () => createWAGroup(id, []),
    onSuccess: () => {
      // Aguarda ~35s e recarrega (background task pode levar tempo)
      setTimeout(() => qc.invalidateQueries({ queryKey: ['group', id] }), 35000)
    },
  })

  if (loadingGroup) return <div className="text-center text-gray-400 py-16">Carregando...</div>
  if (!group) return <div className="text-center text-red-400 py-16">Grupo não encontrado.</div>

  const badge = 'text-xs px-2.5 py-1 rounded-lg cursor-pointer transition-colors'
  const active = 'bg-green-700 text-white'
  const inactive = 'bg-gray-800 text-gray-400 hover:bg-gray-700'

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link to="/" className="text-gray-500 hover:text-gray-300 text-sm">← Grupos</Link>
            <span className={`text-xs px-2 py-0.5 rounded-full ${group.active ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-500'}`}>
              {group.active ? 'Ativo' : 'Inativo'}
            </span>
          </div>
          <h1 className="text-3xl font-bold text-white">{group.name}</h1>
          {group.description && <p className="text-gray-400 mt-1">{group.description}</p>}
        </div>
        <div className="flex gap-2">
          <Link to={`/groups/${id}/edit`} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm transition-colors">
            ✏️ Editar
          </Link>
          <button
            onClick={() => { if (confirm('Deletar grupo e todos os produtos?')) del.mutate() }}
            className="bg-red-900 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
          >
            🗑️ Deletar
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Busca</p>
          <p className="text-sm text-gray-200 italic">"{group.search_prompt}"</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Faixa de preço</p>
          <p className="text-sm text-white">R$ {group.min_val.toFixed(2)} — R$ {group.max_val.toFixed(2)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">WhatsApp Group ID</p>
          {group.whatsapp_group_id ? (
            <p className={`text-xs font-mono break-all ${
              group.wa_group_status === 'removed' ? 'text-red-400' : 'text-green-400'
            }`}>
              {group.wa_group_status === 'removed' ? '⚠️ Removido — ' : ''}
              {group.whatsapp_group_id}
            </p>
          ) : (
            <div className="flex flex-col gap-2 mt-1">
              <span className="text-sm text-gray-600">Não vinculado</span>
              <button
                onClick={() => createWA.mutate()}
                disabled={createWA.isPending || createWA.isSuccess}
                className="text-xs bg-green-800 hover:bg-green-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                {createWA.isPending ? '⏳ Criando...' : '📱 Criar grupo WA'}
              </button>
              {createWA.isSuccess && (
                <span className="text-xs text-yellow-400">⏳ Criando grupo no WA... aguarde ~30s e recarregue</span>
              )}
              {createWA.isError && <span className="text-xs text-red-400">✗ Erro ao criar</span>}
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
            Produtos encontrados <span className="text-gray-500 font-normal text-base">({products.length})</span>
          </h2>
          <div className="flex gap-2 ml-auto">
            <button onClick={() => setSourceFilter('')} className={`${badge} ${!sourceFilter ? active : inactive}`}>Todos</button>
            <button onClick={() => setSourceFilter('mercadolivre')} className={`${badge} ${sourceFilter === 'mercadolivre' ? active : inactive}`}>ML</button>
            <button onClick={() => setSourceFilter('amazon')} className={`${badge} ${sourceFilter === 'amazon' ? active : inactive}`}>Amazon</button>
            <span className="w-px bg-gray-700 mx-1" />
            <button onClick={() => setSentFilter('')} className={`${badge} ${sentFilter === '' ? active : inactive}`}>Todos</button>
            <button onClick={() => setSentFilter('false')} className={`${badge} ${sentFilter === 'false' ? active : inactive}`}>Não enviados</button>
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
          {products.map(p => <ProductCard key={p.id} product={p} />)}
        </div>
      </div>
    </div>
  )
}
