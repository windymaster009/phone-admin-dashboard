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

  it('triggers open operation event for New purchase', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ trades: [] }),
    } as Response)

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    const user = userEvent.setup()

    render(<TradePage />)

    const newPurchaseBtn = screen.getByRole('button', { name: /New purchase/i })
    await user.click(newPurchaseBtn)

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'phoneflow:open-operation',
        detail: { kind: 'purchase' },
      }),
    )
  })

  it('exports transactions as CSV and handles quotes escaping', async () => {
    const mockTradeWithQuotes: Trade = {
      ...mockTradeRecord,
      _id: 'trade-quote-1',
      tradeNo: 'TR-QUOTE-1',
      customer: {
        _id: 'cust-quote-1',
        name: 'John "The Boss" Doe',
        phone: '099-888-777',
      },
      items: [
        {
          name: 'Case "Rugged" Pro',
          quantity: 2,
          unitPrice: 15,
        },
      ],
      subtotal: 30,
      discount: 5,
      total: 25,
      amountPaid: 25,
      balance: 0,
      createdAt: '2026-09-01T10:30:00.000Z',
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ trades: [mockTradeWithQuotes] }),
    } as Response)

    let createdBlob: Blob | null = null
    const createObjectURLMock = vi.fn((blob: Blob) => {
      createdBlob = blob
      return 'blob:mock-url-123'
    })
    const revokeObjectURLMock = vi.fn()
    window.URL.createObjectURL = createObjectURLMock as any
    window.URL.revokeObjectURL = revokeObjectURLMock as any

    let clickedDownload = ''
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clickedDownload = this.download
    })

    const user = userEvent.setup()
    render(<TradePage />)

    await waitFor(() => {
      expect(screen.getByText(/TR-QUOTE-1/)).toBeInTheDocument()
    })

    const exportBtn = screen.getByRole('button', { name: /Export transactions as CSV/i })
    expect(exportBtn).not.toBeDisabled()
    await user.click(exportBtn)

    expect(createObjectURLMock).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url-123')
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(clickedDownload).toMatch(/^phoneflow-transactions-\d{4}-\d{2}-\d{2}\.csv$/)

    expect(createdBlob).not.toBeNull()
    const text = await (createdBlob as any).text()
    expect(text).toContain('"Reference","Type","Customer","Items","Subtotal","Discount","Total","Paid","Balance","Payment","Status","Date"')
    expect(text).toContain('John ""The Boss"" Doe')
    expect(text).toContain('Case ""Rugged"" Pro x2')
    expect(text).toContain('2026-09-01T10:30:00.000Z')
  })

  it('disables export button when trades array is empty', async () => {
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

    const exportBtn = screen.getByRole('button', { name: /Export transactions as CSV/i })
    expect(exportBtn).toBeDisabled()
  })

  it('toggles transaction card collapse and expand state', async () => {
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

    const collapseBtn = screen.getByRole('button', { name: /Collapse recent transactions/i })
    expect(collapseBtn).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(new RegExp(mockTradeRecord.tradeNo, 'i'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Export transactions as CSV/i })).toBeInTheDocument()

    // Collapse
    await user.click(collapseBtn)

    expect(collapseBtn).toHaveAttribute('aria-expanded', 'false')
    expect(collapseBtn).toHaveAttribute('aria-label', 'Expand recent transactions')
    expect(screen.queryByText(new RegExp(mockTradeRecord.tradeNo, 'i'))).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Export transactions as CSV/i })).not.toBeInTheDocument()

    // Expand again
    await user.click(collapseBtn)

    expect(collapseBtn).toHaveAttribute('aria-expanded', 'true')
    expect(collapseBtn).toHaveAttribute('aria-label', 'Collapse recent transactions')
    expect(screen.getByText(new RegExp(mockTradeRecord.tradeNo, 'i'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Export transactions as CSV/i })).toBeInTheDocument()
  })

  it('renders KHR transactions, notes, and refund details with restored stock disposition', async () => {
    const mockKhrTrade: Trade = {
      _id: 'trade-khr-1',
      tradeNo: 'TR-KHR-001',
      type: 'SELL',
      customer: {
        _id: 'cust-khr-1',
        name: 'Sokha Chan',
        phone: '012-999-888',
      },
      items: [
        {
          name: 'Screen Protector Premium',
          quantity: 2,
          unitPrice: 5,
          originalUnitPrice: 20500,
        },
      ],
      subtotal: 10,
      discount: 0,
      total: 10,
      amountPaid: 10,
      balance: 0,
      currency: 'KHR',
      transactionSubtotal: 41000,
      transactionTotal: 41000,
      transactionAmountPaid: 41000,
      transactionBalance: 0,
      paymentMethod: 'KHQR',
      status: 'COMPLETED',
      paymentStatus: 'PAID',
      notes: 'Customer requested front & back alignment',
      refund: {
        amount: 20500,
        inventoryDisposition: 'RESTOCK',
        reason: 'Client preferred clear instead of matte',
        refundedAt: '2026-09-02T13:00:00.000Z',
      },
      createdAt: '2026-09-02T12:00:00.000Z',
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ trades: [mockKhrTrade] }),
    } as Response)

    const user = userEvent.setup()
    render(<TradePage />)

    await waitFor(() => {
      expect(screen.getByText(/TR-KHR-001/)).toBeInTheDocument()
    })

    // List view displays formatted KHR amount
    expect(screen.getByText('+41,000 KHR')).toBeInTheDocument()

    // Open detail modal
    const viewBtn = screen.getByRole('button', { name: /View TR-KHR-001/i })
    await user.click(viewBtn)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Modal verifies KHR fields and line items
    expect(screen.getByText('Subtotal').parentElement).toHaveTextContent('41,000 KHR')
    expect(screen.getByText('Amount paid').parentElement).toHaveTextContent('41,000 KHR')
    expect(screen.getByText('Balance').parentElement).toHaveTextContent('0 KHR')
    expect(screen.getByText('1 line item')).toBeInTheDocument()

    // Notes
    expect(screen.getByText('Notes')).toBeInTheDocument()
    expect(screen.getByText('Customer requested front & back alignment')).toBeInTheDocument()

    // Refund record
    const refundRecord = screen.getByRole('status')
    expect(refundRecord).toBeInTheDocument()
    expect(refundRecord).toHaveTextContent('Refund recorded')
    expect(refundRecord).toHaveTextContent('20,500 KHR · Items restored to stock')
    expect(refundRecord).toHaveTextContent('Client preferred clear instead of matte')
  })

  it('renders trade detail modal with non-restock refund, walk-in party, missing phone, and multiple items', async () => {
    const mockWalkInTrade: Trade = {
      _id: 'trade-walkin-1',
      tradeNo: 'TR-WALKIN-1',
      type: 'BUY',
      items: [
        {
          name: 'Item A',
          quantity: 1,
          unitPrice: 50,
        },
        {
          name: 'Item B',
          quantity: 3,
          unitPrice: 20,
        },
      ],
      subtotal: 110,
      discount: 10,
      total: 100,
      amountPaid: 60,
      balance: 40,
      currency: 'USD',
      paymentMethod: 'BANK_TRANSFER',
      status: 'PARTIAL',
      refund: {
        amount: 30,
        inventoryDisposition: 'NO_RESTOCK',
        reason: 'Water damaged internal motherboard',
        refundedAt: '2026-09-03T16:00:00.000Z',
      },
      createdAt: '2026-09-03T15:00:00.000Z',
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ trades: [mockWalkInTrade] }),
    } as Response)

    const user = userEvent.setup()
    render(<TradePage />)

    await waitFor(() => {
      expect(screen.getByText(/TR-WALKIN-1/)).toBeInTheDocument()
    })

    const viewBtn = screen.getByRole('button', { name: /View TR-WALKIN-1/i })
    await user.click(viewBtn)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Walk-in seller and no phone
    expect(screen.getByText('Walk-in seller')).toBeInTheDocument()
    expect(screen.getByText('No phone recorded')).toBeInTheDocument()

    // Multiple line items count
    expect(screen.getByText('2 line items')).toBeInTheDocument()

    // Refund shows scrap disposition text
    const refundRecord = screen.getByRole('status')
    expect(refundRecord).toHaveTextContent('Items not returned to saleable stock')
    expect(refundRecord).toHaveTextContent('Water damaged internal motherboard')
  })
})
