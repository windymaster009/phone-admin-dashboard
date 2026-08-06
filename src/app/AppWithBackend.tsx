import { lazy, Suspense, useEffect, useLayoutEffect, useState } from 'react'
import { Smartphone } from 'lucide-react'
import DeferredBridges from './DeferredBridges'
import {
  api,
  getSessionUser,
  getToken,
  setSessionUser,
  setToken,
  subscribeToTokenChanges,
  type SessionUser,
} from '../lib/api'

const loadApp = () => import('./App')
const loadAuthScreen = () => import('./AuthScreen')
const App = lazy(loadApp)
const AuthScreen = lazy(loadAuthScreen)

type AppTheme = 'dark' | 'light'
const THEME_STORAGE_KEY = 'phoneflow_theme'

function getInitialTheme(): AppTheme {
  const renderedTheme = document.querySelector<HTMLElement>('.app')?.dataset.theme
  if (renderedTheme === 'dark' || renderedTheme === 'light') return renderedTheme

  try {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY)
    if (storedTheme === 'dark' || storedTheme === 'light') return storedTheme
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }

  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function StartupScreen({ message = 'Connecting to the shop...' }: { message?: string }) {
  return (
    <div className="startup-screen">
      <Smartphone size={35} />
      <strong>PhoneFlow</strong>
      <span>{message}</span>
    </div>
  )
}

export default function AppWithBackend() {
  const [theme, setTheme] = useState<AppTheme>(getInitialTheme)
  const [user, setUser] = useState<SessionUser | null>(() => getToken() ? getSessionUser() : null)
  const [checking, setChecking] = useState(() => Boolean(getToken() && !getSessionUser()))

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // The active page still receives the theme when storage is unavailable.
    }
  }, [theme])

  useEffect(() => subscribeToTokenChanges(() => {
    if (!getToken()) {
      setUser(null)
      setChecking(false)
    }
  }), [])

  useEffect(() => {
    const token = getToken()
    if (!token) {
      void loadAuthScreen()
      setChecking(false)
      return
    }

    let active = true
    void loadApp()

    api<{ user: SessionUser }>('/auth/me')
      .then((result) => {
        if (!active || !getToken()) return
        setSessionUser(result.user)
        setUser(result.user)
      })
      .catch(() => {
        if (!active) return
        setToken(null)
        setUser(null)
      })
      .finally(() => {
        if (active) setChecking(false)
      })

    return () => {
      active = false
    }
  }, [])

  const handleAuthenticated = (authenticatedUser: SessionUser) => {
    setSessionUser(authenticatedUser)
    setUser(authenticatedUser)
    setChecking(false)
  }

  if (checking) return <StartupScreen />

  if (!user) {
    return (
      <Suspense fallback={<StartupScreen message="Loading sign in..." />}>
        <AuthScreen theme={theme} onAuthenticated={handleAuthenticated} />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<StartupScreen message="Opening your workspace..." />}>
      <App
        theme={theme}
        onToggleTheme={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
        user={user}
        onLogout={() => {
          setToken(null)
          setUser(null)
        }}
      />
      <DeferredBridges />
    </Suspense>
  )
}
