import { useState } from 'react'
import axios from 'axios'

export default function Login({ onLogin }) {
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const r = await axios.post('/api/auth/login', form)
      localStorage.setItem('ph_token', r.data.access_token)
      onLogin()
    } catch {
      setError('Usuário ou senha incorretos')
    } finally {
      setLoading(false)
    }
  }

  const field = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors'

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-4xl">🔥</span>
          <h1 className="text-2xl font-bold text-white mt-2">Promo Snatcher</h1>
          <p className="text-gray-500 text-sm mt-1">Entre para continuar</p>
        </div>
        <form onSubmit={submit} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1.5">Usuário</label>
            <input
              className={field}
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              placeholder="admin"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1.5">Senha</label>
            <input
              className={field}
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="••••••••"
              required
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
