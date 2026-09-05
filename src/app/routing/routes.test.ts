import { describe, expect, it } from 'vitest'
import {
  findRouteByPath,
  getNavGroups,
  normalizePathname,
  resolveCanonicalPath,
  ROUTES,
} from './routes'

describe('routes and navigation configuration', () => {
  describe('normalizePathname', () => {
    it('normalizes root and empty paths to "/"', () => {
      expect(normalizePathname('')).toBe('/')
      expect(normalizePathname('/')).toBe('/')
    })

    it('strips trailing slashes from paths', () => {
      expect(normalizePathname('/stock/')).toBe('/stock')
      expect(normalizePathname('/reports/overview///')).toBe('/reports/overview')
    })
  })

  describe('findRouteByPath', () => {
    it('resolves dashboard aliases', () => {
      const rootMatch = findRouteByPath('/')
      expect(rootMatch?.key).toBe('dashboard')

      const adminMatch = findRouteByPath('/admin')
      expect(adminMatch?.key).toBe('dashboard')
    })

    it('resolves exact route pathnames', () => {
      expect(findRouteByPath('/stock')?.key).toBe('inventory')
      expect(findRouteByPath('/pawn-management')?.key).toBe('pawn')
      expect(findRouteByPath('/buy-sell')?.key).toBe('trade')
      expect(findRouteByPath('/settings')?.key).toBe('settings')
    })

    it('resolves nested reports paths to reports route', () => {
      expect(findRouteByPath('/reports')?.key).toBe('reports')
      expect(findRouteByPath('/reports/sales')?.key).toBe('reports')
    })

    it('returns null for unknown paths', () => {
      expect(findRouteByPath('/unknown-path-xyz')).toBeNull()
    })
  })

  describe('resolveCanonicalPath', () => {
    it('redirects aliases to /dashboard canonical path', () => {
      expect(resolveCanonicalPath('/')).toBe('/dashboard')
      expect(resolveCanonicalPath('/admin')).toBe('/dashboard')
    })

    it('preserves nested reports paths', () => {
      expect(resolveCanonicalPath('/reports/profit')).toBe('/reports/profit')
    })

    it('resolves known routes to their official pathname', () => {
      expect(resolveCanonicalPath('/stock')).toBe('/stock')
      expect(resolveCanonicalPath('/stock/')).toBe('/stock')
    })

    it('returns normalized unknown path if not found', () => {
      expect(resolveCanonicalPath('/not-found-page/')).toBe('/not-found-page')
    })
  })

  describe('getNavGroups and role-based filtering', () => {
    it('returns the three main nav groups', () => {
      const groups = getNavGroups('OWNER')
      expect(groups.map((g) => g.label)).toEqual(['Overview', 'Operations', 'Finance & Control'])
    })

    it('allows OWNER full access to all routes including security and refunds', () => {
      const groups = getNavGroups('OWNER')
      const allKeys = groups.flatMap((g) => g.items.map((i) => i.key))

      expect(allKeys).toContain('dashboard')
      expect(allKeys).toContain('pawn')
      expect(allKeys).toContain('refunds')
      expect(allKeys).toContain('security')
      expect(allKeys).toContain('secureDocuments')
    })

    it('hides security and refunds from CASHIER role', () => {
      const groups = getNavGroups('CASHIER')
      const allKeys = groups.flatMap((g) => g.items.map((i) => i.key))

      expect(allKeys).not.toContain('security')
      expect(allKeys).not.toContain('refunds')
      expect(allKeys).toContain('secureDocuments')
      expect(allKeys).toContain('trade')
      expect(allKeys).toContain('inventory')
    })

    it('hides security from MANAGER role but includes refunds', () => {
      const groups = getNavGroups('MANAGER')
      const allKeys = groups.flatMap((g) => g.items.map((i) => i.key))

      expect(allKeys).not.toContain('security')
      expect(allKeys).toContain('refunds')
      expect(allKeys).toContain('secureDocuments')
    })

    it('adds overdue count badge to loans route when overdueLoansCount > 0', () => {
      const groupsWithOverdue = getNavGroups('OWNER', 4)
      const loansItem = groupsWithOverdue
        .flatMap((g) => g.items)
        .find((i) => i.key === 'loans')

      expect(loansItem?.badge).toBe('4 overdue')

      const groupsWithoutOverdue = getNavGroups('OWNER', 0)
      const cleanLoansItem = groupsWithoutOverdue
        .flatMap((g) => g.items)
        .find((i) => i.key === 'loans')

      expect(cleanLoansItem?.badge).toBeUndefined()
    })
  })
})
