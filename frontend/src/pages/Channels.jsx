import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getChannels, createChannel, updateChannel, deleteChannel,
  addChannelTarget, removeChannelTarget,
  addChannelRule, deleteChannelRule,
  getCatalogProducts,
} from '../api'

const MATCH_TYPES = [
  { value: 'all', label: 'Todos os produtos' },
  { value: 'tag', label: 'Por tag' },
  { value: 'brand', label: 'Por marca' },
  { value: 'search_term', label: 'Por termo de busca (ID)' },
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

function CatalogPreview({ rules }) {
  // Build filter params from rules to preview matching products
  const firstTagRule = rules.find(r => r.match_type === 'tag' && r.active)
  const firstBrandRule = rules.find(r => r.match_type === 'brand' && r.active)
  const hasAllRule = rules.some(r => r.match_type === 'all' && r.active)

  const params = {
    limit: 8,
    ...(firstTagRule && { tag: firstTagRule.match_value }),
    ...(firstBrandRule && { brand: firstBrandRule.match_value }),
  }

  const { data } = useQuery({
    queryKey: ['catalogPreview', params],
    queryFn: () => getCatalogProducts(params),
    enabled: rules.length > 0,
    staleTime: 60_000,
  })

  const products = data?.items ?? []
  const total = data?.total ?? 0

  if (rules.length === 0) {
    return <p className="text-xs text-gray-600 py-2">Adicione regras para ver quais produtos seriam enviados.</p>
  }

  return (
    <div>
      <p className="text-xs text-gray-400 mb-2">
        {hasAllRule ? `Todo o catalogo (${total} produtos)` : `${total} produto${total !== 1 ? 's' : ''} matcham as regras`}
      </p>
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {products.map(p => (
          <div key={p.id} className="flex items-center gap-3 py-1.5 px-2 bg-gray-800 rounded text-xs">
            {p.image_url && <img src={p.image_url} alt="" className="w-8 h-8 object-contain bg-white rounded flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-gray-300 truncate">{p.canonical_name}</p>
              <div className="flex gap-1">
                {p.brand && <span className="text-blue-400">{p.brand}</span>}
                {p.weight && <span className="text-gray-500">{p.weight}</span>}
              </div>
            </div>
            <span className="text-green-400 font-medium whitespace-nowrap">
              R$ {(p.lowest_price || 0).toFixed(2).replace('.', ',')}
            </span>
            <span className="text-gray-500">{p.variant_count}v</span>
          </div>
        ))}
      </div>
      {total > 8 && <p className="text-xs text-gray-600 mt-1">...e mais {total - 8} produtos</p>}
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
            <div className="flex gap-1 mt-2 flex-wrap">
              {channel.targets.map(t => (
                <span key={t.id} className={`${badge} ${t.provider === 'whatsapp' ? 'bg-green-900 text-green-300' : 'bg-blue-900 text-blue-300'}`}>
                  {t.provider === 'whatsapp' ? '📱' : '🤖'} {t.chat_id.length > 15 ? `...${t.chat_id.slice(-10)}` : t.chat_id}
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

        {/* Rules summary inline */}
        {!expanded && channel.rules.length > 0 && (
          <p className="text-xs text-gray-600 mt-2">
            {channel.rules.length} regra{channel.rules.length > 1 ? 's' : ''}: {channel.rules.map(r =>
              r.match_type === 'all' ? 'todos' : `${r.match_type}="${r.match_value}"`
            ).join(', ')}
          </p>
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-800 pt-3 space-y-4">
          {/* Rules section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-medium text-gray-300">Regras de envio</h4>
              <button onClick={() => setShowAddRule(r => !r)} className="text-xs text-green-400 hover:text-green-300">+ Regra</button>
            </div>
            <div className="space-y-1">
              {channel.rules.map(r => <RuleCard key={r.id} rule={r} channelId={channel.id} />)}
              {channel.rules.length === 0 && <p className="text-xs text-gray-600">Nenhuma regra — nenhum produto sera enviado</p>}
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

          {/* Targets section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-medium text-gray-300">Targets ({channel.targets.length})</h4>
              <button onClick={() => setShowAddTarget(t => !t)} className="text-xs text-blue-400 hover:text-blue-300">+ Target</button>
            </div>
            <div className="space-y-1">
              {channel.targets.map(t => (
                <div key={t.id} className="flex items-center gap-2 py-1.5 px-2 bg-gray-800 rounded text-xs">
                  <span className={t.provider === 'whatsapp' ? 'text-green-400' : 'text-blue-400'}>
                    {t.provider === 'whatsapp' ? '📱 WhatsApp' : '🤖 Telegram'}
                  </span>
                  <span className="text-gray-400 font-mono flex-1">{t.chat_id}</span>
                  <span className={`${badge} ${t.status === 'ok' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>{t.status}</span>
                  <button onClick={() => rmTarget.mutate(t.id)} className="text-gray-500 hover:text-red-400">×</button>
                </div>
              ))}
            </div>
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

          {/* Catalog preview */}
          <div>
            <h4 className="text-xs font-medium text-gray-300 mb-2">Produtos que seriam enviados</h4>
            <CatalogPreview rules={channel.rules} />
          </div>
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
        {channels.map(ch => <ChannelCard key={ch.id} channel={ch} />)}
      </div>

      {!isLoading && channels.length === 0 && (
        <div className="text-center py-16 bg-gray-900 border border-gray-800 rounded-xl">
          <p className="text-4xl mb-3">📢</p>
          <p className="text-gray-400">Nenhum canal de envio configurado.</p>
          <p className="text-gray-500 text-sm mt-1">Crie um canal, adicione targets (WA/TG) e regras para filtrar o catalogo.</p>
        </div>
      )}
    </div>
  )
}
