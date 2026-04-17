import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getGroups, getScanStatus } from '../api'

function StatCard({ label, value, icon, link, color = 'text-white' }) {
  const inner = (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
      <p className="text-gray-400 text-xs uppercase tracking-wider">{label}</p>
      <div className="flex items-center gap-3 mt-2">
        <span className="text-3xl">{icon}</span>
        <span className={`text-2xl font-bold ${color}`}>{value ?? '-'}</span>
      </div>
    </div>
  )
  return link ? <Link to={link}>{inner}</Link> : inner
}

// Safe fetch — retorna null se endpoint nao existe (404/500)
const safeFetch = (fn) => async () => {
  try { return await fn() } catch { return null }
}

export default function Dashboard() {
  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: getGroups, retry: false })
  const { data: scanStatus } = useQuery({ queryKey: ['scanStatus'], queryFn: getScanStatus, refetchInterval: 10_000, retry: false })

  // v2 endpoints — podem nao existir ainda
  const { data: v2Terms } = useQuery({
    queryKey: ['v2terms'],
    queryFn: safeFetch(async () => {
      const { getSearchTerms } = await import('../api')
      return getSearchTerms()
    }),
    retry: false, staleTime: 30_000,
  })
  const { data: v2Catalog } = useQuery({
    queryKey: ['v2catalog'],
    queryFn: safeFetch(async () => {
      const { getCatalogProducts } = await import('../api')
      return getCatalogProducts({ limit: 1 })
    }),
    retry: false, staleTime: 30_000,
  })
  const { data: v2Channels } = useQuery({
    queryKey: ['v2channels'],
    queryFn: safeFetch(async () => {
      const { getChannels } = await import('../api')
      return getChannels()
    }),
    retry: false, staleTime: 30_000,
  })

  const hasV2 = v2Terms !== null && v2Terms !== undefined
  const termCount = hasV2 ? (v2Terms?.filter?.(t => t.active)?.length ?? 0) : groups.filter(g => g.active).length
  const catalogCount = v2Catalog?.total ?? 0
  const channelCount = hasV2 ? (v2Channels?.filter?.(c => c.active)?.length ?? 0) : groups.length

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Promo Snatcher</h1>
          <p className="text-gray-400 mt-1 text-sm">
            {hasV2 ? 'Pipeline: Crawl → Catalogo → Canais' : `${groups.length} grupo${groups.length !== 1 ? 's' : ''} configurado${groups.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label={hasV2 ? 'Crawlers' : 'Grupos'} value={termCount} icon="🔍" link={hasV2 ? '/admin/crawlers' : '/admin'} color="text-blue-400" />
        <StatCard label="Catalogo" value={catalogCount} icon="📦" link="/admin/catalog" color="text-green-400" />
        <StatCard label="Canais" value={channelCount} icon="📢" link="/admin/channels" color="text-purple-400" />
        <StatCard label="Scheduler" value={scanStatus?.running ? 'Ativo' : 'Off'} icon="⏰"
          color={scanStatus?.running ? 'text-green-400' : 'text-gray-500'} />
      </div>

      {scanStatus && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-300">Scheduler</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {scanStatus.running
                  ? `Ativo — proximo: ${scanStatus.next_run ? new Date(scanStatus.next_run).toLocaleTimeString('pt-BR') : '...'}`
                  : 'Parado'}
              </p>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${scanStatus.running ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-500'}`}>
              {scanStatus.running ? `cada ${scanStatus.interval_minutes}min` : 'offline'}
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link to="/admin/crawlers" className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-blue-800 transition-colors group">
          <p className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">Crawlers</p>
          <p className="text-xs text-gray-500 mt-1">Termos de busca, resultados brutos, crawls manuais</p>
        </Link>
        <Link to="/admin/catalog" className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-green-800 transition-colors group">
          <p className="text-sm font-medium text-white group-hover:text-green-400 transition-colors">Catalogo</p>
          <p className="text-xs text-gray-500 mt-1">Produtos agrupados, variantes, tags, historico</p>
        </Link>
        <Link to="/admin/channels" className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-purple-800 transition-colors group">
          <p className="text-sm font-medium text-white group-hover:text-purple-400 transition-colors">Canais</p>
          <p className="text-xs text-gray-500 mt-1">Targets WA/TG, regras de envio</p>
        </Link>
      </div>
    </div>
  )
}
