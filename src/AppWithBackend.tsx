import { lazy, Suspense, useEffect, useState } from 'react'
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
} from './api'

const loadApp = () => import('./App')
const loadAuthScreen = () => import('./AuthScreen')
const App = lazy(loadApp)
const AuthScreen = lazy(loadAuthScreen)

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

  if (checking) return <StartupScreen />

  if (!user) {
    return (
      <Suspense fallback={<StartupScreen message="Loading sign in..." />}>
        <AuthScreen onAuthenticated={handleAuthenticated} />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<StartupScreen message="Opening your workspace..." />}>
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
