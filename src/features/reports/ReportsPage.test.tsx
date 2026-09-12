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

describe('Sales Report View', () => {
  const mockSalesReportData = {
    period: { key: 'this_month', label: 'This Month', from: '2026-09-01', to: '2026-09-30' },
    filters: { paymentMethod: 'ALL', status: 'COMPLETED', staff: 'ALL' },
    summary: {
      salesRevenue: 5400,
      cogs: 3200,
      grossProfit: 2200,
      itemsSold: 6,
      transactions: 3,
      averageSale: 1800,
    },
    chart: [
      { key: '2026-09-01', label: '1 Sep', sales: 5400, cogs: 3200, grossProfit: 2200 },
    ],
    products: [
      { name: 'iPhone 13 128GB', quantity: 4, revenue: 3600, cogs: 2200, grossProfit: 1400 },
      { name: 'AirPods Pro 2', quantity: 2, revenue: 1800, cogs: 1000, grossProfit: 800 },
    ],
    payments: [
      { method: 'CASH', amount: 3600, transactions: 2 },
      { method: 'KHQR', amount: 1800, transactions: 1 },
    ],
    staff: [
      { _id: 'staff-1', name: 'Sophea Staff' },
    ],
    transactions: [
      {
        _id: 'sale-1',
        tradeNo: 'INV-2026-0001',
        type: 'SELL',
        customer: { name: 'Sokha Chan' },
        items: [{ name: 'iPhone 13 128GB', quantity: 2, price: 900 }],
        subtotal: 1800,
        discount: 0,
        total: 1800,
        reportTotal: 1800,
        reportCost: 1100,
        reportGrossProfit: 700,
        paymentMethod: 'CASH',
        status: 'COMPLETED',
        createdAt: '2026-09-02T10:00:00.000Z',
        createdBy: { name: 'Sophea Staff' },
      },
    ],
    totalRecords: 1,
    limited: false,
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders sales summary cards, products breakdown, payments breakdown, and transactions agreeing with filters', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => mockSalesReportData,
      } as Response
    })

    window.history.pushState({}, '', '/reports/sales')
    render(
      <RouterProvider>
        <ReportsPage />
      </RouterProvider>,
    )

    // Wait for report to load
    const summaryElement = await screen.findByLabelText('Sales report summary')
    const summary = within(summaryElement)
    expect(summary.getByText('$5,400')).toBeInTheDocument() // Sales Revenue
    expect(summary.getByText('$3,200')).toBeInTheDocument() // COGS
    expect(summary.getByText('$2,200')).toBeInTheDocument() // Gross Profit
    expect(summary.getByText('6')).toBeInTheDocument() // Items Sold
    expect(summary.getByText('3')).toBeInTheDocument() // Transactions
    expect(summary.getByText('$1,800')).toBeInTheDocument() // Average Sale

    // Top Products breakdown agreements
    expect(screen.getByText('iPhone 13 128GB')).toBeInTheDocument()
    expect(screen.getAllByText('$3,600')).toHaveLength(2) // iPhone revenue + Cash payment amount
    expect(screen.getByText('AirPods Pro 2')).toBeInTheDocument()

    // Payment methods breakdown agreement ($3,600 Cash + $1,800 KHQR = $5,400)
    expect(screen.getAllByText('Cash').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Khqr').length).toBeGreaterThan(0)

    // Transaction rows (desktop + mobile)
    expect(screen.getAllByText('INV-2026-0001').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Sokha Chan').length).toBeGreaterThan(0)
  })

  it('filters by payment method and triggers API with paymentMethod query parameter', async () => {
    const requestedUrls: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      requestedUrls.push(url)
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => mockSalesReportData,
      } as Response
    })

    window.history.pushState({}, '', '/reports/sales')
    const user = userEvent.setup()

    render(
      <RouterProvider>
        <ReportsPage />
      </RouterProvider>,
    )

    await screen.findByLabelText('Sales report summary')

    const methodSelect = screen.getByLabelText(/Payment method/i) as HTMLSelectElement
    await user.selectOptions(methodSelect, 'KHQR')

    await waitFor(() => {
      const lastUrl = requestedUrls[requestedUrls.length - 1]
      expect(lastUrl).toContain('paymentMethod=KHQR')
    })
  })

  it('discards stale response when sales filter changes rapidly', async () => {
    let resolveCash: (val: Response) => void
    const cashPromise = new Promise<Response>((res) => {
      resolveCash = res
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('paymentMethod=CASH')) {
        return cashPromise
      }
      if (url.includes('paymentMethod=KHQR')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            ...mockSalesReportData,
            summary: { ...mockSalesReportData.summary, salesRevenue: 9999 },
          }),
        } as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => mockSalesReportData,
      } as Response
    })

    window.history.pushState({}, '', '/reports/sales')
    const user = userEvent.setup()

    render(
      <RouterProvider>
        <ReportsPage />
      </RouterProvider>,
    )

    await waitFor(() => {
      const summary = within(screen.getByLabelText('Sales report summary'))
      expect(summary.getByText('$5,400')).toBeInTheDocument()
    })

    const methodSelect = screen.getByLabelText(/Payment method/i) as HTMLSelectElement

    // Select CASH (slow)
    await user.selectOptions(methodSelect, 'CASH')

    // Immediately select KHQR (fast)
    await user.selectOptions(methodSelect, 'KHQR')

    await waitFor(() => {
      const summary = within(screen.getByLabelText('Sales report summary'))
      expect(summary.getByText('$9,999')).toBeInTheDocument()
    })

    // Now CASH resolves with 3333
    resolveCash!({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        ...mockSalesReportData,
        summary: { ...mockSalesReportData.summary, salesRevenue: 3333 },
      }),
    } as Response)

    // Wait and verify $9,999 is retained and $3,333 is ignored
    await new Promise((r) => setTimeout(r, 50))
    const finalSummary = within(screen.getByLabelText('Sales report summary'))
    expect(finalSummary.getByText('$9,999')).toBeInTheDocument()
    expect(finalSummary.queryByText('$3,333')).not.toBeInTheDocument()
  })

  it('renders error alert with role="alert" when sales report API fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers({ 'X-Request-ID': 'req-sales-err' }),
      json: async () => ({ message: 'Failed to aggregate sales metrics', requestId: 'req-sales-err' }),
    } as Response)

    window.history.pushState({}, '', '/reports/sales')
    render(
      <RouterProvider>
        <ReportsPage />
      </RouterProvider>,
    )

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toBeInTheDocument()
      expect(alert).toHaveTextContent(/Failed to aggregate sales metrics/i)
    })
  })
})

describe('Purchases Report View', () => {
  const mockPurchaseReportData = {
    period: { key: 'this_month', label: 'This Month', from: '2026-09-01', to: '2026-09-30' },
    filters: { source: 'ALL', paymentMethod: 'ALL', paymentStatus: 'ALL', status: 'COMPLETED', staff: 'ALL' },
    summary: {
      totalPurchases: 4500,
      amountPaid: 3500,
      outstandingBalance: 1000,
      itemsPurchased: 8,
      transactions: 2,
      averagePurchase: 2250,
    },
    chart: [
      { key: '2026-09-01', label: '1 Sep', total: 4500, paid: 3500, balance: 1000 },
    ],
    products: [
      { name: 'iPhone 14 Pro 128GB', quantity: 3, totalCost: 2400, averageUnitCost: 800, transactions: 1 },
    ],
    sources: [
      { source: 'SUPPLIER', amount: 3000, transactions: 1 },
      { source: 'WALK_IN', amount: 1500, transactions: 1 },
    ],
    payments: [
      { method: 'BANK', amount: 3500, transactions: 2 },
    ],
    staff: [
      { _id: 'staff-1', name: 'Sophea Staff' },
    ],
    transactions: [
      {
        _id: 'po-1',
        tradeNo: 'PO-2026-0001',
        type: 'BUY',
        sellerType: 'SUPPLIER',
        supplier: { name: 'Mega Tech' },
        items: [{ name: 'iPhone 14 Pro 128GB', quantity: 3, cost: 800 }],
        total: 2400,
        amountPaid: 2400,
        balance: 0,
        reportTotal: 2400,
        reportPaid: 2400,
        reportBalance: 0,
        currency: 'USD',
        paymentMethod: 'BANK',
        paymentStatus: 'PAID',
        status: 'COMPLETED',
        createdAt: '2026-09-03T11:00:00.000Z',
        createdBy: { name: 'Sophea Staff' },
      },
    ],
    totalRecords: 1,
    limited: false,
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders purchase summary cards, sources breakdown, products, and transactions agreeing with filters', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => mockPurchaseReportData,
      } as Response
    })

    window.history.pushState({}, '', '/reports/purchases')
    render(
      <RouterProvider>
        <ReportsPage />
      </RouterProvider>,
    )

    // Wait for report to load
    const summaryElement = await screen.findByLabelText('Purchases report summary')
    const summary = within(summaryElement)
    expect(summary.getByText('$4,500')).toBeInTheDocument() // Total Purchases
    expect(summary.getByText('$3,500')).toBeInTheDocument() // Amount Paid
    expect(summary.getByText('$1,000')).toBeInTheDocument() // Outstanding
    expect(summary.getByText('8')).toBeInTheDocument() // Items Purchased
    expect(summary.getByText('2')).toBeInTheDocument() // Transactions
    expect(summary.getByText('$2,250')).toBeInTheDocument() // Average Purchase

    // Products breakdown
    expect(screen.getByText('iPhone 14 Pro 128GB')).toBeInTheDocument()

    // Sources breakdown agreement ($3,000 Supplier + $1,500 Walk In = $4,500)
    expect(screen.getAllByText('Supplier').length).toBeGreaterThan(0)
    expect(screen.getByText('Walk In')).toBeInTheDocument()

    // Transactions table (desktop + mobile)
    expect(screen.getAllByText('PO-2026-0001').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Mega Tech').length).toBeGreaterThan(0)
  })

  it('filters by seller source and payment status triggering API query parameters', async () => {
    const requestedUrls: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      requestedUrls.push(url)
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => mockPurchaseReportData,
      } as Response
    })

    window.history.pushState({}, '', '/reports/purchases')
    const user = userEvent.setup()

    render(
      <RouterProvider>
        <ReportsPage />
      </RouterProvider>,
    )

    await screen.findByLabelText('Purchases report summary')

    const sourceSelect = screen.getByLabelText(/Seller source/i) as HTMLSelectElement
    await user.selectOptions(sourceSelect, 'SUPPLIER')

    await waitFor(() => {
      const lastUrl = requestedUrls[requestedUrls.length - 1]
      expect(lastUrl).toContain('source=SUPPLIER')
    })

    const paymentStatusSelect = screen.getByLabelText(/Payment status/i) as HTMLSelectElement
    await user.selectOptions(paymentStatusSelect, 'PAID')

    await waitFor(() => {
      const lastUrl = requestedUrls[requestedUrls.length - 1]
      expect(lastUrl).toContain('source=SUPPLIER')
      expect(lastUrl).toContain('paymentStatus=PAID')
    })
  })

  it('discards stale response when purchase filter changes rapidly', async () => {
    let resolveSupplier: (val: Response) => void
    const supplierPromise = new Promise<Response>((res) => {
      resolveSupplier = res
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('source=SUPPLIER')) {
        return supplierPromise
      }
      if (url.includes('source=CUSTOMER')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            ...mockPurchaseReportData,
            summary: { ...mockPurchaseReportData.summary, totalPurchases: 8888 },
          }),
        } as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => mockPurchaseReportData,
      } as Response
    })

    window.history.pushState({}, '', '/reports/purchases')
    const user = userEvent.setup()

    render(
      <RouterProvider>
        <ReportsPage />
      </RouterProvider>,
    )

    await waitFor(() => {
      const summary = within(screen.getByLabelText('Purchases report summary'))
      expect(summary.getByText('$4,500')).toBeInTheDocument()
    })

    const sourceSelect = screen.getByLabelText(/Seller source/i) as HTMLSelectElement

    // Select SUPPLIER (slow)
    await user.selectOptions(sourceSelect, 'SUPPLIER')

    // Immediately select CUSTOMER (fast)
    await user.selectOptions(sourceSelect, 'CUSTOMER')

    await waitFor(() => {
      const summary = within(screen.getByLabelText('Purchases report summary'))
      expect(summary.getByText('$8,888')).toBeInTheDocument()
    })

    // Now SUPPLIER resolves with 2222
    resolveSupplier!({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        ...mockPurchaseReportData,
        summary: { ...mockPurchaseReportData.summary, totalPurchases: 2222 },
      }),
    } as Response)

    // Wait and verify $8,888 is retained and $2,222 is ignored
    await new Promise((r) => setTimeout(r, 50))
    const finalSummary = within(screen.getByLabelText('Purchases report summary'))
    expect(finalSummary.getByText('$8,888')).toBeInTheDocument()
    expect(finalSummary.queryByText('$2,222')).not.toBeInTheDocument()
  })

  it('renders error alert with role="alert" when purchase report API fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers({ 'X-Request-ID': 'req-purch-err' }),
      json: async () => ({ message: 'Failed to aggregate purchase metrics', requestId: 'req-purch-err' }),
    } as Response)

    window.history.pushState({}, '', '/reports/purchases')
    render(
      <RouterProvider>
        <ReportsPage />
      </RouterProvider>,
    )

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toBeInTheDocument()
      expect(alert).toHaveTextContent(/Failed to aggregate purchase metrics/i)
    })
  })
})
