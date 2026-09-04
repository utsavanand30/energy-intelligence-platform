import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,  // send httpOnly cookies on every request
})

// Response error logger
api.interceptors.response.use(
  (r) => r,
  (err) => {
    console.error('[API Error]', err.response?.status, err.config?.url, err.message)
    return Promise.reject(err)
  },
)

// 401 interceptor: attempt token refresh, then redirect to login
let isRefreshing = false
let pendingRequests: Array<() => void> = []

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    // Only retry once, only on 401, skip auth endpoints to prevent loops
    if (
      error.response?.status === 401 &&
      !original._retry &&
      !original.url?.includes('/auth/login') &&
      !original.url?.includes('/auth/refresh')
    ) {
      if (isRefreshing) {
        return new Promise<void>((resolve) => {
          pendingRequests.push(resolve)
        }).then(() => api(original))
      }

      original._retry = true
      isRefreshing = true

      try {
        await api.post('/auth/refresh')
        pendingRequests.forEach((cb) => cb())
        pendingRequests = []
        return api(original)
      } catch {
        // Refresh failed — redirect to login
        window.location.href = '/login?reason=session_expired'
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(error)
  },
)

export default api
