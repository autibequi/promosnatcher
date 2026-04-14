import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import GroupForm from './pages/GroupForm'
import GroupDetail from './pages/GroupDetail'
import Settings from './pages/Settings'

function Nav() {
  const link = ({ isActive }) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
    }`

  return (
    <nav className="border-b border-gray-800 bg-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
        <span className="text-green-400 font-bold text-lg mr-4">🔥 Promo Hunter</span>
        <NavLink to="/" end className={link}>Grupos</NavLink>
        <NavLink to="/settings" className={link}>Configurações</NavLink>
      </div>
    </nav>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
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
