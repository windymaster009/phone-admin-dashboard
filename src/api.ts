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

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`/api${path}`, { ...options, headers })
  const payload = (await response.json().catch(() => ({}))) as { message?: string } & T

  if (response.status === 401) setToken(null)
  if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`)
  return payload
}
