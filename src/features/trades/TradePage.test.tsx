import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TradePage from './TradePage'
import { mockTradeRecord } from '../../test/testUtils'

describe('TradePage feature integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders Buy and Sell action cards and triggers open operation events', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ trades: [] }),
    } as Response)

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    const user = userEvent.setup()

    render(<TradePage />)

    expect(screen.getByRole('heading', { level: 3, name: 'Buy products' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Sell an item' })).toBeInTheDocument()

    const newSaleBtn = screen.getByRole('button', { name: /New sale/i })
    await user.click(newSaleBtn)

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'phoneflow:open-operation',
        detail: { kind: 'sale' },
      }),
    )
  })

  it('renders recent transactions when API returns trades', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ trades: [mockTradeRecord] }),
    } as Response)

    render(<TradePage />)

    await waitFor(() => {
      expect(screen.getByText(new RegExp(mockTradeRecord.items[0].name, 'i'))).toBeInTheDocument()
      expect(screen.getByText(new RegExp(mockTradeRecord.tradeNo, 'i'))).toBeInTheDocument()
      expect(screen.getByText('+$1,150')).toBeInTheDocument()
    })
  })

  it('opens trade detail modal when view action is clicked', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ trades: [mockTradeRecord] }),
    } as Response)

    const user = userEvent.setup()
    render(<TradePage />)

    await waitFor(() => {
      expect(screen.getByText(new RegExp(mockTradeRecord.tradeNo, 'i'))).toBeInTheDocument()
    })

    const viewBtn = screen.getByRole('button', { name: new RegExp(`View ${mockTradeRecord.tradeNo}`, 'i') })
    await user.click(viewBtn)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 3, name: mockTradeRecord.tradeNo })).toBeInTheDocument()
    })

    // Close modal
    const closeBtn = screen.getByRole('button', { name: /Close details/i })
    await user.click(closeBtn)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('displays empty state when no transactions exist', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ trades: [] }),
    } as Response)

    render(<TradePage />)

    await waitFor(() => {
      expect(screen.getByText(/No transactions yet/i)).toBeInTheDocument()
    })
  })

  it('displays error notice when trades fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers({ 'X-Request-ID': 'req-trade-err' }),
      json: async () => ({ message: 'Failed to retrieve trade history', requestId: 'req-trade-err' }),
    } as Response)

    render(<TradePage />)

    await waitFor(() => {
      expect(screen.getByText(/Failed to retrieve trade history/i)).toBeInTheDocument()
    })
  })
})
