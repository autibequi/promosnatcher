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
      const isWAConfig = url.includes('/wa/') || url.includes('/config/wa')
      if (!isWAConfig) {
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
export const getAllProducts = (params = {}) =>
  api.get('/products', { params }).then(r => r.data)
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

// Telegram
export const getTGStatus = () => api.get('/config/tg/status').then(r => r.data)
export const testTG = () => api.post('/config/tg/test').then(r => r.data)
export const getTGChats = (linked) => api.get('/config/tg/chats', { params: { linked } }).then(r => r.data)
export const resolveTGChat = (handle) => api.post('/config/tg/chats/resolve', { handle }).then(r => r.data)
export const linkTGChat = (chatId, groupId) => api.post(`/config/tg/chats/${encodeURIComponent(chatId)}/link`, { group_id: groupId }).then(r => r.data)
export const unlinkTGChat = (chatId) => api.delete(`/config/tg/chats/${encodeURIComponent(chatId)}/link`).then(r => r.data)
export const setTGTitle = (chatId, title) => api.put(`/config/tg/chats/${encodeURIComponent(chatId)}/title`, { title }).then(r => r.data)
export const getTGInvite = (chatId) => api.get(`/config/tg/chats/${encodeURIComponent(chatId)}/invite`).then(r => r.data)
export const leaveTGChat = (chatId) => api.delete(`/config/tg/chats/${encodeURIComponent(chatId)}`).then(r => r.data)
export const getTGDeeplink = () => api.get('/config/tg/deeplink').then(r => r.data)

// Analytics
export const getAnalyticsSummary = (days = 30) =>
  api.get('/analytics/summary', { params: { days } }).then(r => r.data)
export const getAnalyticsByGroup = (days = 30) =>
  api.get('/analytics/by-group', { params: { days } }).then(r => r.data)

// v2 — Search Terms (Crawlers)
export const getSearchTerms = () => api.get('/search-terms').then(r => r.data)
export const createSearchTerm = (data) => api.post('/search-terms', data).then(r => r.data)
export const updateSearchTerm = (id, data) => api.put(`/search-terms/${id}`, data).then(r => r.data)
export const deleteSearchTerm = (id) => api.delete(`/search-terms/${id}`)
export const crawlSearchTerm = (id) => api.post(`/search-terms/${id}/crawl`).then(r => r.data)
export const getCrawlResults = (termId, params = {}) => api.get(`/search-terms/${termId}/results`, { params }).then(r => r.data)
export const getCrawlLogs = (params = {}) => api.get('/crawl-logs', { params }).then(r => r.data)

// v2 — Catalog
export const getCatalogProducts = (params = {}) => api.get('/catalog', { params }).then(r => r.data)
export const getCatalogProduct = (id) => api.get(`/catalog/${id}`).then(r => r.data)
export const updateCatalogProduct = (id, data) => api.put(`/catalog/${id}`, data).then(r => r.data)
export const getCatalogVariants = (productId) => api.get(`/catalog/${productId}/variants`).then(r => r.data)
export const getVariantHistory = (variantId) => api.get(`/catalog/variants/${variantId}/history`).then(r => r.data)
export const getKeywords = () => api.get('/catalog/keywords').then(r => r.data)
export const createKeyword = (data) => api.post('/catalog/keywords', data).then(r => r.data)
export const deleteKeyword = (id) => api.delete(`/catalog/keywords/${id}`)

// v2 — Channels
export const getChannels = () => api.get('/channels').then(r => r.data)
export const createChannel = (data) => api.post('/channels', data).then(r => r.data)
export const getChannel = (id) => api.get(`/channels/${id}`).then(r => r.data)
export const updateChannel = (id, data) => api.put(`/channels/${id}`, data).then(r => r.data)
export const deleteChannel = (id) => api.delete(`/channels/${id}`)
export const addChannelTarget = (channelId, data) => api.post(`/channels/${channelId}/targets`, data).then(r => r.data)
export const updateChannelTarget = (channelId, targetId, data) => api.patch(`/channels/${channelId}/targets/${targetId}`, data).then(r => r.data)
export const removeChannelTarget = (channelId, targetId) => api.delete(`/channels/${channelId}/targets/${targetId}`)
export const addChannelRule = (channelId, data) => api.post(`/channels/${channelId}/rules`, data).then(r => r.data)
export const updateChannelRule = (channelId, ruleId, data) => api.put(`/channels/${channelId}/rules/${ruleId}`, data).then(r => r.data)
export const deleteChannelRule = (channelId, ruleId) => api.delete(`/channels/${channelId}/rules/${ruleId}`)

// v2 — Accounts (multi-WA/TG)
export const getWAHealth = () => api.get('/accounts/wa/health').then(r => r.data)
export const getWAAccounts = () => api.get('/accounts/wa').then(r => r.data)
export const createWAAccount = (data) => api.post('/accounts/wa', data).then(r => r.data)
export const updateWAAccount = (id, data) => api.put(`/accounts/wa/${id}`, data).then(r => r.data)
export const deleteWAAccount = (id) => api.delete(`/accounts/wa/${id}`)
export const getWAAccountStatus = (id) => api.get(`/accounts/wa/${id}/status`).then(r => r.data)
export const getWAAccountGroups = (id) => api.get(`/accounts/wa/${id}/groups`).then(r => r.data)
export const createWAAccountGroup = (id, name) => api.post(`/accounts/wa/${id}/groups`, { name }).then(r => r.data)
export const leaveWAAccountGroup = (id, groupId) => api.delete(`/accounts/wa/${id}/groups/${encodeURIComponent(groupId)}`).then(r => r.data)
export const testWAAccount = (id) => api.post(`/accounts/wa/${id}/test`).then(r => r.data)
export const startWAAccountSession = (id) => api.post(`/accounts/wa/${id}/session/start`).then(r => r.data)
export const logoutWAAccount = (id) => api.post(`/accounts/wa/${id}/session/logout`).then(r => r.data)

export const getTGAccounts = () => api.get('/accounts/tg').then(r => r.data)
export const createTGAccount = (data) => api.post('/accounts/tg', data).then(r => r.data)
export const updateTGAccount = (id, data) => api.put(`/accounts/tg/${id}`, data).then(r => r.data)
export const deleteTGAccount = (id) => api.delete(`/accounts/tg/${id}`)
export const testTGAccount = (id) => api.post(`/accounts/tg/${id}/test`).then(r => r.data)

export default api
