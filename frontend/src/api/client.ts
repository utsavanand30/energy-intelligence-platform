import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    console.error('[API Error]', err.response?.status, err.config?.url, err.message)
    return Promise.reject(err)
  },
)

export default api
