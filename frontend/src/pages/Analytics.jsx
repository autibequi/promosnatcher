import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
         PieChart, Pie, Cell, BarChart, Bar } from 'recharts'
import { getAnalyticsSummary, getAnalyticsByGroup } from '../api'

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6']

export default function Analytics() {
  const [days, setDays] = useState(30)

  const { data: summary, isLoading } = useQuery({
    queryKey: ['analytics', 'summary', days],
    queryFn: () => getAnalyticsSummary(days),
  })

  const { data: byGroup = [] } = useQuery({
    queryKey: ['analytics', 'byGroup', days],
    queryFn: () => getAnalyticsByGroup(days),
  })

  const stat = 'bg-gray-900 border border-gray-800 rounded-xl p-5 text-center'

  if (isLoading) return <div className="text-center text-gray-400 py-16">Carregando analytics...</div>

  const ratio = summary?.unique > 0 ? (summary.total / summary.unique).toFixed(1) : '—'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <select
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-green-500"
        >
          <option value={7}>7 dias</option>
          <option value={30}>30 dias</option>
          <option value={90}>90 dias</option>
          <option value={365}>365 dias</option>
        </select>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className={stat}>
          <p className="text-3xl font-bold text-white">{summary?.total?.toLocaleString() || 0}</p>
          <p className="text-sm text-gray-400 mt-1">Cliques</p>
        </div>
        <div className={stat}>
          <p className="text-3xl font-bold text-white">{summary?.unique?.toLocaleString() || 0}</p>
          <p className="text-sm text-gray-400 mt-1">Visitantes únicos</p>
        </div>
        <div className={stat}>
          <p className="text-3xl font-bold text-white">{ratio}</p>
          <p className="text-sm text-gray-400 mt-1">Cliques/Único</p>
        </div>
      </div>

      {/* Daily chart */}
      {summary?.daily?.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-medium text-gray-300 mb-4">Cliques por dia</h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={summary.daily}>
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
              <Line type="monotone" dataKey="clicks" stroke="#22c55e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Source + Group charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* By source */}
        {summary?.by_source?.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-sm font-medium text-gray-300 mb-4">Por fonte</h2>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={summary.by_source} dataKey="clicks" nameKey="source" cx="50%" cy="50%"
                     outerRadius={70} label={({ source, clicks }) => `${source}: ${clicks}`}>
                  {summary.by_source.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* By group */}
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
      </div>

      {/* Top products */}
      {summary?.top_products?.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-medium text-gray-300 mb-4">Top produtos</h2>
          <div className="space-y-2">
            {summary.top_products.map((p, i) => (
              <div key={p.id} className="flex items-center justify-between bg-gray-800 px-4 py-2.5 rounded-lg">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-gray-500 text-sm font-mono w-5">{i + 1}</span>
                  <p className="text-sm text-white truncate">{p.title}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${p.source === 'amazon' ? 'bg-orange-900 text-orange-300' : 'bg-yellow-900 text-yellow-300'}`}>
                    {p.source === 'amazon' ? 'AMZ' : 'ML'}
                  </span>
                  <span className="text-sm text-green-400 font-medium w-16 text-right">
                    {p.clicks} click{p.clicks !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(!summary?.total) && (
        <div className="text-center py-16 bg-gray-900 border border-gray-800 rounded-xl">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-gray-400">Nenhum clique registrado ainda.</p>
          <p className="text-gray-500 text-sm mt-1">Os cliques aparecem quando alguém abre um link enviado no WhatsApp.</p>
        </div>
      )}
    </div>
  )
}
