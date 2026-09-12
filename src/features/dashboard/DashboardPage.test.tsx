import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardView from './DashboardPage'
import { RouterProvider } from '../../app/routing/RouterContext'
import type { SessionUser } from '../../lib/api'

const mockUser: SessionUser = {
  id: 'user-1',
  name: 'Vanna Owner',
  email: 'vanna@example.com',
  role: 'OWNER',
  active: true,
}

const mockDashboardData = {
  metrics: {
    salesToday: 2400,
    purchasesToday: 1100,
    activePawnValue: 8500,
    overdueContracts: 2,
    phonesInStock: 42,
    lowStock: 3,
    customerCount: 156,
  },
  monthlyPerformance: [
    { _id: { month: 9, type: 'SELL' as const }, total: 18000 },
    { _id: { month: 9, type: 'BUY' as const }, total: 9500 },
  ],
  monthPerformance: [
    { _id: 'SELL' as const, total: 18000 },
    { _id: 'BUY' as const, total: 9500 },
  ],
  dailyPerformance: [
    { _id: { day: 12, type: 'SELL' as const }, total: 2400 },
    { _id: { day: 12, type: 'BUY' as const }, total: 1100 },
  ],
  weekPerformance: [
    { _id: { date: '2026-09-12', type: 'SELL' as const }, total: 2400 },
  ],
  inventoryMix: [
    { _id: 'PHONE', count: 42, value: 12500 },
    { _id: 'ACCESSORY', count: 30, value: 1800 },
  ],
  recentPawns: [
    {
      _id: 'pawn-1',
      pawnNo: 'PW-2026-0001',
      principal: 350,
      currency: 'USD',
      estimatedValue: 500,
      status: 'ACTIVE',
      dueDate: '2026-09-25T00:00:00.000Z',
      itemSnapshot: { name: 'iPhone 13 Pro 256GB' },
      customer: { _id: 'c-1', name: 'Bopha Pich', phone: '012345678' },
    },
  ],
}

function renderDashboard(props: Partial<{ goTo: (key: any) => void; onReady: () => void }> = {}) {
  const goTo = props.goTo || vi.fn()
  const onReady = props.onReady || vi.fn()
  const utils = render(
    <RouterProvider>
      <DashboardView user={mockUser} goTo={goTo} onReady={onReady} />
    </RouterProvider>,
  )
  return { ...utils, goTo, onReady }
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/exchange-rates')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ usdKhr: 4100, source: 'NBC' }),
        } as Response
      }
      if (url.includes('/loan-dashboard')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            summary: {
              byCurrency: {
                USD: { lent: 5000, expected: 5500, paid: 2000, outstanding: 3500, dueSoon: 1, overdue: 0 },
                KHR: { lent: 4000000, expected: 4400000, paid: 1000000, outstanding: 3400000, dueSoon: 0, overdue: 0 },
              },
              counts: { total: 5, open: 3, dueSoon: 1, overdue: 0, paid: 2 },
            },
            urgentLoans: [],
            generatedAt: '2026-09-12T00:00:00.000Z',
          }),
        } as Response
      }
      if (url.includes('/inventory')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ items: [] }),
        } as Response
      }
      if (url.endsWith('/dashboard')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => mockDashboardData,
        } as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({}),
      } as Response
    })
  })

  it('renders loading state initially and then shows metric cards', async () => {
    const { onReady } = renderDashboard()

    expect(screen.getByText('Loading dashboard')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText("Today's sales")).toBeInTheDocument()
      expect(onReady).toHaveBeenCalled()
    })

    expect(screen.getByText('$2,400')).toBeInTheDocument()
    expect(screen.getByText('Active pawn value')).toBeInTheDocument()
    expect(screen.getByText('$8,500')).toBeInTheDocument()
    expect(screen.getByText('Phones in stock')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('3 low stock')).toBeInTheDocument()
    expect(screen.getByText('Customers')).toBeInTheDocument()
    expect(screen.getByText('156')).toBeInTheDocument()
  })

  it('renders dual currency exchange rate estimation for sales and pawn values', async () => {
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText("Today's sales")).toBeInTheDocument()
    })

    // $2,400 * 4100 = 9,840,000 KHR
    await waitFor(() => {
      expect(screen.getByText('≈ 9,840,000 ៛')).toBeInTheDocument()
      // $8,500 * 4100 = 34,850,000 KHR
      expect(screen.getByText('≈ 34,850,000 ៛')).toBeInTheDocument()
    })
  })

  it('displays recent pawn contracts table with customer name and contract details', async () => {
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('Recent contracts')).toBeInTheDocument()
    })

    expect(screen.getAllByText('PW-2026-0001')).toHaveLength(2)
    expect(screen.getAllByText('Bopha Pich')).toHaveLength(2)
    expect(screen.getAllByText('iPhone 13 Pro 256GB')).toHaveLength(2)
    expect(screen.getAllByText('$350')).toHaveLength(2) // desktop table + mobile card
  })

  it('displays empty state when recent pawns array is empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/dashboard')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            ...mockDashboardData,
            recentPawns: [],
          }),
        } as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({}),
      } as Response
    })

    renderDashboard()

    await waitFor(() => {
      expect(screen.getAllByText('No pawn contracts in the database yet.')).toHaveLength(2)
    })
  })

  it('navigates to trade and pawn screens via action buttons', async () => {
    const user = userEvent.setup()
    const { goTo } = renderDashboard()

    await waitFor(() => {
      expect(screen.getByText("Today's sales")).toBeInTheDocument()
    })

    const newTxButton = screen.getByRole('button', { name: /New transaction/i })
    await user.click(newTxButton)
    expect(goTo).toHaveBeenCalledWith('trade')

    const viewAllPawnButton = screen.getByRole('button', { name: /^View all$/i })
    await user.click(viewAllPawnButton)
    expect(goTo).toHaveBeenCalledWith('pawn')
  })

  it('handles dashboard load failure gracefully and shows error in description', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/dashboard')) {
        return {
          ok: false,
          status: 500,
          headers: new Headers({ 'X-Request-ID': 'req-dash-err' }),
          json: async () => ({ message: 'Failed to aggregate dashboard metrics', requestId: 'req-dash-err' }),
        } as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({}),
      } as Response
    })

    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText(/Failed to aggregate dashboard metrics/i)).toBeInTheDocument()
    })
  })
})
