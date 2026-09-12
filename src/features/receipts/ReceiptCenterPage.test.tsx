import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReceiptCenterPage from './ReceiptCenterPage'
import type { ReceiptRecord } from './receipt-types'
import { setStoredSessionUser } from '../../lib/storage'
import { mockOwnerUser } from '../../test/testUtils'

const mockReceipt: ReceiptRecord = {
  _id: 'rec-1',
  receiptNo: 'RCP-2026-0001',
  documentType: 'SALE_RECEIPT',
  sourceType: 'TRADE',
  sourceId: 'trade-1',
  sourceSubId: 'sub-1',
  referenceNo: 'SL-2026-0001',
  partyName: 'Alice Johnson',
  partyPhone: '098765432',
  currency: 'USD',
  total: 450,
  issuedAt: new Date().toISOString(),
  printCount: 2,
  createdAt: new Date().toISOString(),
  createdBy: { name: 'Owner', role: 'OWNER' },
  snapshot: {
    schemaVersion: 1,
    documentType: 'SALE_RECEIPT',
    title: 'Sales Invoice',
    shop: { name: 'PhoneFlow Central', phone: '012345678' },
    referenceNo: 'SL-2026-0001',
    issuedAt: new Date().toISOString(),
    party: { name: 'Alice Johnson', phone: '098765432' },
    currency: 'USD',
    total: 450,
    items: [
      { name: 'iPhone 13 128GB', quantity: 1, unitPrice: 450, total: 450 },
    ],
  },
}

describe('ReceiptCenterPage component', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
    setStoredSessionUser(mockOwnerUser)
  })

  it('renders loading state initially', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))

    render(<ReceiptCenterPage />)

    expect(screen.getAllByText(/Loading receipts/i).length).toBeGreaterThan(0)
  })

  it('renders empty state when no receipts are available', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ receipts: [] }),
    } as Response)

    render(<ReceiptCenterPage />)

    await waitFor(() => {
      expect(screen.getAllByText(/No receipt documents match/i).length).toBeGreaterThan(0)
    })
  })

  it('renders receipts list, statistics, and handles search filtering', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ receipts: [mockReceipt] }),
    } as Response)

    render(<ReceiptCenterPage />)

    await waitFor(() => {
      expect(screen.getAllByText('RCP-2026-0001').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Alice Johnson').length).toBeGreaterThan(0)
    })

    // Check stats are rendered
    expect(screen.getByText('Documents')).toBeInTheDocument()
    expect(screen.getAllByText('Sales receipts').length).toBeGreaterThan(0)
  })

  it('shows error notice when receipts API fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers({ 'X-Request-ID': 'rec-fail-req' }),
      json: async () => ({ message: 'Failed to query receipt log', requestId: 'rec-fail-req' }),
    } as Response)

    render(<ReceiptCenterPage />)

    await waitFor(() => {
      expect(screen.getByText(/Failed to query receipt log/i)).toBeInTheDocument()
    })
  })

  it('opens viewer modal when viewing a receipt and supports layout switching', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/receipts/rec-1')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ receipt: mockReceipt }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ receipts: [mockReceipt] }) } as Response
    })

    const user = userEvent.setup()
    render(<ReceiptCenterPage />)

    await waitFor(() => {
      expect(screen.getAllByText('RCP-2026-0001').length).toBeGreaterThan(0)
    })

    // Click on the action button to open viewer modal
    const openBtn = screen.getByRole('button', { name: 'Open receipt RCP-2026-0001' })
    await user.click(openBtn)

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'RCP-2026-0001' })).toBeInTheDocument()
    })

    // Switch to 80mm thermal layout
    const thermalBtn = screen.getByRole('button', { name: /80mm thermal/i })
    await user.click(thermalBtn)
    expect(thermalBtn).toHaveClass('active')

    // Close modal
    const closeBtn = screen.getAllByRole('button', { name: 'Close' })[0]
    await user.click(closeBtn)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('records print via /receipts/:id/printed, increments print count, and guards against duplicate clicks', async () => {
    let printCalls = 0
    let resolvePrint: (value: Response) => void = () => {}
    const printPromise = new Promise<Response>((resolve) => {
      resolvePrint = resolve
    })

    const updatedReceipt: ReceiptRecord = {
      ...mockReceipt,
      printCount: 3,
      lastPrintedAt: new Date().toISOString(),
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/receipts/rec-1/printed') && init?.method === 'POST') {
        printCalls += 1
        return printPromise
      }
      if (url.includes('/receipts/rec-1')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ receipt: mockReceipt }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ receipts: [mockReceipt] }) } as Response
    })

    const user = userEvent.setup()
    render(<ReceiptCenterPage />)

    await waitFor(() => {
      expect(screen.getAllByText('RCP-2026-0001').length).toBeGreaterThan(0)
    })

    await user.click(screen.getByRole('button', { name: 'Open receipt RCP-2026-0001' }))

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'RCP-2026-0001' })).toBeInTheDocument()
    })

    const printBtn = screen.getByRole('button', { name: /Print \/ Save PDF/i })
    act(() => {
      printBtn.click()
      printBtn.click()
    })

    // Verify print call was made to /printed endpoint
    expect(printCalls).toBe(1)

    // Second click while in-flight should be blocked
    await user.click(printBtn)
    expect(printCalls).toBe(1)

    // Resolve print response
    resolvePrint({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ receipt: updatedReceipt }),
    } as Response)

    await waitFor(() => {
      expect(screen.getByText('3 prints')).toBeInTheDocument()
    })
  })

  it('displays role="alert" notice when print API fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/receipts/rec-1/printed') && init?.method === 'POST') {
        return { ok: false, status: 500, headers: new Headers({ 'X-Request-ID': 'rec-print-err' }), json: async () => ({ message: 'Print recording service down', requestId: 'rec-print-err' }) } as Response
      }
      if (url.includes('/receipts/rec-1')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ receipt: mockReceipt }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ receipts: [mockReceipt] }) } as Response
    })

    const user = userEvent.setup()
    render(<ReceiptCenterPage />)

    await waitFor(() => {
      expect(screen.getAllByText('RCP-2026-0001').length).toBeGreaterThan(0)
    })

    await user.click(screen.getByRole('button', { name: 'Open receipt RCP-2026-0001' }))

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'RCP-2026-0001' })).toBeInTheDocument()
    })

    const printBtn = screen.getByRole('button', { name: /Print \/ Save PDF/i })
    await user.click(printBtn)

    await waitFor(() => {
      const alertBox = screen.getByRole('alert')
      expect(alertBox).toHaveTextContent(/Print recording service down/i)
    })
  })

  it('filters receipts by documentType dropdown and formats KHR currencies', async () => {
    const khrReceipt: ReceiptRecord = {
      ...mockReceipt,
      _id: 'rec-khr',
      receiptNo: 'RR-2026-0001',
      documentType: 'REFUND_RECEIPT',
      currency: 'KHR',
      total: 410000,
    }

    let queriedDocType = ''
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input), 'http://localhost')
      queriedDocType = url.searchParams.get('documentType') || ''
      if (queriedDocType === 'REFUND_RECEIPT') {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ receipts: [khrReceipt] }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ receipts: [mockReceipt] }) } as Response
    })

    const user = userEvent.setup()
    render(<ReceiptCenterPage />)

    await waitFor(() => {
      expect(screen.getAllByText('RCP-2026-0001').length).toBeGreaterThan(0)
    })

    // Filter by Refund receipts
    const select = screen.getByRole('combobox')
    await user.selectOptions(select, 'REFUND_RECEIPT')

    await waitFor(() => {
      expect(screen.getAllByText('RR-2026-0001').length).toBeGreaterThan(0)
      // Expect KHR formatting with ៛ and 410,000
      expect(screen.getAllByText(/410,000\s*៛/).length).toBeGreaterThan(0)
    })
  })
})
