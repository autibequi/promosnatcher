import axios from 'axios'

// Cria instância já com o token atual (se existir)
const getToken = () => localStorage.getItem('ph_token')

const api = axios.create({
  baseURL: '/api',
  headers: { Authorization: getToken() ? `Bearer ${getToken()}` : undefined },
})

// Atualiza token em cada request (refresh automático)
api.interceptors.request.use(config => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  else delete config.headers.Authorization
  return config
})

// Remove token e força re-login em 401 — exceto endpoints WAHA (falha silenciosa)
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      const url = err.config?.url || ''
      const isWAHA = url.includes('/wa/') || url.includes('/config/wa')
      if (!isWAHA) {
        localStorage.removeItem('ph_token')
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

// Groups
export const getGroups = () => api.get('/groups').then(r => r.data)
export const getGroup = (id) => api.get(`/groups/${id}`).then(r => r.data)
export const createGroup = (data) => api.post('/groups', data).then(r => r.data)
export const updateGroup = (id, data) => api.put(`/groups/${id}`, data).then(r => r.data)
export const deleteGroup = (id) => api.delete(`/groups/${id}`)
export const triggerScan = (id) => api.post(`/groups/${id}/scan`).then(r => r.data)
export const createWAGroup = (id, participants) =>
  api.post(`/groups/${id}/create-wa-group`, { participants }).then(r => r.data)

// Products
export const getProducts = (groupId, params = {}) =>
  api.get(`/groups/${groupId}/products`, { params }).then(r => r.data)
export const deleteProduct = (id) => api.delete(`/products/${id}`)
export const sendProduct = (id) => api.post(`/products/${id}/send`).then(r => r.data)
export const getProductHistory = (id) => api.get(`/products/${id}/history`).then(r => r.data)

// Scan
export const getScanJobs = () => api.get('/scan/jobs').then(r => r.data)
export const getScanStatus = () => api.get('/scan/status').then(r => r.data)

// Config
export const getConfig = () => api.get('/config').then(r => r.data)
export const updateConfig = (data) => api.put('/config', data).then(r => r.data)
export const testWA = () => api.post('/config/test-wa').then(r => r.data)
export const getWAStatus = () => api.get('/config/wa/status').then(r => r.data)
export const startWASession = () => api.post('/config/wa/session/start').then(r => r.data)
export const logoutWASession = () => api.post('/config/wa/session/logout').then(r => r.data)
export const getWAGroups = () => api.get('/config/wa/groups').then(r => r.data)
export const createWAGroupDirect = (name) => api.post('/config/wa/groups', { name }).then(r => r.data)
export const getWAGroupInvite = (groupId) => api.get(`/config/wa/groups/${encodeURIComponent(groupId)}/invite`).then(r => r.data)
export const updateWAGroup = (groupId, data) => api.put(`/config/wa/groups/${encodeURIComponent(groupId)}`, data).then(r => r.data)
export const leaveWAGroup = (groupId) => api.delete(`/config/wa/groups/${encodeURIComponent(groupId)}`).then(r => r.data)

// Analytics
export const getAnalyticsSummary = (days = 30) =>
  api.get('/analytics/summary', { params: { days } }).then(r => r.data)
export const getAnalyticsByGroup = (days = 30) =>
  api.get('/analytics/by-group', { params: { days } }).then(r => r.data)

export default api
