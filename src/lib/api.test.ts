import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  api,
  ApiError,
  getSessionUser,
  getToken,
  setAuthTransitionInProgress,
  setSessionUser,
  setToken,
  subscribeToTokenChanges,
} from './api'

describe('api client & request reliability', () => {
  beforeEach(() => {
    setToken(null)
    setSessionUser(null)
    setAuthTransitionInProgress(false)
    vi.restoreAllMocks()
  })

  afterEach(() => {
    setToken(null)
    setSessionUser(null)
    setAuthTransitionInProgress(false)
    vi.restoreAllMocks()
  })

  describe('token and session state management', () => {
    it('sets and gets auth token and notifies listeners on change', () => {
      const listener = vi.fn()
      const unsubscribe = subscribeToTokenChanges(listener)

      setToken('jwt-token-alpha')
      expect(getToken()).toBe('jwt-token-alpha')
      expect(listener).toHaveBeenCalledTimes(1)

      setToken('jwt-token-alpha') // unchanged, should not trigger listener
      expect(listener).toHaveBeenCalledTimes(1)

      setToken('jwt-token-beta')
      expect(getToken()).toBe('jwt-token-beta')
      expect(listener).toHaveBeenCalledTimes(2)

      unsubscribe()
      setToken(null)
      expect(getToken()).toBeNull()
      expect(listener).toHaveBeenCalledTimes(2) // unsubscribed
    })

    it('sets and gets session user', () => {
      expect(getSessionUser()).toBeNull()
      const user = {
        id: 'u-1',
        name: 'Alex',
        email: 'alex@example.com',
        role: 'OWNER' as const,
        active: true,
      }
      setSessionUser(user)
      expect(getSessionUser()).toEqual(user)
    })
  })

  describe('HTTP request headers and payload handling', () => {
    it('injects Authorization, X-Request-ID, and X-PhoneFlow-Request headers', async () => {
      setToken('auth-token-123')
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ success: true }),
      } as Response)

      await api('/test-endpoint', {
        method: 'POST',
        body: JSON.stringify({ name: 'test' }),
      })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url, init] = fetchSpy.mock.calls[0]
      expect(url).toBe('/api/test-endpoint')

      const headers = init?.headers as Headers
      expect(headers.get('Authorization')).toBe('Bearer auth-token-123')
      expect(headers.get('X-PhoneFlow-Request')).toBe('1')
      expect(headers.get('Content-Type')).toBe('application/json')
      expect(headers.get('X-Request-ID')).toBeDefined()
    })
  })

  describe('401 Unauthorized handling', () => {
    it('clears token on 401 response when not in auth transition', async () => {
      setToken('expired-token')
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: async () => ({ message: 'Token expired' }),
      } as Response)

      await expect(api('/protected')).rejects.toThrow('Token expired')
      expect(getToken()).toBeNull()
    })

    it('preserves token on 401 when authTransitionInProgress is true', async () => {
      setToken('valid-token-during-login')
      setAuthTransitionInProgress(true)
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: async () => ({ message: 'Invalid credentials' }),
      } as Response)

      await expect(api('/auth/login', { method: 'POST' })).rejects.toThrow('Invalid credentials')
      expect(getToken()).toBe('valid-token-during-login')
    })
  })

  describe('error handling and retries', () => {
    it('throws ApiError with correct status and message on client error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers({ 'X-Request-ID': 'req-client-err' }),
        json: async () => ({ message: 'Validation failed', requestId: 'req-client-err' }),
      } as Response)

      await expect(api('/invalid')).rejects.toThrow('Validation failed Reference: req-client-err')
    })

    it('retries once on transient 500 error for GET requests', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          headers: new Headers(),
          json: async () => ({ retryable: true, message: 'Temporary glitch' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ data: 'recovered' }),
        } as Response)

      const result = await api<{ data: string }>('/flaky')
      expect(result.data).toBe('recovered')
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('does not retry failed POST requests by default', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
        json: async () => ({ retryable: true, message: 'Server error' }),
      } as Response)

      await expect(
        api('/submit', { method: 'POST', body: JSON.stringify({ item: 1 }) }),
      ).rejects.toThrow()

      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('in-flight request deduplication', () => {
    it('deduplicates concurrent identical GET reads', async () => {
      let resolveFetch!: (res: Response) => void
      const fetchPromise = new Promise<Response>((resolve) => {
        resolveFetch = resolve
      })

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(fetchPromise)

      const p1 = api<{ value: string }>('/shared-data')
      const p2 = api<{ value: string }>('/shared-data')

      resolveFetch({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ value: 'shared' }),
      } as Response)

      const [res1, res2] = await Promise.all([p1, p2])
      expect(res1.value).toBe('shared')
      expect(res2.value).toBe('shared')
      expect(fetchSpy).toHaveBeenCalledTimes(1) // Only one network fetch triggered!
    })
  })
})
