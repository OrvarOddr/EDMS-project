import axios from 'axios'

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

function isAuthFlowRequest(url?: string) {
  const normalized = String(url ?? '')
  return normalized.includes('/auth/login') || normalized.includes('/auth/refresh') || normalized.includes('/auth/logout')
}

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  const authorizationHeader = config.headers?.Authorization ?? config.headers?.['authorization']
  if (token && !authorizationHeader) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    if (err.response?.status === 401 && !original?._retry && !isAuthFlowRequest(original?.url)) {
      original._retry = true
      const refresh = localStorage.getItem('refresh_token')
      if (refresh) {
        try {
          const { data } = await axios.post('/api/auth/refresh', { refresh_token: refresh })
          localStorage.setItem('access_token', data.access_token)
          localStorage.setItem('refresh_token', data.refresh_token)
          original.headers = original.headers ?? {}
          original.headers.Authorization = `Bearer ${data.access_token}`
          return client(original)
        } catch {
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(err)
  },
)

export default client
