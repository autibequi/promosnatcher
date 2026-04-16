import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getConfig, updateConfig, testWA, testTG,
         getWAStatus, startWASession, logoutWASession, getTGStatus } from '../api'

export default function Settings() {
  const qc = useQueryClient()
  const { data: config, isLoading } = useQuery({ queryKey: ['config'], queryFn: getConfig })

  const [form, setForm] = useState({
    wa_provider: 'evolution',
    wa_base_url: '',
    wa_api_key: '',
    wa_instance: 'default',
    global_interval: 30,
    send_start_hour: 8,
    send_end_hour: 22,
    ml_client_id: '',
    ml_client_secret: '',
    amz_tracking_id: '',
    ml_affiliate_tool_id: '',
    wa_group_prefix: 'Snatcher',
    alert_phone: '',
    use_short_links: true,
    tg_enabled: false,
    tg_bot_token: '',
    tg_group_prefix: 'Snatcher',
  })
  useEffect(() => {
    if (config) {
      setForm({
        wa_provider: config.wa_provider || 'waha',
        wa_base_url: config.wa_base_url || '',
        wa_api_key: '',
        wa_instance: config.wa_instance || 'default',
        global_interval: config.global_interval || 30,
        send_start_hour: config.send_start_hour ?? 8,
        send_end_hour: config.send_end_hour ?? 22,
        ml_client_id: config.ml_client_id || '',
        ml_client_secret: '',
        amz_tracking_id: config.amz_tracking_id || '',
        ml_affiliate_tool_id: config.ml_affiliate_tool_id || '',
        wa_group_prefix: config.wa_group_prefix ?? 'Snatcher',
        alert_phone: config.alert_phone || '',
        use_short_links: config.use_short_links ?? true,
        tg_enabled: config.tg_enabled ?? false,
        tg_bot_token: '',
        tg_group_prefix: config.tg_group_prefix ?? 'Snatcher',
      })
    }
  }, [config])

  const save = useMutation({ mutationFn: updateConfig })
  const test = useMutation({ mutationFn: testWA })
  const testTgMutation = useMutation({ mutationFn: testTG })

  // WAHA status — poll a cada 5s se não WORKING
  const { data: waStatus } = useQuery({
    queryKey: ['waStatus'],
    queryFn: getWAStatus,
    refetchInterval: 5000,
  })

  // Telegram status
  const { data: tgStatus } = useQuery({
    queryKey: ['tgStatus'],
    queryFn: getTGStatus,
    refetchInterval: 5000,
  })


  const startSession = useMutation({
    mutationFn: startWASession,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['waStatus'] }),
  })

  const logout = useMutation({
    mutationFn: logoutWASession,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['waStatus'] })
      qc.invalidateQueries({ queryKey: ['waGroups'] })
    },
  })

  const set = (f) => (e) => setForm(v => ({ ...v, [f]: e.target.value }))

  const submit = (e) => {
    e.preventDefault()
    save.mutate({
      ...form,
      global_interval: parseInt(form.global_interval),
      send_start_hour: parseInt(form.send_start_hour),
      send_end_hour: parseInt(form.send_end_hour),
      ml_client_id: form.ml_client_id || undefined,
      ml_client_secret: form.ml_client_secret || undefined,
      wa_api_key: form.wa_api_key || undefined,
      amz_tracking_id: form.amz_tracking_id || undefined,
      ml_affiliate_tool_id: form.ml_affiliate_tool_id || undefined,
      wa_group_prefix: form.wa_group_prefix || null,
      alert_phone: form.alert_phone || null,
      tg_bot_token: form.tg_bot_token || undefined,
      tg_group_prefix: form.tg_group_prefix || null,
    })
  }

  const field = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors font-mono text-sm'
  const label = 'block text-sm font-medium text-gray-300 mb-1.5'

  const statusColor = {
    WORKING: 'bg-green-900 text-green-300',
    SCAN_QR_CODE: 'bg-yellow-900 text-yellow-300',
    STARTING: 'bg-blue-900 text-blue-300',
    STOPPED: 'bg-gray-800 text-gray-400',
    FAILED: 'bg-red-900 text-red-300',
  }[waStatus?.status] || 'bg-gray-800 text-gray-500'

  if (isLoading) return <div className="text-center text-gray-400 py-16">Carregando...</div>

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2">Configurações</h1>
      <p className="text-gray-400 text-sm mb-8">Configure o WhatsApp, scrapers e intervalo de scan.</p>

      <form onSubmit={submit} className="space-y-5">

        {/* ── Evolution API status ── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">📱 WhatsApp</h2>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                waStatus?.status === 'ERROR' || !waStatus?.status
                  ? 'bg-red-900 text-red-300'
                  : 'bg-green-900 text-green-300'
              }`}>
                Evolution {waStatus?.status === 'ERROR' || !waStatus?.status ? 'offline' : 'online'}
              </span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor}`}>
                {waStatus?.status || '…'}
              </span>
            </div>
          </div>

          {/* QR iframe quando SCAN_QR_CODE */}
          {/* QR code — mostrado em SCAN_QR_CODE ou após iniciar sessão em STOPPED */}
          {(waStatus?.status === 'SCAN_QR_CODE' || waStatus?.status === 'STARTING') && (
            <div>
              <p className="text-xs text-yellow-400 mb-2">Escaneie o QR com o WhatsApp →</p>
              <iframe src="/api/config/wa/qr"
                className="w-full rounded-xl border-0 bg-black"
                style={{ height: 700 }} />
            </div>
          )}

          {/* Botão iniciar sessão */}
          {(waStatus?.status === 'STOPPED' || waStatus?.status === 'ERROR' || !waStatus?.status) && (
            <button type="button" onClick={() => startSession.mutate()}
              disabled={startSession.isPending}
              className="w-full bg-green-800 hover:bg-green-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm">
              {startSession.isPending ? '⏳ Criando instância...' : '▶ Iniciar sessão'}
            </button>
          )}

          {/* Conectado */}
          {waStatus?.status === 'WORKING' && (
            <>
              <button type="button"
                onClick={() => { if (window.confirm('Desconectar o WhatsApp?')) logout.mutate() }}
                disabled={logout.isPending}
                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors">
                {logout.isPending ? '⏳ Desconectando...' : '🚪 Desconectar WhatsApp'}
              </button>
              <div className="pt-2 border-t border-gray-800">
                <a href="/admin/whatsapp" className="text-xs text-green-400 hover:text-green-300 transition-colors">
                  📱 Gerenciar grupos WhatsApp →
                </a>
              </div>
            </>
          )}
        </div>

        {/* ── Telegram ─────────────────────────────────────────────── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">🤖 Telegram</h2>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                tgStatus?.configured && tgStatus?.enabled
                  ? 'bg-green-900 text-green-300'
                  : 'bg-gray-800 text-gray-400'
              }`}>
                {tgStatus?.configured ? (tgStatus?.enabled ? '✓ Ativo' : '✗ Desabilitado') : 'Não configurado'}
              </span>
            </div>
          </div>

          <div>
            <label className={label}>Bot Token</label>
            <input
              className={field}
              type="password"
              value={form.tg_bot_token}
              onChange={set('tg_bot_token')}
              placeholder="123456:ABC..."
            />
            <p className="text-xs text-gray-600 mt-1">Crie um bot em @BotFather no Telegram e copie o token aqui.</p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-300">Habilitar Telegram</label>
              <p className="text-xs text-gray-600 mt-0.5">Ativa envio de mensagens para grupos Telegram</p>
            </div>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, tg_enabled: !f.tg_enabled }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                form.tg_enabled ? 'bg-green-600' : 'bg-gray-700'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                form.tg_enabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {form.tg_enabled && (
            <div>
              <label className={label}>Prefixo dos grupos</label>
              <input
                className={field}
                value={form.tg_group_prefix}
                onChange={set('tg_group_prefix')}
                placeholder="Snatcher"
              />
              <p className="text-xs text-gray-600 mt-1">Grupos Telegram serão renomeados com este prefixo.</p>
            </div>
          )}

          {form.tg_bot_token && (
            <button
              type="button"
              onClick={() => testTgMutation.mutate()}
              disabled={testTgMutation.isPending}
              className="w-full bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-sm py-2 rounded-lg transition-colors"
            >
              {testTgMutation.isPending ? '⏳ Testando...' : '🧪 Testar token'}
            </button>
          )}

          {testTgMutation.isSuccess && (
            <div className="bg-green-900 bg-opacity-30 border border-green-800 rounded-lg p-3">
              <p className="text-xs text-green-300">✓ Token válido!</p>
              <p className="text-xs text-green-400 mt-1">Bot: @{testTgMutation.data?.me?.username}</p>
            </div>
          )}
          {testTgMutation.isError && (
            <p className="text-xs text-red-400">✗ Token inválido: {testTgMutation.error?.response?.data?.detail}</p>
          )}

          {form.tg_enabled && tgStatus?.configured && (
            <div className="pt-2 border-t border-gray-800">
              <a href="/admin/telegram" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                🤖 Gerenciar grupos Telegram →
              </a>
            </div>
          )}
        </div>

        {/* ── ML API ──────────────────────────────────────────────── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-white">Mercado Livre API</h2>
          <p className="text-xs text-gray-500">
            Opcional. Cadastre um app em{' '}
            <span className="text-green-400">developers.mercadolivre.com.br</span>{' '}
            para usar a API oficial (5000 req/dia). Sem credenciais, usa scraping HTML.
          </p>
          <div>
            <label className={label}>Client ID</label>
            <input className={field} value={form.ml_client_id} onChange={set('ml_client_id')} placeholder="1234567890" />
          </div>
          <div>
            <label className={label}>Client Secret {config?.ml_client_id ? '(configurado — deixe em branco para manter)' : ''}</label>
            <input className={field} type="password" value={form.ml_client_secret} onChange={set('ml_client_secret')} placeholder="••••••••" />
          </div>
        </div>

        {/* ── Afiliados ────────────────────────────────────────────── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-white">Afiliados</h2>
          <p className="text-xs text-gray-500">Links enviados no WA incluirão seu ID de afiliado automaticamente.</p>
          <div>
            <label className={label}>Amazon Associates — Tag</label>
            <input className={field} value={form.amz_tracking_id} onChange={set('amz_tracking_id')} placeholder="meublog-20" />
          </div>
          <div>
            <label className={label}>Mercado Livre Afiliados — Tool ID</label>
            <input className={field} value={form.ml_affiliate_tool_id} onChange={set('ml_affiliate_tool_id')} placeholder="64838818" />
          </div>
        </div>

        {/* ── Short Links / Redirect ─────────────────────────────── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Short Links com Tracking</h2>
              <p className="text-xs text-gray-500 mt-1">
                {form.use_short_links
                  ? 'Links passam pelo redirect com tracking de cliques + GA4'
                  : 'Links diretos para Amazon/ML (sem tracking)'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, use_short_links: !f.use_short_links }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                form.use_short_links ? 'bg-green-600' : 'bg-gray-700'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                form.use_short_links ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
        </div>

        {/* ── Alertas ──────────────────────────────────────────────── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-white">Alertas de Falha</h2>
          <p className="text-xs text-gray-500">
            Se um grupo falhar 3 scans consecutivos, uma mensagem WA será enviada para o número abaixo.
          </p>
          <div>
            <label className={label}>Número WA do admin</label>
            <input
              className={field}
              value={form.alert_phone}
              onChange={set('alert_phone')}
              placeholder="5511999998888@c.us"
            />
            <p className="text-xs text-gray-600 mt-1">Formato: código do país + DDD + número + @c.us</p>
          </div>
        </div>

        {/* ── Scan ─────────────────────────────────────────────────── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-white mb-4">Scan</h2>
          <div>
            <label className={label}>Intervalo global (minutos)</label>
            <input className={field} type="number" min="5" max="1440" value={form.global_interval} onChange={set('global_interval')} />
            <p className="text-xs text-gray-500 mt-1">Reinicia o scheduler ao salvar.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Enviar WA a partir de (h)</label>
              <input className={field} type="number" min="0" max="23" value={form.send_start_hour} onChange={set('send_start_hour')} />
            </div>
            <div>
              <label className={label}>Enviar WA até (h)</label>
              <input className={field} type="number" min="0" max="23" value={form.send_end_hour} onChange={set('send_end_hour')} />
            </div>
          </div>
          <p className="text-xs text-gray-500">Fuso: America/Sao_Paulo. Scans rodam fora da janela — só envio WA é bloqueado.</p>
        </div>

        {save.isSuccess && <p className="text-green-400 text-sm">✓ Configurações salvas!</p>}
        {save.error && <p className="text-red-400 text-sm">Erro ao salvar.</p>}

        <button type="submit" disabled={save.isPending}
          className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors">
          {save.isPending ? 'Salvando...' : 'Salvar configurações'}
        </button>
      </form>
    </div>
  )
}
