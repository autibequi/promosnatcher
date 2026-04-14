import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { getConfig, updateConfig, testWA } from '../api'

export default function Settings() {
  const { data: config, isLoading } = useQuery({ queryKey: ['config'], queryFn: getConfig })

  const [form, setForm] = useState({
    wa_provider: 'evolution',
    wa_base_url: '',
    wa_api_key: '',
    wa_instance: '',
    global_interval: 30,
    send_start_hour: 8,
    send_end_hour: 22,
    ml_client_id: '',
    ml_client_secret: '',
  })

  useEffect(() => {
    if (config) {
      setForm({
        wa_provider: config.wa_provider || 'evolution',
        wa_base_url: config.wa_base_url || '',
        wa_api_key: '',
        wa_instance: config.wa_instance || '',
        global_interval: config.global_interval || 30,
        send_start_hour: config.send_start_hour ?? 8,
        send_end_hour: config.send_end_hour ?? 22,
        ml_client_id: config.ml_client_id || '',
        ml_client_secret: '',
      })
    }
  }, [config])

  const save = useMutation({
    mutationFn: (data) => updateConfig(data),
  })

  const test = useMutation({ mutationFn: testWA })

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

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
    })
  }

  const field = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors font-mono text-sm'
  const label = 'block text-sm font-medium text-gray-300 mb-1.5'

  if (isLoading) return <div className="text-center text-gray-400 py-16">Carregando...</div>

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2">Configurações</h1>
      <p className="text-gray-400 text-sm mb-8">Configure o provider do WhatsApp e o intervalo de scan global.</p>

      <form onSubmit={submit} className="space-y-5">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-white">WhatsApp</h2>

          <div>
            <label className={label}>Provider</label>
            <select className={field} value={form.wa_provider} onChange={set('wa_provider')}>
              <option value="evolution">Evolution API (self-hosted)</option>
              <option value="zapi">Z-API (SaaS)</option>
            </select>
          </div>

          <div>
            <label className={label}>Base URL</label>
            <input className={field} value={form.wa_base_url} onChange={set('wa_base_url')} placeholder={form.wa_provider === 'evolution' ? 'http://localhost:8080' : 'https://api.z-api.io'} />
          </div>

          <div>
            <label className={label}>API Key {config?.wa_api_key ? '(já configurada — deixe em branco para manter)' : ''}</label>
            <input className={field} type="password" value={form.wa_api_key} onChange={set('wa_api_key')} placeholder="••••••••" />
          </div>

          <div>
            <label className={label}>Instance ID</label>
            <input className={field} value={form.wa_instance} onChange={set('wa_instance')} placeholder={form.wa_provider === 'evolution' ? 'minha-instancia' : 'seu-instance-id'} />
          </div>

          <button
            type="button"
            onClick={() => test.mutate()}
            disabled={test.isPending}
            className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm transition-colors"
          >
            {test.isPending ? '⏳ Testando...' : '🔌 Testar conexão WA'}
          </button>
          {test.isSuccess && (
            <p className={`text-sm ${test.data.connected ? 'text-green-400' : 'text-red-400'}`}>
              {test.data.connected ? '✓ Conectado!' : '✗ Falha na conexão'}
            </p>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-white">Mercado Livre API</h2>
          <p className="text-xs text-gray-500">
            Opcional. Cadastre um app em{' '}
            <span className="text-green-400">developers.mercadolivre.com.br</span>{' '}
            para usar a API oficial (5000 req/dia, mais estável). Sem credenciais, usa scraping HTML.
          </p>
          <div>
            <label className={label}>Client ID</label>
            <input className={field} value={form.ml_client_id} onChange={set('ml_client_id')} placeholder="1234567890" />
          </div>
          <div>
            <label className={label}>
              Client Secret {config?.ml_client_id ? '(configurado — deixe em branco para manter)' : ''}
            </label>
            <input className={field} type="password" value={form.ml_client_secret} onChange={set('ml_client_secret')} placeholder="••••••••" />
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-base font-semibold text-white mb-4">Scan</h2>
          <div>
            <label className={label}>Intervalo global (minutos)</label>
            <input className={field} type="number" min="5" max="1440" value={form.global_interval} onChange={set('global_interval')} />
            <p className="text-xs text-gray-500 mt-1">Grupos sem intervalo próprio usam esse valor. Reinicia o scheduler ao salvar.</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-2">
            <div>
              <label className={label}>Enviar WA a partir de (h)</label>
              <input className={field} type="number" min="0" max="23" value={form.send_start_hour} onChange={set('send_start_hour')} />
            </div>
            <div>
              <label className={label}>Enviar WA até (h)</label>
              <input className={field} type="number" min="0" max="23" value={form.send_end_hour} onChange={set('send_end_hour')} />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Fuso: America/Sao_Paulo. Scans rodam normalmente fora da janela — só o envio WA é bloqueado.
          </p>
        </div>

        {save.isSuccess && <p className="text-green-400 text-sm">✓ Configurações salvas!</p>}
        {save.error && <p className="text-red-400 text-sm">Erro ao salvar.</p>}

        <button
          type="submit"
          disabled={save.isPending}
          className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors"
        >
          {save.isPending ? 'Salvando...' : 'Salvar configurações'}
        </button>
      </form>
    </div>
  )
}
