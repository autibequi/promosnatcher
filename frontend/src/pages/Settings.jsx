import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getConfig, updateConfig, testWA, getWAGroups, createWAGroupDirect,
         getWAStatus, startWASession, logoutWASession } from '../api'

export default function Settings() {
  const qc = useQueryClient()
  const { data: config, isLoading } = useQuery({ queryKey: ['config'], queryFn: getConfig })

  const [form, setForm] = useState({
    wa_provider: 'waha',
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
  })
  const [newGroupName, setNewGroupName] = useState('')

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
      })
    }
  }, [config])

  const save = useMutation({ mutationFn: updateConfig })
  const test = useMutation({ mutationFn: testWA })

  // WAHA status — poll a cada 5s se não WORKING
  const { data: waStatus } = useQuery({
    queryKey: ['waStatus'],
    queryFn: getWAStatus,
    refetchInterval: 5000,
  })

  // Grupos WA
  const { data: waGroups = [], isLoading: loadingGroups, refetch: refetchGroups } = useQuery({
    queryKey: ['waGroups'],
    queryFn: getWAGroups,
    staleTime: 60000,
    enabled: waStatus?.status === 'WORKING',
  })

  const createGroup = useMutation({
    mutationFn: createWAGroupDirect,
    onSuccess: () => {
      setNewGroupName('')
      setTimeout(() => refetchGroups(), 12000)
    },
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

        {/* ── WhatsApp — WAHA only ── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">WhatsApp</h2>
            <span className="text-xs text-gray-500 font-mono">
              WAHA {waStatus?.engine?.engine ? `(${waStatus.engine.engine})` : ''}
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-1">Gerenciado pelo painel abaixo.</p>
        </div>

        {/* ── WAHA Status + QR + Grupos ────────────────────────────── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">📱 WhatsApp Status</h2>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor}`}>
              {waStatus?.status || '…'}
            </span>
          </div>

          {/* QR iframe quando SCAN_QR_CODE */}
          {waStatus?.status === 'SCAN_QR_CODE' && (
            <div>
              <p className="text-xs text-yellow-400 mb-2">Escaneie o QR com o WhatsApp →</p>
              <iframe src="/api/config/wa/qr"
                className="w-full rounded-xl border-0 bg-black"
                style={{ height: 700 }} />
            </div>
          )}

          {/* Botão iniciar sessão */}
          {(waStatus?.status === 'STOPPED' || waStatus?.status === 'NOT_CONFIGURED' || waStatus?.status === 'FAILED') && (
            <button type="button" onClick={() => startSession.mutate()}
              disabled={startSession.isPending}
              className="w-full bg-green-800 hover:bg-green-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm">
              {startSession.isPending ? '⏳ Iniciando...' : '▶ Iniciar sessão'}
            </button>
          )}

          {/* Logout quando WORKING */}
          {waStatus?.status === 'WORKING' && (
            <button type="button"
              onClick={() => { if (window.confirm('Desconectar o WhatsApp?')) logout.mutate() }}
              disabled={logout.isPending}
              className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors">
              {logout.isPending ? '⏳ Desconectando...' : '🚪 Desconectar WhatsApp'}
            </button>
          )}

          {/* Gestão de grupos — só quando WORKING */}
          {waStatus?.status === 'WORKING' && (
            <div className="space-y-3 pt-2 border-t border-gray-800">
              <div className="flex items-center justify-between">
                {/* Prefixo */}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-400 whitespace-nowrap">Prefixo:</label>
                  <input
                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-green-500"
                    value={form.wa_group_prefix}
                    onChange={e => setForm(f => ({ ...f, wa_group_prefix: e.target.value }))}
                    placeholder="Snatcher"
                  />
                  <span className="text-xs text-gray-500 font-mono whitespace-nowrap">
                    → {form.wa_group_prefix || '…'} - Nome
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-300">Grupos WhatsApp</p>
                <button type="button" onClick={() => refetchGroups()}
                  className="text-xs text-gray-400 hover:text-white transition-colors">
                  🔄 Atualizar
                </button>
              </div>

              {/* Criar novo grupo */}
              <div className="flex gap-2">
                <input className={`${field} flex-1`}
                  placeholder={form.wa_group_prefix ? `ex: Whey Barato` : 'Nome do grupo'}
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)} />
                <button type="button"
                  onClick={() => createGroup.mutate(newGroupName)}
                  disabled={!newGroupName.trim() || createGroup.isPending}
                  className="bg-green-800 hover:bg-green-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg whitespace-nowrap transition-colors">
                  {createGroup.isPending ? '⏳' : '+ Criar'}
                </button>
              </div>
              {createGroup.isSuccess && (
                <p className="text-xs text-yellow-400">⏳ Criando... aguarde ~10s e clique Atualizar</p>
              )}

              {/* Lista de grupos */}
              {loadingGroups && <p className="text-xs text-gray-500">Carregando grupos...</p>}
              {!loadingGroups && waGroups.length === 0 && (
                <p className="text-xs text-gray-500">Nenhum grupo encontrado. Crie um acima ou pelo WhatsApp.</p>
              )}
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {waGroups.map(g => (
                  <div key={g.id}
                    className="flex items-center justify-between bg-gray-800 px-3 py-2 rounded-lg">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">{g.name}</p>
                      <p className="text-xs text-gray-500 font-mono truncate">{g.id}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                      {g.size > 0 && (
                        <span className="text-xs text-gray-500">{g.size}👤</span>
                      )}
                      <button type="button"
                        onClick={() => { navigator.clipboard.writeText(g.id); }}
                        className="text-gray-400 hover:text-green-400 transition-colors text-sm"
                        title="Copiar Group ID">
                        📋
                      </button>
                    </div>
                  </div>
                ))}
              </div>
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
