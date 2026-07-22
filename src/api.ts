const TOKEN_KEY = 'phoneflow_token'

export type SessionUser = {
  id: string
  name: string
  email: string
  role: 'OWNER' | 'MANAGER' | 'CASHIER' | 'STOCK'
  active: boolean
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  requestId?: string
  retryable: boolean

  constructor(message: string, status: number, requestId?: string, retryable = false) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.requestId = requestId
    this.retryable = retryable
  }
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers = new Headers(options.headers)
  const clientRequestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (!headers.has('X-Request-ID')) headers.set('X-Request-ID', clientRequestId)

  const response = await fetch(`/api${path}`, { ...options, headers })
  const payload = (await response.json().catch(() => ({}))) as { message?: string; requestId?: string; retryable?: boolean } & T

  if (response.status === 401) setToken(null)
  if (!response.ok) {
    const requestId = payload.requestId || response.headers.get('X-Request-ID') || undefined
    const serverUnavailable = response.status >= 500 && !requestId
    const message = serverUnavailable
      ? 'The API server is temporarily unavailable. Check the server terminal before trying again.'
      : payload.message || `Request failed (${response.status})`
    const reference = requestId ? ` Reference: ${requestId}` : ''

    // Mutation requests are deliberately not retried automatically. A timed-out
    // MongoDB write may already be committed, so retrying could create duplicates.
    throw new ApiError(`${message}${reference}`, response.status, requestId, Boolean(payload.retryable))
  }
  return payload
}
