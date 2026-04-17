import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getConfig, updateConfig,
  getWAAccounts, createWAAccount, updateWAAccount, deleteWAAccount, getWAAccountStatus, testWAAccount,
  startWAAccountSession, logoutWAAccount,
  getTGAccounts, createTGAccount, updateTGAccount, deleteTGAccount, testTGAccount,
} from '../api'

const field = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors'
const label = 'block text-sm font-medium text-gray-300 mb-1'
const badge = 'text-xs px-2 py-0.5 rounded-full font-medium'

function WAAccountCard({ account }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})

  const { data: status } = useQuery({
    queryKey: ['waStatus', account.id],
    queryFn: () => getWAAccountStatus(account.id),
    refetchInterval: 5000,
    retry: false,
  })

  const update = useMutation({
    mutationFn: (data) => updateWAAccount(account.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['waAccounts'] }); setEditing(false) },
  })
  const del = useMutation({
    mutationFn: () => deleteWAAccount(account.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['waAccounts'] }),
  })
  const startSession = useMutation({
    mutationFn: () => startWAAccountSession(account.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['waStatus', account.id] }),
  })
  const logout = useMutation({
    mutationFn: () => logoutWAAccount(account.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['waStatus', account.id] }); qc.invalidateQueries({ queryKey: ['waAccounts'] }) },
  })

  const waStatus = status?.status || 'UNKNOWN'
  const statusColor = {
    WORKING: 'bg-green-900 text-green-300',
    SCAN_QR_CODE: 'bg-yellow-900 text-yellow-300',
    STARTING: 'bg-blue-900 text-blue-300',
  }[waStatus] || 'bg-gray-800 text-gray-500'

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white">{account.name}</p>
          <span className={`${badge} ${statusColor}`}>{waStatus}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setEditing(e => !e); setForm({ name: account.name, base_url: account.base_url || '', api_key: '', instance: account.instance || '', group_prefix: account.group_prefix || '' }) }}
            className="text-xs text-gray-400 hover:text-white">✏️</button>
          <button onClick={() => { if (confirm(`Remover "${account.name}"?`)) del.mutate() }}
            className="text-xs text-gray-400 hover:text-red-400">🗑️</button>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-3">{account.provider} | {account.instance} | {account.base_url || 'sem URL'}</p>

      {/* QR Code — quando SCAN_QR_CODE ou STARTING */}
      {(waStatus === 'SCAN_QR_CODE' || waStatus === 'STARTING') && (
        <iframe
          src={`/api/accounts/wa/${account.id}/qr`}
          className="w-full rounded-lg border-0 bg-black mb-3"
          style={{ height: 420 }}
        />
      )}

      {/* Botão iniciar sessão — quando STOPPED/ERROR/UNKNOWN */}
      {(waStatus === 'STOPPED' || waStatus === 'ERROR' || waStatus === 'UNKNOWN' || !status) && account.base_url && (
        <button onClick={() => startSession.mutate()} disabled={startSession.isPending}
          className="w-full bg-green-800 hover:bg-green-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm mb-3">
          {startSession.isPending ? '⏳ Criando instancia...' : '▶ Iniciar sessao'}
        </button>
      )}

      {/* Conectado — botão logout */}
      {waStatus === 'WORKING' && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-green-400">✅ WhatsApp conectado</span>
          <button onClick={() => { if (confirm('Desconectar WhatsApp?')) logout.mutate() }} disabled={logout.isPending}
            className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50">
            🚪 Desconectar
          </button>
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="pt-3 border-t border-gray-700 space-y-2">
          <input className={field} placeholder="Nome" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <input className={field} placeholder="URL (http://evolution:8080)" value={form.base_url} onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))} />
          <input className={field} type="password" placeholder="API Key (deixe vazio pra manter)" value={form.api_key} onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))} />
          <input className={field} placeholder="Instance" value={form.instance} onChange={e => setForm(f => ({ ...f, instance: e.target.value }))} />
          <input className={field} placeholder="Prefixo grupos" value={form.group_prefix} onChange={e => setForm(f => ({ ...f, group_prefix: e.target.value }))} />
          <div className="flex gap-2">
            <button onClick={() => update.mutate(form)} className="bg-green-700 hover:bg-green-600 text-white text-xs px-3 py-1.5 rounded-lg">Salvar</button>
            <button onClick={() => setEditing(false)} className="bg-gray-700 text-white text-xs px-3 py-1.5 rounded-lg">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

function TGAccountCard({ account }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})

  const update = useMutation({
    mutationFn: (data) => updateTGAccount(account.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tgAccounts'] }); setEditing(false) },
  })
  const del = useMutation({
    mutationFn: () => deleteTGAccount(account.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tgAccounts'] }),
  })
  const test = useMutation({ mutationFn: () => testTGAccount(account.id) })

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white">{account.name}</p>
          {account.bot_username && <span className="text-xs text-blue-400">@{account.bot_username}</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => test.mutate()} className="text-xs text-gray-400 hover:text-green-400">🧪</button>
          <button onClick={() => { setEditing(e => !e); setForm({ name: account.name, bot_token: '', group_prefix: account.group_prefix || '' }) }}
            className="text-xs text-gray-400 hover:text-white">✏️</button>
          <button onClick={() => { if (confirm(`Remover "${account.name}"?`)) del.mutate() }}
            className="text-xs text-gray-400 hover:text-red-400">🗑️</button>
        </div>
      </div>
      {test.isSuccess && <p className="text-xs text-green-400 mt-1">Bot conectado: @{test.data?.me?.username}</p>}
      {test.isError && <p className="text-xs text-red-400 mt-1">Token inválido</p>}

      {editing && (
        <div className="mt-3 pt-3 border-t border-gray-700 space-y-2">
          <input className={field} placeholder="Nome" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <input className={field} type="password" placeholder="Bot Token" value={form.bot_token} onChange={e => setForm(f => ({ ...f, bot_token: e.target.value }))} />
          <input className={field} placeholder="Prefixo grupos" value={form.group_prefix} onChange={e => setForm(f => ({ ...f, group_prefix: e.target.value }))} />
          <div className="flex gap-2">
            <button onClick={() => update.mutate(form)} className="bg-green-700 hover:bg-green-600 text-white text-xs px-3 py-1.5 rounded-lg">Salvar</button>
            <button onClick={() => setEditing(false)} className="bg-gray-700 text-white text-xs px-3 py-1.5 rounded-lg">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Settings() {
  const qc = useQueryClient()
  const { data: config, isLoading } = useQuery({ queryKey: ['config'], queryFn: getConfig })

  // Global settings form
  const [form, setForm] = useState({
    global_interval: 30, send_start_hour: 8, send_end_hour: 22,
    ml_client_id: '', ml_client_secret: '',
    amz_tracking_id: '', ml_affiliate_tool_id: '',
    use_short_links: true, alert_phone: '',
  })

  useEffect(() => {
    if (config) setForm({
      global_interval: config.global_interval || 30,
      send_start_hour: config.send_start_hour ?? 8,
      send_end_hour: config.send_end_hour ?? 22,
      ml_client_id: config.ml_client_id || '',
      ml_client_secret: '',
      amz_tracking_id: config.amz_tracking_id || '',
      ml_affiliate_tool_id: config.ml_affiliate_tool_id || '',
      use_short_links: config.use_short_links ?? true,
      alert_phone: config.alert_phone || '',
    })
  }, [config])

  const save = useMutation({ mutationFn: updateConfig })
  const set = (f) => (e) => setForm(v => ({ ...v, [f]: e.target.value }))

  // Multi-account
  const { data: waAccounts = [] } = useQuery({ queryKey: ['waAccounts'], queryFn: getWAAccounts, retry: false })
  const { data: tgAccounts = [] } = useQuery({ queryKey: ['tgAccounts'], queryFn: getTGAccounts, retry: false })

  const [showNewWA, setShowNewWA] = useState(false)
  const [showNewTG, setShowNewTG] = useState(false)
  const [newWAName, setNewWAName] = useState('')
  const [newTG, setNewTG] = useState({ name: '', bot_token: '' })

  const createWA = useMutation({
    mutationFn: (name) => createWAAccount({
      name,
      provider: config?.wa_provider || 'evolution',
      base_url: config?.wa_base_url || '',
      api_key: config?.wa_api_key || '',
      instance: name.toLowerCase().replace(/\s+/g, '-'),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['waAccounts'] }); setShowNewWA(false); setNewWAName('') },
  })
  const createTG = useMutation({
    mutationFn: createTGAccount,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tgAccounts'] }); setShowNewTG(false); setNewTG({ name: '', bot_token: '' }) },
  })

  const submit = (e) => {
    e.preventDefault()
    save.mutate({
      global_interval: parseInt(form.global_interval),
      send_start_hour: parseInt(form.send_start_hour),
      send_end_hour: parseInt(form.send_end_hour),
      ml_client_id: form.ml_client_id || undefined,
      ml_client_secret: form.ml_client_secret || undefined,
      amz_tracking_id: form.amz_tracking_id || undefined,
      ml_affiliate_tool_id: form.ml_affiliate_tool_id || undefined,
      alert_phone: form.alert_phone || null,
    })
  }

  if (isLoading) return <div className="text-center text-gray-400 py-16">Carregando...</div>

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Configuracoes</h1>

      {/* ── WhatsApp Accounts ─── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">📱 WhatsApp</h2>
          <button onClick={() => setShowNewWA(s => !s)} className="text-xs text-green-400 hover:text-green-300">+ Conta</button>
        </div>
        <div className="space-y-3">
          {waAccounts.map(a => <WAAccountCard key={a.id} account={a} />)}
          {waAccounts.length === 0 && <p className="text-xs text-gray-600">Nenhuma conta WA. Adicione uma acima.</p>}
        </div>
        {showNewWA && (
          <div className="mt-3 pt-3 border-t border-gray-800">
            <div className="flex gap-2">
              <input className={`${field} flex-1`} placeholder="Nome da conta (ex: Principal)" value={newWAName}
                onChange={e => setNewWAName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && newWAName.trim() && createWA.mutate(newWAName)} />
              <button onClick={() => createWA.mutate(newWAName)} disabled={!newWAName.trim() || createWA.isPending}
                className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg">
                {createWA.isPending ? '...' : 'Criar'}
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-1">Usa Evolution API da config global. Apos criar, clique "Iniciar sessao" e escaneie o QR.</p>
          </div>
        )}
      </div>

      {/* ── Telegram Accounts ─── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">🤖 Telegram</h2>
          <button onClick={() => setShowNewTG(s => !s)} className="text-xs text-green-400 hover:text-green-300">+ Bot</button>
        </div>
        <div className="space-y-3">
          {tgAccounts.map(a => <TGAccountCard key={a.id} account={a} />)}
          {tgAccounts.length === 0 && <p className="text-xs text-gray-600">Nenhum bot TG. Adicione um acima.</p>}
        </div>
        {showNewTG && (
          <div className="mt-3 pt-3 border-t border-gray-800 space-y-2">
            <input className={field} placeholder="Nome (ex: Bot Principal)" value={newTG.name} onChange={e => setNewTG(f => ({ ...f, name: e.target.value }))} />
            <input className={field} type="password" placeholder="Bot Token (123456:ABC...)" value={newTG.bot_token} onChange={e => setNewTG(f => ({ ...f, bot_token: e.target.value }))} />
            <button onClick={() => createTG.mutate(newTG)} disabled={!newTG.name.trim()}
              className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg">Criar</button>
          </div>
        )}
      </div>

      {/* ── Mercado Livre API ─── */}
      <form onSubmit={submit} className="space-y-5">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-white">Mercado Livre API</h2>
          <p className="text-xs text-gray-500">Opcional. Sem credenciais, usa scraping HTML.</p>
          <div>
            <label className={label}>Client ID</label>
            <input className={field} value={form.ml_client_id} onChange={set('ml_client_id')} placeholder="1234567890" />
          </div>
          <div>
            <label className={label}>Client Secret</label>
            <input className={field} type="password" value={form.ml_client_secret} onChange={set('ml_client_secret')} placeholder="••••••" />
          </div>
        </div>

        {/* ── Afiliados ─── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-white">Afiliados</h2>
          <div>
            <label className={label}>Amazon Associates Tag</label>
            <input className={field} value={form.amz_tracking_id} onChange={set('amz_tracking_id')} placeholder="meublog-20" />
          </div>
          <div>
            <label className={label}>ML Afiliados Tool ID</label>
            <input className={field} value={form.ml_affiliate_tool_id} onChange={set('ml_affiliate_tool_id')} placeholder="64838818" />
          </div>
        </div>

        {/* ── Short Links ─── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Short Links</h2>
              <p className="text-xs text-gray-500 mt-1">{form.use_short_links ? 'Redirect com tracking' : 'Links diretos'}</p>
            </div>
            <button type="button" onClick={() => setForm(f => ({ ...f, use_short_links: !f.use_short_links }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.use_short_links ? 'bg-green-600' : 'bg-gray-700'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.use_short_links ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>

        {/* ── Scan ─── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-white">Pipeline</h2>
          <div>
            <label className={label}>Intervalo (minutos)</label>
            <input className={field} type="number" min="5" max="1440" value={form.global_interval} onChange={set('global_interval')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Enviar a partir de (h)</label>
              <input className={field} type="number" min="0" max="23" value={form.send_start_hour} onChange={set('send_start_hour')} />
            </div>
            <div>
              <label className={label}>Enviar ate (h)</label>
              <input className={field} type="number" min="0" max="23" value={form.send_end_hour} onChange={set('send_end_hour')} />
            </div>
          </div>
        </div>

        {/* ── Alertas ─── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-white">Alertas</h2>
          <div>
            <label className={label}>Numero WA do admin</label>
            <input className={field} value={form.alert_phone} onChange={set('alert_phone')} placeholder="5511999998888@c.us" />
          </div>
        </div>

        {save.isSuccess && <p className="text-green-400 text-sm">Salvo!</p>}
        {save.isError && <p className="text-red-400 text-sm">Erro ao salvar.</p>}

        <button type="submit" disabled={save.isPending}
          className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors">
          {save.isPending ? 'Salvando...' : 'Salvar configuracoes'}
        </button>
      </form>
    </div>
  )
}
