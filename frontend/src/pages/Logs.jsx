import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getCrawlLogs } from '../api'

const STATUS_BADGE = {
  done:    'bg-green-900 text-green-300',
  partial: 'bg-yellow-900 text-yellow-300',
  error:   'bg-red-900 text-red-400',
  running: 'bg-blue-900 text-blue-300',
}

function fmt(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })
}

function duration(start, end) {
  if (!end) return '—'
  const ms = new Date(end) - new Date(start)
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export default function Logs() {
  const [status, setStatus] = useState('')
  const [limit, setLimit] = useState(50)

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['crawl-logs', status, limit],
    queryFn: () => getCrawlLogs({ status: status || undefined, limit }),
    refetchInterval: 10000,
  })

  const counts = logs.reduce((acc, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1
    return acc
  }, {})

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Logs de Crawl</h1>
          <p className="text-gray-400 text-sm mt-0.5">Histórico de execução por SearchTerm</p>
        </div>
        <button onClick={() => refetch()}
          className="text-sm px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">
          Atualizar
        </button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Sucesso', key: 'done', color: 'text-green-400' },
          { label: 'Parcial', key: 'partial', color: 'text-yellow-400' },
          { label: 'Erro', key: 'error', color: 'text-red-400' },
          { label: 'Rodando', key: 'running', color: 'text-blue-400' },
        ].map(({ label, key, color }) => (
          <div key={key}
            onClick={() => setStatus(s => s === key ? '' : key)}
            className={`bg-gray-800 rounded-xl p-4 cursor-pointer border-2 transition-colors ${status === key ? 'border-gray-500' : 'border-transparent hover:border-gray-700'}`}>
            <div className={`text-2xl font-bold ${color}`}>{counts[key] || 0}</div>
            <div className="text-gray-400 text-sm">{label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-4">
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2">
          <option value="">Todos os status</option>
          <option value="done">Sucesso</option>
          <option value="partial">Parcial</option>
          <option value="error">Erro</option>
          <option value="running">Rodando</option>
        </select>
        <select value={limit} onChange={e => setLimit(Number(e.target.value))}
          className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2">
          <option value={50}>50 registros</option>
          <option value={100}>100 registros</option>
          <option value={200}>200 registros</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-gray-500 text-center py-16">Carregando...</div>
      ) : logs.length === 0 ? (
        <div className="text-gray-600 text-center py-16">Nenhum log encontrado</div>
      ) : (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Term</th>
                <th className="px-4 py-3 text-left">Início</th>
                <th className="px-4 py-3 text-left">Duração</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">ML</th>
                <th className="px-4 py-3 text-center">Amazon</th>
                <th className="px-4 py-3 text-left">Erro</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className="border-b border-gray-700/50 hover:bg-gray-750 transition-colors">
                  <td className="px-4 py-3 text-white font-medium max-w-[160px] truncate" title={log.search_term_query}>
                    {log.search_term_query}
                  </td>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{fmt(log.started_at)}</td>
                  <td className="px-4 py-3 text-gray-400">{duration(log.started_at, log.finished_at)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[log.status] || 'bg-gray-700 text-gray-300'}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-300">{log.ml_count}</td>
                  <td className="px-4 py-3 text-center text-gray-300">{log.amz_count}</td>
                  <td className="px-4 py-3 text-red-400 text-xs max-w-[200px] truncate" title={log.error_msg || ''}>
                    {log.error_msg || ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
