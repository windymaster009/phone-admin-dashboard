import { act, render, screen, waitFor, within } from '@testing-library/react'
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

  it('fits archive thermal reprints in the isolated print document', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => ({
      ok: true, status: 200, headers: new Headers(),
      json: async () => String(input).includes('/receipts/rec-1')
        ? { receipt: mockReceipt } : { receipts: [mockReceipt] },
    } as Response))
    const printDoc = document.implementation.createHTMLDocument()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 400 } as DOMRect)
    const print = vi.fn()
    const create = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
      const element = create(tag, options)
      if (tag === 'iframe') Object.defineProperty(element, 'contentWindow', {
        value: { document: printDoc, focus: vi.fn(), print },
      })
      return element
    })
    const user = userEvent.setup()
    render(<ReceiptCenterPage />)
    await user.click(await screen.findByRole('button', { name: 'Open receipt RCP-2026-0001' }))
    await user.click(screen.getByRole('button', { name: '80mm thermal' }))
    await user.click(screen.getByRole('button', { name: /Print \/ Save PDF/ }))
    await waitFor(() => { expect(print).toHaveBeenCalledOnce() })
    expect(printDoc.getElementById('receipt-page-size')?.textContent).toBe('@page{size:80mm 108mm;margin:0}')
    expect(printDoc.body.textContent).toContain('iPhone 13 128GB')
    expect(printDoc.body.textContent).toContain('$450')
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

  it('filters receipts by search text and shows empty state when no matching results', async () => {
    let queriedSearch = ''
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input), 'http://localhost')
      queriedSearch = url.searchParams.get('search') || ''
      if (queriedSearch === 'nonexistent') {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ receipts: [] }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ receipts: [mockReceipt] }) } as Response
    })

    const user = userEvent.setup()
    render(<ReceiptCenterPage />)

    await waitFor(() => {
      expect(screen.getAllByText('RCP-2026-0001').length).toBeGreaterThan(0)
    })

    const searchInput = screen.getByPlaceholderText(/Search receipt, reference, name or phone/i)
    await user.type(searchInput, 'nonexistent')

    await waitFor(() => {
      expect(screen.getByText('No receipt documents match these filters.')).toBeInTheDocument()
    })
  })

  it('displays error when opening a specific receipt fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/receipts/rec-1')) {
        return {
          ok: false,
          status: 400,
          headers: new Headers({ 'X-Request-ID': 'rec-err-1' }),
          json: async () => ({ message: 'Corrupt snapshot payload', requestId: 'rec-err-1' }),
        } as Response
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
      expect(screen.getByRole('alert')).toHaveTextContent(/Corrupt snapshot payload/i)
    })
  })

  it('cleans up temporary iframe when print preparation fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/receipts/rec-1/printed') && init?.method === 'POST') {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ receipt: mockReceipt }) } as Response
      }
      if (url.includes('/receipts/rec-1')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ receipt: mockReceipt }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ receipts: [mockReceipt] }) } as Response
    })

    // Mock document.createElement('iframe') to have contentWindow without document
    const origCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string, options?: any) => {
      const elem = origCreateElement(tagName, options)
      if (tagName.toLowerCase() === 'iframe') {
        Object.defineProperty(elem, 'contentWindow', {
          value: { document: null },
          writable: true,
        })
      }
      return elem
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
      expect(screen.getByRole('alert')).toHaveTextContent(/Cannot open print preview/i)
    })

    // Confirm that no leaked iframe remains in document.body
    expect(document.body.querySelectorAll('iframe').length).toBe(0)
  })

  it.each(['print failure', 'close before print', 'close during request'])('cleans up print job: %s', async (scenario) => {
    let resolveRequest!: (response: Response) => void
    const response = { ok: true, status: 200, headers: new Headers(), json: async () => ({ receipt: mockReceipt }) } as Response
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/printed') && scenario === 'close during request') return new Promise<Response>((resolve) => { resolveRequest = resolve })
      if (url.includes('/receipts/rec-1')) return response
      return { ...response, json: async () => ({ receipts: [mockReceipt] }) } as Response
    })
    const print = vi.fn(() => { throw new Error('Printing unavailable') })
    const createElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string, options?: ElementCreationOptions) => {
      const element = createElement(tagName, options)
      if (tagName === 'iframe') Object.defineProperty(element, 'contentWindow', { value: {
        document: document.implementation.createHTMLDocument(), focus: vi.fn(), print,
      } })
      return element
    })
    const user = userEvent.setup()
    render(<ReceiptCenterPage />)
    await user.click(await screen.findByRole('button', { name: 'Open receipt RCP-2026-0001' }))
    const dialog = await screen.findByRole('dialog', { name: mockReceipt.receiptNo })
    vi.useFakeTimers()
    await act(async () => { within(dialog).getByRole('button', { name: /Print \/ Save PDF/i }).click() })
    if (scenario !== 'print failure') {
      act(() => { within(dialog).getAllByRole('button', { name: 'Close' })[0].click() })
      if (scenario === 'close during request') await act(async () => { resolveRequest(response) })
      expect(document.querySelectorAll('iframe')).toHaveLength(0)
      await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
      expect(print).not.toHaveBeenCalled()
    } else {
      await act(async () => { await vi.advanceTimersByTimeAsync(250) })
      expect(within(dialog).getByRole('alert')).toHaveTextContent('Printing unavailable')
      expect(document.querySelectorAll('iframe')).toHaveLength(0)
      expect(within(dialog).getByRole('button', { name: /Print \/ Save PDF/i })).toBeEnabled()
    }
    vi.useRealTimers()
  })

  it('triggers refresh when clicking Refresh button', async () => {
    let callCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      callCount += 1
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ receipts: [mockReceipt] }) } as Response
    })

    const user = userEvent.setup()
    render(<ReceiptCenterPage />)

    await waitFor(() => {
      expect(callCount).toBeGreaterThanOrEqual(1)
    })

    const refreshBtn = screen.getByRole('button', { name: /Refresh/i })
    await user.click(refreshBtn)

    await waitFor(() => {
      expect(callCount).toBeGreaterThanOrEqual(2)
    })
  })

  it('renders varied document types with appropriate icons and labels', async () => {
    const variedReceipts: ReceiptRecord[] = [
      { ...mockReceipt, _id: 'rec-pur', receiptNo: 'PO-01', documentType: 'PURCHASE_RECEIPT' },
      { ...mockReceipt, _id: 'rec-svc', receiptNo: 'SVC-01', documentType: 'SERVICE_RECEIPT' },
      { ...mockReceipt, _id: 'rec-pwn', receiptNo: 'PW-01', documentType: 'PAWN_CONTRACT' },
      { ...mockReceipt, _id: 'rec-loan', receiptNo: 'LN-01', documentType: 'LOAN_AGREEMENT' },
    ]

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ receipts: variedReceipts }),
    } as Response)

    render(<ReceiptCenterPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Purchase receipt').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Service receipt').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Pawn contract').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Loan agreement').length).toBeGreaterThan(0)
    })
  })
})
