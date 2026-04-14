import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// Injeta token JWT em todas as requests
api.interceptors.request.use(config => {
  const token = localStorage.getItem('ph_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Remove token e força re-login em 401
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ph_token')
      window.location.href = '/'
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
