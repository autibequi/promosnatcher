import { useState, Component, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'

class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: '#f87171', fontFamily: 'monospace', background: '#111' }}>
          <h2>React Error</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, color: '#888', marginTop: 10 }}>{this.state.error.stack}</pre>
          <button onClick={() => { this.setState({ error: null }); window.location.reload() }}
            style={{ marginTop: 20, padding: '8px 16px', background: '#333', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Recarregar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
import Frontpage from './pages/Frontpage'
import Dashboard from './pages/Dashboard'
import GroupForm from './pages/GroupForm'
import GroupDetail from './pages/GroupDetail'
import Settings from './pages/Settings'
import Analytics from './pages/Analytics'
import WAGroups from './pages/WAGroups'
import TGGroups from './pages/TGGroups'
import Products from './pages/Products'
import Login from './pages/Login'

// v2 pages — lazy load para nao crashar o app se api.js nao tiver os exports
const Crawlers = lazy(() => import('./pages/Crawlers'))
const Catalog = lazy(() => import('./pages/Catalog'))
const Channels = lazy(() => import('./pages/Channels'))

function AdminNav({ onLogout }) {
  const link = ({ isActive }) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
    }`

  return (
    <nav className="border-b border-gray-800 bg-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-2 sm:gap-4 flex-wrap">
        <span className="text-green-400 font-bold text-lg mr-2 sm:mr-4">🔥 <span className="hidden sm:inline">Promo Snatcher</span></span>
        <NavLink to="/admin" end className={link}>Home</NavLink>
        <NavLink to="/admin/crawlers" className={link}>Crawlers</NavLink>
        <NavLink to="/admin/catalog" className={link}>Catalogo</NavLink>
        <NavLink to="/admin/channels" className={link}>Canais</NavLink>
        <NavLink to="/admin/analytics" className={link}>Analytics</NavLink>
        <NavLink to="/admin/settings" className={link}>Config</NavLink>
        <div className="ml-auto">
          <button
            onClick={onLogout}
            className="text-gray-500 hover:text-gray-300 text-sm px-2 sm:px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
          >
            Sair
          </button>
        </div>
      </div>
    </nav>
  )
}

function RequireAuth({ children }) {
  const token = localStorage.getItem('ph_token')
  const location = useLocation()
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

export default function App() {
  const [, setTick] = useState(0)

  const logout = () => {
    localStorage.removeItem('ph_token')
    setTick(t => t + 1)
  }

  const isAuthed = !!localStorage.getItem('ph_token')

  return (
    <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Frontpage />} />
        <Route path="/login" element={
          isAuthed ? <Navigate to="/admin" replace /> : <Login onLogin={() => setTick(t => t + 1)} />
        } />

        {/* Admin routes */}
        <Route path="/admin" element={
          <RequireAuth>
            <AdminNav onLogout={logout} />
            <main className="max-w-6xl mx-auto px-4 py-8"><Dashboard /></main>
          </RequireAuth>
        } />
        <Route path="/admin/groups/new" element={
          <RequireAuth>
            <AdminNav onLogout={logout} />
            <main className="max-w-6xl mx-auto px-4 py-8"><GroupForm /></main>
          </RequireAuth>
        } />
        <Route path="/admin/groups/:id" element={
          <RequireAuth>
            <AdminNav onLogout={logout} />
            <main className="max-w-6xl mx-auto px-4 py-8"><GroupDetail /></main>
          </RequireAuth>
        } />
        <Route path="/admin/groups/:id/edit" element={
          <RequireAuth>
            <AdminNav onLogout={logout} />
            <main className="max-w-6xl mx-auto px-4 py-8"><GroupForm /></main>
          </RequireAuth>
        } />
        <Route path="/admin/settings" element={
          <RequireAuth>
            <AdminNav onLogout={logout} />
            <main className="max-w-6xl mx-auto px-4 py-8"><Settings /></main>
          </RequireAuth>
        } />
        <Route path="/admin/crawlers" element={
          <RequireAuth>
            <AdminNav onLogout={logout} />
            <main className="max-w-6xl mx-auto px-4 py-8">
              <Suspense fallback={<div className="text-gray-500 text-center py-16">Carregando...</div>}>
                <Crawlers />
              </Suspense>
            </main>
          </RequireAuth>
        } />
        <Route path="/admin/catalog" element={
          <RequireAuth>
            <AdminNav onLogout={logout} />
            <main className="max-w-6xl mx-auto px-4 py-8">
              <Suspense fallback={<div className="text-gray-500 text-center py-16">Carregando...</div>}>
                <Catalog />
              </Suspense>
            </main>
          </RequireAuth>
        } />
        <Route path="/admin/channels" element={
          <RequireAuth>
            <AdminNav onLogout={logout} />
            <main className="max-w-6xl mx-auto px-4 py-8">
              <Suspense fallback={<div className="text-gray-500 text-center py-16">Carregando...</div>}>
                <Channels />
              </Suspense>
            </main>
          </RequireAuth>
        } />
        {/* Legacy routes */}
        <Route path="/admin/products" element={
          <RequireAuth>
            <AdminNav onLogout={logout} />
            <main className="max-w-6xl mx-auto px-4 py-8"><Products /></main>
          </RequireAuth>
        } />
        <Route path="/admin/whatsapp" element={
          <RequireAuth>
            <AdminNav onLogout={logout} />
            <main className="max-w-6xl mx-auto px-4 py-8"><WAGroups /></main>
          </RequireAuth>
        } />
        <Route path="/admin/telegram" element={
          <RequireAuth>
            <AdminNav onLogout={logout} />
            <main className="max-w-6xl mx-auto px-4 py-8"><TGGroups /></main>
          </RequireAuth>
        } />
        <Route path="/admin/analytics" element={
          <RequireAuth>
            <AdminNav onLogout={logout} />
            <main className="max-w-6xl mx-auto px-4 py-8"><Analytics /></main>
          </RequireAuth>
        } />

        {/* Catch-all → frontpage */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  )
}
