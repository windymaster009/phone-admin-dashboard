import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RefundsPage from './RefundsPage'
import { mockCashierUser, mockOwnerUser, mockTradeRecord } from '../../test/testUtils'
import type { Trade } from '../../types/domain'

describe('RefundsPage feature integration & safeguards', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('blocks unauthorized users and displays manager access requirement message', () => {
    render(<RefundsPage user={mockCashierUser} />)

    expect(screen.getByRole('heading', { level: 3, name: 'Manager access required' })).toBeInTheDocument()
    expect(screen.getByText(/Only owners and managers can review or record refunds/i)).toBeInTheDocument()
  })

  it('allows OWNER and loads eligible trades queue', async () => {
    const saleTrade: Trade = {
      ...mockTradeRecord,
      _id: 'tr-sale-1',
      tradeNo: 'SL-2026-0001',
      status: 'COMPLETED',
      warrantyDays: 30,
      createdAt: new Date().toISOString(),
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ trades: [saleTrade] }),
    } as Response)

    render(<RefundsPage user={mockOwnerUser} />)

    await waitFor(() => {
      expect(screen.getAllByText('SL-2026-0001').length).toBeGreaterThan(0)
      expect(screen.getByText(/ready/i)).toBeInTheDocument()
    })
  })

  it('enforces multi-step safeguard before enabling refund submission button', async () => {
    const saleTrade: Trade = {
      ...mockTradeRecord,
      _id: 'tr-sale-2',
      tradeNo: 'SL-SAFEGUARD',
      status: 'COMPLETED',
      warrantyDays: 14,
      createdAt: new Date().toISOString(),
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ trades: [saleTrade] }),
    } as Response)

    const user = userEvent.setup()
    render(<RefundsPage user={mockOwnerUser} />)

    await waitFor(() => {
      expect(screen.getAllByText('SL-SAFEGUARD').length).toBeGreaterThan(0)
    })

    const submitBtn = screen.getByRole('button', { name: /Record full refund/i })
    // Initially disabled because reason, disposition, and confirmation are empty
    expect(submitBtn).toBeDisabled()

    // 1. Enter too short reason (< 5 characters)
    const reasonInput = screen.getByPlaceholderText(/Example: Item is faulty/i)
    await user.type(reasonInput, 'Bad')
    expect(submitBtn).toBeDisabled()

    // Enter valid reason (>= 5 characters)
    await user.type(reasonInput, ' device screen flickering')
    expect(submitBtn).toBeDisabled()

    // 2. Select inventory disposition
    const selectDisposition = screen.getByRole('combobox')
    await user.selectOptions(selectDisposition, 'RESTOCK')
    expect(submitBtn).toBeDisabled()

    // 3. Enter incorrect confirmation code
    const confirmInput = screen.getByPlaceholderText('Type SL-SAFEGUARD')
    await user.type(confirmInput, 'WRONG-CODE')
    expect(submitBtn).toBeDisabled()

    // 4. Enter exact matching trade number
    await user.clear(confirmInput)
    await user.type(confirmInput, 'SL-SAFEGUARD')

    // Now all safeguards are satisfied -> submit button must be enabled
    expect(submitBtn).toBeEnabled()
  })

  it('prevents double refund on already returned sales', async () => {
    const refundedTrade: Trade = {
      ...mockTradeRecord,
      _id: 'tr-returned-1',
      tradeNo: 'SL-RETURNED-ALREADY',
      status: 'RETURNED',
      createdAt: new Date().toISOString(),
      refund: {
        amount: 1150,
        refundedAt: new Date().toISOString(),
        reason: 'Customer returned item',
        inventoryDisposition: 'RESTOCK',
        refundedBy: { _id: 'u-1', name: 'Manager' },
      },
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ trades: [refundedTrade] }),
    } as Response)

    render(<RefundsPage user={mockOwnerUser} />)

    await waitFor(() => {
      expect(screen.getAllByText('SL-RETURNED-ALREADY').length).toBeGreaterThan(0)
    })

    // Should indicate the sale is already refunded
    expect(screen.getByText(/Refund already recorded/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Complete refund/i })).not.toBeInTheDocument()
  })

  it('handles successful refund without page reload and dispatches open-refund-receipt event', async () => {
    const saleTrade: Trade = {
      ...mockTradeRecord,
      _id: 'tr-sale-success',
      tradeNo: 'SL-SUCCESS-1',
      status: 'COMPLETED',
      warrantyDays: 30,
      createdAt: new Date().toISOString(),
      transactionAmountPaid: 250,
      amountPaid: 250,
      currency: 'USD',
    }

    const refundedTrade: Trade = {
      ...saleTrade,
      status: 'RETURNED',
      refund: {
        amount: 250,
        refundedAt: new Date().toISOString(),
        reason: 'Customer returned faulty unit',
        inventoryDisposition: 'RESTOCK',
        refundedBy: { _id: 'u-1', name: 'Owner' },
      },
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/refunds')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ trades: [saleTrade] }) } as Response
      }
      if (url.includes('/trades/tr-sale-success/refund') && init?.method === 'POST') {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ trade: refundedTrade }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<RefundsPage user={mockOwnerUser} />)

    await waitFor(() => {
      expect(screen.getAllByText('SL-SUCCESS-1').length).toBeGreaterThan(0)
    })

    // Fill form
    await user.type(screen.getByPlaceholderText(/Example: Item is faulty/i), 'Customer returned faulty unit')
    await user.selectOptions(screen.getByRole('combobox'), 'RESTOCK')
    await user.type(screen.getByPlaceholderText('Type SL-SUCCESS-1'), 'SL-SUCCESS-1')

    const submitBtn = screen.getByRole('button', { name: /Record full refund/i })
    expect(submitBtn).toBeEnabled()

    // Listen for custom event
    const eventListener = vi.fn()
    window.addEventListener('phoneflow:open-refund-receipt', eventListener)

    await user.click(submitBtn)

    // Success modal appears
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /SL-SUCCESS-1 refunded/i })).toBeInTheDocument()
      expect(screen.getByText(/The refund is saved and the sale has been moved to the refunded records/i)).toBeInTheDocument()
      expect(screen.getByText('Restocked')).toBeInTheDocument()
    })

    // Click "Print receipt" in success modal
    const printReceiptBtn = screen.getByRole('button', { name: /Print receipt/i })
    await user.click(printReceiptBtn)

    await waitFor(() => {
      expect(eventListener).toHaveBeenCalledTimes(1)
      const event = eventListener.mock.calls[0][0] as CustomEvent
      expect(event.detail).toEqual({ reference: 'SL-SUCCESS-1', currency: 'USD' })
    })

    window.removeEventListener('phoneflow:open-refund-receipt', eventListener)
  })

  it('displays error alert on API failure without mutating trade queue or showing false success', async () => {
    const saleTrade: Trade = {
      ...mockTradeRecord,
      _id: 'tr-sale-fail',
      tradeNo: 'SL-FAIL-1',
      status: 'COMPLETED',
      warrantyDays: 30,
      createdAt: new Date().toISOString(),
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/refunds')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ trades: [saleTrade] }) } as Response
      }
      if (url.includes('/trades/tr-sale-fail/refund') && init?.method === 'POST') {
        return {
          ok: false,
          status: 409,
          headers: new Headers(),
          json: async () => ({ message: 'Returned item is no longer linked to inventory' }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<RefundsPage user={mockOwnerUser} />)

    await waitFor(() => {
      expect(screen.getAllByText('SL-FAIL-1').length).toBeGreaterThan(0)
    })

    const reasonInput = screen.getByPlaceholderText(/Example: Item is faulty/i)
    await user.type(reasonInput, 'Item broken on delivery')
    await user.selectOptions(screen.getByRole('combobox'), 'RESTOCK')
    const confirmInput = screen.getByPlaceholderText('Type SL-FAIL-1')
    await user.type(confirmInput, 'SL-FAIL-1')

    await user.click(screen.getByRole('button', { name: /Record full refund/i }))

    // Error alert is displayed
    await waitFor(() => {
      const errorNotice = screen.getByRole('alert')
      expect(errorNotice).toHaveTextContent(/Returned item is no longer linked to inventory/i)
    })

    // No success modal
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Inputs preserved
    expect(reasonInput).toHaveValue('Item broken on delivery')
    expect(confirmInput).toHaveValue('SL-FAIL-1')
  })

  it('prevents in-flight duplicate submission on rapid repeated clicks', async () => {
    const saleTrade: Trade = {
      ...mockTradeRecord,
      _id: 'tr-sale-inflight',
      tradeNo: 'SL-INFLIGHT-1',
      status: 'COMPLETED',
      warrantyDays: 30,
      createdAt: new Date().toISOString(),
    }

    let resolveRefund: (value: Response) => void = () => {}
    const refundPromise = new Promise<Response>((resolve) => {
      resolveRefund = resolve
    })

    let fetchCallCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/refunds')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ trades: [saleTrade] }) } as Response
      }
      if (url.includes('/trades/tr-sale-inflight/refund') && init?.method === 'POST') {
        fetchCallCount += 1
        return refundPromise
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<RefundsPage user={mockOwnerUser} />)

    await waitFor(() => {
      expect(screen.getAllByText('SL-INFLIGHT-1').length).toBeGreaterThan(0)
    })

    await user.type(screen.getByPlaceholderText(/Example: Item is faulty/i), 'Customer changed mind')
    await user.selectOptions(screen.getByRole('combobox'), 'NO_RESTOCK')
    await user.type(screen.getByPlaceholderText('Type SL-INFLIGHT-1'), 'SL-INFLIGHT-1')

    const submitBtn = screen.getByRole('button', { name: /Record full refund/i })
    expect(submitBtn).toBeEnabled()

    act(() => {
      const form = submitBtn.closest('form')!
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    // Button should show busy state and be disabled
    expect(screen.getByRole('button', { name: /Recording refund…/i })).toBeDisabled()

    // Second click should be blocked
    await user.click(screen.getByRole('button', { name: /Recording refund…/i }))
    expect(fetchCallCount).toBe(1)

    // Resolve request
    resolveRefund({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        trade: {
          ...saleTrade,
          status: 'RETURNED',
          refund: {
            amount: 100,
            refundedAt: new Date().toISOString(),
            reason: 'Customer changed mind',
            inventoryDisposition: 'NO_RESTOCK',
          },
        },
      }),
    } as Response)

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /SL-INFLIGHT-1 refunded/i })).toBeInTheDocument()
    })
  })

  it('correctly displays KHR currency in queue and refund review panel', async () => {
    const khrSale: Trade = {
      ...mockTradeRecord,
      _id: 'tr-sale-khr',
      tradeNo: 'SL-KHR-1',
      status: 'COMPLETED',
      warrantyDays: 14,
      createdAt: new Date().toISOString(),
      currency: 'KHR',
      transactionAmountPaid: 410000,
      amountPaid: 100,
      transactionTotal: 410000,
      total: 100,
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ trades: [khrSale] }),
    } as Response)

    render(<RefundsPage user={mockOwnerUser} />)

    await waitFor(() => {
      expect(screen.getAllByText('SL-KHR-1').length).toBeGreaterThan(0)
    })

    // Expect KHR currency with 410,000 KHR
    expect(screen.getAllByText(/410,000\s*KHR/).length).toBeGreaterThan(0)
  })

  it('blocks refund when sale warranty is expired or recorded with 0 days', async () => {
    const expiredSale: Trade = {
      ...mockTradeRecord,
      _id: 'tr-expired',
      tradeNo: 'SL-EXPIRED-1',
      status: 'COMPLETED',
      warrantyDays: 7,
      warrantyExpiresAt: '2020-01-01T00:00:00.000Z',
      createdAt: '2019-12-25T00:00:00.000Z',
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ trades: [expiredSale] }),
    } as Response)

    render(<RefundsPage user={mockOwnerUser} />)

    await waitFor(() => {
      expect(screen.getAllByText('SL-EXPIRED-1').length).toBeGreaterThan(0)
    })

    expect(screen.getAllByText('Warranty expired').length).toBeGreaterThan(0)
    expect(screen.getByText('A refund cannot be recorded for this sale.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Record full refund/i })).not.toBeInTheDocument()
  })

  it('supports search and scanner modal workflow to find sale by barcode/tradeNo', async () => {
    const sale1: Trade = { ...mockTradeRecord, _id: 'tr-1', tradeNo: 'SL-ALPHA', status: 'COMPLETED', warrantyDays: 14, createdAt: new Date().toISOString() }
    const sale2: Trade = { ...mockTradeRecord, _id: 'tr-2', tradeNo: 'SL-BETA', status: 'COMPLETED', warrantyDays: 14, createdAt: new Date().toISOString() }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ trades: [sale1, sale2] }),
    } as Response)

    const user = userEvent.setup()
    render(<RefundsPage user={mockOwnerUser} />)

    await waitFor(() => {
      expect(screen.getAllByText('SL-ALPHA').length).toBeGreaterThan(0)
      expect(screen.getAllByText('SL-BETA').length).toBeGreaterThan(0)
    })

    // Filter by search input
    const searchInput = screen.getByPlaceholderText(/Search receipt, customer, phone, or item/i)
    await user.type(searchInput, 'ALPHA')

    expect(screen.getAllByText('SL-ALPHA').length).toBeGreaterThan(0)
    expect(screen.queryByText('SL-BETA')).not.toBeInTheDocument()

    // Clear search
    await user.clear(searchInput)
    expect(screen.getAllByText('SL-BETA').length).toBeGreaterThan(0)

    // Open scanner modal
    const scanBtn = screen.getByRole('button', { name: /Scan receipt/i })
    await user.click(scanBtn)

    expect(screen.getByRole('heading', { name: 'Scan receipt' })).toBeInTheDocument()

    // Enter invalid barcode
    const barcodeInput = screen.getByPlaceholderText(/Scan or enter sale number/i)
    await user.type(barcodeInput, 'NONEXISTENT')
    await user.click(screen.getByRole('button', { name: 'Find sale' }))

    expect(screen.getByRole('alert')).toHaveTextContent(/No sale matched that code/i)

    // Enter valid barcode
    await user.clear(barcodeInput)
    await user.type(barcodeInput, 'SL-BETA')
    await user.click(screen.getByRole('button', { name: 'Find sale' }))

    // Scanner modal should close and SL-BETA should be selected
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Scan receipt' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Type SL-BETA')).toBeInTheDocument()
    })
  })

  it('clear button resets all form inputs and cleared errors', async () => {
    const saleTrade: Trade = {
      ...mockTradeRecord,
      _id: 'tr-sale-clear',
      tradeNo: 'SL-CLEAR-1',
      status: 'COMPLETED',
      warrantyDays: 14,
      createdAt: new Date().toISOString(),
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ trades: [saleTrade] }),
    } as Response)

    const user = userEvent.setup()
    render(<RefundsPage user={mockOwnerUser} />)

    await waitFor(() => {
      expect(screen.getAllByText('SL-CLEAR-1').length).toBeGreaterThan(0)
    })

    const reasonInput = screen.getByPlaceholderText(/Example: Item is faulty/i)
    await user.type(reasonInput, 'Testing clear button')
    await user.selectOptions(screen.getByRole('combobox'), 'RESTOCK')
    const confirmInput = screen.getByPlaceholderText('Type SL-CLEAR-1')
    await user.type(confirmInput, 'SL-CLEAR-1')

    const clearBtn = screen.getByRole('button', { name: 'Clear' })
    await user.click(clearBtn)

    expect(reasonInput).toHaveValue('')
    expect(confirmInput).toHaveValue('')
    expect(screen.getByRole('combobox')).toHaveValue('')
  })
})
