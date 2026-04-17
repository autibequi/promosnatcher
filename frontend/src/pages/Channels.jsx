import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getChannels, createChannel } from '../api'

export default function Channels() {
  const qc = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({ name: '', description: '' })

  const { data: channels = [], isLoading } = useQuery({ queryKey: ['channels'], queryFn: getChannels })

  const create = useMutation({
    mutationFn: createChannel,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['channels'] }); setShowNew(false); setNewForm({ name: '', description: '' }) },
  })

  const field = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors'
  const badge = 'text-xs px-2 py-0.5 rounded-full font-medium'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Canais</h1>
          <p className="text-gray-400 text-sm mt-1">{channels.length} canal{channels.length !== 1 ? 'is' : ''} de envio</p>
        </div>
        <button onClick={() => setShowNew(s => !s)} className="bg-green-700 hover:bg-green-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">
          + Novo canal
        </button>
      </div>

      {showNew && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 space-y-3">
          <input className={field} placeholder="Nome do canal (ex: Whey Barato)" value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} />
          <input className={field} placeholder="Descricao (opcional)" value={newForm.description} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))} />
          <div className="flex gap-2">
            <button onClick={() => create.mutate(newForm)} disabled={!newForm.name.trim() || create.isPending}
              className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors">
              {create.isPending ? '...' : 'Criar'}
            </button>
            <button onClick={() => setShowNew(false)} className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">Cancelar</button>
          </div>
        </div>
      )}

      {isLoading && <p className="text-gray-500 text-sm">Carregando...</p>}

      <div className="space-y-3">
        {channels.map(ch => (
          <Link key={ch.id} to={`/admin/channels/${ch.id}`}
            className="block bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-base font-medium text-white">{ch.name}</p>
                  <span className={`${badge} ${ch.active ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-500'}`}>
                    {ch.active ? 'ativo' : 'pauso'}
                  </span>
                </div>
                {ch.description && <p className="text-xs text-gray-500 mt-0.5">{ch.description}</p>}
                <div className="flex gap-1 mt-2 flex-wrap">
                  {ch.targets?.map(t => (
                    <span key={t.id} className={`${badge} ${t.provider === 'whatsapp' ? 'bg-green-900 text-green-300' : 'bg-blue-900 text-blue-300'}`}>
                      {t.provider === 'whatsapp' ? '📱' : '🤖'} {t.chat_id.length > 15 ? `...${t.chat_id.slice(-10)}` : t.chat_id}
                    </span>
                  ))}
                  {(!ch.targets || ch.targets.length === 0) && <span className="text-xs text-gray-600">sem targets</span>}
                  {ch.rules?.length > 0 && (
                    <span className="text-xs text-gray-500 ml-2">{ch.rules.length} regra{ch.rules.length > 1 ? 's' : ''}</span>
                  )}
                </div>
              </div>
              <span className="text-gray-600 text-sm ml-3">→</span>
            </div>
          </Link>
        ))}
      </div>

      {!isLoading && channels.length === 0 && (
        <div className="text-center py-16 bg-gray-900 border border-gray-800 rounded-xl">
          <p className="text-4xl mb-3">📢</p>
          <p className="text-gray-400">Nenhum canal de envio configurado.</p>
          <p className="text-gray-500 text-sm mt-1">Crie um canal, adicione targets e regras.</p>
        </div>
      )}
    </div>
  )
}
