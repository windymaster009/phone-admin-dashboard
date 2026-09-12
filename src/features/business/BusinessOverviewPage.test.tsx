import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BusinessOverviewPage from './BusinessOverviewPage'

const mockOverviewData = {
  period: {
    key: 'this_month',
    label: 'This Month',
    from: '2026-09-01T00:00:00.000Z',
    to: '2026-09-30T23:59:59.999Z',
    granularity: 'day',
  },
  financial: {
    salesRevenue: 12500,
    purchases: 7800,
    cogs: 8200,
    grossProfit: 4300,
  },
  pawn: {
    active: 14,
    dueSoon: 3,
    overdue: 2,
    outstandingPrincipal: {
      USD: 3500,
      KHR: 4100000,
    },
  },
  loans: {
    active: 8,
    dueSoon: 2,
    overdue: 1,
    outstandingBalance: {
      USD: 2400,
      KHR: 2050000,
    },
  },
  inventory: {
    inStockCount: 85,
    productCount: 30,
    phoneCount: 40,
    tabletCount: 10,
    accessoryCount: 25,
    sparePartCount: 10,
    otherCount: 0,
    lowStockCount: 4,
    costValue: 18500,
    retailValue: 26000,
    lowStockItems: [
      { _id: 'item-1', sku: 'SKU-001', name: 'iPhone 13 128GB', category: 'PHONE', quantity: 1, reorderLevel: 3 },
    ],
  },
  chart: [
    { key: '2026-09-01', label: '1 Sep', sales: 4000, purchases: 2000, grossProfit: 1500 },
    { key: '2026-09-02', label: '2 Sep', sales: 8500, purchases: 5800, grossProfit: 2800 },
  ],
  recentTransactions: [
    {
      _id: 'tr-1',
      tradeNo: 'INV-2026-001',
      type: 'SELL',
      total: 1200,
      paymentMethod: 'CASH',
      status: 'COMPLETED',
      createdAt: '2026-09-02T10:00:00.000Z',
      customer: { name: 'Sokha Chan' },
    },
  ],
  recentActivity: [
    {
      _id: 'act-1',
      entity: 'TRADE',
      action: 'CREATE',
      createdAt: '2026-09-02T10:05:00.000Z',
      details: { type: 'SELL' },
      user: { name: 'Sophea Staff' },
    },
  ],
}

describe('BusinessOverviewPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders loading state initially and then displays overview metrics', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => mockOverviewData,
      } as Response
    })

    const onReady = vi.fn()
    render(<BusinessOverviewPage onReady={onReady} />)

    // Loading state
    expect(screen.getByText('Loading business overview')).toBeInTheDocument()

    // Loaded state
    await waitFor(() => {
      expect(screen.getByText('Business Overview')).toBeInTheDocument()
      expect(onReady).toHaveBeenCalled()
    })

    // Financial KPIs
    expect(screen.getByText('$12,500')).toBeInTheDocument() // sales revenue
    expect(screen.getByText('$7,800')).toBeInTheDocument() // purchases
    expect(screen.getByText('$4,300')).toBeInTheDocument() // gross profit
    expect(screen.getAllByText('$18,500')).toHaveLength(2) // stat card + inventory snapshot
  })

  it('preserves dual currency isolation for pawn and loan outstanding balances without cross-currency addition', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => mockOverviewData,
      } as Response
    })

    render(<BusinessOverviewPage onReady={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getAllByText('$3,500')).toHaveLength(2) // Pawn USD (summary + snapshot)
      expect(screen.getAllByText('4,100,000 KHR')).toHaveLength(2) // Pawn KHR (summary + snapshot)
      expect(screen.getAllByText('$2,400')).toHaveLength(1) // Loan USD snapshot
      expect(screen.getAllByText('2,050,000 KHR')).toHaveLength(1) // Loan KHR snapshot
    })
  })

  it('renders empty chart message when no transactions exist in the period', async () => {
    const emptyData = {
      ...mockOverviewData,
      chart: [
        { key: '2026-09-01', label: '1 Sep', sales: 0, purchases: 0, grossProfit: 0 },
      ],
      recentTransactions: [],
      recentActivity: [],
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => emptyData,
      } as Response
    })

    render(<BusinessOverviewPage onReady={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('No completed transactions')).toBeInTheDocument()
      expect(screen.getByText('Sales and purchases will appear for this period once recorded.')).toBeInTheDocument()
      expect(screen.getAllByText('No transactions in this period.')).toHaveLength(2)
    })
  })

  it('displays accessible error alert with role="alert" when API fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers({ 'X-Request-ID': 'req-err-1' }),
      json: async () => ({ message: 'Database connection failed', requestId: 'req-err-1' }),
    } as Response)

    render(<BusinessOverviewPage onReady={vi.fn()} />)

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toBeInTheDocument()
      expect(alert).toHaveTextContent(/Database connection failed/i)
      expect(alert).toHaveTextContent(/req-err-1/)
    })
  })

  it('switches period and triggers API with period query parameters', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => mockOverviewData,
    } as Response)

    const user = userEvent.setup()
    render(<BusinessOverviewPage onReady={vi.fn()} />)

    const periodSelect = await screen.findByRole('combobox')
    await user.selectOptions(periodSelect, 'today')

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/business-overview?period=today'),
        expect.anything(),
      )
    })
  })

  it('discards stale response when period is changed rapidly', async () => {
    let resolveToday: (value: Response) => void
    const todayPromise = new Promise<Response>((res) => {
      resolveToday = res
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('period=this_month')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => mockOverviewData,
        } as Response
      }
      if (url.includes('period=today')) {
        return todayPromise
      }
      if (url.includes('period=yesterday')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            ...mockOverviewData,
            period: { ...mockOverviewData.period, key: 'yesterday', label: 'Yesterday' },
            financial: { ...mockOverviewData.financial, salesRevenue: 9999 },
          }),
        } as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => mockOverviewData,
      } as Response
    })

    const user = userEvent.setup()
    render(<BusinessOverviewPage onReady={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Business Overview')).toBeInTheDocument()
      expect(screen.getByText('$12,500')).toBeInTheDocument()
    })

    const periodSelect = screen.getByRole('combobox')

    // 1. Select 'today' (delayed)
    await user.selectOptions(periodSelect, 'today')

    // 2. Quickly select 'yesterday' (instant)
    await user.selectOptions(periodSelect, 'yesterday')

    // 3. 'yesterday' resolves first with 9999
    await waitFor(() => {
      expect(screen.getByText('$9,999')).toBeInTheDocument()
    })

    // 4. Now 'today' finally resolves with 7777
    resolveToday!({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        ...mockOverviewData,
        period: { ...mockOverviewData.period, key: 'today', label: 'Today' },
        financial: { ...mockOverviewData.financial, salesRevenue: 7777 },
      }),
    } as Response)

    // Stale 'today' response must be discarded; display must remain $9,999
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByText('$9,999')).toBeInTheDocument()
    expect(screen.queryByText('$7,777')).not.toBeInTheDocument()
  })
})
