import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getTGStatus, getTGChats, resolveTGChat, linkTGChat, unlinkTGChat,
  getTGInvite, setTGTitle, leaveTGChat, getTGDeeplink, getConfig, getGroups,
} from '../api'

export default function TGGroups() {
  const qc = useQueryClient()
  const [resolveHandle, setResolveHandle] = useState('')
  const [resolvedChat, setResolvedChat] = useState(null)
  const [inviteLinks, setInviteLinks] = useState({}) // { chatId: link }
  const [selectedGroup, setSelectedGroup] = useState('') // para linking
  const [editingTitle, setEditingTitle] = useState(null) // chat_id being edited
  const [newTitle, setNewTitle] = useState('')

  const { data: config } = useQuery({ queryKey: ['config'], queryFn: getConfig })
  const { data: tgStatus } = useQuery({
    queryKey: ['tgStatus'], queryFn: getTGStatus, refetchInterval: 5000,
  })
  const { data: groups = [] } = useQuery({
    queryKey: ['groups'], queryFn: getGroups,
  })
  const { data: chats = [], isLoading, refetch } = useQuery({
    queryKey: ['tgChats'], queryFn: getTGChats,
    staleTime: 30000, enabled: tgStatus?.enabled && tgStatus?.configured,
  })

  const { data: deeplink } = useQuery({
    queryKey: ['tgDeeplink'], queryFn: getTGDeeplink,
    enabled: tgStatus?.enabled && tgStatus?.configured,
  })

  const resolve = useMutation({
    mutationFn: resolveTGChat,
    onSuccess: (data) => {
      setResolvedChat(data)
      setResolveHandle('')
      refetch()
    },
  })

  const link = useMutation({
    mutationFn: ({ chatId, groupId }) => linkTGChat(chatId, groupId),
    onSuccess: () => {
      setSelectedGroup('')
      setResolvedChat(null)
      refetch()
      qc.invalidateQueries({ queryKey: ['groups'] })
    },
  })

  const unlink = useMutation({
    mutationFn: unlinkTGChat,
    onSuccess: () => {
      refetch()
      qc.invalidateQueries({ queryKey: ['groups'] })
    },
  })

  const setTitle = useMutation({
    mutationFn: ({ chatId, title }) => setTGTitle(chatId, title),
    onSuccess: () => {
      setEditingTitle(null)
      setNewTitle('')
      refetch()
    },
  })

  const leave = useMutation({
    mutationFn: leaveTGChat,
    onSuccess: () => refetch(),
  })

  const fetchInvite = async (chatId) => {
    try {
      const data = await getTGInvite(chatId)
      setInviteLinks(prev => ({ ...prev, [chatId]: data.invite_link }))
    } catch {
      setInviteLinks(prev => ({ ...prev, [chatId]: 'erro' }))
    }
  }

  const field = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors text-sm'

  if (!tgStatus?.configured) {
    return (
      <div className="text-center py-20">
        <p className="text-5xl mb-4">🤖</p>
        <p className="text-gray-400 text-lg">Telegram não configurado</p>
        <p className="text-gray-500 text-sm mt-2">Vá em Configurações e configure o token do bot primeiro.</p>
      </div>
    )
  }

  if (!tgStatus?.enabled) {
    return (
      <div className="text-center py-20">
        <p className="text-5xl mb-4">🔒</p>
        <p className="text-gray-400 text-lg">Telegram desabilitado</p>
        <p className="text-gray-500 text-sm mt-2">Ative Telegram em Configurações.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Grupos Telegram</h1>
          <p className="text-gray-400 text-sm mt-1">
            {chats.filter(c => !c.linked_group_id).length} não vinculado{chats.filter(c => !c.linked_group_id).length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => refetch()} className="text-gray-400 hover:text-white text-sm transition-colors">
          🔄 Atualizar
        </button>
      </div>

      {/* Deep-link para novo grupo */}
      {deeplink && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
          <h2 className="text-sm font-medium text-gray-300 mb-3">Adicionar bot a novo grupo</h2>
          <p className="text-xs text-gray-500 mb-3">
            Use este link para adicionar o bot {tgStatus?.bot?.username ? `@${tgStatus.bot.username}` : 'Telegram'} a um novo grupo:
          </p>
          <a
            href={deeplink.url}
            target="_blank"
            rel="noreferrer"
            className="inline-block bg-blue-700 hover:bg-blue-600 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            🔗 Adicionar a novo grupo
          </a>
        </div>
      )}

      {/* Resolver chat por @handle */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
        <h2 className="text-sm font-medium text-gray-300 mb-3">Resolver grupo por @handle</h2>
        <div className="flex gap-2 mb-3">
          <input
            className={`${field} flex-1`}
            placeholder="@meugrupo ou -100123456789"
            value={resolveHandle}
            onChange={e => setResolveHandle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && resolveHandle.trim() && resolve.mutate(resolveHandle)}
          />
          <button
            onClick={() => resolve.mutate(resolveHandle)}
            disabled={!resolveHandle.trim() || resolve.isPending}
            className="bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-sm px-5 py-2 rounded-lg whitespace-nowrap transition-colors"
          >
            {resolve.isPending ? '⏳' : '🔍 Resolver'}
          </button>
        </div>

        {/* Resolved chat info + link to group */}
        {resolvedChat && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 space-y-2">
            <div>
              <p className="text-xs text-gray-400">Chat resolvido:</p>
              <p className="text-white font-mono">{resolvedChat.title}</p>
              <p className="text-xs text-gray-500 font-mono">{resolvedChat.chat_id}</p>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Vincular a grupo:</label>
              <select
                className={field}
                value={selectedGroup}
                onChange={e => setSelectedGroup(e.target.value)}
              >
                <option value="">— Selecione um grupo</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (selectedGroup) {
                    link.mutate({ chatId: resolvedChat.chat_id, groupId: parseInt(selectedGroup) })
                  }
                }}
                disabled={!selectedGroup || link.isPending}
                className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
              >
                {link.isPending ? '⏳' : '✓ Vincular'}
              </button>
              <button
                onClick={() => {
                  setResolvedChat(null)
                  setSelectedGroup('')
                }}
                className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {resolve.isError && (
          <p className="text-xs text-red-400 mt-2">✗ {resolve.error?.response?.data?.detail || 'Erro ao resolver'}</p>
        )}
      </div>

      {/* Lista de chats descobertos */}
      {isLoading && <p className="text-gray-500 text-sm">Carregando...</p>}

      <div className="space-y-3">
        {chats.map(c => (
          <div key={c.chat_id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-base font-medium text-white">{c.title}</p>
                <p className="text-xs text-gray-500 font-mono mt-0.5">{c.chat_id}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {c.type === 'private' ? '👤 Privado' : c.type === 'group' ? '👥 Grupo' : '📢 Canal'} •{' '}
                  {c.member_count ? `${c.member_count} membros` : 'membros desconhecidos'}
                  {c.is_admin ? ' • 🔑 Admin' : ''}
                </p>
              </div>
              <div className="flex gap-2 ml-3 flex-shrink-0">
                {c.is_admin && (
                  <>
                    <button
                      onClick={() => {
                        setEditingTitle(c.chat_id)
                        setNewTitle(c.title)
                      }}
                      className="text-gray-400 hover:text-white text-sm transition-colors"
                      title="Editar título"
                    >✏️</button>
                    <button
                      onClick={() => fetchInvite(c.chat_id)}
                      className="text-gray-400 hover:text-green-400 text-sm transition-colors"
                      title="Invite link"
                    >🔗</button>
                  </>
                )}
                <button
                  onClick={() => { navigator.clipboard.writeText(c.chat_id) }}
                  className="text-gray-400 hover:text-blue-400 text-sm transition-colors"
                  title="Copiar ID"
                >📋</button>
                {c.linked_group_id ? (
                  <button
                    onClick={() => {
                      if (confirm(`Desvincular do grupo?`)) {
                        unlink.mutate(c.chat_id)
                      }
                    }}
                    className="text-gray-400 hover:text-yellow-400 text-sm transition-colors"
                    title="Desvincar"
                  >🔗‍💔</button>
                ) : null}
                <button
                  onClick={() => {
                    if (confirm(`Bot sairá do grupo "${c.title}"?`)) {
                      leave.mutate(c.chat_id)
                    }
                  }}
                  className="text-gray-400 hover:text-red-400 text-sm transition-colors"
                  title="Bot sair do grupo"
                >🚪</button>
              </div>
            </div>

            {/* Status vinculado */}
            {c.linked_group_id && (
              <div className="mt-2 px-2 py-1 bg-green-900 bg-opacity-30 border border-green-800 rounded text-xs text-green-300">
                ✓ Vinculado ao grupo #{c.linked_group_id}
              </div>
            )}

            {/* Invite link */}
            {inviteLinks[c.chat_id] && inviteLinks[c.chat_id] !== 'erro' && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  readOnly
                  value={inviteLinks[c.chat_id]}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-green-400 font-mono"
                />
                <button
                  onClick={() => navigator.clipboard.writeText(inviteLinks[c.chat_id])}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >Copiar</button>
              </div>
            )}
            {inviteLinks[c.chat_id] === 'erro' && (
              <p className="text-xs text-red-400 mt-2">Não foi possível obter o invite link</p>
            )}

            {/* Edit title form */}
            {editingTitle === c.chat_id && (
              <div className="mt-3 pt-3 border-t border-gray-800 space-y-2">
                <div>
                  <label className="text-xs text-gray-400">Novo título (com prefixo)</label>
                  <input
                    className={field}
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder={`${config?.tg_group_prefix || 'Snatcher'} - ...`}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTitle.mutate({ chatId: c.chat_id, title: newTitle })}
                    disabled={setTitle.isPending}
                    className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs px-4 py-1.5 rounded-lg transition-colors"
                  >
                    {setTitle.isPending ? '⏳' : 'Salvar'}
                  </button>
                  <button
                    onClick={() => setEditingTitle(null)}
                    className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-4 py-1.5 rounded-lg transition-colors"
                  >Cancelar</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {!isLoading && chats.length === 0 && (
        <div className="text-center py-12 bg-gray-900 border border-gray-800 rounded-xl">
          <p className="text-4xl mb-3">🤖</p>
          <p className="text-gray-400">Nenhum grupo descoberto ainda</p>
          <p className="text-gray-500 text-sm mt-1">Adicione o bot a um grupo ou use o link acima.</p>
        </div>
      )}
    </div>
  )
}
