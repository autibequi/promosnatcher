import { useState } from 'react'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getWAAccounts, getWAAccountGroups, createWAAccountGroup, leaveWAAccountGroup,
  getTGChats,
} from '../api'

export default function Groups() {
  const qc = useQueryClient()
  const [newGroupName, setNewGroupName] = useState('')
  const [selectedAccount, setSelectedAccount] = useState(null)

  // WA accounts + groups
  const { data: waAccounts = [] } = useQuery({ queryKey: ['waAccounts'], queryFn: getWAAccounts, retry: false })
  const connectedAccounts = waAccounts.filter(a => a.status === 'connected')

  // Load groups for each connected account (useQueries — array dinâmico OK)
  const waGroupQueries = useQueries({
    queries: connectedAccounts.map(a => ({
      queryKey: ['waGroups', a.id],
      queryFn: () => getWAAccountGroups(a.id),
      staleTime: 30_000,
      retry: false,
    })),
  }).map((q, i) => ({ ...q, account: connectedAccounts[i] }))

  // TG chats
  const { data: tgChats = [] } = useQuery({ queryKey: ['tgChats'], queryFn: getTGChats, retry: false })

  // Flatten all WA groups
  const allWAGroups = waGroupQueries.flatMap(q =>
    (q.data || []).map(g => ({ ...g, accountId: q.account.id, accountName: q.account.name, provider: 'whatsapp' }))
  )

  const createGroup = useMutation({
    mutationFn: ({ accountId, name }) => createWAAccountGroup(accountId, name),
    onSuccess: (_, { accountId }) => {
      qc.invalidateQueries({ queryKey: ['waGroups', accountId] })
      setNewGroupName('')
    },
  })
  const leaveGroup = useMutation({
    mutationFn: ({ accountId, groupId }) => leaveWAAccountGroup(accountId, groupId),
    onSuccess: (_, { accountId }) => qc.invalidateQueries({ queryKey: ['waGroups', accountId] }),
  })

  const field = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors'
  const badge = 'text-xs px-2 py-0.5 rounded-full font-medium'

  const totalGroups = allWAGroups.length + tgChats.length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Grupos</h1>
          <p className="text-gray-400 text-sm mt-1">{totalGroups} grupo{totalGroups !== 1 ? 's' : ''} em {connectedAccounts.length} conta{connectedAccounts.length !== 1 ? 's' : ''} WA + Telegram</p>
        </div>
      </div>

      {/* Criar grupo WA */}
      {connectedAccounts.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
          <h2 className="text-sm font-medium text-gray-300 mb-3">Criar grupo WhatsApp</h2>
          <div className="flex gap-2 items-center">
            <select className={field} value={selectedAccount || connectedAccounts[0]?.id}
              onChange={e => setSelectedAccount(+e.target.value)}>
              {connectedAccounts.map(a => <option key={a.id} value={a.id}>📱 {a.name}</option>)}
            </select>
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-2 rounded-lg border border-gray-700 whitespace-nowrap" title="Prefixo configurado na conta">
              {(connectedAccounts.find(a => a.id === (selectedAccount || connectedAccounts[0]?.id))?.group_prefix || 'Snatcher')} -
            </span>
            <input className={`${field} flex-1`} placeholder="Nome do grupo" value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && newGroupName.trim() && createGroup.mutate({
                accountId: selectedAccount || connectedAccounts[0]?.id,
                name: newGroupName,
              })} />
            <button onClick={() => createGroup.mutate({ accountId: selectedAccount || connectedAccounts[0]?.id, name: newGroupName })}
              disabled={!newGroupName.trim() || createGroup.isPending}
              className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg whitespace-nowrap">
              {createGroup.isPending ? '...' : '+ Criar'}
            </button>
          </div>
          {createGroup.isSuccess && createGroup.data?.invite_link && (
            <div className="flex items-center gap-2 mt-2 text-xs">
              <span className="text-green-400">Criado!</span>
              <input readOnly value={createGroup.data.invite_link} className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-green-400 font-mono" />
              <button onClick={() => navigator.clipboard.writeText(createGroup.data.invite_link)} className="text-gray-400 hover:text-white">📋</button>
            </div>
          )}
          {createGroup.isError && <p className="text-xs text-red-400 mt-2">{createGroup.error?.response?.data?.detail || 'Erro'}</p>}
        </div>
      )}

      {connectedAccounts.length === 0 && waAccounts.length > 0 && (
        <div className="bg-yellow-900 bg-opacity-20 border border-yellow-800 rounded-xl p-4 mb-6 text-xs text-yellow-300">
          Nenhuma conta WA conectada. Va em Config e conecte uma conta primeiro.
        </div>
      )}

      {/* WhatsApp groups */}
      <div className="mb-6">
        <h2 className="text-sm font-medium text-gray-300 mb-3">📱 WhatsApp ({allWAGroups.length})</h2>
        <div className="space-y-1">
          {allWAGroups.map(g => (
            <div key={`${g.accountId}-${g.id}`} className="flex items-center gap-3 py-2 px-3 bg-gray-900 border border-gray-800 rounded-lg text-sm">
              <div className="flex-1 min-w-0">
                <p className="text-white truncate">{g.name}</p>
                <p className="text-xs text-gray-600 font-mono truncate">{g.id}</p>
              </div>
              {connectedAccounts.length > 1 && (
                <span className={`${badge} bg-gray-800 text-gray-400`}>{g.accountName}</span>
              )}
              {g.size > 0 && <span className="text-xs text-gray-500">{g.size} membros</span>}
              <button onClick={() => navigator.clipboard.writeText(g.id)} className="text-gray-500 hover:text-blue-400 text-sm" title="Copiar ID">📋</button>
              <button onClick={() => { if (confirm(`Sair de "${g.name}"?`)) leaveGroup.mutate({ accountId: g.accountId, groupId: g.id }) }}
                className="text-gray-500 hover:text-red-400 text-sm" title="Sair">🚪</button>
            </div>
          ))}
          {allWAGroups.length === 0 && <p className="text-xs text-gray-600 py-4 text-center">Nenhum grupo WhatsApp</p>}
        </div>
      </div>

      {/* Telegram chats */}
      <div>
        <h2 className="text-sm font-medium text-gray-300 mb-3">🤖 Telegram ({tgChats.length})</h2>
        <div className="space-y-1">
          {tgChats.map(c => (
            <div key={c.chat_id} className="flex items-center gap-3 py-2 px-3 bg-gray-900 border border-gray-800 rounded-lg text-sm">
              <div className="flex-1 min-w-0">
                <p className="text-white truncate">{c.title}</p>
                <p className="text-xs text-gray-600 font-mono">{c.chat_id}</p>
              </div>
              <span className={`${badge} ${c.type === 'group' ? 'bg-blue-900 text-blue-300' : 'bg-purple-900 text-purple-300'}`}>
                {c.type}
              </span>
              {c.is_admin && <span className={`${badge} bg-green-900 text-green-300`}>admin</span>}
              {c.member_count && <span className="text-xs text-gray-500">{c.member_count}</span>}
              <button onClick={() => navigator.clipboard.writeText(c.chat_id)} className="text-gray-500 hover:text-blue-400 text-sm" title="Copiar ID">📋</button>
            </div>
          ))}
          {tgChats.length === 0 && <p className="text-xs text-gray-600 py-4 text-center">Nenhum chat Telegram descoberto</p>}
        </div>
      </div>
    </div>
  )
}
