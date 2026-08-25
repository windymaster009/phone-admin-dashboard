import { lazy, Suspense, useEffect, useLayoutEffect, useState } from 'react'
import DeferredBridges from './DeferredBridges'
import StartupScreen from './StartupScreen'
import {
  api,
  defaultShopProfile,
  getToken,
  setSessionUser,
  setToken,
  subscribeToTokenChanges,
  type ShopProfile,
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

export default function AppWithBackend() {
  const [theme, setTheme] = useState<AppTheme>(getInitialTheme)
  const [fontSize, setFontSize] = useState<AppFontSize>(getInitialFontSize)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [shop, setShop] = useState<ShopProfile>(defaultShopProfile)
  const [checking, setChecking] = useState(true)
  const [workspaceReady, setWorkspaceReady] = useState(false)

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
    api<{ shop: ShopProfile }>('/shop')
      .then((result) => { if (active) setShop(result.shop) })
      .catch(() => undefined)
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true

    api<{ user: SessionUser }>('/auth/me')
      .then((result) => {
        if (!active) return
        setToken(null)
        setSessionUser(result.user)
        setWorkspaceReady(false)
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
    setWorkspaceReady(false)
    setUser(authenticatedUser)
    setChecking(false)
  }

  if (checking) return <StartupScreen stage="checking-session" shop={shop} />

  if (!user) {
    return (
      <Suspense fallback={<StartupScreen stage="loading-sign-in" shop={shop} />}>
        <AuthScreen theme={theme} shop={shop} onAuthenticated={handleAuthenticated} />
      </Suspense>
    )
  }

  return (
    <>
      <Suspense fallback={<StartupScreen stage="opening-workspace" shop={shop} />}>
        <App
          theme={theme}
          onToggleTheme={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          user={user}
          shop={shop}
          onWorkspaceReady={() => setWorkspaceReady(true)}
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
      {!workspaceReady && <StartupScreen stage="opening-workspace" shop={shop} overlay />}
    </>
  )
}
