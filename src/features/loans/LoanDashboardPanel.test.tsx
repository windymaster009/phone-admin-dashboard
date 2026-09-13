import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoanDashboardPanel, { type LoanDashboardData } from './LoanDashboardPanel'
import { RouterProvider } from '../../app/routing/RouterContext'

const mockDashboardData: LoanDashboardData = {
  summary: {
    byCurrency: {
      USD: {
        lent: 12000,
        expected: 13200,
        paid: 4000,
        outstanding: 9200,
        dueSoon: 2500,
        overdue: 1500,
      },
      KHR: {
        lent: 48000000,
        expected: 52800000,
        paid: 16000000,
        outstanding: 36800000,
        dueSoon: 10000000,
        overdue: 6000000,
      },
    },
    counts: {
      total: 10,
      open: 7,
      dueSoon: 2,
      overdue: 1,
      paid: 3,
    },
  },
  urgentLoans: [
    {
      _id: 'urgent-1',
      loanNo: 'LN-2026-001',
      borrower: {
        name: 'Dara Sam',
        phone: '098 765 432',
      },
      remainingBalance: 1500,
      totalDue: 1650,
      amountPaid: 150,
      currency: 'USD',
      dueDate: '2026-09-10T00:00:00.000Z',
      status: 'OVERDUE',
    },
    {
      _id: 'urgent-2',
      loanNo: 'LN-2026-002',
      borrower: {
        name: 'Kolap Meas',
      },
      remainingBalance: 10000000,
      totalDue: 11000000,
      amountPaid: 1000000,
      currency: 'KHR',
      dueDate: '2026-09-15T00:00:00.000Z',
      status: 'DUE_SOON',
    },
  ],
  generatedAt: '2026-09-13T10:00:00.000Z',
}

describe('LoanDashboardPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('uncontrolled mode: loads /loan-dashboard, displays dual-currency metrics and urgent borrowers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => mockDashboardData,
    } as Response)

    render(
      <RouterProvider>
        <LoanDashboardPanel />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Dara Sam')).toBeInTheDocument()
      expect(screen.getByText('Kolap Meas')).toBeInTheDocument()
    })

    // Assert metric cards show dual currency formatted values
    expect(screen.getByText('$9,200.00')).toBeInTheDocument()
    expect(screen.getByText('36,800,000 ៛')).toBeInTheDocument()
    expect(screen.getByText('7 open loans')).toBeInTheDocument()

    // Assert urgent loan detail rendering
    expect(screen.getByText(/LN-2026-001 · 098 765 432/i)).toBeInTheDocument()
    expect(screen.getAllByText('$1,500.00').length).toBeGreaterThan(0)
    expect(screen.getByText(/LN-2026-002/i)).toBeInTheDocument()
    expect(screen.getAllByText('10,000,000 ៛').length).toBeGreaterThan(0)
  })

  it('uncontrolled mode: sets up polling interval and clears timer on unmount', async () => {
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => mockDashboardData,
    } as Response)

    const { unmount } = render(
      <RouterProvider>
        <LoanDashboardPanel />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Dara Sam')).toBeInTheDocument()
    })

    unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()
  })

  it('uncontrolled mode: refresh button triggers reload', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => mockDashboardData,
    } as Response)

    const user = userEvent.setup()
    render(
      <RouterProvider>
        <LoanDashboardPanel />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Dara Sam')).toBeInTheDocument()
    })

    const initialFetchCount = fetchSpy.mock.calls.length
    const refreshButton = screen.getByRole('button', { name: /Refresh loan dashboard/i })
    await user.click(refreshButton)

    await waitFor(() => {
      expect(fetchSpy.mock.calls.length).toBeGreaterThan(initialFetchCount)
    })
  })

  it('displays empty state when urgentLoans is empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        ...mockDashboardData,
        urgentLoans: [],
      }),
    } as Response)

    render(
      <RouterProvider>
        <LoanDashboardPanel />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('No urgent loans')).toBeInTheDocument()
      expect(screen.getByText('Nothing is overdue or due soon.')).toBeInTheDocument()
    })
  })

  it('displays error message when API request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: new Headers(),
      json: async () => ({ message: 'Failed to load loan dashboard' }),
    } as Response)

    render(
      <RouterProvider>
        <LoanDashboardPanel />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText(/Failed to load loan dashboard/i)).toBeInTheDocument()
    })
  })

  it('controlled mode: renders provided data and delegates refresh to propOnRefresh', async () => {
    const onRefresh = vi.fn()
    const user = userEvent.setup()

    render(
      <RouterProvider>
        <LoanDashboardPanel
          data={mockDashboardData}
          loading={false}
          error=""
          onRefresh={onRefresh}
        />
      </RouterProvider>,
    )

    expect(screen.getByText('Dara Sam')).toBeInTheDocument()

    const refreshButton = screen.getByRole('button', { name: /Refresh loan dashboard/i })
    await user.click(refreshButton)

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('navigates to /loans when clicking View all loans or an urgent borrower card', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => mockDashboardData,
    } as Response)

    const user = userEvent.setup()
    render(
      <RouterProvider>
        <LoanDashboardPanel />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Dara Sam')).toBeInTheDocument()
    })

    // 1. Click "View all loans"
    const viewAllButton = screen.getByRole('button', { name: /View all loans/i })
    await user.click(viewAllButton)
    expect(window.location.pathname).toBe('/loans')

    // 2. Click urgent borrower row
    const borrowerButton = screen.getByRole('button', { name: /Dara Sam/i })
    await user.click(borrowerButton)
    expect(window.location.pathname).toBe('/loans')
  })
})
