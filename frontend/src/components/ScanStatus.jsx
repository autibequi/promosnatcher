import { useQuery, useMutation } from '@tanstack/react-query'
import { getScanStatus, triggerScan } from '../api'

export default function ScanStatus({ groupId }) {
  const { data: status } = useQuery({
    queryKey: ['scanStatus'],
    queryFn: getScanStatus,
    refetchInterval: 30_000,
  })

  const scan = useMutation({ mutationFn: () => triggerScan(groupId) })

  return (
    <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
      <div className="flex-1">
        <p className="text-xs text-gray-400">Scheduler</p>
        {status?.running ? (
          <p className="text-sm text-green-400">
            ● Ativo — próximo scan: {status.next_run ? new Date(status.next_run).toLocaleTimeString('pt-BR') : '?'}
          </p>
        ) : (
          <p className="text-sm text-red-400">● Parado</p>
        )}
      </div>
      <button
        onClick={() => scan.mutate()}
        disabled={scan.isPending}
        className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
      >
        {scan.isPending ? '⏳' : '🔍 Scan Now'}
      </button>
      {scan.isSuccess && <span className="text-xs text-green-400">✓</span>}
    </div>
  )
}
