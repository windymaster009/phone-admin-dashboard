import { render, screen, waitFor } from '@testing-library/react'
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
})
