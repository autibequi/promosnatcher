import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getChannel, updateChannel, deleteChannel,
  addChannelTarget, removeChannelTarget,
  addChannelRule, deleteChannelRule,
  getCatalogProducts, getWAGroups, getTGChats,
} from '../api'

function TargetPicker({ field, onAdd, existingTargets = [] }) {
  const [provider, setProvider] = useState('whatsapp')
  const [chatId, setChatId] = useState('')
  const [mode, setMode] = useState('select')

  const { data: waGroups = [] } = useQuery({
    queryKey: ['waGroups'], queryFn: getWAGroups, enabled: provider === 'whatsapp', retry: false,
  })
  const { data: tgChats = [] } = useQuery({
    queryKey: ['tgChats'], queryFn: () => getTGChats(), enabled: provider === 'telegram', retry: false,
  })

  // Filtrar grupos já adicionados como targets
  const existingIds = new Set(existingTargets.filter(t => t.provider === provider).map(t => t.chat_id))
  const availableWA = waGroups.filter(g => !existingIds.has(g.id))
  const availableTG = tgChats.filter(c => !existingIds.has(c.chat_id))
  const available = provider === 'whatsapp' ? availableWA : availableTG
  const hasGroups = available.length > 0

  return (
    <div className="mt-3 space-y-2">
      <div className="flex gap-2">
        <select className={field} value={provider} onChange={e => { setProvider(e.target.value); setChatId('') }}>
          <option value="whatsapp">WhatsApp</option>
          <option value="telegram">Telegram</option>
        </select>
        {hasGroups && mode === 'select' ? (
          <select className={`${field} flex-1`} value={chatId} onChange={e => setChatId(e.target.value)}>
            <option value="">— Selecionar grupo ({available.length}) —</option>
            {provider === 'whatsapp'
              ? availableWA.map(g => <option key={g.id} value={g.id}>{g.name}</option>)
              : availableTG.map(c => <option key={c.chat_id} value={c.chat_id}>{c.title || c.chat_id}</option>)
            }
          </select>
        ) : (
          <input className={`${field} flex-1`} placeholder="Chat ID manual" value={chatId} onChange={e => setChatId(e.target.value)} />
        )}
        <button onClick={() => { if (chatId) { onAdd({ provider, chat_id: chatId }); setChatId('') } }} disabled={!chatId}
          className="bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs px-3 py-2 rounded-lg transition-colors">+</button>
      </div>
      <div className="flex gap-3">
        {hasGroups && (
          <button onClick={() => setMode(m => m === 'select' ? 'manual' : 'select')} className="text-xs text-gray-500 hover:text-gray-300">
            {mode === 'select' ? 'Digitar ID manualmente' : 'Selecionar da lista'}
          </button>
        )}
        {!hasGroups && mode === 'select' && (
          <p className="text-xs text-gray-600">
            {provider === 'whatsapp' ? 'Evolution offline ou sem grupos' : 'Nenhum chat TG disponivel'}
            {' — '}
            <button onClick={() => setMode('manual')} className="text-blue-400 hover:text-blue-300">digitar ID</button>
          </p>
        )}
      </div>
    </div>
  )
}

const MATCH_TYPES = [
  { value: 'all', label: 'Todos os produtos' },
  { value: 'tag', label: 'Por tag' },
  { value: 'brand', label: 'Por marca' },
  { value: 'search_term', label: 'Por termo de busca (ID)' },
]

function CatalogPreview({ rules }) {
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

  if (rules.length === 0) return <p className="text-xs text-gray-600 py-4">Adicione regras para ver quais produtos seriam enviados.</p>

  return (
    <div>
      <p className="text-xs text-gray-400 mb-2">
        {hasAllRule ? `Todo o catalogo (${total})` : `${total} produto${total !== 1 ? 's' : ''} matcham`}
      </p>
      <div className="space-y-1">
        {products.map(p => (
          <div key={p.id} className="flex items-center gap-3 py-2 px-3 bg-gray-800 rounded text-xs">
            {p.image_url && <img src={p.image_url} alt="" className="w-8 h-8 object-contain bg-white rounded flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-gray-300 truncate">{p.canonical_name}</p>
              <div className="flex gap-1">
                {p.brand && <span className="text-blue-400">{p.brand}</span>}
                {p.weight && <span className="text-gray-500">{p.weight}</span>}
              </div>
            </div>
            <span className="text-green-400 font-medium whitespace-nowrap">R$ {(p.lowest_price || 0).toFixed(2).replace('.', ',')}</span>
          </div>
        ))}
      </div>
      {total > 8 && <p className="text-xs text-gray-600 mt-1">...e mais {total - 8}</p>}
    </div>
  )
}

export default function ChannelDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showAddTarget, setShowAddTarget] = useState(false)
  const [showAddRule, setShowAddRule] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [targetForm, setTargetForm] = useState({ provider: 'whatsapp', chat_id: '' })
  const [ruleForm, setRuleForm] = useState({ match_type: 'tag', match_value: '', max_price: '', notify_new: true, notify_drop: false, notify_lowest: false, drop_threshold: 0.10 })

  const { data: channel, isLoading } = useQuery({
    queryKey: ['channel', id],
    queryFn: () => getChannel(id),
    enabled: !!id,
  })

  const update = useMutation({
    mutationFn: (data) => updateChannel(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['channel', id] }); qc.invalidateQueries({ queryKey: ['channels'] }); setEditing(false) },
  })
  const del = useMutation({
    mutationFn: () => deleteChannel(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['channels'] }); navigate('/admin/channels') },
  })
  const toggleActive = useMutation({
    mutationFn: () => updateChannel(id, { active: !channel?.active }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['channel', id] }); qc.invalidateQueries({ queryKey: ['channels'] }) },
  })
  const addTarget = useMutation({
    mutationFn: (data) => addChannelTarget(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['channel', id] }); setShowAddTarget(false); setTargetForm({ provider: 'whatsapp', chat_id: '' }) },
  })
  const rmTarget = useMutation({
    mutationFn: (targetId) => removeChannelTarget(id, targetId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channel', id] }),
  })
  const addRule = useMutation({
    mutationFn: (data) => addChannelRule(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['channel', id] }); setShowAddRule(false) },
  })
  const rmRule = useMutation({
    mutationFn: (ruleId) => deleteChannelRule(id, ruleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channel', id] }),
  })

  const field = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors'
  const badge = 'text-xs px-2 py-0.5 rounded-full font-medium'

  if (isLoading) return <div><Link to="/admin/channels" className="text-gray-400 text-sm">← Canais</Link><p className="text-gray-500 mt-8 text-center">Carregando...</p></div>
  if (!channel) return <div><Link to="/admin/channels" className="text-gray-400 text-sm">← Canais</Link><p className="text-gray-500 mt-8 text-center">Canal não encontrado.</p></div>

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/admin/channels" className="text-gray-400 hover:text-white text-sm">← Canais</Link>
        <span className={`${badge} ${channel.active ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-500'}`}>
          {channel.active ? 'ativo' : 'pauso'}
        </span>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{channel.name}</h1>
          {channel.description && <p className="text-gray-500 text-sm mt-1">{channel.description}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setEditing(e => !e); setEditForm({ name: channel.name, description: channel.description }) }}
            className="bg-gray-800 hover:bg-gray-700 text-white text-sm px-3 py-2 rounded-lg transition-colors">Editar</button>
          <button onClick={() => toggleActive.mutate()}
            className="bg-gray-800 hover:bg-gray-700 text-white text-sm px-3 py-2 rounded-lg transition-colors">
            {channel.active ? '⏸️ Pausar' : '▶️ Ativar'}
          </button>
          <button onClick={() => { if (confirm(`Remover "${channel.name}"?`)) del.mutate() }}
            className="bg-red-900 hover:bg-red-800 text-white text-sm px-3 py-2 rounded-lg transition-colors">Deletar</button>
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 space-y-3">
          <input className={`${field} w-full`} value={editForm.name || ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome" />
          <input className={`${field} w-full`} value={editForm.description || ''} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder="Descricao" />
          <div className="flex gap-2">
            <button onClick={() => update.mutate(editForm)} className="bg-green-700 hover:bg-green-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">Salvar</button>
            <button onClick={() => setEditing(false)} className="bg-gray-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">Cancelar</button>
          </div>
        </div>
      )}

      {/* Digest toggle */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-300">Modo Digest</p>
            <p className="text-xs text-gray-500">
              {channel.digest_mode
                ? `Envia "Top ${channel.digest_max_items} ofertas" consolidado`
                : 'Envia 1 mensagem por produto individualmente'}
            </p>
          </div>
          <button type="button" onClick={() => update.mutate({ digest_mode: !channel.digest_mode })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${channel.digest_mode ? 'bg-green-600' : 'bg-gray-700'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${channel.digest_mode ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Targets */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-gray-300">Targets ({channel.targets?.length || 0})</h2>
            <button onClick={() => setShowAddTarget(t => !t)} className="text-xs text-blue-400 hover:text-blue-300">+ Target</button>
          </div>
          <div className="space-y-2">
            {channel.targets?.map(t => (
              <div key={t.id} className="flex items-center gap-2 py-2 px-3 bg-gray-800 rounded text-xs">
                <span className={t.provider === 'whatsapp' ? 'text-green-400' : 'text-blue-400'}>
                  {t.provider === 'whatsapp' ? '📱 WhatsApp' : '🤖 Telegram'}
                </span>
                <span className="text-gray-400 font-mono flex-1 truncate">{t.chat_id}</span>
                <span className={`${badge} ${t.status === 'ok' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>{t.status}</span>
                <button onClick={() => rmTarget.mutate(t.id)} className="text-gray-500 hover:text-red-400">×</button>
              </div>
            ))}
            {(!channel.targets || channel.targets.length === 0) && <p className="text-xs text-gray-600">Nenhum target configurado</p>}
          </div>
          {showAddTarget && <TargetPicker field={field} onAdd={(data) => addTarget.mutate(data)} existingTargets={channel.targets || []} />}
        </div>

        {/* Rules */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-gray-300">Regras de envio ({channel.rules?.length || 0})</h2>
            <button onClick={() => setShowAddRule(r => !r)} className="text-xs text-green-400 hover:text-green-300">+ Regra</button>
          </div>
          <div className="space-y-2">
            {channel.rules?.map(r => {
              const triggers = [
                r.notify_new && 'Novo',
                r.notify_drop && `Queda ${(r.drop_threshold * 100).toFixed(0)}%`,
                r.notify_lowest && 'Menor preco',
              ].filter(Boolean)
              return (
                <div key={r.id} className="flex items-center gap-2 py-2 px-3 bg-gray-800 rounded text-xs">
                  <span className="text-blue-300 font-medium">{MATCH_TYPES.find(m => m.value === r.match_type)?.label}</span>
                  {r.match_value && <span className="text-purple-300">"{r.match_value}"</span>}
                  {r.max_price && <span className="text-yellow-300">max R${r.max_price}</span>}
                  <span className="text-gray-500">→</span>
                  <span className="text-green-300 flex-1">{triggers.join(', ') || 'sem trigger'}</span>
                  <button onClick={() => rmRule.mutate(r.id)} className="text-gray-500 hover:text-red-400">×</button>
                </div>
              )
            })}
            {(!channel.rules || channel.rules.length === 0) && <p className="text-xs text-gray-600">Nenhuma regra — nenhum produto sera enviado</p>}
          </div>
          {showAddRule && (
            <div className="mt-3 bg-gray-800 rounded-lg p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <select className={field} value={ruleForm.match_type} onChange={e => setRuleForm(f => ({ ...f, match_type: e.target.value }))}>
                  {MATCH_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                {ruleForm.match_type !== 'all' && (
                  <input className={field} placeholder="valor" value={ruleForm.match_value} onChange={e => setRuleForm(f => ({ ...f, match_value: e.target.value }))} />
                )}
                <input className={field} type="number" placeholder="Preco max" value={ruleForm.max_price}
                  onChange={e => setRuleForm(f => ({ ...f, max_price: e.target.value }))} />
              </div>
              <div className="flex gap-3 text-xs">
                <label className="flex items-center gap-1 text-gray-300"><input type="checkbox" checked={ruleForm.notify_new} onChange={e => setRuleForm(f => ({ ...f, notify_new: e.target.checked }))} /> Novo</label>
                <label className="flex items-center gap-1 text-gray-300"><input type="checkbox" checked={ruleForm.notify_drop} onChange={e => setRuleForm(f => ({ ...f, notify_drop: e.target.checked }))} /> Queda</label>
                <label className="flex items-center gap-1 text-gray-300"><input type="checkbox" checked={ruleForm.notify_lowest} onChange={e => setRuleForm(f => ({ ...f, notify_lowest: e.target.checked }))} /> Menor</label>
              </div>
              <button onClick={() => addRule.mutate({ ...ruleForm, max_price: ruleForm.max_price ? +ruleForm.max_price : null })}
                className="bg-green-700 hover:bg-green-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">Adicionar regra</button>
            </div>
          )}
        </div>
      </div>

      {/* Catalog preview */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mt-6">
        <h2 className="text-sm font-medium text-gray-300 mb-3">Produtos que seriam enviados</h2>
        <CatalogPreview rules={channel.rules || []} />
      </div>
    </div>
  )
}
