import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSearchTerms, createSearchTerm, updateSearchTerm, deleteSearchTerm, crawlSearchTerm, getCrawlResults } from '../api'

export default function Crawlers() {
  const qc = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({ query: '', min_val: 0, max_val: 9999, sources: 'all', crawl_interval: 30 })
  const [expandedTerm, setExpandedTerm] = useState(null)
  const [resultsPage, setResultsPage] = useState(0)

  const { data: terms = [], isLoading } = useQuery({
    queryKey: ['searchTerms'], queryFn: getSearchTerms,
  })

  const { data: resultsData } = useQuery({
    queryKey: ['crawlResults', expandedTerm, resultsPage],
    queryFn: () => getCrawlResults(expandedTerm, { limit: 20, offset: resultsPage * 20 }),
    enabled: !!expandedTerm,
  })

  const create = useMutation({
    mutationFn: createSearchTerm,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['searchTerms'] }); setShowNew(false); setNewForm({ query: '', min_val: 0, max_val: 9999, sources: 'all', crawl_interval: 30 }) },
  })
  const toggle = useMutation({
    mutationFn: ({ id, active }) => updateSearchTerm(id, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['searchTerms'] }),
  })
  const del = useMutation({
    mutationFn: deleteSearchTerm,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['searchTerms'] }),
  })
  const crawl = useMutation({
    mutationFn: crawlSearchTerm,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['searchTerms'] }); qc.invalidateQueries({ queryKey: ['crawlResults'] }) },
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

      {/* New term form */}
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

      {/* Terms list */}
      <div className="space-y-3">
        {terms.map(t => (
          <div key={t.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
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
                  R${t.min_val.toFixed(0)}–R${t.max_val.toFixed(0)} | {t.crawl_interval}min |{' '}
                  {t.last_crawled_at ? `${t.result_count} resultados — ${new Date(t.last_crawled_at).toLocaleString('pt-BR')}` : 'nunca executado'}
                </p>
              </div>
              <div className="flex gap-2 ml-3 flex-shrink-0">
                <button onClick={() => crawl.mutate(t.id)} disabled={crawl.isPending}
                  className="text-gray-400 hover:text-green-400 text-sm transition-colors" title="Crawl agora">
                  {crawl.isPending ? '...' : '🔄'}
                </button>
                <button onClick={() => toggle.mutate({ id: t.id, active: !t.active })}
                  className="text-gray-400 hover:text-yellow-400 text-sm transition-colors" title={t.active ? 'Pausar' : 'Ativar'}>
                  {t.active ? '⏸️' : '▶️'}
                </button>
                <button onClick={() => setExpandedTerm(expandedTerm === t.id ? null : t.id)}
                  className="text-gray-400 hover:text-blue-400 text-sm transition-colors" title="Ver resultados">
                  📋
                </button>
                <button onClick={() => { if (confirm(`Remover "${t.query}"?`)) del.mutate(t.id) }}
                  className="text-gray-400 hover:text-red-400 text-sm transition-colors" title="Remover">
                  🗑️
                </button>
              </div>
            </div>

            {/* Raw results */}
            {expandedTerm === t.id && resultsData && (
              <div className="mt-3 pt-3 border-t border-gray-800">
                <p className="text-xs text-gray-400 mb-2">Resultados brutos ({resultsData.total})</p>
                <div className="space-y-1 max-h-80 overflow-y-auto">
                  {resultsData.items.map(r => (
                    <div key={r.id} className="flex items-center gap-3 py-1.5 px-2 bg-gray-800 rounded text-xs">
                      {r.image_url && <img src={r.image_url} alt="" className="w-8 h-8 object-contain bg-white rounded flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-300 truncate">{r.title}</p>
                        <p className="text-gray-500">{r.source} | {new Date(r.crawled_at).toLocaleString('pt-BR')}</p>
                      </div>
                      <span className="text-green-400 font-medium whitespace-nowrap">R$ {r.price.toFixed(2).replace('.', ',')}</span>
                      <span className={`${badge} ${r.catalog_variant_id ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'}`}>
                        {r.catalog_variant_id ? 'processado' : 'pendente'}
                      </span>
                    </div>
                  ))}
                </div>
                {resultsData.total > 20 && (
                  <div className="flex gap-2 mt-2">
                    <button disabled={resultsPage === 0} onClick={() => setResultsPage(p => p - 1)} className="text-xs text-gray-400 hover:text-white disabled:opacity-40">← Anterior</button>
                    <span className="text-xs text-gray-500">{resultsPage + 1}/{Math.ceil(resultsData.total / 20)}</span>
                    <button disabled={(resultsPage + 1) * 20 >= resultsData.total} onClick={() => setResultsPage(p => p + 1)} className="text-xs text-gray-400 hover:text-white disabled:opacity-40">Próximo →</button>
                  </div>
                )}
              </div>
            )}
          </div>
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
