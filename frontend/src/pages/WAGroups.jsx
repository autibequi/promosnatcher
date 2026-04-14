import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getWAGroups, createWAGroupDirect, getWAGroupInvite, updateWAGroup, leaveWAGroup,
         getWAStatus, getConfig, updateConfig } from '../api'

export default function WAGroups() {
  const qc = useQueryClient()
  const [newGroupName, setNewGroupName] = useState('')
  const [editing, setEditing] = useState(null) // group id being edited
  const [editForm, setEditForm] = useState({ subject: '', description: '' })
  const [inviteLinks, setInviteLinks] = useState({}) // { groupId: link }

  const { data: config } = useQuery({ queryKey: ['config'], queryFn: getConfig })
  const { data: waStatus } = useQuery({
    queryKey: ['waStatus'], queryFn: getWAStatus, refetchInterval: 5000,
  })
  const { data: groups = [], isLoading, refetch } = useQuery({
    queryKey: ['waGroups'], queryFn: getWAGroups,
    staleTime: 30000, enabled: waStatus?.status === 'WORKING',
  })

  const prefix = config?.wa_group_prefix || ''

  const createGroup = useMutation({
    mutationFn: createWAGroupDirect,
    onSuccess: (data) => {
      setNewGroupName('')
      if (data.invite_link) {
        setInviteLinks(prev => ({ ...prev, [data.group_id]: data.invite_link }))
      }
      refetch()
    },
  })

  const update = useMutation({
    mutationFn: ({ id, data }) => updateWAGroup(id, data),
    onSuccess: () => { setEditing(null); refetch() },
  })

  const leave = useMutation({
    mutationFn: leaveWAGroup,
    onSuccess: () => refetch(),
  })

  const fetchInvite = async (groupId) => {
    try {
      const data = await getWAGroupInvite(groupId)
      setInviteLinks(prev => ({ ...prev, [groupId]: data.invite_link }))
    } catch {
      setInviteLinks(prev => ({ ...prev, [groupId]: 'erro' }))
    }
  }

  const savePrefixMutation = useMutation({
    mutationFn: (newPrefix) => updateConfig({ wa_group_prefix: newPrefix }),
  })

  const [prefixInput, setPrefixInput] = useState(null)

  const field = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors text-sm'

  if (waStatus?.status !== 'WORKING') {
    return (
      <div className="text-center py-20">
        <p className="text-5xl mb-4">📱</p>
        <p className="text-gray-400 text-lg">WhatsApp não conectado</p>
        <p className="text-gray-500 text-sm mt-2">Vá em Configurações e conecte o WhatsApp primeiro.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Grupos WhatsApp</h1>
          <p className="text-gray-400 text-sm mt-1">{groups.length} grupo{groups.length !== 1 ? 's' : ''} com prefixo "{prefix || '...'}"</p>
        </div>
        <button onClick={() => refetch()} className="text-gray-400 hover:text-white text-sm transition-colors">
          🔄 Atualizar
        </button>
      </div>

      {/* Prefixo */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-300 whitespace-nowrap">Prefixo:</label>
          <input
            className={`${field} max-w-xs`}
            value={prefixInput ?? prefix}
            onChange={e => setPrefixInput(e.target.value)}
            placeholder="Snatcher"
          />
          <span className="text-xs text-gray-500 font-mono">→ {prefixInput ?? prefix} - Nome</span>
          {prefixInput !== null && prefixInput !== prefix && (
            <button
              onClick={() => { savePrefixMutation.mutate(prefixInput); setPrefixInput(null) }}
              className="bg-green-700 hover:bg-green-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
            >
              Salvar
            </button>
          )}
        </div>
      </div>

      {/* Criar grupo */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
        <h2 className="text-sm font-medium text-gray-300 mb-3">Criar novo grupo</h2>
        <div className="flex gap-2">
          <input
            className={`${field} flex-1`}
            placeholder={prefix ? `ex: Whey Barato → ${prefix} - Whey Barato` : 'Nome do grupo'}
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && newGroupName.trim() && createGroup.mutate(newGroupName)}
          />
          <button
            onClick={() => createGroup.mutate(newGroupName)}
            disabled={!newGroupName.trim() || createGroup.isPending}
            className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm px-5 py-2 rounded-lg whitespace-nowrap transition-colors"
          >
            {createGroup.isPending ? '⏳ Criando...' : '+ Criar'}
          </button>
        </div>
        {createGroup.isSuccess && <p className="text-xs text-green-400 mt-2">✓ Grupo criado!</p>}
        {createGroup.isError && (
          <p className="text-xs text-red-400 mt-2">✗ {createGroup.error?.response?.data?.detail || 'Erro'}</p>
        )}
      </div>

      {/* Lista de grupos */}
      {isLoading && <p className="text-gray-500 text-sm">Carregando...</p>}

      <div className="space-y-3">
        {groups.map(g => (
          <div key={g.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-base font-medium text-white">{g.name}</p>
                <p className="text-xs text-gray-500 font-mono mt-0.5">{g.id}</p>
                {g.size > 0 && <span className="text-xs text-gray-500">{g.size} membros</span>}
              </div>
              <div className="flex gap-2 ml-3 flex-shrink-0">
                <button
                  onClick={() => {
                    if (editing === g.id) { setEditing(null) } else {
                      setEditing(g.id)
                      setEditForm({ subject: g.name, description: '' })
                    }
                  }}
                  className="text-gray-400 hover:text-white text-sm transition-colors"
                  title="Editar"
                >✏️</button>
                <button
                  onClick={() => fetchInvite(g.id)}
                  className="text-gray-400 hover:text-green-400 text-sm transition-colors"
                  title="Invite link"
                >🔗</button>
                <button
                  onClick={() => { navigator.clipboard.writeText(g.id) }}
                  className="text-gray-400 hover:text-blue-400 text-sm transition-colors"
                  title="Copiar ID"
                >📋</button>
                <button
                  onClick={() => { if (confirm(`Sair do grupo "${g.name}"?`)) leave.mutate(g.id) }}
                  className="text-gray-400 hover:text-red-400 text-sm transition-colors"
                  title="Sair do grupo"
                >🚪</button>
              </div>
            </div>

            {/* Invite link */}
            {inviteLinks[g.id] && inviteLinks[g.id] !== 'erro' && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  readOnly
                  value={inviteLinks[g.id]}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-green-400 font-mono"
                />
                <button
                  onClick={() => navigator.clipboard.writeText(inviteLinks[g.id])}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >Copiar</button>
              </div>
            )}
            {inviteLinks[g.id] === 'erro' && (
              <p className="text-xs text-red-400 mt-2">Não foi possível obter o invite link</p>
            )}

            {/* Edit form */}
            {editing === g.id && (
              <div className="mt-3 pt-3 border-t border-gray-800 space-y-2">
                <div>
                  <label className="text-xs text-gray-400">Nome do grupo</label>
                  <input className={field} value={editForm.subject}
                    onChange={e => setEditForm(f => ({ ...f, subject: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Descrição</label>
                  <textarea className={`${field} resize-none`} rows={3}
                    value={editForm.description}
                    onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Descrição do grupo WA" />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => update.mutate({ id: g.id, data: editForm })}
                    disabled={update.isPending}
                    className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs px-4 py-1.5 rounded-lg transition-colors"
                  >
                    {update.isPending ? '⏳' : 'Salvar'}
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-4 py-1.5 rounded-lg transition-colors"
                  >Cancelar</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {!isLoading && groups.length === 0 && (
        <div className="text-center py-12 bg-gray-900 border border-gray-800 rounded-xl">
          <p className="text-4xl mb-3">📱</p>
          <p className="text-gray-400">Nenhum grupo com prefixo "{prefix}"</p>
          <p className="text-gray-500 text-sm mt-1">Crie um acima ou no WhatsApp com o prefixo "{prefix} - Nome".</p>
        </div>
      )}
    </div>
  )
}
