import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  findRouteByPath,
  normalizePathname,
  resolveCanonicalPath,
  ROUTES,
  type AppRoute,
  type RouteKey,
} from './routes'

export interface NavigateOptions {
  replace?: boolean
  state?: unknown
}

export interface RouterContextValue {
  currentPath: string
  canonicalPath: string
  currentRoute: AppRoute | null
  routeKey: RouteKey | 'not-found'
  navigate: (to: string, options?: NavigateOptions) => void
  isUnknownRoute: boolean
}

const RouterContext = createContext<RouterContextValue | null>(null)

export function RouterProvider({ children }: { children: ReactNode }) {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window === 'undefined') return '/dashboard'
    return normalizePathname(window.location.pathname)
  })

  // Sync with browser back/forward buttons natively
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(normalizePathname(window.location.pathname))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const currentRoute = useMemo(() => findRouteByPath(currentPath), [currentPath])

  const canonicalPath = useMemo(() => resolveCanonicalPath(currentPath), [currentPath])

  const routeKey: RouteKey | 'not-found' = useMemo(() => {
    if (currentRoute) return currentRoute.key
    return 'not-found'
  }, [currentRoute])

  const isUnknownRoute = routeKey === 'not-found'

  const navigate = useCallback((to: string, options?: NavigateOptions) => {
    const target = to.startsWith('/') ? to : (ROUTES.find((r) => r.key === to)?.pathname || `/${to}`)
    const url = new URL(target, window.location.origin)
    const targetPath = normalizePathname(url.pathname)
    const targetUrl = `${targetPath}${url.search}${url.hash}`
    const state = options?.state || { path: targetPath }

    if (options?.replace) {
      if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== targetUrl) {
        window.history.replaceState(state, '', targetUrl)
      }
    } else {
      if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== targetUrl) {
        window.history.pushState(state, '', targetUrl)
      }
    }

    setCurrentPath(targetPath)
  }, [])

  const value = useMemo<RouterContextValue>(() => ({
    currentPath,
    canonicalPath,
    currentRoute,
    routeKey,
    navigate,
    isUnknownRoute,
  }), [currentPath, canonicalPath, currentRoute, routeKey, navigate, isUnknownRoute])

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

export function useRouter(): RouterContextValue {
  const context = useContext(RouterContext)
  if (!context) {
    throw new Error('useRouter must be used within a RouterProvider')
  }
  return context
}
