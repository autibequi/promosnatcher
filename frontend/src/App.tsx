import React, { useState, Component, Suspense, lazy, ErrorInfo, ReactNode } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'

interface ErrorBoundaryState {
  error: Error | null
}

interface ErrorBoundaryProps {
  children: ReactNode
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Error caught:', error, errorInfo)
  }

  render(): ReactNode {
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
import Settings from './pages/Settings'
import Login from './pages/Login'

// v2 pages — lazy load para nao crashar o app se api.js nao tiver os exports
const Crawlers = lazy(() => import('./pages/Crawlers'))
const CrawlerDetail = lazy(() => import('./pages/CrawlerDetail'))
const Catalog = lazy(() => import('./pages/Catalog'))
const Channels = lazy(() => import('./pages/Channels'))
const ChannelDetail = lazy(() => import('./pages/ChannelDetail'))
const Groups = lazy(() => import('./pages/Groups'))
const Logs = lazy(() => import('./pages/Logs'))
const Broadcast = lazy(() => import('./pages/Broadcast'))

interface AdminNavProps {
  onLogout: () => void
}

interface RequireAuthProps {
  children: ReactNode
}

function AdminNav({ onLogout }: AdminNavProps): React.ReactElement {
  const link = ({ isActive }: { isActive: boolean }): string =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
      isActive ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
    }`

  return (
    <nav className="border-b border-gray-800 bg-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center gap-1.5 sm:gap-3 overflow-x-auto">
        <NavLink to="/admin" end className="text-green-400 font-bold text-lg mr-1 sm:mr-3 flex-shrink-0">🔥</NavLink>
        <NavLink to="/admin" end className={link}>Dashboard</NavLink>
        <NavLink to="/admin/crawlers" className={link}>Crawlers</NavLink>
        <NavLink to="/admin/catalog" className={link}>Catalogo</NavLink>
        <NavLink to="/admin/channels" className={link}>Canais</NavLink>
        <NavLink to="/admin/broadcast" className={link}>Broadcast</NavLink>
        <NavLink to="/admin/groups" className={link}>Grupos</NavLink>
        <NavLink to="/admin/logs" className={link}>Logs</NavLink>
        <NavLink to="/admin/settings" className={link}>Config</NavLink>
        <button onClick={onLogout}
          className="ml-auto text-gray-500 hover:text-gray-300 text-sm px-2 py-1.5 rounded-lg hover:bg-gray-800 transition-colors flex-shrink-0">
          Sair
        </button>
      </div>
    </nav>
  )
}

function RequireAuth({ children }: RequireAuthProps): React.ReactElement {
  const token = localStorage.getItem('ph_token')
  const location = useLocation()
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />
  return <>{children}</>
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
        <Route path="/admin/groups" element={
          <RequireAuth>
            <AdminNav onLogout={logout} />
            <main className="max-w-6xl mx-auto px-4 py-8">
              <Suspense fallback={<div className="text-gray-500 text-center py-16">Carregando...</div>}>
                <Groups />
              </Suspense>
            </main>
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
        <Route path="/admin/crawlers/:id" element={
          <RequireAuth>
            <AdminNav onLogout={logout} />
            <main className="max-w-6xl mx-auto px-4 py-8">
              <Suspense fallback={<div className="text-gray-500 text-center py-16">Carregando...</div>}>
                <CrawlerDetail />
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
        <Route path="/admin/channels/:id" element={
          <RequireAuth>
            <AdminNav onLogout={logout} />
            <main className="max-w-6xl mx-auto px-4 py-8">
              <Suspense fallback={<div className="text-gray-500 text-center py-16">Carregando...</div>}>
                <ChannelDetail />
              </Suspense>
            </main>
          </RequireAuth>
        } />
        <Route path="/admin/logs" element={
          <RequireAuth>
            <AdminNav onLogout={logout} />
            <main className="max-w-6xl mx-auto px-4 py-8">
              <Suspense fallback={<div className="text-gray-500 text-center py-16">Carregando...</div>}>
                <Logs />
              </Suspense>
            </main>
          </RequireAuth>
        } />
        <Route path="/admin/broadcast" element={
          <RequireAuth>
            <AdminNav onLogout={logout} />
            <main className="max-w-6xl mx-auto px-4 py-8">
              <Suspense fallback={<div className="text-gray-500 text-center py-16">Carregando...</div>}>
                <Broadcast />
              </Suspense>
            </main>
          </RequireAuth>
        } />
        {/* Catch-all → frontpage */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  )
}
