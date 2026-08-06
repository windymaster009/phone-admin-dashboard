import { lazy, Suspense, useEffect, useLayoutEffect, useState } from 'react'
import { Smartphone } from 'lucide-react'
import DeferredBridges from './DeferredBridges'
import {
  api,
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
type AppFontSize = 'default' | 'comfortable' | 'large'
const THEME_STORAGE_KEY = 'phoneflow_theme'
const FONT_SIZE_STORAGE_KEY = 'phoneflow_font_size'

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

function getInitialFontSize(): AppFontSize {
  try {
    const storedFontSize = localStorage.getItem(FONT_SIZE_STORAGE_KEY)
    if (storedFontSize === 'default' || storedFontSize === 'comfortable' || storedFontSize === 'large') {
      return storedFontSize
    }
  } catch {
    // Use the standard size when storage is unavailable.
  }

  return 'default'
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
  const [fontSize, setFontSize] = useState<AppFontSize>(getInitialFontSize)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [checking, setChecking] = useState(true)

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // The active page still receives the theme when storage is unavailable.
    }
  }, [theme])

  useLayoutEffect(() => {
    document.documentElement.dataset.fontSize = fontSize
    try {
      localStorage.setItem(FONT_SIZE_STORAGE_KEY, fontSize)
    } catch {
      // The active page still receives the display size when storage is unavailable.
    }
  }, [fontSize])

  useEffect(() => subscribeToTokenChanges(() => {
    if (!getToken()) {
      setUser(null)
      setChecking(false)
    }
  }), [])

  useEffect(() => {
    let active = true

    api<{ user: SessionUser }>('/auth/me')
      .then((result) => {
        if (!active) return
        setToken(null)
        setSessionUser(result.user)
        setUser(result.user)
        void loadApp()
      })
      .catch(() => {
        if (!active) return
        setToken(null)
        setUser(null)
        void loadAuthScreen()
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
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        user={user}
        onLogout={() => {
          void api('/auth/logout', { method: 'POST' }).catch(() => undefined).finally(() => {
            setToken(null)
            setSessionUser(null)
            setUser(null)
          })
        }}
      />
      <DeferredBridges />
    </Suspense>
  )
}
