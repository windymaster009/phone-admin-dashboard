import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { RouterProvider } from './routing'
import StartupScreen from './StartupScreen'
import ErrorBoundary from '../components/ErrorBoundary'
import {
  ApiError,
  api,
  defaultShopProfile,
  getToken,
  setSessionUser,
  setToken,
  subscribeToTokenChanges,
  type ShopProfile,
  type SessionUser,
} from '../lib/api'
import { safeStorage, STORAGE_KEYS } from '../lib/storage'
import { reportFrontendError } from '../lib/errorReporting'
import type { AppFontSize } from './types'

const loadApp = () => import('./App')
const loadAuthScreen = () => import('./AuthScreen')
const App = lazy(loadApp)
const AuthScreen = lazy(loadAuthScreen)

type AppTheme = 'dark' | 'light'

function getInitialTheme(): AppTheme {
  if (typeof document !== 'undefined') {
    const renderedTheme = document.querySelector<HTMLElement>('.app')?.dataset.theme
    if (renderedTheme === 'dark' || renderedTheme === 'light') return renderedTheme
  }

  const storedTheme = safeStorage.getItem(STORAGE_KEYS.THEME)
  if (storedTheme === 'dark' || storedTheme === 'light') return storedTheme

  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }

  return 'dark'
}

function getInitialFontSize(): AppFontSize {
  const storedFontSize = safeStorage.getItem(STORAGE_KEYS.FONT_SIZE)
  if (storedFontSize === 'default' || storedFontSize === 'comfortable' || storedFontSize === 'large') {
    return storedFontSize
  }

  return 'default'
}

export default function AppWithBackend() {
  const [theme, setTheme] = useState<AppTheme>(getInitialTheme)
  const [fontSize, setFontSize] = useState<AppFontSize>(getInitialFontSize)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [shop, setShop] = useState<ShopProfile>(defaultShopProfile)
  const [checking, setChecking] = useState(true)
  const [startupError, setStartupError] = useState<{ message: string; retryable?: boolean } | null>(null)
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const isMountedRef = useRef(true)
  const sessionRequestIdRef = useRef(0)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      sessionRequestIdRef.current++
    }
  }, [])

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    safeStorage.setItem(STORAGE_KEYS.THEME, theme)
  }, [theme])

  useLayoutEffect(() => {
    document.documentElement.dataset.fontSize = fontSize
    safeStorage.setItem(STORAGE_KEYS.FONT_SIZE, fontSize)
  }, [fontSize])

  useEffect(() => subscribeToTokenChanges(() => {
    if (!getToken()) {
      if (isMountedRef.current) {
        sessionRequestIdRef.current++
        setSessionUser(null)
        setUser(null)
        setChecking(false)
        setStartupError(null)
      }
    }
  }), [])

  useEffect(() => {
    let active = true
    api<{ shop: ShopProfile }>('/shop')
      .then((result) => { if (active && isMountedRef.current) setShop(result.shop) })
      .catch(() => undefined)
    return () => { active = false }
  }, [])

  const checkSession = useCallback(() => {
    const requestId = ++sessionRequestIdRef.current
    setChecking(true)
    setStartupError(null)

    api<{ user: SessionUser }>('/auth/me')
      .then((result) => {
        if (!isMountedRef.current || sessionRequestIdRef.current !== requestId) return
        setToken(null)
        setSessionUser(result.user)
        setWorkspaceReady(false)
        setUser(result.user)
        setStartupError(null)
        void loadApp()
      })
      .catch((error: unknown) => {
        if (!isMountedRef.current || sessionRequestIdRef.current !== requestId) return
        const is401 = error instanceof ApiError && error.status === 401
        if (is401) {
          // Genuine 401 response: user is normally signed out
          setToken(null)
          setSessionUser(null)
          setUser(null)
          setStartupError(null)
          void loadAuthScreen()
        } else {
          // Network failure, 5xx server error, or request timeout
          // Do NOT silently treat as signed out
          reportFrontendError(error, { operation: 'session_startup_check' })
          const message = error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'The API server is temporarily unavailable.'
          setStartupError({ message, retryable: true })
        }
      })
      .finally(() => {
        if (isMountedRef.current && sessionRequestIdRef.current === requestId) {
          setChecking(false)
        }
      })
  }, [])

  useEffect(() => {
    checkSession()
  }, [checkSession])

  // Safety timer: ensure the opening-workspace overlay cannot remain indefinitely
  useEffect(() => {
    if (user && !workspaceReady) {
      const safetyTimer = window.setTimeout(() => {
        reportFrontendError(new Error('Workspace readiness timed out; auto-dismissing overlay'), {
          operation: 'workspace_readiness_timeout',
        })
        if (isMountedRef.current) setWorkspaceReady(true)
      }, 8000)

      return () => window.clearTimeout(safetyTimer)
    }
  }, [user, workspaceReady])

  const handleAuthenticated = (authenticatedUser: SessionUser) => {
    sessionRequestIdRef.current++
    setSessionUser(authenticatedUser)
    setWorkspaceReady(false)
    setUser(authenticatedUser)
    setChecking(false)
    setStartupError(null)
  }

  if (checking) return <StartupScreen stage="checking-session" shop={shop} />

  if (startupError) {
    return (
      <StartupScreen
        stage="checking-session"
        shop={shop}
        error={startupError}
        onRetry={checkSession}
      />
    )
  }

  if (!user) {
    return (
      <ErrorBoundary boundaryName="AuthScreen">
        <Suspense fallback={<StartupScreen stage="loading-sign-in" shop={shop} />}>
          <AuthScreen theme={theme} shop={shop} onAuthenticated={handleAuthenticated} />
        </Suspense>
      </ErrorBoundary>
    )
  }

  return (
    <>
      <ErrorBoundary boundaryName="AuthenticatedApp">
        <Suspense fallback={<StartupScreen stage="opening-workspace" shop={shop} />}>
          <RouterProvider>
            <App
              theme={theme}
              onToggleTheme={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
              fontSize={fontSize}
              onFontSizeChange={setFontSize}
              user={user}
              shop={shop}
              onWorkspaceReady={() => setWorkspaceReady(true)}
              onLogout={() => {
                sessionRequestIdRef.current++
                void api('/auth/logout', { method: 'POST' }).catch(() => undefined).finally(() => {
                  if (isMountedRef.current) {
                    setToken(null)
                    setSessionUser(null)
                    setUser(null)
                  }
                })
              }}
            />
          </RouterProvider>
        </Suspense>
      </ErrorBoundary>
      {!workspaceReady && (
        <StartupScreen
          stage="opening-workspace"
          shop={shop}
          overlay
          onDismissOverlay={() => setWorkspaceReady(true)}
        />
      )}
    </>
  )
}
