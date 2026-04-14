import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createGroup, updateGroup, getGroup } from '../api'

const EMPTY = {
  name: '',
  description: '',
  search_prompt: '',
  min_val: '',
  max_val: '',
  scan_interval: 30,
  active: true,
  message_template: '',
}

export default function GroupForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isEdit = Boolean(id)
  const [form, setForm] = useState(EMPTY)

  const { data: existing } = useQuery({
    queryKey: ['group', id],
    queryFn: () => getGroup(id),
    enabled: isEdit,
  })

  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name,
        description: existing.description,
        search_prompt: existing.search_prompt,
        min_val: existing.min_val,
        max_val: existing.max_val,
        scan_interval: existing.scan_interval,
        active: existing.active,
        message_template: existing.message_template || '',
      })
    }
  }, [existing])

  const mutation = useMutation({
    mutationFn: (data) => isEdit ? updateGroup(id, data) : createGroup(data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      navigate(isEdit ? `/admin/groups/${id}` : `/admin/groups/${result.id}`)
    },
  })

  const set = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm(f => ({ ...f, [field]: val }))
  }

  const submit = (e) => {
    e.preventDefault()
    mutation.mutate({
      ...form,
      min_val: parseFloat(form.min_val),
      max_val: parseFloat(form.max_val),
      scan_interval: parseInt(form.scan_interval),
      message_template: form.message_template || null,
    })
  }

  const field = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors'
  const label = 'block text-sm font-medium text-gray-300 mb-1.5'

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-8">
        {isEdit ? 'Editar Canal' : 'Novo Canal'}
      </h1>

      <form onSubmit={submit} className="space-y-5">
        <div>
          <label className={label}>Nome *</label>
          <input className={field} value={form.name} onChange={set('name')} required placeholder="Ex: Whey Barato" />
        </div>

        <div>
          <label className={label}>Descrição</label>
          <input className={field} value={form.description} onChange={set('description')} placeholder="Ex: Grupo de whey protein com bom custo-benefício" />
        </div>

        <div>
          <label className={label}>Prompt de busca *</label>
          <textarea
            className={`${field} resize-none`}
            rows={3}
            value={form.search_prompt}
            onChange={set('search_prompt')}
            required
            placeholder="Ex: whey protein isolado 900g sem açúcar"
          />
          <p className="text-xs text-gray-500 mt-1">Descreva com detalhes o produto que quer encontrar.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Preço mínimo (R$) *</label>
            <input className={field} type="number" min="0" step="0.01" value={form.min_val} onChange={set('min_val')} required placeholder="50.00" />
          </div>
          <div>
            <label className={label}>Preço máximo (R$) *</label>
            <input className={field} type="number" min="0" step="0.01" value={form.max_val} onChange={set('max_val')} required placeholder="200.00" />
          </div>
        </div>

        <div>
          <label className={label}>Intervalo de scan (minutos)</label>
          <input className={field} type="number" min="5" max="1440" value={form.scan_interval} onChange={set('scan_interval')} />
        </div>

        <div>
          <label className={label}>Template de mensagem</label>
          <textarea
            className={`${field} resize-none font-mono text-sm`}
            rows={5}
            value={form.message_template}
            onChange={set('message_template')}
            placeholder={'🔥 *PROMOÇÃO — {group_name}*\n\n📦 {title}\n💰 {price}\n🏪 {source}\n\n🔗 {url}'}
          />
          <p className="text-xs text-gray-500 mt-1">
            Variáveis:{' '}
            {['{title}', '{price}', '{url}', '{source}', '{group_name}', '{image_url}'].map(v => (
              <code key={v} className="text-green-400 mr-1">{v}</code>
            ))}.
            Deixe vazio para usar o padrão.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="active"
            checked={form.active}
            onChange={set('active')}
            className="w-4 h-4 accent-green-500"
          />
          <label htmlFor="active" className="text-sm text-gray-300">Canal ativo (incluso no scan automático)</label>
        </div>

        {mutation.error && (
          <p className="text-red-400 text-sm">Erro: {mutation.error.message}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors"
          >
            {mutation.isPending ? 'Salvando...' : (isEdit ? 'Salvar alterações' : 'Criar canal')}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
