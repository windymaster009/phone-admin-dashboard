import { reportFrontendError } from './errorReporting'

export type StorageType = 'local' | 'session'

export const STORAGE_KEYS = {
  TOKEN: 'phoneflow_token',
  SESSION_USER: 'phoneflow_session_user',
  THEME: 'phoneflow_theme',
  FONT_SIZE: 'phoneflow_font_size',
  INVENTORY_VIEW: 'phoneflow_inventory_view',
  VALUATIONS: 'phoneflow_valuations',
  LAST_SEEN_ACTIVITY: 'phoneflow_last_seen_activity',
  LAST_VALUATION: 'phoneflow_last_valuation',
  RESTORE_SUCCESS: 'phoneflow_restore_success',
} as const

// In-memory fallback maps for private mode or when storage access is restricted/blocked
const inMemoryStores: Record<StorageType, Map<string, string>> = {
  local: new Map<string, string>(),
  session: new Map<string, string>(),
}

function getNativeStorage(type: StorageType): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    const storage = type === 'local' ? window.localStorage : window.sessionStorage
    if (!storage) return null
    // Test that getItem and setItem do not throw (e.g. SecurityError in restricted iframes)
    const testKey = '__phoneflow_storage_probe__'
    storage.setItem(testKey, 'probe')
    storage.removeItem(testKey)
    return storage
  } catch {
    return null
  }
}

export const safeStorage = {
  getItem(key: string, storageType: StorageType = 'local'): string | null {
    const storage = getNativeStorage(storageType)
    if (storage) {
      try {
        const item = storage.getItem(key)
        if (item !== null) return item
      } catch (error) {
        reportFrontendError(error, {
          operation: 'storage_read_error',
          context: { key, storageType },
        })
      }
    }
    // Fall back to memory store
    return inMemoryStores[storageType].get(key) ?? null
  },

  setItem(key: string, value: string, storageType: StorageType = 'local'): boolean {
    const storage = getNativeStorage(storageType)
    if (storage) {
      try {
        storage.setItem(key, value)
        inMemoryStores[storageType].set(key, value)
        return true
      } catch (error) {
        reportFrontendError(error, {
          operation: 'storage_write_error',
          context: { key, storageType },
        })
        // Fall back to in-memory store on quota exceeded or security restriction
        inMemoryStores[storageType].set(key, value)
        return false
      }
    }

    inMemoryStores[storageType].set(key, value)
    return true
  },

  removeItem(key: string, storageType: StorageType = 'local'): void {
    const storage = getNativeStorage(storageType)
    if (storage) {
      try {
        storage.removeItem(key)
      } catch (error) {
        reportFrontendError(error, {
          operation: 'storage_remove_error',
          context: { key, storageType },
        })
      }
    }
    inMemoryStores[storageType].delete(key)
  },

  clear(storageType: StorageType = 'local'): void {
    const storage = getNativeStorage(storageType)
    if (storage) {
      try {
        storage.clear()
      } catch (error) {
        reportFrontendError(error, {
          operation: 'storage_clear_error',
          context: { storageType },
        })
      }
    }
    inMemoryStores[storageType].clear()
  },

  getJSON<T>(
    key: string,
    fallback: T,
    validator?: (value: unknown) => value is T,
    storageType: StorageType = 'local',
  ): T {
    const raw = this.getItem(key, storageType)
    if (raw === null || raw === undefined || raw === '') return fallback

    try {
      const parsed = JSON.parse(raw) as unknown
      if (validator && !validator(parsed)) {
        reportFrontendError(new Error(`Storage value for key "${key}" failed validation`), {
          operation: 'storage_validation_failure',
          context: { key, storageType },
        })
        return fallback
      }
      return parsed as T
    } catch (error) {
      reportFrontendError(error, {
        operation: 'storage_parse_error',
        context: { key, storageType },
      })
      return fallback
    }
  },

  setJSON<T>(key: string, value: T, storageType: StorageType = 'local'): boolean {
    try {
      const serialized = JSON.stringify(value)
      return this.setItem(key, serialized, storageType)
    } catch (error) {
      reportFrontendError(error, {
        operation: 'storage_stringify_error',
        context: { key, storageType },
      })
      return false
    }
  },
}

// Typed PhoneFlow Helpers

export type SessionUser = {
  id: string
  name: string
  email: string
  role: 'OWNER' | 'MANAGER' | 'CASHIER' | 'STOCK'
  active: boolean
}

const VALID_ROLES = new Set<SessionUser['role']>(['OWNER', 'MANAGER', 'CASHIER', 'STOCK'])

export function isSessionUser(value: unknown): value is SessionUser {
  if (!value || typeof value !== 'object') return false
  const user = value as Record<string, unknown>
  return (
    typeof user.id === 'string'
    && typeof user.name === 'string'
    && typeof user.email === 'string'
    && typeof user.role === 'string'
    && VALID_ROLES.has(user.role as SessionUser['role'])
    && typeof user.active === 'boolean'
  )
}

export function getStoredToken(): string | null {
  return safeStorage.getItem(STORAGE_KEYS.TOKEN)
}

export function setStoredToken(token: string | null): void {
  if (token) {
    safeStorage.setItem(STORAGE_KEYS.TOKEN, token)
  } else {
    safeStorage.removeItem(STORAGE_KEYS.TOKEN)
    setStoredSessionUser(null)
  }
}

export function getStoredSessionUser(): SessionUser | null {
  const user = safeStorage.getJSON<SessionUser | null>(
    STORAGE_KEYS.SESSION_USER,
    null,
    (val): val is SessionUser => isSessionUser(val),
  )
  if (!user && safeStorage.getItem(STORAGE_KEYS.SESSION_USER) !== null) {
    safeStorage.removeItem(STORAGE_KEYS.SESSION_USER)
  }
  return user
}

export function setStoredSessionUser(user: SessionUser | null): void {
  if (user) {
    safeStorage.setJSON(STORAGE_KEYS.SESSION_USER, user)
  } else {
    safeStorage.removeItem(STORAGE_KEYS.SESSION_USER)
  }
}

export function getStoredInventoryView(): 'large' | 'details' {
  const raw = safeStorage.getItem(STORAGE_KEYS.INVENTORY_VIEW)
  return raw === 'details' ? 'details' : 'large'
}

export function setStoredInventoryView(view: 'large' | 'details'): void {
  safeStorage.setItem(STORAGE_KEYS.INVENTORY_VIEW, view)
}

export function getStoredValuations(): unknown[] {
  return safeStorage.getJSON<unknown[]>(
    STORAGE_KEYS.VALUATIONS,
    [],
    (val): val is unknown[] => Array.isArray(val),
  )
}

export function setStoredValuations(valuations: unknown[]): void {
  safeStorage.setJSON(STORAGE_KEYS.VALUATIONS, valuations)
}

export function clearStoredValuations(): void {
  safeStorage.removeItem(STORAGE_KEYS.VALUATIONS)
}

export function getActivityLastSeenKey(userId?: string): string {
  return userId ? `phoneflow_activity_last_seen_${userId}` : 'phoneflow_activity_last_seen'
}

export function getActivityClearedKey(userId?: string): string {
  return userId ? `phoneflow_activity_cleared_at_${userId}` : 'phoneflow_activity_cleared_at'
}

export function getSecurityClearedKey(userId?: string): string {
  return userId ? `phoneflow_security_cleared_at_${userId}` : 'phoneflow_security_cleared_at'
}
