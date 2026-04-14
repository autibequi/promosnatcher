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
  })

  useEffect(() => {
    if (config) {
      setForm({
        wa_provider: config.wa_provider || 'evolution',
        wa_base_url: config.wa_base_url || '',
        wa_api_key: '',
        wa_instance: config.wa_instance || '',
        global_interval: config.global_interval || 30,
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

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-base font-semibold text-white mb-4">Scan</h2>
          <div>
            <label className={label}>Intervalo global (minutos)</label>
            <input className={field} type="number" min="5" max="1440" value={form.global_interval} onChange={set('global_interval')} />
            <p className="text-xs text-gray-500 mt-1">Grupos sem intervalo próprio usam esse valor. Reinicia o scheduler ao salvar.</p>
          </div>
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
