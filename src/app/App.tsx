import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bell, ChevronDown, LogOut, Menu, Moon, Settings, Smartphone, Sun, X } from 'lucide-react'
import { api, type SessionUser, type ShopProfile } from '../lib/api'
import { titleStatus } from '../lib/presentation'
import ErrorBoundary from '../components/ErrorBoundary'
import LoadingState from '../components/LoadingState'
import NotFoundView from '../components/NotFoundView'
import DashboardPage from '../features/dashboard/DashboardPage'
import ActivityReportDropdown from '../features/activity/ActivityReportDropdown'
import { getNavGroups, useRouter } from './routing'
import type { AppFontSize } from './types'

const PawnManagementPage = lazy(() => import('../features/pawns/PawnManagementPage'))
const TradePage = lazy(() => import('../features/trades/TradePage'))
const ServiceWorkspace = lazy(() => import('../features/services/ServiceWorkspace'))
const InventoryPage = lazy(() => import('../features/inventory/InventoryPage'))
const CustomerPage = lazy(() => import('../features/customers/CustomerPage'))
const SupplierWorkspace = lazy(() => import('../features/suppliers/SupplierWorkspace'))
const DepreciationPage = lazy(() => import('../features/depreciation/DepreciationPage'))
const RefundsPage = lazy(() => import('../features/refunds/RefundsPage'))
const BusinessOverviewPage = lazy(() => import('../features/business/BusinessOverviewPage'))
const ReportsPage = lazy(() => import('../features/reports/ReportsPage'))
const LoanPage = lazy(() => import('../features/loans/LoanPage'))
const ReceiptCenterPage = lazy(() => import('../features/receipts/ReceiptCenterPage'))
const SecureDocumentsPage = lazy(() => import('../features/documents/SecureDocumentsPage'))
const SecurityWorkspacePage = lazy(() => import('../features/security/SecurityWorkspacePage'))
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'))
const BackupStatusCard = lazy(() => import('../features/backup/BackupStatusCard'))
const OperationModalBridge = lazy(() => import('../features/operations/OperationModalBridge'))
const ReceiptCenterBridge = lazy(() => import('../features/receipts/ReceiptCenterBridge'))

function App({
  user,
  shop,
  onLogout,
  theme,
  onToggleTheme,
  fontSize,
  onFontSizeChange,
  onWorkspaceReady,
}: {
  user: SessionUser
  shop: ShopProfile
  onLogout: () => void
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  fontSize: AppFontSize
  onFontSizeChange: (fontSize: AppFontSize) => void
  onWorkspaceReady: () => void
}) {
  const { navigate, routeKey, currentRoute, isUnknownRoute, currentPath, canonicalPath } = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [overdueLoans, setOverdueLoans] = useState(0)
  const [activityOpen, setActivityOpen] = useState(false)
  const [activityUnread, setActivityUnread] = useState(0)
  const [initialViewReady, setInitialViewReady] = useState(() => {
    return routeKey !== 'dashboard' && routeKey !== 'businessOverview'
  })
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null)
  const notificationButtonRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)

  const changePage = useCallback((to: string) => {
    setMobileOpen(false)
    setProfileOpen(false)
    navigate(to)
  }, [navigate])

  useEffect(() => {
    if (initialViewReady) onWorkspaceReady()
  }, [initialViewReady, onWorkspaceReady])

  useEffect(() => {
    if (currentPath !== canonicalPath && !isUnknownRoute) {
      navigate(canonicalPath, { replace: true })
    }
  }, [currentPath, canonicalPath, isUnknownRoute, navigate])

  useEffect(() => {
    let mounted = true
    const checkLoans = async () => {
      if (document.hidden) return
      try {
        const res = await api<{ summary: { counts: { overdue: number } } }>('/loans/summary')
        if (mounted) setOverdueLoans(res.summary?.counts?.overdue || 0)
      } catch {
        // unauthenticated or offline
      }
    }
    void checkLoans()
    const timer = window.setInterval(checkLoans, 60_000)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    document.title = `${currentRoute?.label || (isUnknownRoute ? 'Not Found' : 'Dashboard')} · ${shop.name}`
  }, [currentRoute, isUnknownRoute, shop.name])

  useEffect(() => {
    if (!profileOpen) return

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) setProfileOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileOpen(false)
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [profileOpen])

  useEffect(() => {
    if (!mobileOpen || !window.matchMedia('(max-width: 900px)').matches) return

    const sidebar = sidebarRef.current
    if (!sidebar) return
    const focusableSelector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',')
    const focusableElements = () => Array.from(sidebar.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => element.getClientRects().length > 0)
    const focusFrame = window.requestAnimationFrame(() => {
      sidebar.querySelector<HTMLElement>('.mobile-close')?.focus()
    })

    const keepFocusInSidebar = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMobileOpen(false)
        return
      }
      if (event.key !== 'Tab') return

      const elements = focusableElements()
      if (elements.length === 0) {
        event.preventDefault()
        return
      }
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      } else if (!sidebar.contains(document.activeElement)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', keepFocusInSidebar)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', keepFocusInSidebar)
      window.requestAnimationFrame(() => mobileMenuButtonRef.current?.focus())
    }
  }, [mobileOpen])

  const renderView = () => {
    switch (routeKey) {
      case 'dashboard':
        return <DashboardPage goTo={changePage} user={user} onReady={() => setInitialViewReady(true)} />
      case 'pawn':
        return <PawnManagementPage user={user} />
      case 'loans':
        return <LoanPage onSummary={(s) => setOverdueLoans(s.counts.overdue)} />
      case 'trade':
        return <TradePage />
      case 'services':
        return <ServiceWorkspace />
      case 'inventory':
        return <InventoryPage />
      case 'customers':
        return <CustomerPage />
      case 'suppliers':
        return <SupplierWorkspace />
      case 'depreciation':
        return <DepreciationPage goTo={changePage} />
      case 'refunds':
        return <RefundsPage user={user} />
      case 'businessOverview':
        return <BusinessOverviewPage onReady={() => setInitialViewReady(true)} />
      case 'reports':
        return <ReportsPage />
      case 'receipts':
        return <ReceiptCenterPage />
      case 'secureDocuments':
        return <SecureDocumentsPage />
      case 'security':
        return <SecurityWorkspacePage />
      case 'settings':
        return <SettingsPage user={user} onLogout={onLogout} fontSize={fontSize} onFontSizeChange={onFontSizeChange} />
      default:
        return <NotFoundView onGoHome={() => changePage('/dashboard')} />
    }
  }

  const activeNavGroups = useMemo(() => getNavGroups(user.role, overdueLoans), [user.role, overdueLoans])

  return (
    <div
      className="app"
      data-theme={theme}
      data-font-size={fontSize}
    >
      <div className={`mobile-overlay ${mobileOpen ? 'show' : ''}`} onClick={() => setMobileOpen(false)} aria-hidden="true" />
      <aside ref={sidebarRef} id="primary-sidebar" className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`} aria-label="Primary navigation">
        <div className="brand">
          <span className="brand-mark">{shop.logoUrl ? <img src={shop.logoUrl} alt="" /> : <Smartphone size={22} />}</span>
          <div><strong>{shop.name}</strong><small>{shop.subtitle}</small></div>
          <button type="button" className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation menu" aria-controls="primary-sidebar"><X size={20} aria-hidden="true" /></button>
        </div>

        <nav className="sidebar-nav" aria-label="Main menu">
          {activeNavGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-group-label">{group.label}</span>
              {group.items.map((item) => {
                const Icon = item.icon
                const isActive = routeKey === item.key
                return (
                  <button
                    className={isActive ? 'active' : ''}
                    key={item.key}
                    onClick={() => changePage(item.pathname)}
                  >
                    <Icon size={19} />
                    <span>{item.label}</span>
                    {item.badge && <small>{item.badge}</small>}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <Suspense fallback={null}>
            <BackupStatusCard />
          </Suspense>
        </div>
      </aside>

      <div className="app-shell">
        <header className="topbar">
          <button ref={mobileMenuButtonRef} type="button" className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation menu" aria-controls="primary-sidebar" aria-expanded={mobileOpen}><Menu size={21} aria-hidden="true" /></button>
          <div className="topbar-actions">
            <button
              className="icon-button theme-toggle"
              onClick={onToggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              aria-pressed={theme === 'light'}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              ref={notificationButtonRef}
              className="icon-button notification-button"
              aria-label="Notifications"
              aria-expanded={activityOpen}
              onClick={() => setActivityOpen((curr) => !curr)}
            >
              <Bell size={18} />
              {activityUnread > 0 && <span />}
            </button>
            <ActivityReportDropdown
              anchorRef={notificationButtonRef}
              open={activityOpen}
              onClose={() => setActivityOpen(false)}
              onUnreadChange={setActivityUnread}
            />
            <div className="profile-menu" ref={profileMenuRef}>
              <button
                className={`topbar-user ${profileOpen ? 'open' : ''}`}
                onClick={() => setProfileOpen((current) => !current)}
                aria-expanded={profileOpen}
                aria-haspopup="menu"
              >
                <span className="avatar">{user.name.slice(0, 2).toUpperCase()}</span>
                <p><strong>{user.name.split(' ')[0]}</strong><small>{titleStatus(user.role)}</small></p>
                <ChevronDown className="profile-chevron" size={15} />
              </button>

              {profileOpen && (
                <div className="profile-dropdown surface-card" role="menu">
                  <div className="profile-dropdown-header">
                    <span className="avatar large">{user.name.slice(0, 2).toUpperCase()}</span>
                    <p><strong>{user.name}</strong><small>{user.email}</small></p>
                  </div>
                  <div className="profile-dropdown-role">
                    <span>Signed in as</span>
                    <strong>{titleStatus(user.role)}</strong>
                  </div>
                  <div className="profile-dropdown-actions">
                    <button role="menuitem" onClick={() => changePage('/settings')}><Settings size={16} /><span>Account settings</span></button>
                    <button className="logout-action" role="menuitem" onClick={onLogout}><LogOut size={16} /><span>Log out</span></button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="main-content">
          <ErrorBoundary boundaryName={`Screen:${routeKey}`} key={routeKey}>
            <Suspense fallback={<LoadingState label="Loading view..." detail="Preparing application workspace…" />}>
              {renderView()}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <ErrorBoundary boundaryName="GlobalOverlays" compact>
        <Suspense fallback={null}>
          <OperationModalBridge />
          <ReceiptCenterBridge />
        </Suspense>
      </ErrorBoundary>
    </div>
  )
}

export default App
