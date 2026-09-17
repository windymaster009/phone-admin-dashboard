import { act, render, screen, waitFor, within } from '@testing-library/react'
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
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 400 } as DOMRect)
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

    const mockDoc = document.implementation.createHTMLDocument()
    vi.spyOn(mockDoc, 'write')
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 400 } as DOMRect)
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

  it.each(['print failure', 'close before print', 'close during request'])('cleans up popup print job: %s', async (scenario) => {
    let resolveRequest!: (response: Response) => void
    const response = { ok: true, status: 200, headers: new Headers(), json: async () => ({ receipt: mockRefundReceipt }) } as Response
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).endsWith('/printed') && scenario === 'close during request') return new Promise<Response>((resolve) => { resolveRequest = resolve })
      return response
    })
    const popup = {
      document: document.implementation.createHTMLDocument(),
      focus: vi.fn(), close: vi.fn(), print: vi.fn(() => { throw new Error('Printing unavailable') }),
    }
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
    render(<ReceiptCenterBridge />)
    act(() => { window.dispatchEvent(new CustomEvent('phoneflow:open-refund-receipt', { detail: { reference: 'SL-2026-0001' } })) })
    const dialog = await screen.findByRole('dialog', { name: mockRefundReceipt.receiptNo })
    vi.useFakeTimers()
    await act(async () => { within(dialog).getByRole('button', { name: /Print \/ Save PDF/i }).click() })
    if (scenario !== 'print failure') {
      act(() => { within(dialog).getAllByRole('button', { name: 'Close' })[0].click() })
      if (scenario === 'close during request') await act(async () => { resolveRequest(response) })
      await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
      expect(popup.print).not.toHaveBeenCalled()
    } else {
      await act(async () => { await vi.advanceTimersByTimeAsync(220) })
      expect(within(dialog).getByRole('alert')).toHaveTextContent('Printing unavailable')
      expect(within(dialog).getByRole('button', { name: /Print \/ Save PDF/i })).toBeEnabled()
    }
    expect(popup.close).toHaveBeenCalled()
    vi.useRealTimers()
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

  it('detects trade detail modal in DOM, mounts action button, and opens option picker when multiple options exist', async () => {
    // Setup trade modal in DOM
    const tradeModal = document.createElement('div')
    tradeModal.className = 'trade-detail-modal'
    const h3 = document.createElement('h3')
    h3.textContent = 'SL-2026-0002'
    tradeModal.appendChild(h3)
    const footer = document.createElement('div')
    footer.className = 'detail-modal-footer'
    tradeModal.appendChild(footer)
    document.body.appendChild(tradeModal)

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/receipts/options')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            referenceNo: 'SL-2026-0002',
            options: [
              { documentType: 'SALE_RECEIPT', sourceSubId: 'sale-1', label: 'Sales receipt / invoice', issuedAt: new Date().toISOString(), amount: 100, currency: 'USD' },
              { documentType: 'REFUND_RECEIPT', sourceSubId: 'refund-1', label: 'Refund receipt', issuedAt: new Date().toISOString(), amount: 50, currency: 'USD' },
            ],
          }),
        } as Response
      }
      if (url.includes('/receipts/generate') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ receipt: mockRefundReceipt }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<ReceiptCenterBridge />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Print receipt' })).toBeInTheDocument()
    })

    // Click print receipt
    await user.click(screen.getByRole('button', { name: 'Print receipt' }))

    // Option picker modal should open
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'SL-2026-0002' })).toBeInTheDocument()
      expect(screen.getByText('Sales receipt / invoice')).toBeInTheDocument()
      expect(screen.getByText('Refund receipt')).toBeInTheDocument()
    })

    // Click on the refund receipt option
    await user.click(screen.getByRole('button', { name: /Refund receipt/i }))

    // Viewer modal opens
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'RR-2026-0001' })).toBeInTheDocument()
    })

    // Press Escape to close viewer modal
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    tradeModal.remove()
  })

  it('keeps the picker source independent of an underlying transaction modal', async () => {
    const tradeModal = document.createElement('div')
    tradeModal.className = 'trade-detail-modal'
    tradeModal.innerHTML = '<h3>SL-OTHER</h3><footer class="detail-modal-footer"></footer>'
    document.body.append(tradeModal)
    let payload: unknown
    let generateCalls = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input).includes('/receipts/options')) return {
        ok: true, status: 200, headers: new Headers(), json: async () => ({
          referenceNo: 'PW-SELECTED', options: [
            { documentType: 'PAWN_CONTRACT', sourceSubId: 'latest-contract', label: 'Selected pawn contract', amount: 100, currency: 'USD' },
            { documentType: 'PAWN_PAYMENT', sourceSubId: 'payment-1', label: 'Pawn payment', amount: 10, currency: 'USD' },
          ],
        }),
      } as Response
      generateCalls += 1
      payload = JSON.parse(String(init?.body))
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ receipt: mockRefundReceipt }) } as Response
    })
    try {
      render(<ReceiptCenterBridge />)
      act(() => { window.dispatchEvent(new CustomEvent('phoneflow:open-documents', { detail: { sourceType: 'PAWN', reference: 'PW-SELECTED' } })) })
      const picker = await screen.findByRole('dialog', { name: 'PW-SELECTED' })
      const option = within(picker).getByRole('button', { name: /Selected pawn contract/ })
      act(() => { option.click(); option.click() })
      await screen.findByRole('dialog', { name: mockRefundReceipt.receiptNo })
      expect(payload).toMatchObject({ sourceType: 'PAWN', reference: 'PW-SELECTED', sourceSubId: 'latest-contract' })
      expect(generateCalls).toBe(1)
    } finally {
      await act(async () => { tradeModal.remove() })
    }
  })

  it('does not reopen a picker after its cancelled generation returns late', async () => {
    let finish!: (response: Response) => void
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).includes('/receipts/options')) return {
        ok: true, status: 200, headers: new Headers(), json: async () => ({
          referenceNo: 'PW-CANCELLED', options: [
            { documentType: 'PAWN_CONTRACT', sourceSubId: 'latest-contract', label: 'Contract', amount: 100, currency: 'USD' },
            { documentType: 'PAWN_PAYMENT', sourceSubId: 'payment-1', label: 'Payment', amount: 10, currency: 'USD' },
          ],
        }),
      } as Response
      // Deliberately emulate a response already in progress when cancellation occurs.
      return new Promise<Response>((resolve) => { finish = resolve })
    })
    render(<ReceiptCenterBridge />)
    act(() => { window.dispatchEvent(new CustomEvent('phoneflow:open-documents', { detail: { reference: 'PW-CANCELLED' } })) })
    const picker = await screen.findByRole('dialog', { name: 'PW-CANCELLED' })
    act(() => { within(picker).getByRole('button', { name: /Contract/ }).click() })
    act(() => { within(picker).getAllByRole('button', { name: 'Close' })[0].click() })
    await act(async () => { finish({ ok: true, status: 200, headers: new Headers(), json: async () => ({ receipt: mockRefundReceipt }) } as Response) })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('detects loan modal in DOM and mounts Documents action button', async () => {
    const loanModal = document.createElement('div')
    loanModal.className = 'loan-modal'
    const h2 = document.createElement('h2')
    h2.textContent = 'LN-2026-9999 - Borrower Alice'
    loanModal.appendChild(h2)
    const header = document.createElement('div')
    header.className = 'operation-modal-header'
    const headerContent = document.createElement('div')
    header.appendChild(headerContent)
    loanModal.appendChild(header)
    document.body.appendChild(loanModal)

    render(<ReceiptCenterBridge />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Documents' })).toBeInTheDocument()
    })

    loanModal.remove()
  })

  it('suppresses duplicate header button when loan modal already contains footer actions', async () => {
    const loanModal = document.createElement('div')
    loanModal.className = 'loan-modal'
    const h2 = document.createElement('h2')
    h2.textContent = 'LN-2026-9999 - Borrower Alice'
    loanModal.appendChild(h2)
    const header = document.createElement('div')
    header.className = 'operation-modal-header'
    const headerContent = document.createElement('div')
    header.appendChild(headerContent)
    loanModal.appendChild(header)
    const footer = document.createElement('div')
    footer.className = 'loan-detail-footer'
    loanModal.appendChild(footer)
    document.body.appendChild(loanModal)

    render(<ReceiptCenterBridge />)

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('button', { name: 'Documents' })).not.toBeInTheDocument()

    loanModal.remove()
  })

  it('handles phoneflow:open-loan-receipt custom event and opens 80mm thermal viewer', async () => {
    let generatedBody: any = null
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/receipts/generate') && init?.method === 'POST') {
        generatedBody = JSON.parse(String(init.body))
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            receipt: {
              ...mockRefundReceipt,
              documentType: generatedBody.documentType,
              referenceNo: generatedBody.reference,
              sourceType: 'LOAN',
            },
          }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    render(<ReceiptCenterBridge />)

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-loan-receipt', {
        detail: { reference: 'LN-20260917-SPP3M0', documentType: 'LOAN_AGREEMENT', layout: 'THERMAL' },
      }))
    })

    await waitFor(() => {
      expect(generatedBody).toMatchObject({
        sourceType: 'LOAN',
        reference: 'LN-20260917-SPP3M0',
        documentType: 'LOAN_AGREEMENT',
      })
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /80mm thermal/i })).toHaveClass('active')
    })
  })

  it('handles phoneflow:open-pawn-ticket and phoneflow:open-trade-receipt custom events', async () => {
    let generatedDocType = ''
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/receipts/generate') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        generatedDocType = body.documentType
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ receipt: { ...mockRefundReceipt, documentType: generatedDocType } }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    render(<ReceiptCenterBridge />)

    // Dispatch open-pawn-ticket
    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-pawn-ticket', {
        detail: { reference: 'PW-2026-0001', sourceSubId: 'ticket-1' },
      }))
    })

    await waitFor(() => {
      expect(generatedDocType).toBe('PAWN_CONTRACT')
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Close modal
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // Dispatch open-trade-receipt with KHR currency
    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-trade-receipt', {
        detail: { reference: 'SL-2026-KHR', currency: 'KHR' },
      }))
    })

    await waitFor(() => {
      expect(generatedDocType).toBe('SALE_RECEIPT')
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  it('opens document picker for multi-part pawn contracts and previews selected extension ticket', async () => {
    const user = userEvent.setup()
    let generatedPayload: any = null

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/receipts/options') && url.includes('sourceType=PAWN')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            sourceType: 'PAWN',
            referenceNo: 'PW-2026-MULTI',
            options: [
              {
                documentType: 'PAWN_CONTRACT',
                sourceSubId: 'renewal:renewal-2',
                label: 'Pawn contract - Part 2',
                issuedAt: '2026-09-17T08:00:00.000Z',
                amount: 300,
                currency: 'USD',
              },
              {
                documentType: 'PAWN_CONTRACT',
                sourceSubId: 'contract',
                label: 'Pawn contract - Part 1',
                issuedAt: '2026-09-10T08:00:00.000Z',
                amount: 300,
                currency: 'USD',
              },
            ],
          }),
        } as Response
      }
      if (url.includes('/receipts/generate') && init?.method === 'POST') {
        generatedPayload = JSON.parse(String(init.body))
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            receipt: {
              ...mockRefundReceipt,
              _id: 'rec-pawn-part2',
              receiptNo: 'RCP-PW-P2',
              documentType: 'PAWN_CONTRACT',
              sourceType: 'PAWN',
              sourceId: 'pawn-multi',
              sourceSubId: generatedPayload.sourceSubId,
              referenceNo: 'PW-2026-MULTI',
              snapshot: {
                ...mockRefundReceipt.snapshot,
                documentType: 'PAWN_CONTRACT',
                title: 'Pawn Contract - Part 2',
                referenceNo: 'PW-2026-MULTI',
                ticketPart: 2,
                items: [{ name: 'iPhone 15', quantity: 1, unitPrice: 300, total: 300 }],
              },
            },
          }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    render(<ReceiptCenterBridge />)

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-documents', {
        detail: { sourceType: 'PAWN', reference: 'PW-2026-MULTI' },
      }))
    })

    // Option picker opens with Part 2 prominently as current contract, and Part 1 collapsed
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'PW-2026-MULTI' })).toBeInTheDocument()
      expect(screen.getByText('Current contract — Print for customer')).toBeInTheDocument()
      expect(screen.getByText('Pawn contract - Part 2')).toBeInTheDocument()
      expect(screen.getByText('Current')).toBeInTheDocument()
      expect(screen.getByText('Previous contract versions (1)')).toBeInTheDocument()
      expect(screen.queryByText('Pawn contract - Part 1')).not.toBeInTheDocument()
    })

    // Expanding previous versions reveals Part 1
    const toggleBtn = screen.getByRole('button', { name: /Previous contract versions/i })
    await user.click(toggleBtn)
    expect(screen.getByText('Pawn contract - Part 1')).toBeInTheDocument()

    // Select Part 2
    const part2Btn = screen.getByRole('button', { name: /Pawn contract - Part 2/i })
    await user.click(part2Btn)

    await waitFor(() => {
      expect(generatedPayload).toEqual({
        sourceType: 'PAWN',
        reference: 'PW-2026-MULTI',
        documentType: 'PAWN_CONTRACT',
        sourceSubId: 'renewal:renewal-2',
      })
      expect(screen.getByRole('dialog', { name: 'RCP-PW-P2' })).toBeInTheDocument()
      expect(screen.getByText(/Pawn ticket · Part 2/i)).toBeInTheDocument()
    })
  })

  it('preserves Part 1 as current contract when only interest payment is made and separates payment receipt', async () => {
    const user = userEvent.setup()
    let generatedPayload: any = null

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/receipts/options') && url.includes('sourceType=PAWN')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            sourceType: 'PAWN',
            referenceNo: 'PW-2026-INTEREST-ONLY',
            options: [
              {
                documentType: 'PAWN_CONTRACT',
                sourceSubId: 'contract',
                label: 'Pawn contract - Part 1',
                issuedAt: '2026-09-10T08:00:00.000Z',
                amount: 500,
                currency: 'USD',
              },
              {
                documentType: 'PAWN_PAYMENT',
                sourceSubId: 'payment-1',
                label: 'Interest payment receipt',
                issuedAt: '2026-09-17T08:00:00.000Z',
                amount: 25,
                currency: 'USD',
              },
            ],
          }),
        } as Response
      }
      if (url.includes('/receipts/generate') && init?.method === 'POST') {
        generatedPayload = JSON.parse(String(init.body))
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            receipt: {
              ...mockRefundReceipt,
              _id: 'rec-interest-payment',
              receiptNo: 'RCP-INT-1',
              documentType: generatedPayload.documentType,
              sourceType: 'PAWN',
              sourceId: 'pawn-interest-only',
              sourceSubId: generatedPayload.sourceSubId,
              referenceNo: 'PW-2026-INTEREST-ONLY',
              snapshot: {
                ...mockRefundReceipt.snapshot,
                documentType: generatedPayload.documentType,
                title: generatedPayload.documentType === 'PAWN_CONTRACT' ? 'Pawn Contract - Part 1' : 'Payment Receipt',
                referenceNo: 'PW-2026-INTEREST-ONLY',
              },
            },
          }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    render(<ReceiptCenterBridge />)

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-documents', {
        detail: { sourceType: 'PAWN', reference: 'PW-2026-INTEREST-ONLY' },
      }))
    })

    // Option picker opens: Part 1 is current, payment is under Payment receipts, NO previous versions
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'PW-2026-INTEREST-ONLY' })).toBeInTheDocument()
      expect(screen.getByText('Current contract — Print for customer')).toBeInTheDocument()
      expect(screen.getByText('Pawn contract - Part 1')).toBeInTheDocument()
      expect(screen.getByText('Current')).toBeInTheDocument()
      // Interest payment alone must not create previous contract versions
      expect(screen.queryByText(/Previous contract versions/i)).not.toBeInTheDocument()
      // Payment receipts section exists
      expect(screen.getByText('Payment receipts')).toBeInTheDocument()
      expect(screen.getByText('Interest payment receipt')).toBeInTheDocument()
    })

    // Selecting the payment receipt generates the payment receipt
    const paymentBtn = screen.getByRole('button', { name: /Interest payment receipt/i })
    await user.click(paymentBtn)

    await waitFor(() => {
      expect(generatedPayload).toEqual({
        sourceType: 'PAWN',
        reference: 'PW-2026-INTEREST-ONLY',
        documentType: 'PAWN_PAYMENT',
        sourceSubId: 'payment-1',
      })
      expect(screen.getByRole('dialog', { name: 'RCP-INT-1' })).toBeInTheDocument()
    })
  })

  it('handles multiple extensions with Part 3 as current and reprinting older parts from collapsed section', async () => {
    const user = userEvent.setup()
    let generatedPayload: any = null

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/receipts/options') && url.includes('sourceType=PAWN')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            sourceType: 'PAWN',
            referenceNo: 'PW-2026-EXT3',
            options: [
              {
                documentType: 'PAWN_CONTRACT',
                sourceSubId: 'renewal:renewal-3',
                label: 'Pawn contract - Part 3',
                issuedAt: '2026-09-17T12:00:00.000Z',
                amount: 300,
                currency: 'USD',
              },
              {
                documentType: 'PAWN_CONTRACT',
                sourceSubId: 'renewal:renewal-2',
                label: 'Pawn contract - Part 2',
                issuedAt: '2026-09-15T08:00:00.000Z',
                amount: 300,
                currency: 'USD',
              },
              {
                documentType: 'PAWN_CONTRACT',
                sourceSubId: 'contract',
                label: 'Pawn contract - Part 1',
                issuedAt: '2026-09-10T08:00:00.000Z',
                amount: 300,
                currency: 'USD',
              },
              {
                documentType: 'PAWN_PAYMENT',
                sourceSubId: 'payment-renewal-3',
                label: 'Extension payment receipt',
                issuedAt: '2026-09-17T12:00:00.000Z',
                amount: 15,
                currency: 'USD',
              },
            ],
          }),
        } as Response
      }
      if (url.includes('/receipts/generate') && init?.method === 'POST') {
        generatedPayload = JSON.parse(String(init.body))
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            receipt: {
              ...mockRefundReceipt,
              _id: 'rec-pawn-part1',
              receiptNo: 'RCP-PW-P1',
              documentType: 'PAWN_CONTRACT',
              sourceType: 'PAWN',
              sourceId: 'pawn-ext3',
              sourceSubId: generatedPayload.sourceSubId,
              referenceNo: 'PW-2026-EXT3',
              snapshot: {
                ...mockRefundReceipt.snapshot,
                documentType: 'PAWN_CONTRACT',
                title: 'Pawn Contract - Part 1',
                referenceNo: 'PW-2026-EXT3',
                ticketPart: 1,
              },
            },
          }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    render(<ReceiptCenterBridge />)

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-documents', {
        detail: { sourceType: 'PAWN', reference: 'PW-2026-EXT3' },
      }))
    })

    // Part 3 is current, Part 2 & Part 1 in collapsed section (2 versions)
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'PW-2026-EXT3' })).toBeInTheDocument()
      expect(screen.getByText('Current contract — Print for customer')).toBeInTheDocument()
      expect(screen.getByText('Pawn contract - Part 3')).toBeInTheDocument()
      expect(screen.getByText('Current')).toBeInTheDocument()
      expect(screen.getByText('Previous contract versions (2)')).toBeInTheDocument()
      expect(screen.queryByText('Pawn contract - Part 2')).not.toBeInTheDocument()
      expect(screen.queryByText('Pawn contract - Part 1')).not.toBeInTheDocument()
      expect(screen.getByText('Payment receipts')).toBeInTheDocument()
      expect(screen.getByText('Extension payment receipt')).toBeInTheDocument()
    })

    // Expand previous versions and click Part 1 to reprint older version
    const toggleBtn = screen.getByRole('button', { name: /Previous contract versions/i })
    await user.click(toggleBtn)

    expect(screen.getByText('Pawn contract - Part 2')).toBeInTheDocument()
    expect(screen.getByText('Pawn contract - Part 1')).toBeInTheDocument()

    const part1Btn = screen.getByRole('button', { name: /Pawn contract - Part 1/i })
    await user.click(part1Btn)

    await waitFor(() => {
      expect(generatedPayload).toEqual({
        sourceType: 'PAWN',
        reference: 'PW-2026-EXT3',
        documentType: 'PAWN_CONTRACT',
        sourceSubId: 'contract',
      })
      expect(screen.getByRole('dialog', { name: 'RCP-PW-P1' })).toBeInTheDocument()
    })
  })

  it('handles window.open throwing an exception and allows retry after error', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/receipts/generate') && init?.method === 'POST') {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ receipt: mockRefundReceipt }) } as Response
      }
      if (url.includes('/receipts/rec-refund-1/printed') && init?.method === 'POST') {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ receipt: { ...mockRefundReceipt, printCount: 1 } }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    // First attempt: window.open throws security error
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => {
      throw new Error('Blocked by security policy')
    })

    const user = userEvent.setup()
    render(<ReceiptCenterBridge />)

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-refund-receipt', {
        detail: { reference: 'SL-2026-0001', currency: 'USD' },
      }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'RR-2026-0001' })).toBeInTheDocument()
    })

    const printBtn = screen.getByRole('button', { name: /Print \/ Save PDF/i })
    await user.click(printBtn)

    // Should report blocked window without crashing
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/blocked the print window/i)
    })

    // Second deliberate attempt: window.open now succeeds
    const mockDoc = document.implementation.createHTMLDocument()
    vi.spyOn(mockDoc, 'write')
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 400 } as DOMRect)
    const print = vi.fn()
    openSpy.mockReturnValue({
      document: mockDoc,
      print,
      close: vi.fn(),
      focus: vi.fn(),
    } as unknown as Window)

    await user.click(printBtn)

    await waitFor(() => {
      expect(screen.getByText('1 print')).toBeInTheDocument()
    })
    await waitFor(() => { expect(print).toHaveBeenCalledOnce() })
    expect(mockDoc.getElementById('receipt-page-size')?.textContent).toBe('@page{size:80mm 108mm;margin:0}')
  })

  it('directly prepares preview when source has exactly one receipt option', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/receipts/options')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            referenceNo: 'SL-SINGLE-01',
            options: [
              { documentType: 'SALE_RECEIPT', sourceSubId: 'single', label: 'Sales receipt', issuedAt: new Date().toISOString(), amount: 200, currency: 'USD' },
            ],
          }),
        } as Response
      }
      if (url.includes('/receipts/generate') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ receipt: { ...mockRefundReceipt, documentType: 'SALE_RECEIPT', referenceNo: 'SL-SINGLE-01' } }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    render(<ReceiptCenterBridge />)

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-documents', {
        detail: { sourceType: 'TRADE', reference: 'SL-SINGLE-01' },
      }))
    })

    // Should bypass picker and directly open viewer modal
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'RR-2026-0001' })).toBeInTheDocument()
      expect(screen.queryByRole('dialog', { name: 'SL-SINGLE-01' })).not.toBeInTheDocument()
    })
  })

  it('allows user to dismiss option picker via Close button', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/receipts/options')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            referenceNo: 'SL-MULTI-02',
            options: [
              { documentType: 'SALE_RECEIPT', sourceSubId: 'opt-1', label: 'Sale 1', issuedAt: new Date().toISOString(), amount: 100, currency: 'USD' },
              { documentType: 'SALE_RECEIPT', sourceSubId: 'opt-2', label: 'Sale 2', issuedAt: new Date().toISOString(), amount: 200, currency: 'USD' },
            ],
          }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<ReceiptCenterBridge />)

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-documents', {
        detail: { sourceType: 'TRADE', reference: 'SL-MULTI-02' },
      }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'SL-MULTI-02' })).toBeInTheDocument()
    })

    // Click Close
    const closeBtns = screen.getAllByRole('button', { name: 'Close' })
    await user.click(closeBtns[0])

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('displays timeout alert when receipt generation is aborted', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/receipts/generate') && init?.method === 'POST') {
        const abortErr = new DOMException('The operation was aborted', 'AbortError')
        throw abortErr
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    render(<ReceiptCenterBridge />)

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-pawn-ticket', {
        detail: { reference: 'PW-ABORT-01' },
      }))
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/took too long to prepare/i)
    })
  })

  it('handles invalid receipt preview without _id and allows switching to A4 layout', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/receipts/generate') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ receipt: { ...mockRefundReceipt, _id: '' } }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    render(<ReceiptCenterBridge />)

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-trade-receipt', {
        detail: { reference: 'SL-NO-ID' },
      }))
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/without a valid preview/i)
    })
  })

  it('supports layout switching and printing in A4 layout from Bridge Viewer', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/receipts/generate') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ receipt: mockRefundReceipt }),
        } as Response
      }
      if (url.includes('/receipts/rec-refund-1/printed') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ receipt: { ...mockRefundReceipt, printCount: 1 } }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const mockDoc = document.implementation.createHTMLDocument()
    vi.spyOn(mockDoc, 'write')
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 400 } as DOMRect)
    vi.spyOn(window, 'open').mockReturnValue({
      document: mockDoc,
      print: vi.fn(),
      close: vi.fn(),
      focus: vi.fn(),
    } as unknown as Window)

    const user = userEvent.setup()
    render(<ReceiptCenterBridge />)

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-refund-receipt', {
        detail: { reference: 'SL-2026-0001' },
      }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'RR-2026-0001' })).toBeInTheDocument()
    })

    // Switch to A4
    const a4Btn = screen.getByRole('button', { name: /A4 invoice/i })
    await user.click(a4Btn)
    expect(a4Btn).toHaveClass('active')

    // Print in A4
    const printBtn = screen.getByRole('button', { name: /Print \/ Save PDF/i })
    await user.click(printBtn)

    await waitFor(() => {
      expect(mockDoc.write).toHaveBeenCalledWith(expect.stringContaining('@page{size:A4;margin:0}'))
    })
  })

  it('handles phoneflow:open-documents event, generates receipt for single option, and dispatches documents-opened event', async () => {
    const openedHandler = vi.fn()
    window.addEventListener('phoneflow:documents-opened', openedHandler)

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/receipts/options')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            sourceType: 'PAWN',
            referenceNo: 'PW-2026-TEST-DOC',
            options: [{
              documentType: 'PAWN_CONTRACT',
              sourceSubId: 'contract',
              label: 'Pawn contract - Part 1',
              issuedAt: new Date().toISOString(),
              amount: 100000,
              currency: 'KHR',
            }],
          }),
        } as Response
      }
      if (url.includes('/receipts/generate') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            receipt: {
              ...mockRefundReceipt,
              receiptNo: 'PC-2026-DOC-PREVIEW',
              documentType: 'PAWN_CONTRACT',
              referenceNo: 'PW-2026-TEST-DOC',
            },
          }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    render(<ReceiptCenterBridge />)

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-documents', {
        detail: { sourceType: 'PAWN', reference: 'PW-2026-TEST-DOC' },
      }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'PC-2026-DOC-PREVIEW' })).toBeInTheDocument()
      expect(openedHandler).toHaveBeenCalled()
    })

    window.removeEventListener('phoneflow:documents-opened', openedHandler)
  })

  it('handles phoneflow:open-documents failure and dispatches documents-error event', async () => {
    const errorHandler = vi.fn()
    window.addEventListener('phoneflow:documents-error', errorHandler)

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/receipts/options')) {
        return {
          ok: false,
          status: 404,
          headers: new Headers(),
          json: async () => ({ message: 'Pawn contract not found' }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    render(<ReceiptCenterBridge />)

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-documents', {
        detail: { sourceType: 'PAWN', reference: 'PW-NOT-FOUND' },
      }))
    })

    await waitFor(() => {
      expect(errorHandler).toHaveBeenCalled()
      const customEvent = errorHandler.mock.calls[0][0] as CustomEvent
      expect(customEvent.detail.message).toMatch(/Pawn contract not found/i)
    })

    window.removeEventListener('phoneflow:documents-error', errorHandler)
  })
})
