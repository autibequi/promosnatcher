import { useState, FC, ChangeEvent, SelectHTMLAttributes } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getChannel, updateChannel, deleteChannel,
  addChannelTarget, updateChannelTarget, removeChannelTarget,
  addChannelRule, deleteChannelRule,
  getCatalogProducts, getWAGroups, getTGChats,
  sendChannelDigest, sendChannelProduct,
} from '../api'
import type {
  snatcher_backendv2_internal_models_CatalogProduct,
  snatcher_backendv2_internal_models_Channel as ApiChannel,
} from '../types'

// ────────────────────────────────────────────────────────────
// Helpers for Null types
// ────────────────────────────────────────────────────────────

const getString = (ns: { string?: string; valid?: boolean } | undefined): string | undefined => ns?.valid ? ns.string : undefined
const getNumber = (nf: { float64?: number; valid?: boolean } | undefined): number | undefined => nf?.valid ? nf.float64 : undefined

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

type Channel = ApiChannel & { targets?: ChannelTarget[]; rules?: ChannelRule[] }

interface ChannelTarget {
  id: string
  provider: string
  chat_id: string
  invite_url?: string
  name?: string
  status?: string
  accounts?: Array<{ account_id: string; account_name?: string; role?: 'primary' | 'fallback'; priority?: number }>
}

interface ChannelRule {
  id: string
  match_type: string
  match_value?: string
  max_price?: number
  notify_new?: boolean
  notify_drop?: boolean
  notify_lowest?: boolean
  drop_threshold?: number
  active?: boolean
}

interface WAGroup {
  id: string
  name: string
}

interface TGChat {
  chat_id: string
  title?: string
}

// CatalogProduct uses API type directly

interface ChannelFormData {
  name?: string
  description?: string
}

interface ChannelRuleFormData {
  match_type: string
  match_value?: string
  max_price?: string | number
  notify_new?: boolean
  notify_drop?: boolean
  notify_lowest?: boolean
  drop_threshold?: number
}

const MATCH_TYPES = [
  { value: 'all', label: 'Todos os produtos' },
  { value: 'tag', label: 'Por tag' },
  { value: 'brand', label: 'Por marca' },
  { value: 'search_term', label: 'Por termo de busca (ID)' },
]

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────

interface TargetPickerProps {
  field: string
  onAdd: (data: Omit<ChannelTarget, 'id'>) => void
  existingTargets?: ChannelTarget[]
}

const TargetPicker: FC<TargetPickerProps> = ({ field, onAdd, existingTargets = [] }) => {
  const [provider, setProvider] = useState<string>('whatsapp')
  const [chatId, setChatId] = useState<string>('')
  const [mode, setMode] = useState<'select' | 'manual'>('select')

  const { data: waGroups = [] } = useQuery({
    queryKey: ['waGroups'],
    queryFn: getWAGroups as () => Promise<WAGroup[]>,
    enabled: provider === 'whatsapp',
    retry: false,
  })
  const { data: tgChats = [] } = useQuery({
    queryKey: ['tgChats'],
    queryFn: () => getTGChats(false) as Promise<TGChat[]>,
    enabled: provider === 'telegram',
    retry: false,
  })

  const existingIds = new Set(existingTargets.filter(t => t.provider === provider).map(t => t.chat_id))
  const availableWA = waGroups.filter(g => !existingIds.has(g.id))
  const availableTG = tgChats.filter(c => !existingIds.has(c.chat_id))
  const available = provider === 'whatsapp' ? availableWA : availableTG
  const hasGroups = available.length > 0

  return (
    <div className="mt-3 space-y-2">
      <div className="flex gap-2">
        <select className={field} value={provider} onChange={(e: ChangeEvent<HTMLSelectElement>) => { setProvider(e.target.value); setChatId('') }}>
          <option value="whatsapp">WhatsApp</option>
          <option value="telegram">Telegram</option>
        </select>
        {hasGroups && mode === 'select' ? (
          <select className={`${field} flex-1`} value={chatId} onChange={(e: ChangeEvent<HTMLSelectElement>) => setChatId(e.target.value)}>
            <option value="">— Selecionar grupo ({available.length}) —</option>
            {provider === 'whatsapp'
              ? availableWA.map(g => <option key={g.id} value={g.id}>{g.name}</option>)
              : availableTG.map(c => <option key={c.chat_id} value={c.chat_id}>{c.title || c.chat_id}</option>)
            }
          </select>
        ) : (
          <input className={`${field} flex-1`} placeholder="Chat ID manual" value={chatId} onChange={(e: ChangeEvent<HTMLInputElement>) => setChatId(e.target.value)} />
        )}
        <button onClick={() => { if (chatId) { onAdd({ provider, chat_id: chatId } as any); setChatId('') } }} disabled={!chatId}
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

interface CatalogPreviewProps {
  rules: ChannelRule[]
  onSendProduct?: (productId: string) => void
}

const CatalogPreview: FC<CatalogPreviewProps> = ({ rules, onSendProduct }) => {
  const firstTagRule = rules.find(r => r.match_type === 'tag' && r.active)
  const firstBrandRule = rules.find(r => r.match_type === 'brand' && r.active)
  const hasAllRule = rules.some(r => r.match_type === 'all' && r.active)

  const params = {
    limit: 8,
    ...(firstTagRule && { tag: firstTagRule.match_value }),
    ...(firstBrandRule && { brand: firstBrandRule.match_value }),
  }

  const { data: products = [] } = useQuery({
    queryKey: ['catalogPreview', params],
    queryFn: () => getCatalogProducts(params),
    enabled: rules.length > 0,
    staleTime: 60_000,
  })

  const total = products.length

  if (rules.length === 0) return <p className="text-xs text-gray-600 py-4">Adicione regras para ver quais produtos seriam enviados.</p>

  return (
    <div>
      <p className="text-xs text-gray-400 mb-2">
        {hasAllRule ? `Todo o catalogo (${total})` : `${total} produto${total !== 1 ? 's' : ''} matcham`}
      </p>
      <div className="space-y-1">
        {products.map(p => {
          const imgUrl = getString(p.image_url as any)
          const brand = getString(p.brand as any)
          const weight = getString(p.weight as any)
          const price = getNumber(p.lowest_price as any) || 0
          return (
          <div key={p.id} className="flex items-center gap-3 py-2 px-3 bg-gray-800 rounded text-xs">
            {imgUrl && <img src={imgUrl} alt="" className="w-8 h-8 object-contain bg-white rounded flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-gray-300 truncate">{p.canonical_name}</p>
              <div className="flex gap-1">
                {brand && <span className="text-blue-400">{brand}</span>}
                {weight && <span className="text-gray-500">{weight}</span>}
              </div>
            </div>
            <span className="text-green-400 font-medium whitespace-nowrap">R$ {price.toFixed(2).replace('.', ',')}</span>
            {onSendProduct && (
              <button onClick={() => onSendProduct(String(p.id))}
                className="text-xs text-gray-400 hover:text-green-400 px-2 py-1 rounded hover:bg-gray-700 whitespace-nowrap"
                title="Enviar este produto agora">
                📤
              </button>
            )}
          </div>
        )
        })}
      </div>
      {total > 8 && <p className="text-xs text-gray-600 mt-1">...e mais {total - 8}</p>}
    </div>
  )
}

const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'snatcher.autibequi.com'

interface RedirectTabProps {
  channel: Channel
  field: string
}

const RedirectTab: FC<RedirectTabProps> = ({ channel, field }) => {
  const qc = useQueryClient()
  const slugValue = getString(channel.slug as any) || ''
  const [slugDraft, setSlugDraft] = useState<string>(slugValue)
  const [inviteEditing, setInviteEditing] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState<boolean>(false)

  const update = useMutation({
    mutationFn: (data: any) => updateChannel(String(channel.id || 0), data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channel', String(channel.id)] }),
  })
  const updateTarget = useMutation({
    mutationFn: ({ targetId, data }: any) => updateChannelTarget(String(channel.id || 0), targetId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channel', String(channel.id)] }),
  })

  const redirectUrl = slugValue ? `https://${slugValue}.${BASE_DOMAIN}` : null
  const directUrl = slugValue ? `${window.location.origin}/canal/${slugValue}` : null

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const slugValid = /^[a-z0-9-]+$/.test(slugDraft) || slugDraft === ''

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Subdomínio de redirect</h3>
        <div className="flex gap-2 items-center mb-2">
          <span className="text-gray-500 text-sm font-mono">https://</span>
          <input
            className={`${field} flex-1 font-mono`}
            value={slugDraft}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            placeholder="maroma"
          />
          <span className="text-gray-500 text-sm font-mono">.{BASE_DOMAIN}</span>
          <button
            onClick={() => update.mutate({ slug: slugDraft || null })}
            disabled={!slugValid || update.isPending}
            className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs px-3 py-2 rounded-lg transition-colors"
          >
            Salvar
          </button>
        </div>
        {!slugValid && <p className="text-xs text-red-400">Apenas letras minúsculas, números e hífens</p>}

        {redirectUrl && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
              <span className="text-green-400 text-xs font-mono flex-1">{redirectUrl}</span>
              <button onClick={() => copy(redirectUrl)} className="text-xs text-gray-400 hover:text-white transition-colors">
                {copied ? '✓' : 'copiar'}
              </button>
            </div>
            <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
              <span className="text-blue-400 text-xs font-mono flex-1">{directUrl}</span>
              <button onClick={() => copy(directUrl || '')} className="text-xs text-gray-400 hover:text-white transition-colors">copiar</button>
            </div>
            <p className="text-xs text-gray-600">O subdomínio redireciona com GA4 + OG tags. O link direto funciona mesmo sem DNS wildcard.</p>
          </div>
        )}
        {!slugValue && (
          <p className="text-xs text-gray-600 mt-2">Defina um slug para ativar o redirect por subdomínio.</p>
        )}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Links de invite por grupo</h3>
        {channel.targets?.length === 0 && (
          <p className="text-xs text-gray-600">Adicione targets primeiro na aba principal.</p>
        )}
        <div className="space-y-4">
          {channel.targets?.map(t => {
            const inviteDraft = inviteEditing[`invite_${t.id}`] ?? t.invite_url ?? ''
            const nameDraft = inviteEditing[`name_${t.id}`] ?? t.name ?? ''
            const dirty = inviteDraft !== (t.invite_url ?? '') || nameDraft !== (t.name ?? '')
            return (
              <div key={t.id} className="bg-gray-800 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className={t.provider === 'whatsapp' ? 'text-green-400 text-xs' : 'text-blue-400 text-xs'}>
                    {t.provider === 'whatsapp' ? '📱 WhatsApp' : '✈️ Telegram'}
                  </span>
                  <span className="text-gray-600 text-xs font-mono truncate flex-1">{t.chat_id}</span>
                  {t.invite_url && <span className="text-xs text-green-500">✓</span>}
                </div>
                <input
                  className={`${field} w-full text-xs`}
                  value={nameDraft}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setInviteEditing(s => ({ ...s, [`name_${t.id}`]: e.target.value }))}
                  placeholder="Nome no picker (ex: Suplementos SP)"
                />
                <div className="flex gap-2">
                  <input
                    className={`${field} flex-1 text-xs`}
                    value={inviteDraft}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setInviteEditing(s => ({ ...s, [`invite_${t.id}`]: e.target.value }))}
                    placeholder={t.provider === 'whatsapp' ? 'https://chat.whatsapp.com/...' : 'https://t.me/...'}
                  />
                  <button
                    onClick={() => updateTarget.mutate({ targetId: t.id, data: { invite_url: inviteDraft || null, name: nameDraft || '' } })}
                    disabled={updateTarget.isPending || !dirty}
                    className="bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white text-xs px-3 py-2 rounded-lg transition-colors"
                  >
                    Salvar
                  </button>
                </div>

                {/* Contas vinculadas (Fase 11) */}
                {t.accounts && t.accounts.length > 0 && (
                <div className="bg-gray-900 rounded p-2 mt-2 space-y-1">
                  <div className="text-xs font-semibold text-gray-400 mb-2">Contas vinculadas:</div>
                  {t.accounts.map((acc, ai) => (
                    <div key={ai} className="flex items-center gap-2 text-xs">
                      <span className={`px-2 py-1 rounded text-white text-xs font-medium ${acc.role === 'primary' ? 'bg-green-900' : 'bg-yellow-900'}`}>
                        {acc.account_name || acc.account_id}
                      </span>
                      <span className="text-gray-500 text-xs">
                        {acc.role === 'primary' ? '⭐ Primary' : `🔄 Fallback (${acc.priority || 0})`}
                      </span>
                    </div>
                  ))}
                  <button className="text-xs text-blue-400 hover:text-blue-300 mt-2">
                    Editar contas
                  </button>
                </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
        <h3 className="text-sm font-medium text-gray-400 mb-2">Cloudflare — DNS wildcard</h3>
        <div className="bg-gray-800 rounded-lg p-3 font-mono text-xs text-gray-300 space-y-1">
          <p><span className="text-gray-500">Tipo:</span> CNAME</p>
          <p><span className="text-gray-500">Nome:</span> *.snatcher</p>
          <p><span className="text-gray-500">Destino:</span> {BASE_DOMAIN}</p>
          <p><span className="text-gray-500">Proxy:</span> ✓ Ligado</p>
        </div>
        <p className="text-xs text-gray-600 mt-2">Ou use o link direto <code className="text-blue-400">/canal/&#123;slug&#125;</code> sem DNS wildcard.</p>
      </div>
    </div>
  )
}

interface SlugInlineBlockProps {
  channel: Channel
  field: string
}

const SlugInlineBlock: FC<SlugInlineBlockProps> = ({ channel, field }) => {
  const qc = useQueryClient()
  const slugValue = getString(channel.slug as any) || ''
  const [slugDraft, setSlugDraft] = useState<string>(slugValue)
  const [copied, setCopied] = useState<'subdomain' | 'direct' | null>(null)

  const update = useMutation({
    mutationFn: (data: any) => updateChannel(String(channel.id || 0), data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channel', String(channel.id)] }),
  })

  const slugValid = /^[a-z0-9-]+$/.test(slugDraft) || slugDraft === ''
  const directUrl = slugValue ? `${window.location.origin}/canal/${slugValue}` : null

  const copy = (text: string, key: 'subdomain' | 'direct') => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">Link Publico</h3>
        {!slugValue && (
          <span className="text-xs bg-yellow-900/40 text-yellow-400 px-2 py-0.5 rounded-full border border-yellow-700/40">
            slug nao configurado
          </span>
        )}
      </div>
      <div className="flex gap-2 items-center">
        <input
          className={`${field} flex-1 font-mono text-xs`}
          value={slugDraft}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          placeholder="meu-canal"
        />
        <button
          onClick={() => update.mutate({ slug: slugDraft || null })}
          disabled={!slugValid || update.isPending || slugDraft === (channel.slug || '')}
          className="bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-xs px-3 py-2 rounded-lg transition-colors"
        >
          Salvar
        </button>
      </div>
      {!slugValid && <p className="text-xs text-red-400 mt-1">Apenas letras minusculas, numeros e hifens</p>}
      {directUrl && (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
            <span className="text-blue-400 text-xs font-mono flex-1 truncate">{directUrl}</span>
            <button onClick={() => copy(directUrl, 'direct')} className="text-xs text-gray-400 hover:text-white transition-colors flex-shrink-0">
              {copied === 'direct' ? '✓ Copiado!' : 'copiar'}
            </button>
            <a href={directUrl} target="_blank" rel="noreferrer" className="text-xs text-gray-500 hover:text-blue-400 transition-colors flex-shrink-0">
              Abrir
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────

const ChannelDetail: FC = () => {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'main' | 'redirect'>('main')
  const [showAddTarget, setShowAddTarget] = useState<boolean>(false)
  const [showAddRule, setShowAddRule] = useState<boolean>(false)
  const [editing, setEditing] = useState<boolean>(false)
  const [editForm, setEditForm] = useState<ChannelFormData>({})
  const [ruleForm, setRuleForm] = useState<ChannelRuleFormData>({ match_type: 'tag', match_value: '', max_price: '', notify_new: true, notify_drop: false, notify_lowest: false, drop_threshold: 0.10 })
  const [inlineInvite, setInlineInvite] = useState<Record<string, string>>({})

  const { data: channel, isLoading } = useQuery({
    queryKey: ['channel', id],
    queryFn: () => getChannel(id || '') as Promise<Channel>,
    enabled: !!id,
  })

  const update = useMutation({
    mutationFn: (data: any) => updateChannel(id || '', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['channel', id] }); qc.invalidateQueries({ queryKey: ['channels'] }); setEditing(false) },
  })
  const del = useMutation({
    mutationFn: () => deleteChannel(id || ''),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['channels'] }); navigate('/admin/channels') },
  })
  const toggleActive = useMutation({
    mutationFn: () => updateChannel(id || '', { name: channel?.name || '', active: !channel?.active }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['channel', id] }); qc.invalidateQueries({ queryKey: ['channels'] }) },
  })
  const addTarget = useMutation({
    mutationFn: (data: any) => addChannelTarget(id || '', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['channel', id] }); setShowAddTarget(false) },
  })
  const rmTarget = useMutation({
    mutationFn: (targetId: string) => removeChannelTarget(id || '', targetId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channel', id] }),
  })
  const updateTarget = useMutation({
    mutationFn: ({ targetId, data }: any) => updateChannelTarget(id || '', targetId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channel', id] }),
  })
  const addRule = useMutation({
    mutationFn: (data: any) => addChannelRule(id || '', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['channel', id] }); setShowAddRule(false) },
  })
  const rmRule = useMutation({
    mutationFn: (ruleId: string) => deleteChannelRule(id || '', ruleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channel', id] }),
  })

  const sendDigest = useMutation({ mutationFn: () => sendChannelDigest(id || '') })
  const sendProduct = useMutation({ mutationFn: (productId: string) => sendChannelProduct(id || '', productId) })

  const field = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors'
  const badge = 'text-xs px-2 py-0.5 rounded-full font-medium'

  const channelSlugValue = getString(channel?.slug as any)

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
        {channelSlugValue && (
          <span className="text-xs text-purple-400 font-mono bg-purple-900/30 px-2 py-0.5 rounded-full">
            🔗 {channelSlugValue}
          </span>
        )}
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

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-800">
        {[
          { key: 'main' as const, label: 'Configuracao' },
          { key: 'redirect' as const, label: channel.slug ? '🔗 Links Publicos' : '🔗 Links Publicos ⚠' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-sm px-4 py-2 transition-colors border-b-2 -mb-px ${tab === t.key ? 'border-green-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'redirect' && channel && <RedirectTab channel={channel} field={field} />}

      {tab === 'main' && <>

      {/* Edit form */}
      {editing && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 space-y-3">
          <input className={`${field} w-full`} value={editForm.name || ''} onChange={(e: ChangeEvent<HTMLInputElement>) => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome" />
          <input className={`${field} w-full`} value={editForm.description || ''} onChange={(e: ChangeEvent<HTMLInputElement>) => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder="Descricao" />
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
          <div className="flex items-center gap-3">
            {channel.digest_mode && (
              <button onClick={() => sendDigest.mutate()} disabled={sendDigest.isPending}
                className="text-xs bg-green-800 hover:bg-green-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg">
                {sendDigest.isPending ? '...' : '📤 Enviar digest agora'}
              </button>
            )}
            <button type="button" onClick={() => update.mutate({ digest_mode: !channel.digest_mode })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${channel.digest_mode ? 'bg-green-600' : 'bg-gray-700'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${channel.digest_mode ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
        {sendDigest.isSuccess && <p className="text-xs text-green-400 mt-2">✓ Digest enviado para {(sendDigest.data as any)?.targets} target(s)</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Targets */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-gray-300">Targets ({channel.targets?.length || 0})</h2>
            <button onClick={() => setShowAddTarget(t => !t)} className="text-xs text-blue-400 hover:text-blue-300">+ Target</button>
          </div>
          <div className="space-y-2">
            {channel.targets?.map(t => {
              const inviteDraft = inlineInvite[`invite_${t.id}`] ?? t.invite_url ?? ''
              const dirty = inviteDraft !== (t.invite_url ?? '')
              return (
                <div key={t.id} className="bg-gray-800 rounded-lg p-2 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className={t.provider === 'whatsapp' ? 'text-green-400' : 'text-blue-400'}>
                      {t.provider === 'whatsapp' ? '📱 WhatsApp' : '🤖 Telegram'}
                    </span>
                    <span className="text-gray-400 font-mono flex-1 truncate">{t.chat_id}</span>
                    <span className={`${badge} ${t.status === 'ok' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>{t.status}</span>
                    {t.invite_url && <span className="text-green-500 text-xs">✓ link</span>}
                    <button onClick={() => rmTarget.mutate(t.id)} className="text-gray-500 hover:text-red-400">×</button>
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs placeholder-gray-500 focus:outline-none focus:border-green-500 flex-1 transition-colors"
                      value={inviteDraft}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setInlineInvite(s => ({ ...s, [`invite_${t.id}`]: e.target.value }))}
                      placeholder={t.provider === 'whatsapp' ? 'https://chat.whatsapp.com/...' : 'https://t.me/...'}
                    />
                    <button
                      onClick={() => updateTarget.mutate({ targetId: t.id, data: { invite_url: inviteDraft || null } })}
                      disabled={updateTarget.isPending || !dirty}
                      className="bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white text-xs px-2 py-1 rounded transition-colors"
                    >
                      OK
                    </button>
                  </div>
                </div>
              )
            })}
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
                r.notify_drop && `Queda ${(r.drop_threshold! * 100).toFixed(0)}%`,
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
                <select className={field} value={ruleForm.match_type} onChange={(e: ChangeEvent<HTMLSelectElement>) => setRuleForm(f => ({ ...f, match_type: e.target.value }))}>
                  {MATCH_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                {ruleForm.match_type !== 'all' && (
                  <input className={field} placeholder="valor" value={ruleForm.match_value || ''} onChange={(e: ChangeEvent<HTMLInputElement>) => setRuleForm(f => ({ ...f, match_value: e.target.value }))} />
                )}
                <input className={field} type="number" placeholder="Preco max" value={ruleForm.max_price}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setRuleForm(f => ({ ...f, max_price: e.target.value }))} />
              </div>
              <div className="flex gap-3 text-xs">
                <label className="flex items-center gap-1 text-gray-300"><input type="checkbox" checked={ruleForm.notify_new} onChange={(e: ChangeEvent<HTMLInputElement>) => setRuleForm(f => ({ ...f, notify_new: e.target.checked }))} /> Novo</label>
                <label className="flex items-center gap-1 text-gray-300"><input type="checkbox" checked={ruleForm.notify_drop} onChange={(e: ChangeEvent<HTMLInputElement>) => setRuleForm(f => ({ ...f, notify_drop: e.target.checked }))} /> Queda</label>
                <label className="flex items-center gap-1 text-gray-300"><input type="checkbox" checked={ruleForm.notify_lowest} onChange={(e: ChangeEvent<HTMLInputElement>) => setRuleForm(f => ({ ...f, notify_lowest: e.target.checked }))} /> Menor</label>
              </div>
              <button onClick={() => addRule.mutate({ ...ruleForm, max_price: ruleForm.max_price ? +ruleForm.max_price : null })}
                className="bg-green-700 hover:bg-green-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">Adicionar regra</button>
            </div>
          )}
        </div>
      </div>

      {/* Link publico inline */}
      {channel && <SlugInlineBlock channel={channel} field={field} />}

      {/* Catalog preview */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mt-6">
        <h2 className="text-sm font-medium text-gray-300 mb-3">Produtos que seriam enviados</h2>
        <CatalogPreview rules={channel.rules || []} onSendProduct={(pid) => sendProduct.mutate(pid)} />
      </div>

      </>}
    </div>
  )
}

export default ChannelDetail
