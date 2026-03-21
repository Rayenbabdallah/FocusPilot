import axios, { AxiosError } from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

const client = axios.create({
  baseURL: BASE_URL + '/api',
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use((config) => {
  if (import.meta.env.DEV) {
    console.debug(`[FocusPilot] ${config.method?.toUpperCase()} ${config.url}`)
  }
  return config
})

client.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response) {
      const data = error.response.data as { detail?: string }
      const message = data?.detail ?? `Error ${error.response.status}`
      if (error.response.status >= 500) console.error('[FocusPilot] Server error:', message)
      return Promise.reject(new Error(message))
    }
    if (error.request) return Promise.reject(new Error('Cannot reach server. Is the backend running?'))
    return Promise.reject(new Error(error.message))
  }
)

export default client
