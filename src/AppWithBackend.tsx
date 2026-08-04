import { lazy, Suspense, useEffect, useState } from 'react'
import DeferredBridges from './DeferredBridges'
import StartupScreen from './StartupScreen'
import {
  api,
  getSessionUser,
  getToken,
  setSessionUser,
  setToken,
  subscribeToTokenChanges,
  type SessionUser,
} from './api'

const loadApp = () => import('./App')
const loadAuthScreen = () => import('./AuthScreen')
const App = lazy(loadApp)
const AuthScreen = lazy(loadAuthScreen)

export default function AppWithBackend() {
  const [user, setUser] = useState<SessionUser | null>(() => getToken() ? getSessionUser() : null)
  const [checking, setChecking] = useState(() => Boolean(getToken() && !getSessionUser()))

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

  if (checking) return <StartupScreen stage="checking-session" />

  if (!user) {
    return (
      <Suspense fallback={<StartupScreen stage="loading-sign-in" />}>
        <AuthScreen onAuthenticated={handleAuthenticated} />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<StartupScreen stage="opening-workspace" />}>
      <App
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
