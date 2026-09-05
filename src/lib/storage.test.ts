import { describe, expect, it, vi } from 'vitest'
import {
  clearStoredValuations,
  getStoredInventoryView,
  getStoredSessionUser,
  getStoredToken,
  getStoredValuations,
  isSessionUser,
  safeStorage,
  setStoredInventoryView,
  setStoredSessionUser,
  setStoredToken,
  setStoredValuations,
  type SessionUser,
} from './storage'

describe('storage module & safeStorage', () => {
  describe('safeStorage basic operations', () => {
    it('sets, gets, and removes items from localStorage', () => {
      safeStorage.setItem('test-key', 'test-value')
      expect(safeStorage.getItem('test-key')).toBe('test-value')

      safeStorage.removeItem('test-key')
      expect(safeStorage.getItem('test-key')).toBeNull()
    })

    it('sets and gets items from sessionStorage', () => {
      safeStorage.setItem('session-key', 'session-val', 'session')
      expect(safeStorage.getItem('session-key', 'session')).toBe('session-val')

      safeStorage.removeItem('session-key', 'session')
      expect(safeStorage.getItem('session-key', 'session')).toBeNull()
    })

    it('handles getJSON and setJSON with serializable objects', () => {
      const data = { user: 'tester', count: 42 }
      safeStorage.setJSON('json-test', data)
      const retrieved = safeStorage.getJSON('json-test', { user: '', count: 0 })
      expect(retrieved).toEqual(data)
    })

    it('returns fallback for corrupted JSON in getJSON', () => {
      safeStorage.setItem('bad-json', 'not-valid-json{')
      const fallback = { fallback: true }
      const retrieved = safeStorage.getJSON('bad-json', fallback)
      expect(retrieved).toEqual(fallback)
    })

    it('validates JSON using validator function and returns fallback on failure', () => {
      const isNumberArray = (v: unknown): v is number[] => Array.isArray(v) && v.every((i) => typeof i === 'number')
      safeStorage.setJSON('data-arr', ['string', 'not', 'number'])
      const fallback: number[] = [1, 2, 3]
      const retrieved = safeStorage.getJSON('data-arr', fallback, isNumberArray)
      expect(retrieved).toEqual(fallback)

      safeStorage.setJSON('data-arr-valid', [10, 20, 30])
      const retrievedValid = safeStorage.getJSON('data-arr-valid', fallback, isNumberArray)
      expect(retrievedValid).toEqual([10, 20, 30])
    })

    it('falls back gracefully to in-memory store when storage throws error', () => {
      const setItemSpy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

      const writeSuccess = safeStorage.setItem('fallback-key', 'fallback-value')
      expect(writeSuccess).toBe(true)
      // Value should still be retained in in-memory store
      expect(safeStorage.getItem('fallback-key')).toBe('fallback-value')

      setItemSpy.mockRestore()
    })
  })

  describe('isSessionUser validation', () => {
    it('validates well-formed session user objects', () => {
      const valid: SessionUser = {
        id: 'u-1',
        name: 'John Doe',
        email: 'john@example.com',
        role: 'OWNER',
        active: true,
      }
      expect(isSessionUser(valid)).toBe(true)
    })

    it('rejects invalid or incomplete user objects', () => {
      expect(isSessionUser(null)).toBe(false)
      expect(isSessionUser(undefined)).toBe(false)
      expect(isSessionUser('not an object')).toBe(false)
      expect(isSessionUser({ id: '1', name: 'No Role' })).toBe(false)
      expect(isSessionUser({ id: '1', name: 'Wrong Role', email: 'a@b.com', role: 'INVALID_ROLE', active: true })).toBe(false)
    })
  })

  describe('typed PhoneFlow storage helpers', () => {
    it('stores and retrieves auth token', () => {
      setStoredToken('test-token-123')
      expect(getStoredToken()).toBe('test-token-123')

      setStoredToken(null)
      expect(getStoredToken()).toBeNull()
    })

    it('stores and retrieves session user', () => {
      const user: SessionUser = {
        id: 'u-10',
        name: 'Manager Bob',
        email: 'bob@example.com',
        role: 'MANAGER',
        active: true,
      }
      setStoredSessionUser(user)
      expect(getStoredSessionUser()).toEqual(user)

      setStoredSessionUser(null)
      expect(getStoredSessionUser()).toBeNull()
    })

    it('clears stored session user if token is cleared via setStoredToken(null)', () => {
      const user: SessionUser = {
        id: 'u-11',
        name: 'Alice',
        email: 'alice@example.com',
        role: 'CASHIER',
        active: true,
      }
      setStoredSessionUser(user)
      setStoredToken('token-abc')

      setStoredToken(null)
      expect(getStoredToken()).toBeNull()
      expect(getStoredSessionUser()).toBeNull()
    })

    it('stores and retrieves inventory view preferences', () => {
      expect(getStoredInventoryView()).toBe('large')
      setStoredInventoryView('details')
      expect(getStoredInventoryView()).toBe('details')
      setStoredInventoryView('large')
      expect(getStoredInventoryView()).toBe('large')
    })

    it('stores, retrieves, and clears valuations', () => {
      expect(getStoredValuations()).toEqual([])
      const valuations = [{ id: 'val-1', value: 450 }]
      setStoredValuations(valuations)
      expect(getStoredValuations()).toEqual(valuations)
      clearStoredValuations()
      expect(getStoredValuations()).toEqual([])
    })
  })
})
