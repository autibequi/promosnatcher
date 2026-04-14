import { useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import GroupForm from './pages/GroupForm'
import GroupDetail from './pages/GroupDetail'
import Settings from './pages/Settings'
import Login from './pages/Login'

function Nav({ onLogout }) {
  const link = ({ isActive }) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
    }`

  return (
    <nav className="border-b border-gray-800 bg-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
        <span className="text-green-400 font-bold text-lg mr-4">🔥 Promo Snatcher</span>
        <NavLink to="/" end className={link}>Grupos</NavLink>
        <NavLink to="/settings" className={link}>Configurações</NavLink>
        <div className="ml-auto">
          <button
            onClick={onLogout}
            className="text-gray-500 hover:text-gray-300 text-sm px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
          >
            Sair
          </button>
        </div>
      </div>
    </nav>
  )
}

export default function App() {
  const [authed, setAuthed] = useState(!!localStorage.getItem('ph_token'))

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />
  }

  const logout = () => {
    localStorage.removeItem('ph_token')
    setAuthed(false)
  }

  return (
    <BrowserRouter>
      <Nav onLogout={logout} />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/groups/new" element={<GroupForm />} />
          <Route path="/groups/:id" element={<GroupDetail />} />
          <Route path="/groups/:id/edit" element={<GroupForm />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
