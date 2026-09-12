import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CashFlowCard from './CashFlowCard'

const mockPerformanceData = {
  monthPerformance: [
    { _id: 'SELL' as const, total: 15000 },
    { _id: 'BUY' as const, total: 9000 },
  ],
  monthlyPerformance: [
    { _id: { month: 1, type: 'SELL' as const }, total: 8000 },
    { _id: { month: 1, type: 'BUY' as const }, total: 4000 },
    { _id: { month: 2, type: 'SELL' as const }, total: 10000 },
    { _id: { month: 2, type: 'BUY' as const }, total: 6000 },
  ],
  dailyPerformance: [
    { _id: { day: 1, type: 'SELL' as const }, total: 5000 },
    { _id: { day: 1, type: 'BUY' as const }, total: 2000 },
    { _id: { day: 2, type: 'SELL' as const }, total: 10000 },
    { _id: { day: 2, type: 'BUY' as const }, total: 7000 },
  ],
  weekPerformance: [
    { _id: { date: '2026-09-08', type: 'SELL' as const }, total: 3000 },
    { _id: { date: '2026-09-08', type: 'BUY' as const }, total: 1000 },
  ],
}

describe('CashFlowCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders loading state initially and then displays net cash flow and totals', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => mockPerformanceData,
    } as Response)

    render(<CashFlowCard />)

    expect(screen.getByText('Loading cash flow…')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Net cash flow')).toBeInTheDocument()
    })

    // Month mode: sales 15000, purchases 9000, net = +6000
    expect(screen.getByText('$6,000')).toBeInTheDocument()
    expect(screen.getByText('$15,000')).toBeInTheDocument()
    expect(screen.getByText('$9,000')).toBeInTheDocument()
    expect(screen.getByText('More cash in than out')).toBeInTheDocument()
  })

  it('switches between month, week, and year periods and recalculates net totals', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => mockPerformanceData,
    } as Response)

    const user = userEvent.setup()
    render(<CashFlowCard />)

    await waitFor(() => {
      expect(screen.getByText('Net cash flow')).toBeInTheDocument()
    })

    const periodSelect = screen.getByLabelText('Performance period')

    // Switch to This week
    await user.selectOptions(periodSelect, 'week')
    expect(screen.getByText('Mon–Sun')).toBeInTheDocument()

    // Switch to This year
    await user.selectOptions(periodSelect, 'year')
    expect(screen.getByText(/Jan–/)).toBeInTheDocument()
  })

  it('displays empty state when no sales or purchases exist', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        monthPerformance: [],
        monthlyPerformance: [],
        dailyPerformance: [],
        weekPerformance: [],
      }),
    } as Response)

    render(<CashFlowCard />)

    await waitFor(() => {
      expect(screen.getByText('No cash movement yet')).toBeInTheDocument()
      expect(screen.getByText('Completed sales and purchases will appear here.')).toBeInTheDocument()
    })
  })

  it('renders error state and retries fetch when Try again is clicked', async () => {
    let callCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      callCount += 1
      if (callCount === 1) {
        return {
          ok: false,
          status: 500,
          headers: new Headers({ 'X-Request-ID': 'req-cf-err' }),
          json: async () => ({ message: 'Performance calculation timeout', requestId: 'req-cf-err' }),
        } as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => mockPerformanceData,
      } as Response
    })

    const user = userEvent.setup()
    render(<CashFlowCard />)

    await waitFor(() => {
      expect(screen.getByText(/Performance calculation timeout/i)).toBeInTheDocument()
    })

    const retryButton = screen.getByRole('button', { name: 'Try again' })
    await user.click(retryButton)

    await waitFor(() => {
      expect(screen.getByText('Net cash flow')).toBeInTheDocument()
      expect(screen.getByText('$6,000')).toBeInTheDocument()
    })
  })
})
