import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CashFlowCard from './CashFlowCard'

const CAMBODIA_OFFSET_MS = 7 * 60 * 60 * 1000

function currentCambodiaWeekDate(dayOffset = 0) {
  const cambodiaNow = new Date(Date.now() + CAMBODIA_OFFSET_MS)
  const daysSinceMonday = (cambodiaNow.getUTCDay() + 6) % 7
  const date = new Date(Date.UTC(
    cambodiaNow.getUTCFullYear(),
    cambodiaNow.getUTCMonth(),
    cambodiaNow.getUTCDate() - daysSinceMonday + dayOffset,
  ))
  return date.toISOString().slice(0, 10)
}

const mockPerformanceData = {
  monthPerformance: [
    { _id: 'SELL' as const, total: 15000 },
    { _id: 'BUY' as const, total: 9000 },
    { _id: 'REFUND' as const, total: 1000 },
  ],
  monthlyPerformance: [
    { _id: { month: 1, type: 'SELL' as const }, total: 8000 },
    { _id: { month: 1, type: 'BUY' as const }, total: 4000 },
    { _id: { month: 2, type: 'SELL' as const }, total: 10000 },
    { _id: { month: 2, type: 'BUY' as const }, total: 6000 },
    { _id: { month: 2, type: 'REFUND' as const }, total: 500 },
  ],
  dailyPerformance: [
    { _id: { day: 1, type: 'SELL' as const }, total: 5000 },
    { _id: { day: 1, type: 'BUY' as const }, total: 2000 },
    { _id: { day: 2, type: 'SELL' as const }, total: 10000 },
    { _id: { day: 2, type: 'BUY' as const }, total: 7000 },
    { _id: { day: 2, type: 'REFUND' as const }, total: 1000 },
  ],
  weekPerformance: [
    { _id: { date: currentCambodiaWeekDate(), type: 'SELL' as const }, total: 3000 },
    { _id: { date: currentCambodiaWeekDate(), type: 'BUY' as const }, total: 1000 },
    { _id: { date: currentCambodiaWeekDate(), type: 'REFUND' as const }, total: 250 },
    { _id: { date: currentCambodiaWeekDate(-7), type: 'SELL' as const }, total: 6000 },
    { _id: { date: currentCambodiaWeekDate(-7), type: 'BUY' as const }, total: 2000 },
    { _id: { date: currentCambodiaWeekDate(-7), type: 'REFUND' as const }, total: 500 },
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

    // This week: sales 3000, purchases 1000, refunds 250, net = +1750
    expect(screen.getByText('$1,750')).toBeInTheDocument()
    expect(screen.getAllByText('$3,000')).toHaveLength(2)
    expect(screen.getByText('$1,250')).toBeInTheDocument()
    expect(screen.getByText('$250 refunds')).toBeInTheDocument()
    expect(screen.getByText('More cash in than out')).toBeInTheDocument()
  })

  it('offers only this week and last week and recalculates their totals', async () => {
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
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['This week', 'Last week'])
    expect(periodSelect).toHaveValue('this_week')
    expect(screen.getByText('Mon–Sun')).toBeInTheDocument()

    await user.selectOptions(periodSelect, 'last_week')
    expect(screen.getByText('$3,500')).toBeInTheDocument()
    expect(screen.getAllByText('$6,000')).toHaveLength(2)
    expect(screen.getByText('$2,500')).toBeInTheDocument()
    expect(screen.getByText('$500 refunds')).toBeInTheDocument()
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
      expect(screen.getByText('Completed sales, purchases, and refunds will appear here.')).toBeInTheDocument()
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
      expect(screen.getByText('$1,750')).toBeInTheDocument()
    })
  })
})
