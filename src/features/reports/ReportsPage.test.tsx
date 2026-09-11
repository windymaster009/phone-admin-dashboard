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

describe('Operational Reports Mixed-Currency Visibility & Controls', () => {
  const mockPawnData = {
    title: 'Pawn Contracts',
    description: 'Pawn collateral and principal tracking.',
    meta: {
      currency: 'USD',
      currencyFilter: 'ALL',
      normalized: true,
      totalRecords: 2,
      limited: false,
      period: { key: 'all_time', label: 'All history', from: '2026-01-01', to: '2026-03-31' },
    },
    filters: { currency: 'ALL', period: 'all_time' },
    summary: [
      { label: 'Principal Lent', value: 250, format: 'currency', detail: 'USD equivalent across USD and KHR', tone: 'violet' },
    ],
    breakdowns: [],
    columns: [
      { key: 'date', label: 'Date', format: 'date' },
      { key: 'reference', label: 'Pawn #' },
      { key: 'party', label: 'Customer' },
      { key: 'item', label: 'Collateral' },
      { key: 'currency', label: 'Currency', format: 'status' },
      { key: 'principal', label: 'Principal', format: 'currency' },
      { key: 'outstanding', label: 'Outstanding', format: 'currency' },
      { key: 'paid', label: 'Paid', format: 'currency' },
      { key: 'dueDate', label: 'Due Date', format: 'date' },
      { key: 'status', label: 'Status', format: 'status' },
    ],
    rows: [
      { id: '1', reference: 'PW-001', party: 'Sokha', item: 'iPhone', currency: 'USD', principal: 100, outstanding: 75, paid: 25, dueDate: '2026-03-20', status: 'ACTIVE' },
      { id: '2', reference: 'PW-002', party: 'Dara', item: 'Samsung', currency: 'KHR', principal: 615000, outstanding: 410000, paid: 205000, dueDate: '2026-03-21', status: 'ACTIVE' },
    ],
    staff: [],
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('Pawn report defaults to ALL, provides 3 options, sends currency=ALL, and handles currency/period independence', async () => {
    const requestedUrls: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      requestedUrls.push(url)
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => mockPawnData,
      } as Response
    })

    window.history.pushState({}, '', '/reports/pawns')
    const user = userEvent.setup()

    render(
      <RouterProvider>
        <ReportsPage />
      </RouterProvider>,
    )

    // Wait for report to load
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /Pawn Contracts/i })).toBeInTheDocument()
    })

    // 1. Check default request has currency=ALL
    expect(requestedUrls[0]).toContain('/reports/pawns?')
    expect(requestedUrls[0]).toContain('currency=ALL')
    expect(requestedUrls[0]).toContain('period=all_time')

    // 2. Check currency selector and options
    const currencySelect = screen.getByLabelText(/Currency/i) as HTMLSelectElement
    expect(currencySelect.value).toBe('ALL')
    const options = Array.from(currencySelect.options).map((o) => ({ value: o.value, text: o.text }))
    expect(options).toEqual([
      { value: 'ALL', text: 'All currencies — totals in USD' },
      { value: 'USD', text: 'USD — US Dollar' },
      { value: 'KHR', text: 'KHR — Cambodian Riel' },
    ])

    // 3. Switch currency to USD -> sends currency=USD and retains period=all_time
    await user.selectOptions(currencySelect, 'USD')
    await waitFor(() => {
      const lastUrl = requestedUrls[requestedUrls.length - 1]
      expect(lastUrl).toContain('currency=USD')
      expect(lastUrl).toContain('period=all_time')
    })

    // 4. Switch period to 'this_month' -> sends period=this_month and retains currency=USD
    const periodSelect = screen.getByLabelText(/Period/i) as HTMLSelectElement
    await user.selectOptions(periodSelect, 'this_month')
    await waitFor(() => {
      const lastUrl = requestedUrls[requestedUrls.length - 1]
      expect(lastUrl).toContain('period=this_month')
      expect(lastUrl).toContain('currency=USD')
    })

    // 5. Switch currency to KHR -> sends currency=KHR and retains period=this_month
    await user.selectOptions(currencySelect, 'KHR')
    await waitFor(() => {
      const lastUrl = requestedUrls[requestedUrls.length - 1]
      expect(lastUrl).toContain('currency=KHR')
      expect(lastUrl).toContain('period=this_month')
    })
  })

  it('Mixed rows display their original currencies and correct formatting', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => mockPawnData,
      } as Response
    })

    window.history.pushState({}, '', '/reports/pawns')
    render(
      <RouterProvider>
        <ReportsPage />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getAllByText('PW-001').length).toBeGreaterThan(0)
      expect(screen.getAllByText('PW-002').length).toBeGreaterThan(0)
    })

    // Summary uses reporting currency ($250)
    expect(screen.getByText('$250')).toBeInTheDocument()

    const mobileList = document.querySelector('.operational-report-mobile-list')
    expect(mobileList).not.toBeNull()
    const mobile = within(mobileList as HTMLElement)

    // Mobile cards must retain the important financial fields, not only the first six API columns.
    expect(mobile.getByText('$100')).toBeInTheDocument()
    expect(mobile.getByText('615,000 KHR')).toBeInTheDocument()
    expect(mobile.getByText('$75')).toBeInTheDocument()
    expect(mobile.getByText('410,000 KHR')).toBeInTheDocument()
    expect(mobile.getAllByText('Paid')).toHaveLength(2)
  })

  it('Loans, Payments, and Services also default to ALL with currency options', async () => {
    const requestedUrls: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      requestedUrls.push(String(input))
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          title: 'Test Operational Report',
          description: 'Testing operational report currency.',
          meta: { currency: 'USD', totalRecords: 0, limited: false },
          filters: {},
          summary: [],
          breakdowns: [],
          columns: [{ key: 'id', label: 'ID' }],
          rows: [],
        }),
      } as Response
    })

    // Test loans
    window.history.pushState({}, '', '/reports/loans')
    const { unmount: unmountLoans } = render(
      <RouterProvider>
        <ReportsPage />
      </RouterProvider>,
    )
    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes('/reports/loans?') && u.includes('currency=ALL'))).toBe(true)
    })
    unmountLoans()

    // Test payments
    window.history.pushState({}, '', '/reports/payments')
    const { unmount: unmountPayments } = render(
      <RouterProvider>
        <ReportsPage />
      </RouterProvider>,
    )
    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes('/reports/payments?') && u.includes('currency=ALL'))).toBe(true)
    })
    unmountPayments()

    // Test services
    window.history.pushState({}, '', '/reports/services')
    const { unmount: unmountServices } = render(
      <RouterProvider>
        <ReportsPage />
      </RouterProvider>,
    )
    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes('/reports/services?') && u.includes('currency=ALL'))).toBe(true)
    })
    unmountServices()
  })

  it('Service report mobile cards keep the charge total and payment method visible', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        title: 'Service Charges Report',
        description: 'Service work.',
        meta: { currency: 'USD', currencyFilter: 'ALL', normalized: true, totalRecords: 1, limited: false },
        filters: { currency: 'ALL' },
        summary: [],
        breakdowns: [],
        columns: [
          { key: 'date', label: 'Date', format: 'dateTime' },
          { key: 'reference', label: 'Service #' },
          { key: 'service', label: 'Service' },
          { key: 'category', label: 'Category', format: 'status' },
          { key: 'party', label: 'Customer' },
          { key: 'quantity', label: 'Qty', format: 'number' },
          { key: 'currency', label: 'Currency', format: 'status' },
          { key: 'total', label: 'Total', format: 'currency' },
          { key: 'paymentMethod', label: 'Payment', format: 'status' },
          { key: 'status', label: 'Status', format: 'status' },
        ],
        rows: [{
          id: 'service-1', reference: 'SV-001', service: 'Data transfer', category: 'DATA_TRANSFER',
          party: 'Dara', quantity: 1, currency: 'KHR', total: 123000, paymentMethod: 'CASH', status: 'COMPLETED',
        }],
      }),
    } as Response)

    window.history.pushState({}, '', '/reports/services')
    render(<RouterProvider><ReportsPage /></RouterProvider>)

    await screen.findByRole('heading', { level: 2, name: 'Service Charges Report' })
    const mobileList = document.querySelector('.operational-report-mobile-list')
    expect(mobileList).not.toBeNull()
    const mobile = within(mobileList as HTMLElement)
    expect(mobile.getByText('123,000 KHR')).toBeInTheDocument()
    expect(mobile.getByText('Cash')).toBeInTheDocument()
  })

  it('Inventory report does not render currency selector and does not send currency parameter', async () => {
    const requestedUrls: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      requestedUrls.push(String(input))
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          title: 'Inventory Report',
          description: 'Testing inventory.',
          meta: { currency: 'USD', totalRecords: 0, limited: false },
          filters: {},
          summary: [],
          breakdowns: [],
          columns: [{ key: 'id', label: 'ID' }],
          rows: [],
        }),
      } as Response
    })

    window.history.pushState({}, '', '/reports/inventory')
    render(
      <RouterProvider>
        <ReportsPage />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes('/reports/inventory?'))).toBe(true)
    })

    // Must NOT have currency param
    const inventoryUrl = requestedUrls.find((u) => u.includes('/reports/inventory?'))!
    expect(inventoryUrl).not.toContain('currency=')

    // Must NOT render currency selector
    expect(screen.queryByLabelText(/Currency/i)).not.toBeInTheDocument()
  })
})
