import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TradePage from './TradePage'
import ReceiptCenterBridge from '../receipts/ReceiptCenterBridge'
import { mockTradeRecord } from '../../test/testUtils'
import type { Trade } from '../../types/domain'

const mockPurchaseRecord: Trade = {
  _id: 'trade-buy-1',
  tradeNo: 'TR-2026-0002',
  type: 'BUY',
  customer: {
    _id: 'supplier-1',
    name: 'Tech Wholesaler',
    phone: '012-345-678',
  },
  items: [
    {
      name: 'iPhone 13 128GB',
      quantity: 1,
      unitPrice: 400,
    },
  ],
  subtotal: 400,
  discount: 0,
  total: 400,
  amountPaid: 400,
  balance: 0,
  currency: 'USD',
  paymentMethod: 'CASH',
  status: 'COMPLETED',
  paymentStatus: 'PAID',
  createdAt: '2026-08-16T00:00:00.000Z',
}

const mockZeroTradeRecord: Trade = {
  ...mockPurchaseRecord,
  _id: 'trade-zero-1',
  tradeNo: 'TR-2026-0003',
  subtotal: 0,
  total: 0,
  amountPaid: 0,
  balance: 0,
}

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

  it('opens trade detail modal portaled under document.body with shared DetailModal architecture', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ trades: [mockTradeRecord] }),
    } as Response)

    const user = userEvent.setup()
    const { container } = render(<TradePage />)

    await waitFor(() => {
      expect(screen.getByText(new RegExp(mockTradeRecord.tradeNo, 'i'))).toBeInTheDocument()
    })

    const viewBtn = screen.getByRole('button', { name: new RegExp(`View ${mockTradeRecord.tradeNo}`, 'i') })
    await user.click(viewBtn)

    await waitFor(() => {
      const dialog = screen.getByRole('dialog')
      expect(dialog).toBeInTheDocument()
      expect(dialog).toHaveAttribute('aria-modal', 'true')
      expect(dialog).toHaveAttribute('aria-labelledby', 'trade-detail-title')
      expect(dialog).toHaveClass('detail-modal', 'trade-detail-modal')

      // Portaled directly to document.body, outside component root container
      const backdrop = dialog.parentElement
      expect(backdrop).toHaveClass('modal-backdrop', 'detail-modal-backdrop')
      expect(backdrop?.parentElement).toBe(document.body)
      expect(container.contains(dialog)).toBe(false)

      // Header structure
      const header = dialog.querySelector('.detail-modal-header')
      expect(header).toBeInTheDocument()
      const title = header?.querySelector('#trade-detail-title')
      expect(title).toHaveTextContent(mockTradeRecord.tradeNo)
      expect(screen.getByText('Sale transaction')).toBeInTheDocument()

      // Body structure
      const body = dialog.querySelector('.trade-detail-body')
      expect(body).toBeInTheDocument()
      expect(body).toHaveClass('detail-modal-body')
      expect(body?.querySelector('.detail-grid')).toBeInTheDocument()
      expect(body?.querySelector('.detail-sections')).toBeInTheDocument()
      expect(body?.querySelector('.detail-lines')).toBeInTheDocument()

      // Footer structure
      const footer = dialog.querySelector('.detail-modal-footer')
      expect(footer).toBeInTheDocument()
      const dismissGroup = footer?.querySelector('.detail-modal-dismiss-group')
      expect(dismissGroup).toBeInTheDocument()
      expect(dismissGroup?.querySelector('button')).toHaveTextContent('Close')
    })
  })

  it('closes modal via header close button, footer close button, Escape key, and backdrop click', async () => {
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

    // 1. Close via header close button
    await user.click(viewBtn)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const headerCloseBtn = screen.getByRole('button', { name: /Close details/i })
    await user.click(headerCloseBtn)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // 2. Close via footer close button
    await user.click(viewBtn)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const footerCloseBtn = screen.getByRole('button', { name: 'Close' })
    await user.click(footerCloseBtn)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // 3. Close via Escape key
    await user.click(viewBtn)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // 4. Close via backdrop click
    await user.click(viewBtn)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const backdrop = document.querySelector('.detail-modal-backdrop')
    expect(backdrop).toBeInTheDocument()
    fireEvent.click(backdrop!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('integrates with ReceiptCenterBridge dynamically injecting Print receipt button', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ trades: [mockTradeRecord] }),
    } as Response)

    const user = userEvent.setup()
    render(
      <>
        <TradePage />
        <ReceiptCenterBridge />
      </>,
    )

    await waitFor(() => {
      expect(screen.getByText(new RegExp(mockTradeRecord.tradeNo, 'i'))).toBeInTheDocument()
    })

    const viewBtn = screen.getByRole('button', { name: new RegExp(`View ${mockTradeRecord.tradeNo}`, 'i') })
    await user.click(viewBtn)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      const printBtn = screen.getByRole('button', { name: /Print receipt/i })
      expect(printBtn).toBeInTheDocument()

      const footer = document.querySelector('.trade-detail-modal .detail-modal-footer')
      expect(footer?.contains(printBtn)).toBe(true)
    })
  })

  it('renders purchase transaction variant and seller information properly', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ trades: [mockPurchaseRecord] }),
    } as Response)

    const user = userEvent.setup()
    render(<TradePage />)

    await waitFor(() => {
      expect(screen.getByText(new RegExp(mockPurchaseRecord.tradeNo, 'i'))).toBeInTheDocument()
      expect(screen.getByText('-$400')).toBeInTheDocument()
    })

    const viewBtn = screen.getByRole('button', { name: new RegExp(`View ${mockPurchaseRecord.tradeNo}`, 'i') })
    await user.click(viewBtn)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Purchase transaction')).toBeInTheDocument()
      expect(screen.getByText('Seller')).toBeInTheDocument()
      expect(screen.getByText('Tech Wholesaler')).toBeInTheDocument()
      expect(screen.getByText('012-345-678')).toBeInTheDocument()
    })
  })

  it('does not display negative zero for transactions with zero total', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ trades: [mockZeroTradeRecord] }),
    } as Response)

    const user = userEvent.setup()
    render(<TradePage />)

    await waitFor(() => {
      expect(screen.getByText(new RegExp(mockZeroTradeRecord.tradeNo, 'i'))).toBeInTheDocument()
    })

    // Table list total should be $0 or $0.00, NOT -$0 or -$0.00
    const moneyOutElements = document.querySelectorAll('.money-out')
    expect(moneyOutElements.length).toBeGreaterThan(0)
    moneyOutElements.forEach((el) => {
      expect(el.textContent).not.toMatch(/^-\$0/)
    })

    const viewBtn = screen.getByRole('button', { name: new RegExp(`View ${mockZeroTradeRecord.tradeNo}`, 'i') })
    await user.click(viewBtn)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Detail modal total should be $0, NOT -$0
    const totalSection = screen.getByText('Total').parentElement
    expect(totalSection?.textContent).not.toMatch(/^-\$0/)
    expect(totalSection?.textContent).toMatch(/\$0/)
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
