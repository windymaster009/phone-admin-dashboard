import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReceiptCenterBridge from './ReceiptCenterBridge'
import type { ReceiptRecord } from './receipt-types'
import { setStoredSessionUser } from '../../lib/storage'
import { mockOwnerUser } from '../../test/testUtils'

const mockRefundReceipt: ReceiptRecord = {
  _id: 'rec-refund-1',
  receiptNo: 'RR-2026-0001',
  documentType: 'REFUND_RECEIPT',
  sourceType: 'TRADE',
  sourceId: 'trade-1',
  sourceSubId: 'refund',
  referenceNo: 'SL-2026-0001',
  partyName: 'Bob Smith',
  partyPhone: '012345678',
  currency: 'USD',
  total: 150,
  issuedAt: new Date().toISOString(),
  printCount: 0,
  createdAt: new Date().toISOString(),
  snapshot: {
    schemaVersion: 1,
    documentType: 'REFUND_RECEIPT',
    title: 'Refund Receipt',
    shop: { name: 'PhoneFlow Central', phone: '012345678' },
    referenceNo: 'SL-2026-0001',
    issuedAt: new Date().toISOString(),
    party: { name: 'Bob Smith', phone: '012345678', role: 'Customer' },
    currency: 'USD',
    total: 150,
    amountPaid: 150,
    balance: 0,
    paymentStatus: 'REFUNDED',
    transactionStatus: 'RETURNED',
    notes: 'Refund reason: Customer returned item\nReturned items were restored to available stock.',
    items: [
      { name: 'AirPods Pro 2', quantity: 1, unitPrice: 150, total: 150 },
    ],
    signatureLabels: ['Customer acknowledgement', 'Shop representative'],
  },
}

describe('ReceiptCenterBridge component', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
    setStoredSessionUser(mockOwnerUser)
  })

  it('listens for phoneflow:open-refund-receipt event and opens thermal receipt viewer', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/receipts/generate') && init?.method === 'POST') {
        return { ok: true, status: 201, headers: new Headers(), json: async () => ({ receipt: mockRefundReceipt, created: true }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    render(<ReceiptCenterBridge />)

    // Dispatch custom event
    act(() => { window.dispatchEvent(new CustomEvent('phoneflow:open-refund-receipt', {
      detail: { reference: 'SL-2026-0001', currency: 'USD' },
    })) })

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'RR-2026-0001' })).toBeInTheDocument()
      expect(screen.getAllByText(/Refund receipt/i).length).toBeGreaterThan(0)
      expect(screen.getByText(/Returned items were restored to available stock/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /80mm thermal/i })).toHaveClass('active')
    })
  })

  it('handles blocked popups gracefully with an error alert', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/receipts/generate') && init?.method === 'POST') {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ receipt: mockRefundReceipt }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    // Mock window.open to return null (popup blocked)
    vi.spyOn(window, 'open').mockReturnValue(null)

    const user = userEvent.setup()
    render(<ReceiptCenterBridge />)

    act(() => { window.dispatchEvent(new CustomEvent('phoneflow:open-refund-receipt', {
      detail: { reference: 'SL-2026-0001', currency: 'USD' },
    })) })

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'RR-2026-0001' })).toBeInTheDocument()
    })

    const printBtn = screen.getByRole('button', { name: /Print \/ Save PDF/i })
    act(() => {
      printBtn.click()
      printBtn.click()
    })

    await waitFor(() => {
      const alertNotice = screen.getByRole('alert')
      expect(alertNotice).toHaveTextContent(/blocked the print window/i)
    })
  })

  it('prevents duplicate print execution when already busy', async () => {
    let printCalls = 0
    let resolvePrint: (value: Response) => void = () => {}
    const printPromise = new Promise<Response>((resolve) => {
      resolvePrint = resolve
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/receipts/generate') && init?.method === 'POST') {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ receipt: mockRefundReceipt }) } as Response
      }
      if (url.includes('/receipts/rec-refund-1/printed') && init?.method === 'POST') {
        printCalls += 1
        return printPromise
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const mockDoc = {
      write: vi.fn(),
      close: vi.fn(),
      open: vi.fn(),
      body: document.createElement('body'),
      head: document.createElement('head'),
    }
    vi.spyOn(window, 'open').mockReturnValue({
      document: mockDoc,
      print: vi.fn(),
      close: vi.fn(),
      focus: vi.fn(),
    } as unknown as Window)

    const user = userEvent.setup()
    render(<ReceiptCenterBridge />)

    act(() => { window.dispatchEvent(new CustomEvent('phoneflow:open-refund-receipt', {
      detail: { reference: 'SL-2026-0001', currency: 'USD' },
    })) })

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'RR-2026-0001' })).toBeInTheDocument()
    })

    const printBtn = screen.getByRole('button', { name: /Print \/ Save PDF/i })
    act(() => {
      printBtn.click()
      printBtn.click()
    })

    expect(printCalls).toBe(1)
    expect(window.open).toHaveBeenCalledTimes(1)

    // Immediate second click while busy
    await user.click(printBtn)
    expect(printCalls).toBe(1)

    resolvePrint({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        receipt: { ...mockRefundReceipt, printCount: 1, lastPrintedAt: new Date().toISOString() },
      }),
    } as Response)

    await waitFor(() => {
      expect(screen.getByText('1 print')).toBeInTheDocument()
    })
  })

  it('renders and dismisses error toast when options fail to load', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
      json: async () => ({ message: 'Document reference was not found' }),
    } as Response)

    const user = userEvent.setup()
    render(<ReceiptCenterBridge />)

    act(() => { window.dispatchEvent(new CustomEvent('phoneflow:open-documents', {
      detail: { sourceType: 'TRADE', reference: 'NONEXISTENT' },
    })) })

    await waitFor(() => {
      const toast = screen.getByRole('alert')
      expect(toast).toHaveTextContent(/Document reference was not found/i)
    })

    // Dismiss toast
    const dismissBtn = screen.getByRole('button')
    await user.click(dismissBtn)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
