import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteGroup, triggerScan, getScanJobs } from '../api'

function ScanBadge({ groupId }) {
  const { data: jobs = [] } = useQuery({
    queryKey: ['scanJobs'],
    queryFn: getScanJobs,
    refetchInterval: 5000,
  })

  const job = jobs.find(j => j.group_id === groupId)
  if (!job) return null

  if (job.status === 'running') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-yellow-400 animate-pulse">
        <span className="inline-block w-2 h-2 rounded-full bg-yellow-400" />
        Escaneando...
      </span>
    )
  }
  if (job.status === 'done') {
    return (
      <span className="text-xs text-gray-500">
        ✓ {job.products_found} produto{job.products_found !== 1 ? 's' : ''} · {new Date(job.finished_at).toLocaleTimeString('pt-BR')}
      </span>
    )
  }
  if (job.status === 'error') {
    return <span className="text-xs text-red-400">✗ Erro no scan</span>
  }
  return null
}

export default function GroupCard({ group }) {
  const qc = useQueryClient()

  const del = useMutation({
    mutationFn: () => deleteGroup(group.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  })

  const scan = useMutation({
    mutationFn: () => triggerScan(group.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scanJobs'] }),
  })

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <Link to={`/admin/groups/${group.id}`} className="text-lg font-semibold text-white hover:text-green-400 transition-colors">
            {group.name}
          </Link>
          {group.description && (
            <p className="text-sm text-gray-400 mt-0.5">{group.description}</p>
          )}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${group.active ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-500'}`}>
          {group.active ? 'Ativo' : 'Inativo'}
        </span>
      </div>

      <p className="text-sm text-gray-300 italic">"{group.search_prompt}"</p>

      <div className="flex gap-2 text-xs">
        <span className="bg-gray-800 text-gray-300 px-2 py-1 rounded">
          Min: R$ {group.min_val.toFixed(2)}
        </span>
        <span className="bg-gray-800 text-gray-300 px-2 py-1 rounded">
          Max: R$ {group.max_val.toFixed(2)}
        </span>
        <span className="bg-gray-800 text-gray-400 px-2 py-1 rounded">
          ⏱ {group.scan_interval}min
        </span>
      </div>

      {/* Status WA */}
      {group.whatsapp_group_id ? (
        <span className={`text-xs flex items-center gap-1 ${
          group.wa_group_status === 'removed' ? 'text-red-400' :
          group.wa_group_status === 'ok' ? 'text-green-400' : 'text-gray-500'
        }`}>
          {group.wa_group_status === 'removed'
            ? '⚠️ Removido do grupo WA'
            : group.wa_group_status === 'ok'
            ? '📱 WA vinculado'
            : `📱 ${group.whatsapp_group_id.slice(0, 20)}...`}
        </span>
      ) : (
        <span className="text-xs text-gray-600">📵 Sem grupo WA</span>
      )}

      {/* Status do último scan */}
      <ScanBadge groupId={group.id} />

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => scan.mutate()}
          disabled={scan.isPending}
          className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
        >
          {scan.isPending ? '⏳' : '🔍 Scan Now'}
        </button>
        <Link
          to={`/groups/${group.id}/edit`}
          className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
        >
          ✏️
        </Link>
        <button
          onClick={() => { if (confirm('Deletar grupo?')) del.mutate() }}
          className="bg-red-900 hover:bg-red-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
        >
          🗑️
        </button>
      </div>
    </div>
  )
}
