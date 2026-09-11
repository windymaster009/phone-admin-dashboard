import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReportsPage from './ReportsPage'
import { RouterProvider } from '../../app/routing'

const mockCustomer = {
  _id: 'cust-1',
  name: 'Sokha Chan',
  phone: '012345678',
  nationalIdNumber: '010203040',
  address: 'Phnom Penh, Cambodia',
  notes: 'VIP customer',
  createdAt: '2026-01-15T00:00:00.000Z',
}

const mockCustomerActivity = {
  customer: mockCustomer,
  period: { key: 'all_time', label: 'All history', start: null, end: null },
  summary: {
    sales: { count: 1, usdEquivalent: 450, KHR: 0 },
    purchases: { count: 0, usdEquivalent: 0, KHR: 0 },
    pawned: { count: 0, usdEquivalent: 0, KHR: 0 },
  },
  activities: [
    {
      id: 'act-1',
      kind: 'SALE',
      reference: 'INV-001',
      occurredAt: '2026-02-01T10:00:00.000Z',
      currency: 'USD',
      amount: 450,
      title: 'iPhone 13 128GB',
      status: 'COMPLETED',
    },
  ],
  limited: false,
}

const mockSupplier = {
  _id: 'supp-1',
  name: 'Mega Tech Supplier',
  phone: '098765432',
  nationalIdNumber: '998877665',
  notes: 'Primary screen distributor',
  createdAt: '2026-01-10T00:00:00.000Z',
}

const mockSupplierActivity = {
  supplier: mockSupplier,
  period: { key: 'all_time', label: 'All history', start: null, end: null },
  summary: {
    purchases: { count: 2, usdEquivalent: 1200, KHR: 0 },
  },
  activities: [
    {
      id: 'supp-act-1',
      kind: 'PURCHASE',
      reference: 'PO-100',
      occurredAt: '2026-02-10T09:00:00.000Z',
      currency: 'USD',
      amount: 1200,
      title: '10x OLED Replacement Panels',
      status: 'COMPLETED',
    },
  ],
  limited: false,
}

describe('Customer and Supplier Report Modals (DetailModal migration)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.history.pushState({}, '', '/reports')
  })

  it('renders CustomerReportModal through DetailModalShell with search, profile, and activity report', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/customers/cust-1/activity-report')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => mockCustomerActivity,
        } as Response
      }
      if (url.includes('/customers')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ customers: [mockCustomer] }),
        } as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({}),
      } as Response
    })

    const user = userEvent.setup()

    render(
      <RouterProvider>
        <ReportsPage />
      </RouterProvider>,
    )

    // Open customer report modal
    const customerCard = screen.getByRole('button', { name: /Customer report/i })
    await user.click(customerCard)

    // Verify modal is portaled under document.body
    const backdrop = document.body.querySelector('.detail-modal-backdrop')
    expect(backdrop).toBeInTheDocument()

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'customer-report-title')
    expect(dialog).toHaveClass('customer-report-modal')

    // Header checks
    expect(within(dialog).getByText('Customer report')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Find a customer' })).toHaveAttribute('id', 'customer-report-title')
    expect(screen.getByRole('button', { name: 'Close customer report' })).toBeInTheDocument()

    // Browser list & selection
    await waitFor(() => {
      expect(screen.getByText(mockCustomer.name)).toBeInTheDocument()
    })

    // Click customer to view profile
    await user.click(screen.getByRole('button', { name: new RegExp(mockCustomer.name, 'i') }))
    expect(screen.getByRole('heading', { level: 4, name: mockCustomer.name })).toBeInTheDocument()
    expect(screen.getByText('VIP customer')).toBeInTheDocument()

    // Open activity report
    const openReportBtn = screen.getByRole('button', { name: /Open activity report/i })
    await user.click(openReportBtn)

    await waitFor(() => {
      expect(screen.getByText('Sales, purchases, and pawn contracts linked to this customer.')).toBeInTheDocument()
      expect(screen.getByText('iPhone 13 128GB')).toBeInTheDocument()
    })

    // Back to profile
    const backToProfileBtn = screen.getByRole('button', { name: /Back to profile/i })
    await user.click(backToProfileBtn)
    expect(screen.getByText('VIP customer')).toBeInTheDocument()

    // Back to list
    const backToListBtn = screen.getByRole('button', { name: /Back to list/i })
    await user.click(backToListBtn)
    expect(screen.getByText('Select a customer')).toBeInTheDocument()

    // Click inside dialog should not close it
    await user.click(dialog)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Close via header button
    await user.click(screen.getByRole('button', { name: 'Close customer report' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes CustomerReportModal via Escape key and backdrop click', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ customers: [mockCustomer] }),
    } as Response)

    const user = userEvent.setup()

    render(
      <RouterProvider>
        <ReportsPage />
      </RouterProvider>,
    )

    // Open and close with Escape
    await user.click(screen.getByRole('button', { name: /Customer report/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Open and close with backdrop click
    await user.click(screen.getByRole('button', { name: /Customer report/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    const backdrop = document.body.querySelector('.detail-modal-backdrop')!
    await user.click(backdrop)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders SupplierReportModal through DetailModalShell with search, profile, and purchase report', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/suppliers/supp-1/activity-report')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => mockSupplierActivity,
        } as Response
      }
      if (url.includes('/suppliers')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ suppliers: [mockSupplier] }),
        } as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({}),
      } as Response
    })

    const user = userEvent.setup()

    render(
      <RouterProvider>
        <ReportsPage />
      </RouterProvider>,
    )

    // Open supplier report modal
    const supplierCard = screen.getByRole('button', { name: /Supplier report/i })
    await user.click(supplierCard)

    // Verify modal is portaled under document.body
    const backdrop = document.body.querySelector('.detail-modal-backdrop')
    expect(backdrop).toBeInTheDocument()

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'supplier-report-title')
    expect(dialog).toHaveClass('customer-report-modal')
    expect(dialog).toHaveClass('supplier-report-modal')

    // Header checks
    expect(within(dialog).getByText('Supplier report')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Find a supplier' })).toHaveAttribute('id', 'supplier-report-title')
    expect(screen.getByRole('button', { name: 'Close supplier report' })).toBeInTheDocument()

    // Browser list & selection
    await waitFor(() => {
      expect(screen.getByText(mockSupplier.name)).toBeInTheDocument()
    })

    // Click supplier to view profile
    await user.click(screen.getByRole('button', { name: new RegExp(mockSupplier.name, 'i') }))
    expect(screen.getByRole('heading', { level: 4, name: mockSupplier.name })).toBeInTheDocument()
    expect(screen.getByText('Primary screen distributor')).toBeInTheDocument()

    // Open purchase report
    const openReportBtn = screen.getByRole('button', { name: /Open purchase report/i })
    await user.click(openReportBtn)

    await waitFor(() => {
      expect(screen.getByText('Purchases linked to this supplier.')).toBeInTheDocument()
      expect(screen.getByText('10x OLED Replacement Panels')).toBeInTheDocument()
    })

    // Back to profile
    const backToProfileBtn = screen.getByRole('button', { name: /Back to profile/i })
    await user.click(backToProfileBtn)
    expect(screen.getByText('Primary screen distributor')).toBeInTheDocument()

    // Back to list
    const backToListBtn = screen.getByRole('button', { name: /Back to list/i })
    await user.click(backToListBtn)
    expect(screen.getByText('Select a supplier')).toBeInTheDocument()

    // Close via header button
    await user.click(screen.getByRole('button', { name: 'Close supplier report' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes SupplierReportModal via Escape key and backdrop click', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ suppliers: [mockSupplier] }),
    } as Response)

    const user = userEvent.setup()

    render(
      <RouterProvider>
        <ReportsPage />
      </RouterProvider>,
    )

    // Open and close with Escape
    await user.click(screen.getByRole('button', { name: /Supplier report/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Open and close with backdrop click
    await user.click(screen.getByRole('button', { name: /Supplier report/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    const backdrop = document.body.querySelector('.detail-modal-backdrop')!
    await user.click(backdrop)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
