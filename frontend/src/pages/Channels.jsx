import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getChannels, createChannel, updateChannel, deleteChannel,
  addChannelTarget, removeChannelTarget,
  addChannelRule, deleteChannelRule,
} from '../api'

const MATCH_TYPES = [
  { value: 'all', label: 'Todos os produtos' },
  { value: 'tag', label: 'Por tag' },
  { value: 'brand', label: 'Por marca' },
  { value: 'search_term', label: 'Por termo de busca' },
]

function RuleCard({ rule, channelId }) {
  const qc = useQueryClient()
  const del = useMutation({
    mutationFn: () => deleteChannelRule(channelId, rule.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  })
  const triggers = [
    rule.notify_new && 'Novo',
    rule.notify_drop && `Queda ${(rule.drop_threshold * 100).toFixed(0)}%`,
    rule.notify_lowest && 'Menor preco',
  ].filter(Boolean)

  return (
    <div className="flex items-center gap-3 py-2 px-3 bg-gray-800 rounded text-xs">
      <span className="text-blue-300 font-medium">{MATCH_TYPES.find(m => m.value === rule.match_type)?.label || rule.match_type}</span>
      {rule.match_value && <span className="text-purple-300">"{rule.match_value}"</span>}
      {rule.max_price && <span className="text-yellow-300">max R${rule.max_price}</span>}
      <span className="text-gray-500">→</span>
      <span className="text-green-300">{triggers.join(', ') || 'sem trigger'}</span>
      <button onClick={() => del.mutate()} className="ml-auto text-gray-500 hover:text-red-400 transition-colors">×</button>
    </div>
  )
}

function ChannelCard({ channel }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [showAddTarget, setShowAddTarget] = useState(false)
  const [showAddRule, setShowAddRule] = useState(false)
  const [targetForm, setTargetForm] = useState({ provider: 'whatsapp', chat_id: '' })
  const [ruleForm, setRuleForm] = useState({ match_type: 'tag', match_value: '', max_price: '', notify_new: true, notify_drop: false, notify_lowest: false, drop_threshold: 0.10 })

  const toggleActive = useMutation({
    mutationFn: () => updateChannel(channel.id, { active: !channel.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  })
  const del = useMutation({
    mutationFn: () => deleteChannel(channel.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  })
  const addTarget = useMutation({
    mutationFn: (data) => addChannelTarget(channel.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['channels'] }); setShowAddTarget(false); setTargetForm({ provider: 'whatsapp', chat_id: '' }) },
  })
  const rmTarget = useMutation({
    mutationFn: (targetId) => removeChannelTarget(channel.id, targetId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  })
  const addRule = useMutation({
    mutationFn: (data) => addChannelRule(channel.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['channels'] }); setShowAddRule(false) },
  })

  const field = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors'
  const badge = 'text-xs px-2 py-0.5 rounded-full font-medium'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-base font-medium text-white">{channel.name}</p>
              <span className={`${badge} ${channel.active ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-500'}`}>
                {channel.active ? 'ativo' : 'pauso'}
              </span>
            </div>
            {channel.description && <p className="text-xs text-gray-500 mt-0.5">{channel.description}</p>}
            {/* Targets badges */}
            <div className="flex gap-1 mt-2 flex-wrap">
              {channel.targets.map(t => (
                <span key={t.id} className={`${badge} ${t.provider === 'whatsapp' ? 'bg-green-900 text-green-300' : 'bg-blue-900 text-blue-300'}`}>
                  {t.provider === 'whatsapp' ? '📱' : '🤖'} {t.chat_id.slice(-8)}
                  <button onClick={() => rmTarget.mutate(t.id)} className="ml-1 text-gray-500 hover:text-red-400">×</button>
                </span>
              ))}
              {channel.targets.length === 0 && <span className="text-xs text-gray-600">sem targets</span>}
            </div>
          </div>
          <div className="flex gap-2 ml-3 flex-shrink-0">
            <button onClick={() => setExpanded(e => !e)} className="text-gray-400 hover:text-white text-sm transition-colors">{expanded ? '▲' : '▼'}</button>
            <button onClick={() => toggleActive.mutate()} className="text-gray-400 hover:text-yellow-400 text-sm transition-colors">
              {channel.active ? '⏸️' : '▶️'}
            </button>
            <button onClick={() => { if (confirm(`Remover canal "${channel.name}"?`)) del.mutate() }}
              className="text-gray-400 hover:text-red-400 text-sm transition-colors">🗑️</button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-800 pt-3 space-y-3">
          {/* Rules */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-medium text-gray-400">Regras de envio ({channel.rules.length})</h4>
              <button onClick={() => setShowAddRule(r => !r)} className="text-xs text-green-400 hover:text-green-300">+ Regra</button>
            </div>
            <div className="space-y-1">
              {channel.rules.map(r => <RuleCard key={r.id} rule={r} channelId={channel.id} />)}
              {channel.rules.length === 0 && <p className="text-xs text-gray-600">Nenhuma regra configurada</p>}
            </div>
          </div>

          {/* Add rule form */}
          {showAddRule && (
            <div className="bg-gray-800 rounded-lg p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <select className={field} value={ruleForm.match_type} onChange={e => setRuleForm(f => ({ ...f, match_type: e.target.value }))}>
                  {MATCH_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                {ruleForm.match_type !== 'all' && (
                  <input className={field} placeholder={ruleForm.match_type === 'tag' ? 'nome da tag' : ruleForm.match_type === 'brand' ? 'marca' : 'ID do termo'}
                    value={ruleForm.match_value} onChange={e => setRuleForm(f => ({ ...f, match_value: e.target.value }))} />
                )}
                <input className={field} type="number" placeholder="Preco max (opcional)" value={ruleForm.max_price}
                  onChange={e => setRuleForm(f => ({ ...f, max_price: e.target.value }))} />
              </div>
              <div className="flex gap-3 text-xs">
                <label className="flex items-center gap-1 text-gray-300">
                  <input type="checkbox" checked={ruleForm.notify_new} onChange={e => setRuleForm(f => ({ ...f, notify_new: e.target.checked }))} /> Novo
                </label>
                <label className="flex items-center gap-1 text-gray-300">
                  <input type="checkbox" checked={ruleForm.notify_drop} onChange={e => setRuleForm(f => ({ ...f, notify_drop: e.target.checked }))} /> Queda
                </label>
                <label className="flex items-center gap-1 text-gray-300">
                  <input type="checkbox" checked={ruleForm.notify_lowest} onChange={e => setRuleForm(f => ({ ...f, notify_lowest: e.target.checked }))} /> Menor preco
                </label>
              </div>
              <button onClick={() => addRule.mutate({ ...ruleForm, max_price: ruleForm.max_price ? +ruleForm.max_price : null })}
                className="bg-green-700 hover:bg-green-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">Adicionar regra</button>
            </div>
          )}

          {/* Add target */}
          <div>
            <button onClick={() => setShowAddTarget(t => !t)} className="text-xs text-blue-400 hover:text-blue-300">+ Target WA/TG</button>
          </div>
          {showAddTarget && (
            <div className="flex gap-2">
              <select className={field} value={targetForm.provider} onChange={e => setTargetForm(f => ({ ...f, provider: e.target.value }))}>
                <option value="whatsapp">WhatsApp</option>
                <option value="telegram">Telegram</option>
              </select>
              <input className={`${field} flex-1`} placeholder="Chat ID" value={targetForm.chat_id}
                onChange={e => setTargetForm(f => ({ ...f, chat_id: e.target.value }))} />
              <button onClick={() => addTarget.mutate(targetForm)} disabled={!targetForm.chat_id.trim()}
                className="bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">+</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Channels() {
  const qc = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({ name: '', description: '' })

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ['channels'], queryFn: getChannels,
  })

  const create = useMutation({
    mutationFn: createChannel,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['channels'] }); setShowNew(false); setNewForm({ name: '', description: '' }) },
  })

  const field = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Canais</h1>
          <p className="text-gray-400 text-sm mt-1">{channels.length} canal{channels.length !== 1 ? 'is' : ''}</p>
        </div>
        <button onClick={() => setShowNew(s => !s)} className="bg-green-700 hover:bg-green-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">
          + Novo canal
        </button>
      </div>

      {showNew && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 space-y-3">
          <input className={field} placeholder="Nome do canal" value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} />
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
        {channels.map(ch => <ChannelCard key={ch.id} channel={ch} />)}
      </div>

      {!isLoading && channels.length === 0 && (
        <div className="text-center py-16 bg-gray-900 border border-gray-800 rounded-xl">
          <p className="text-4xl mb-3">📢</p>
          <p className="text-gray-400">Nenhum canal configurado.</p>
          <p className="text-gray-500 text-sm mt-1">Crie um canal e adicione targets WA/TG + regras de envio.</p>
        </div>
      )}
    </div>
  )
}
