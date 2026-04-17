import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
         PieChart, Pie, Cell, BarChart, Bar } from 'recharts'
import { getGroups, getScanStatus, getAnalyticsSummary, getAnalyticsByGroup } from '../api'

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6']

const safeFetch = (fn) => async () => {
  try { return await fn() } catch { return null }
}

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

export default function Dashboard() {
  const [days, setDays] = useState(30)

  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: getGroups, retry: false })
  const { data: scanStatus } = useQuery({ queryKey: ['scanStatus'], queryFn: getScanStatus, refetchInterval: 10_000, retry: false })
  const { data: summary } = useQuery({ queryKey: ['analytics', 'summary', days], queryFn: () => getAnalyticsSummary(days), retry: false })
  const { data: byGroup = [] } = useQuery({ queryKey: ['analytics', 'byGroup', days], queryFn: () => getAnalyticsByGroup(days), retry: false })

  const { data: v2Terms } = useQuery({
    queryKey: ['v2terms'],
    queryFn: safeFetch(async () => { const { getSearchTerms } = await import('../api'); return getSearchTerms() }),
    retry: false, staleTime: 30_000,
  })
  const { data: v2Catalog } = useQuery({
    queryKey: ['v2catalog'],
    queryFn: safeFetch(async () => { const { getCatalogProducts } = await import('../api'); return getCatalogProducts({ limit: 1 }) }),
    retry: false, staleTime: 30_000,
  })
  const { data: v2Channels } = useQuery({
    queryKey: ['v2channels'],
    queryFn: safeFetch(async () => { const { getChannels } = await import('../api'); return getChannels() }),
    retry: false, staleTime: 30_000,
  })

  const hasV2 = v2Terms !== null && v2Terms !== undefined
  const termCount = hasV2 ? (v2Terms?.filter?.(t => t.active)?.length ?? 0) : groups.filter(g => g.active).length
  const catalogCount = v2Catalog?.total ?? 0
  const channelCount = hasV2 ? (v2Channels?.filter?.(c => c.active)?.length ?? 0) : groups.length

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 mt-1 text-sm">Pipeline: Crawl → Catalogo → Canais</p>
        </div>
        <select value={days} onChange={e => setDays(Number(e.target.value))}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-green-500">
          <option value={7}>7 dias</option>
          <option value={30}>30 dias</option>
          <option value={90}>90 dias</option>
        </select>
      </div>

      {/* Pipeline stats + Analytics stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Crawlers" value={termCount} icon="🔍" link="/admin/crawlers" color="text-blue-400" />
        <StatCard label="Catalogo" value={catalogCount} icon="📦" link="/admin/catalog" color="text-green-400" />
        <StatCard label="Canais" value={channelCount} icon="📢" link="/admin/channels" color="text-purple-400" />
        <StatCard label="Cliques" value={summary?.total?.toLocaleString() || 0} icon="👆" color="text-yellow-400" />
        <StatCard label="Unicos" value={summary?.unique?.toLocaleString() || 0} icon="👤" color="text-cyan-400" />
        <StatCard label="Scheduler" value={scanStatus?.running ? 'On' : 'Off'} icon="⏰"
          color={scanStatus?.running ? 'text-green-400' : 'text-gray-500'} />
      </div>

      {/* Scheduler bar */}
      {scanStatus && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-300">
              {scanStatus.running
                ? `Proximo pipeline: ${scanStatus.next_run ? new Date(scanStatus.next_run).toLocaleTimeString('pt-BR') : '...'}`
                : 'Scheduler parado'}
            </p>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${scanStatus.running ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-500'}`}>
              {scanStatus.running ? `cada ${scanStatus.interval_minutes}min` : 'offline'}
            </span>
          </div>
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Daily clicks */}
        {summary?.daily?.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-sm font-medium text-gray-300 mb-4">Cliques por dia</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={summary.daily}>
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                <Line type="monotone" dataKey="clicks" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* By source pie */}
        {summary?.by_source?.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-sm font-medium text-gray-300 mb-4">Por fonte</h2>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={summary.by_source} dataKey="clicks" nameKey="source" cx="50%" cy="50%"
                     outerRadius={70} label={({ source, clicks }) => `${source}: ${clicks}`}>
                  {summary.by_source.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* By group bar + Top products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {byGroup.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-sm font-medium text-gray-300 mb-4">Por grupo</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byGroup.slice(0, 8)} layout="vertical">
                <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} width={100} />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                <Bar dataKey="clicks" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {summary?.top_products?.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-sm font-medium text-gray-300 mb-4">Top produtos</h2>
            <div className="space-y-2">
              {summary.top_products.slice(0, 6).map((p, i) => (
                <div key={p.id} className="flex items-center justify-between bg-gray-800 px-3 py-2 rounded-lg">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-gray-500 text-xs font-mono w-4">{i + 1}</span>
                    <p className="text-xs text-white truncate">{p.title}</p>
                  </div>
                  <span className="text-xs text-green-400 font-medium ml-2 flex-shrink-0">{p.clicks}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Quick links */}
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
