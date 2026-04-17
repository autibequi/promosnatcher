import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getSearchTerms, getCatalogProducts, getChannels, getScanStatus, getGroups } from '../api'

function StatCard({ label, value, icon, link, color = 'text-white' }) {
  const inner = (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
      <p className="text-gray-400 text-xs uppercase tracking-wider">{label}</p>
      <div className="flex items-center gap-3 mt-2">
        <span className="text-3xl">{icon}</span>
        <span className={`text-2xl font-bold ${color}`}>{value}</span>
      </div>
    </div>
  )
  return link ? <Link to={link}>{inner}</Link> : inner
}

export default function Dashboard() {
  const { data: terms = [] } = useQuery({ queryKey: ['searchTerms'], queryFn: getSearchTerms, staleTime: 30_000, retry: false })
  const { data: catalogPage } = useQuery({ queryKey: ['catalogDash'], queryFn: () => getCatalogProducts({ limit: 1 }), staleTime: 30_000, retry: false })
  const { data: channels = [] } = useQuery({ queryKey: ['channels'], queryFn: getChannels, staleTime: 30_000, retry: false })
  const { data: scanStatus } = useQuery({ queryKey: ['scanStatus'], queryFn: getScanStatus, refetchInterval: 10_000, retry: false })
  // Fallback: v1 groups count for servers that haven't migrated yet
  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: getGroups, staleTime: 60_000, retry: false })

  const activeTerms = terms.filter(t => t.active).length
  const catalogTotal = catalogPage?.total ?? 0
  const activeChannels = channels.filter(c => c.active).length
  const totalTargets = channels.reduce((sum, ch) => sum + (ch.targets?.length || 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Promo Snatcher</h1>
          <p className="text-gray-400 mt-1 text-sm">Pipeline: Crawl → Catalogo → Canais</p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Crawlers" value={activeTerms} icon="🔍" link="/admin/crawlers" color="text-blue-400" />
        <StatCard label="Catalogo" value={catalogTotal} icon="📦" link="/admin/catalog" color="text-green-400" />
        <StatCard label="Canais" value={activeChannels} icon="📢" link="/admin/channels" color="text-purple-400" />
        <StatCard label="Targets" value={totalTargets} icon="📱" color="text-yellow-400" />
      </div>

      {/* Scheduler status */}
      {scanStatus && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-300">Scheduler</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {scanStatus.running
                  ? `Ativo — proximo pipeline: ${scanStatus.next_run ? new Date(scanStatus.next_run).toLocaleTimeString('pt-BR') : '...'}`
                  : 'Parado'}
              </p>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${scanStatus.running ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-500'}`}>
              {scanStatus.running ? `a cada ${scanStatus.interval_minutes}min` : 'offline'}
            </span>
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link to="/admin/crawlers" className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-blue-800 transition-colors group">
          <p className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">Crawlers</p>
          <p className="text-xs text-gray-500 mt-1">Gerenciar termos de busca, ver resultados brutos, disparar crawls manuais</p>
        </Link>
        <Link to="/admin/catalog" className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-green-800 transition-colors group">
          <p className="text-sm font-medium text-white group-hover:text-green-400 transition-colors">Catalogo</p>
          <p className="text-xs text-gray-500 mt-1">Produtos agrupados por familia, variantes, tags, historico de precos</p>
        </Link>
        <Link to="/admin/channels" className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-purple-800 transition-colors group">
          <p className="text-sm font-medium text-white group-hover:text-purple-400 transition-colors">Canais</p>
          <p className="text-xs text-gray-500 mt-1">Targets WA/TG, regras de envio, preview de produtos</p>
        </Link>
      </div>
    </div>
  )
}
