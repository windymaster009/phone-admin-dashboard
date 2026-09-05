import type { LucideIcon } from 'lucide-react'
import {
  Banknote,
  BarChart3,
  Boxes,
  Building2,
  FileText,
  FolderLock,
  HandCoins,
  LayoutDashboard,
  ReceiptText,
  RefreshCcw,
  Settings,
  ShieldCheck,
  ShoppingCart,
  TrendingDown,
  Users,
  Wrench,
} from 'lucide-react'
import type { SessionUser } from '../../lib/api'

export type RouteKey =
  | 'dashboard'
  | 'pawn'
  | 'loans'
  | 'trade'
  | 'services'
  | 'inventory'
  | 'customers'
  | 'suppliers'
  | 'refunds'
  | 'depreciation'
  | 'businessOverview'
  | 'reports'
  | 'receipts'
  | 'secureDocuments'
  | 'security'
  | 'settings'

export type NavGroupName = 'Overview' | 'Operations' | 'Finance & Control'

export interface AppRoute {
  key: RouteKey
  pathname: string
  label: string
  icon: LucideIcon
  group: NavGroupName
  roles?: SessionUser['role'][]
  aliases?: string[]
  badge?: string
  exact?: boolean
}

export const ROUTES: AppRoute[] = [
  // Overview
  {
    key: 'dashboard',
    pathname: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    group: 'Overview',
    aliases: ['/', '/admin'],
  },

  // Operations
  {
    key: 'pawn',
    pathname: '/pawn-management',
    label: 'Pawn Management',
    icon: HandCoins,
    group: 'Operations',
  },
  {
    key: 'loans',
    pathname: '/loans',
    label: 'Loans',
    icon: Banknote,
    group: 'Operations',
  },
  {
    key: 'trade',
    pathname: '/buy-sell',
    label: 'Buy & Sell',
    icon: ShoppingCart,
    group: 'Operations',
  },
  {
    key: 'services',
    pathname: '/services',
    label: 'Services',
    icon: Wrench,
    group: 'Operations',
  },
  {
    key: 'inventory',
    pathname: '/stock',
    label: 'Stock Information',
    icon: Boxes,
    group: 'Operations',
  },
  {
    key: 'customers',
    pathname: '/customers',
    label: 'Customers',
    icon: Users,
    group: 'Operations',
  },
  {
    key: 'suppliers',
    pathname: '/suppliers',
    label: 'Suppliers',
    icon: Building2,
    group: 'Operations',
  },
  {
    key: 'refunds',
    pathname: '/refunds',
    label: 'Refunds',
    icon: RefreshCcw,
    group: 'Operations',
    roles: ['OWNER', 'MANAGER'],
  },

  // Finance & Control
  {
    key: 'depreciation',
    pathname: '/depreciation',
    label: 'Depreciation',
    icon: TrendingDown,
    group: 'Finance & Control',
  },
  {
    key: 'businessOverview',
    pathname: '/business-overview',
    label: 'Business Overview',
    icon: BarChart3,
    group: 'Finance & Control',
  },
  {
    key: 'reports',
    pathname: '/reports',
    label: 'Reports',
    icon: FileText,
    group: 'Finance & Control',
  },
  {
    key: 'receipts',
    pathname: '/receipts',
    label: 'Receipts',
    icon: ReceiptText,
    group: 'Finance & Control',
  },
  {
    key: 'secureDocuments',
    pathname: '/secure-documents',
    label: 'Secure Documents',
    icon: FolderLock,
    group: 'Finance & Control',
    roles: ['OWNER', 'MANAGER', 'CASHIER'],
  },
  {
    key: 'security',
    pathname: '/security',
    label: 'Security',
    icon: ShieldCheck,
    group: 'Finance & Control',
    roles: ['OWNER'],
  },
  {
    key: 'settings',
    pathname: '/settings',
    label: 'Settings',
    icon: Settings,
    group: 'Finance & Control',
  },
]

export function normalizePathname(pathname: string): string {
  if (!pathname || pathname === '/') return '/'
  return pathname.replace(/\/+$/, '') || '/'
}

export function findRouteByPath(pathname: string): AppRoute | null {
  const normalized = normalizePathname(pathname)

  // Direct alias check
  if (normalized === '/' || normalized === '/admin') {
    return ROUTES.find((r) => r.key === 'dashboard') || null
  }

  // Nested reports check
  if (normalized === '/reports' || normalized.startsWith('/reports/')) {
    return ROUTES.find((r) => r.key === 'reports') || null
  }

  // Exact path match
  const directMatch = ROUTES.find((r) => r.pathname === normalized)
  if (directMatch) return directMatch

  // Alias match in routes definition
  const aliasMatch = ROUTES.find((r) => r.aliases?.includes(normalized))
  if (aliasMatch) return aliasMatch

  return null
}

export function resolveCanonicalPath(pathname: string): string {
  const normalized = normalizePathname(pathname)
  if (normalized === '/' || normalized === '/admin') return '/dashboard'
  if (normalized.startsWith('/reports/')) return normalized
  const route = findRouteByPath(normalized)
  return route ? route.pathname : normalized
}

export interface NavGroup {
  label: NavGroupName
  items: Array<{
    key: RouteKey
    pathname: string
    label: string
    icon: LucideIcon
    badge?: string
    roles?: SessionUser['role'][]
  }>
}

export function getNavGroups(
  userRole?: SessionUser['role'],
  overdueLoansCount: number = 0,
): NavGroup[] {
  const groupNames: NavGroupName[] = ['Overview', 'Operations', 'Finance & Control']

  return groupNames.map((groupName) => {
    const items = ROUTES.filter((route) => {
      if (route.group !== groupName) return false
      if (route.roles && userRole && !route.roles.includes(userRole)) return false
      return true
    }).map((route) => {
      let badge = route.badge
      if (route.key === 'loans' && overdueLoansCount > 0) {
        badge = `${overdueLoansCount} overdue`
      }
      return {
        key: route.key,
        pathname: route.pathname,
        label: route.label,
        icon: route.icon,
        badge,
        roles: route.roles,
      }
    })

    return {
      label: groupName,
      items,
    }
  })
}
