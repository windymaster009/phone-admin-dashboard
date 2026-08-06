const TOKEN_KEY = 'phoneflow_token'
const SESSION_USER_KEY = 'phoneflow_session_user'
const tokenListeners = new Set<() => void>()
const inFlightReads = new Map<string, Promise<unknown>>()

export type SessionUser = {
  id: string
  name: string
  email: string
  role: 'OWNER' | 'MANAGER' | 'CASHIER' | 'STOCK'
  active: boolean
}

const validRoles = new Set<SessionUser['role']>(['OWNER', 'MANAGER', 'CASHIER', 'STOCK'])

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function getSessionUser(): SessionUser | null {
  try {
    const stored = localStorage.getItem(SESSION_USER_KEY)
    if (!stored) return null

    const user = JSON.parse(stored) as Partial<SessionUser>
    if (
      typeof user.id !== 'string'
      || typeof user.name !== 'string'
      || typeof user.email !== 'string'
      || !validRoles.has(user.role as SessionUser['role'])
      || typeof user.active !== 'boolean'
    ) {
      localStorage.removeItem(SESSION_USER_KEY)
      return null
    }

    return user as SessionUser
  } catch {
    localStorage.removeItem(SESSION_USER_KEY)
    return null
  }
}

export function setSessionUser(user: SessionUser | null) {
  if (user) localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user))
  else localStorage.removeItem(SESSION_USER_KEY)
}

export function subscribeToTokenChanges(listener: () => void) {
  tokenListeners.add(listener)
  return () => {
    tokenListeners.delete(listener)
  }
}

export function setToken(token: string | null) {
  const previousToken = getToken()
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else {
    localStorage.removeItem(TOKEN_KEY)
    setSessionUser(null)
  }

  if (!token || previousToken !== token) {
    tokenListeners.forEach((listener) => listener())
  }
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

type ApiBehavior = {
  /** Only enable this for requests that are safe to repeat, such as sign-in. */
  retryTransient?: boolean
  /** Disable only when two concurrent reads must reach the server separately. */
  deduplicate?: boolean
}

const TRANSIENT_RETRY_DELAY_MS = 350

function wait(milliseconds: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds))
}

async function performRequest<T>(path: string, options: RequestInit, behavior: ApiBehavior): Promise<T> {
  const token = getToken()
  const headers = new Headers(options.headers)
  const clientRequestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (!headers.has('X-Request-ID')) headers.set('X-Request-ID', clientRequestId)
  if (!headers.has('X-PhoneFlow-Request')) headers.set('X-PhoneFlow-Request', '1')

  const method = String(options.method || 'GET').toUpperCase()
  const canRetry = method === 'GET' || method === 'HEAD' || behavior.retryTransient === true
  const attempts = canRetry ? 2 : 1

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`/api${path}`, {
        ...options,
        credentials: options.credentials || 'include',
        headers,
      })
      const payload = (await response.json().catch(() => ({}))) as { message?: string; requestId?: string; retryable?: boolean } & T

      if (response.status === 401) setToken(null)
      if (response.ok) return payload

      const requestId = payload.requestId || response.headers.get('X-Request-ID') || undefined
      const serverUnavailable = response.status >= 500 && !requestId
      const transient = serverUnavailable || Boolean(payload.retryable)

      if (transient && attempt < attempts) {
        await wait(TRANSIENT_RETRY_DELAY_MS)
        continue
      }

      const message = serverUnavailable
        ? 'The API server is temporarily unavailable. Check the server terminal before trying again.'
        : payload.message || `Request failed (${response.status})`
      const reference = requestId ? ` Reference: ${requestId}` : ''
      throw new ApiError(`${message}${reference}`, response.status, requestId, transient)
    } catch (error) {
      if (error instanceof ApiError) throw error
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      if (attempt < attempts) {
        await wait(TRANSIENT_RETRY_DELAY_MS)
        continue
      }

      throw new ApiError(
        'The API server is temporarily unavailable. Check the server terminal before trying again.',
        0,
        undefined,
        true,
      )
    }
  }

  throw new ApiError('Unable to complete the request', 0)
}

export function api<T = any>(path: string, options: RequestInit = {}, behavior: ApiBehavior = {}): Promise<T> {
  const method = String(options.method || 'GET').toUpperCase()
  const canDeduplicate = behavior.deduplicate !== false
    && (method === 'GET' || method === 'HEAD')
    && !options.body
    && !options.signal

  if (!canDeduplicate) return performRequest<T>(path, options, behavior)

  const token = getToken() || 'anonymous'
  const requestKey = `${token}:${method}:${path}`
  const existing = inFlightReads.get(requestKey)
  if (existing) return existing as Promise<T>

  const request = performRequest<T>(path, options, behavior)
  inFlightReads.set(requestKey, request)
  request.then(
    () => {
      if (inFlightReads.get(requestKey) === request) inFlightReads.delete(requestKey)
    },
    () => {
      if (inFlightReads.get(requestKey) === request) inFlightReads.delete(requestKey)
    },
  )

  return request
}
