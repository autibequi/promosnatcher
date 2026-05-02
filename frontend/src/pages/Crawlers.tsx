import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSearchTerms, createSearchTerm } from '../api'
import type { SearchTerm } from '../types/extended'

interface NewSearchTermForm {
  query: string
  min_val: number
  max_val: number
  sources: string
  crawl_interval: number
}

export default function Crawlers(): React.ReactElement {
  const qc = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState<NewSearchTermForm>({ query: '', min_val: 0, max_val: 9999, sources: 'all', crawl_interval: 30 })

  const { data: terms = [], isLoading } = useQuery({ queryKey: ['searchTerms'], queryFn: getSearchTerms }) as { data: SearchTerm[], isLoading: boolean }

  const create = useMutation({
    mutationFn: createSearchTerm,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['searchTerms'] }); setShowNew(false); setNewForm({ query: '', min_val: 0, max_val: 9999, sources: 'all', crawl_interval: 30 }) },
  })

  const field = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors'
  const badge = 'text-xs px-2 py-0.5 rounded-full font-medium'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Crawlers</h1>
          <p className="text-gray-400 text-sm mt-1">{terms.length} termo{terms.length !== 1 ? 's' : ''} de busca</p>
        </div>
        <button onClick={() => setShowNew(s => !s)} className="bg-green-700 hover:bg-green-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">
          + Novo termo
        </button>
      </div>

      {showNew && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-400">Busca</label>
              <input className={field} placeholder="whey barato" value={newForm.query} onChange={e => setNewForm(f => ({ ...f, query: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-400">Min (R$)</label>
              <input className={field} type="number" value={newForm.min_val} onChange={e => setNewForm(f => ({ ...f, min_val: +e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-400">Max (R$)</label>
              <input className={field} type="number" value={newForm.max_val} onChange={e => setNewForm(f => ({ ...f, max_val: +e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-400">Sources</label>
              <select className={field} value={newForm.sources} onChange={e => setNewForm(f => ({ ...f, sources: e.target.value }))}>
                <option value="all">Todos</option>
                <option value="mercadolivre">Mercado Livre</option>
                <option value="amazon">Amazon</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400">Intervalo (min)</label>
              <input className={field} type="number" min={5} value={newForm.crawl_interval} onChange={e => setNewForm(f => ({ ...f, crawl_interval: +e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => create.mutate(newForm)} disabled={!newForm.query.trim() || create.isPending}
              className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors">
              {create.isPending ? '...' : 'Criar'}
            </button>
            <button onClick={() => setShowNew(false)} className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">Cancelar</button>
          </div>
        </div>
      )}

      {isLoading && <p className="text-gray-500 text-sm">Carregando...</p>}

      <div className="space-y-3">
        {terms.map(t => (
          <Link key={t.id} to={`/admin/crawlers/${t.id}`}
            className="block bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-base font-medium text-white">"{t.query}"</p>
                  <span className={`${badge} ${t.active ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-500'}`}>
                    {t.active ? 'ativo' : 'pauso'}
                  </span>
                  <span className={`${badge} bg-gray-800 text-gray-400`}>{t.sources}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  R${(t.min_val ?? 0).toFixed(0)}–R${(t.max_val ?? 0).toFixed(0)} | {t.crawl_interval}min |{' '}
                  {t.last_crawled_at ? `${t.result_count} resultados` : 'nunca executado'}
                </p>
              </div>
              <span className="text-gray-600 text-sm ml-3">→</span>
            </div>
          </Link>
        ))}
      </div>

      {!isLoading && terms.length === 0 && (
        <div className="text-center py-16 bg-gray-900 border border-gray-800 rounded-xl">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-gray-400">Nenhum termo de busca cadastrado.</p>
          <p className="text-gray-500 text-sm mt-1">Crie um acima para começar a monitorar preços.</p>
        </div>
      )}
    </div>
  )
}
