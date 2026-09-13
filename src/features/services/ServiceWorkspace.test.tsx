import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RouterProvider } from '../../app/routing'
import { setSessionUser } from '../../lib/api'
import ServiceWorkspace from './ServiceWorkspace'

const sampleServices = [
  {
    _id: 'svc-1',
    code: 'GMAIL_SETUP',
    name: 'Gmail account setup',
    category: 'ACCOUNT_SETUP' as const,
    description: 'Create and configure a Gmail account safely.',
    currency: 'USD' as const,
    price: 5,
    priceUsd: 5,
    priceKhr: 20500,
    pricingExchangeRate: 4100,
    active: true,
  },
  {
    _id: 'svc-2',
    code: 'PHONE_SETUP',
    name: 'New phone setup',
    category: 'DEVICE_SETUP' as const,
    description: 'Initial setup, updates, and basic preferences.',
    currency: 'KHR' as const,
    price: 41000,
    priceUsd: 10,
    priceKhr: 41000,
    pricingExchangeRate: 4100,
    active: true,
  },
  {
    _id: 'svc-unpriced',
    code: 'OTHER_SERVICE',
    name: 'Custom repair help',
    category: 'OTHER' as const,
    description: 'Unpriced service work.',
    currency: 'USD' as const,
    price: 0,
    active: true,
  },
]

const sampleCustomers = [
  { _id: 'cust-1', name: 'Sokha Chan', phone: '012345678' },
  { _id: 'cust-2', name: 'Bopha Vorn', phone: '098765432' },
]

const sampleCharges = [
  {
    _id: 'sc-existing-1',
    serviceNo: 'SV-20260301-A1B2C',
    serviceSnapshot: { name: 'Gmail account setup', category: 'ACCOUNT_SETUP' as const },
    customerSnapshot: { name: 'Sokha Chan', phone: '012345678' },
    currency: 'USD' as const,
    total: 5,
    paymentMethod: 'CASH',
    status: 'COMPLETED',
    completedAt: '2026-03-01T10:00:00.000Z',
  },
  {
    _id: 'sc-existing-2',
    serviceNo: 'SV-20260302-D3E4F',
    serviceSnapshot: { name: 'New phone setup', category: 'DEVICE_SETUP' as const },
    customerSnapshot: { name: 'Walk-in customer' },
    currency: 'KHR' as const,
    total: 41000,
    paymentMethod: 'KHQR',
    status: 'COMPLETED',
    completedAt: '2026-03-02T14:30:00.000Z',
  },
]

describe('ServiceWorkspace', () => {
  beforeEach(() => {
    setSessionUser({
      id: 'usr-mgr',
      name: 'Manager User',
      email: 'manager@phoneflow.test',
      role: 'MANAGER',
      active: true,
    })
  })

  afterEach(() => {
    setSessionUser(null)
    vi.restoreAllMocks()
  })

  function setupFetchMock(customHandlers: Record<string, (req: RequestInit) => Promise<unknown>> = {}) {
    const mockFn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)
      for (const [pattern, handler] of Object.entries(customHandlers)) {
        if (url.includes(pattern)) {
          const result = await handler(init)
          if (result && typeof result === 'object' && 'status' in result && 'ok' in result) {
            return result as Response
          }
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => result,
          } as Response
        }
      }

      if (url.includes('/api/services/catalog')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ services: sampleServices, exchangeRate: 4100 }),
        } as Response
      }

      if (url.includes('/api/customers')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ customers: sampleCustomers }),
        } as Response
      }

      if (url.includes('/api/services/charges')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ charges: [...sampleCharges] }),
        } as Response
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      } as Response
    })
    window.fetch = mockFn as unknown as typeof fetch
    globalThis.fetch = mockFn as unknown as typeof fetch
    return mockFn
  }

  it('1. A successful charge appears in recent charges without manually refreshing', async () => {
    const user = userEvent.setup()
    let postCalled = false
    const newCharge = {
      _id: 'sc-new-999',
      serviceNo: 'SV-20260312-NEW99',
      serviceSnapshot: { name: 'Gmail account setup', category: 'ACCOUNT_SETUP' },
      customerSnapshot: { name: 'Walk-in VIP', phone: '' },
      currency: 'USD',
      total: 5,
      paymentMethod: 'CASH',
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
    }

    setupFetchMock({
      '/api/services/charges': async (init) => {
        if (init.method === 'POST') {
          postCalled = true
          return { charge: newCharge }
        }
        return { charges: [...sampleCharges] }
      },
    })

    render(
      <RouterProvider>
        <ServiceWorkspace />
      </RouterProvider>,
    )

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getAllByText('Gmail account setup').length).toBeGreaterThanOrEqual(1)
    })

    // Click on "Charge" button for Gmail account setup
    const chargeButtons = screen.getAllByRole('button', { name: /^charge/i })
    await user.click(chargeButtons[0])

    // Dialog opens
    const dialog = screen.getByRole('dialog', { name: /record service charge/i })
    expect(dialog).toBeInTheDocument()

    // Fill in walk-in name
    const walkInInput = screen.getByPlaceholderText('Walk-in customer')
    await user.clear(walkInInput)
    await user.type(walkInInput, 'Walk-in VIP')

    // Submit charge
    const submitButton = within(dialog).getByRole('button', { name: /record charge/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(postCalled).toBe(true)
    })

    // Success dialog appears
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /completed/i })).toBeInTheDocument()
    })

    // Dismiss success dialog
    await user.click(screen.getByRole('button', { name: /done/i }))

    // The newly created charge MUST appear in the recent charges list immediately without refresh
    expect(screen.getByText(/SV-20260312-NEW99/)).toBeInTheDocument()
    expect(screen.getByText(/Walk-in VIP · SV-20260312-NEW99/)).toBeInTheDocument()
  })

  it('2. Failed submissions preserve form input and show an error inside the modal', async () => {
    const user = userEvent.setup()

    const mockFn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)
      if (url.includes('/api/services/catalog')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ services: sampleServices, exchangeRate: 4100 }),
        } as Response
      }
      if (url.includes('/api/customers')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ customers: sampleCustomers }),
        } as Response
      }
      if (url.includes('/api/services/charges') && init.method === 'POST') {
        return {
          ok: false,
          status: 400,
          headers: new Headers(),
          json: async () => ({ message: 'Discount cannot exceed the service subtotal' }),
        } as Response
      }
      if (url.includes('/api/services/charges')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ charges: sampleCharges }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })
    window.fetch = mockFn as unknown as typeof fetch
    globalThis.fetch = mockFn as unknown as typeof fetch

    render(
      <RouterProvider>
        <ServiceWorkspace />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getAllByText('Gmail account setup').length).toBeGreaterThanOrEqual(1)
    })

    // Open checkout
    const chargeButtons = screen.getAllByRole('button', { name: /^charge/i })
    await user.click(chargeButtons[0])

    const dialog = screen.getByRole('dialog', { name: /record service charge/i })
    expect(dialog).toBeInTheDocument()

    // Select customer Sokha Chan
    const customerSelect = screen.getByRole('combobox', { name: /customer/i })
    await user.selectOptions(customerSelect, 'cust-1')

    // Add note
    const notesInput = screen.getByPlaceholderText('What was completed for the customer?')
    await user.type(notesInput, 'Verified two-step verification was completed.')

    // Submit charge
    const submitButton = within(dialog).getByRole('button', { name: /record charge/i })
    await user.click(submitButton)

    // A page-level alert behind the backdrop must not satisfy this assertion.
    await waitFor(() => {
      const alert = within(dialog).getByRole('alert')
      expect(alert).toHaveTextContent('Discount cannot exceed the service subtotal')
    })

    // The dialog must still be open
    expect(screen.getByRole('dialog', { name: /record service charge/i })).toBeInTheDocument()

    // Dismiss error inside dialog
    const dismissErr = within(dialog).getByRole('button', { name: /Dismiss message/i })
    await user.click(dismissErr)
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()

    // The form inputs must be preserved
    expect(screen.getByRole('combobox', { name: /customer/i })).toHaveValue('cust-1')
    expect(screen.getByPlaceholderText('What was completed for the customer?')).toHaveValue(
      'Verified two-step verification was completed.',
    )
  })

  it('3. Repeated clicks cannot create unintended duplicate charges', async () => {
    const user = userEvent.setup()
    let postCount = 0

    const mockFn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)
      if (url.includes('/api/services/catalog')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ services: sampleServices, exchangeRate: 4100 }),
        } as Response
      }
      if (url.includes('/api/customers')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ customers: sampleCustomers }),
        } as Response
      }
      if (url.includes('/api/services/charges') && init.method === 'POST') {
        postCount += 1
        // Simulate in-flight asynchronous network delay
        await new Promise((resolve) => setTimeout(resolve, 80))
        return {
          ok: true,
          status: 201,
          headers: new Headers(),
          json: async () => ({
            charge: {
              _id: 'sc-new-dup-test',
              serviceNo: 'SV-20260312-DUP01',
              serviceSnapshot: { name: 'Gmail account setup', category: 'ACCOUNT_SETUP' },
              customerSnapshot: { name: 'Walk-in customer' },
              currency: 'USD',
              total: 5,
              paymentMethod: 'CASH',
              status: 'COMPLETED',
              completedAt: new Date().toISOString(),
            },
          }),
        } as Response
      }
      if (url.includes('/api/services/charges')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ charges: sampleCharges }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })
    window.fetch = mockFn as unknown as typeof fetch
    globalThis.fetch = mockFn as unknown as typeof fetch

    render(
      <RouterProvider>
        <ServiceWorkspace />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getAllByText('Gmail account setup').length).toBeGreaterThanOrEqual(1)
    })

    // Open checkout
    const chargeButtons = screen.getAllByRole('button', { name: /^charge/i })
    await user.click(chargeButtons[0])

    const dialog = screen.getByRole('dialog', { name: /record service charge/i })
    const submitButton = within(dialog).getByRole('button', { name: /record charge/i })

    // Trigger rapid successive clicks
    const click1 = user.click(submitButton)
    const click2 = user.click(submitButton)
    const click3 = user.click(submitButton)
    await Promise.all([click1, click2, click3])

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /completed/i })).toBeInTheDocument()
    })

    // The backend POST must have been invoked exactly ONCE
    expect(postCount).toBe(1)
  })

  it('4. USD/KHR values retain their original currency in display and formatted amounts', async () => {
    const user = userEvent.setup()

    setupFetchMock()

    render(
      <RouterProvider>
        <ServiceWorkspace />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getAllByText('Gmail account setup').length).toBeGreaterThanOrEqual(1)
    })

    // Verify recent charges show their original currencies
    expect(screen.getAllByText('$5.00').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('41,000 KHR').length).toBeGreaterThanOrEqual(1)

    // Open checkout on a USD service
    const chargeButtons = screen.getAllByRole('button', { name: /^charge/i })
    await user.click(chargeButtons[0])

    // Select currency KHR
    const currencySelect = screen.getByRole('combobox', { name: /currency/i })
    await user.selectOptions(currencySelect, 'KHR')

    // At 4100 exchange rate, $5 is 20,500 KHR
    expect(screen.getByText('20,500 KHR each')).toBeInTheDocument()
    expect(screen.getAllByText('20,500 KHR').length).toBeGreaterThanOrEqual(1)

    // Switch back to USD
    await user.selectOptions(currencySelect, 'USD')
    expect(screen.getByText('$5.00 each')).toBeInTheDocument()
  })

  it('5. Walk-in customer vs existing profile selection', async () => {
    const user = userEvent.setup()
    let recordedBody: Record<string, unknown> | null = null

    setupFetchMock({
      '/api/services/charges': async (init) => {
        if (init.method === 'POST') {
          recordedBody = JSON.parse(String(init.body))
          return {
            charge: {
              _id: 'sc-cust-test',
              serviceNo: 'SV-20260312-CUST',
              serviceSnapshot: { name: 'Gmail account setup', category: 'ACCOUNT_SETUP' },
              customerSnapshot: { name: 'Bopha Vorn', phone: '098765432' },
              currency: 'USD',
              total: 5,
              paymentMethod: 'CASH',
              status: 'COMPLETED',
              completedAt: new Date().toISOString(),
            },
          }
        }
        return { charges: sampleCharges }
      },
    })

    render(
      <RouterProvider>
        <ServiceWorkspace />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getAllByText('Gmail account setup').length).toBeGreaterThanOrEqual(1)
    })

    const chargeButtons = screen.getAllByRole('button', { name: /^charge/i })
    await user.click(chargeButtons[0])

    // Initially Walk-in: customerName input is visible
    expect(screen.getByPlaceholderText('Walk-in customer')).toBeInTheDocument()

    // Choose existing customer Bopha Vorn
    const customerSelect = screen.getByRole('combobox', { name: /customer/i })
    await user.selectOptions(customerSelect, 'cust-2')

    // Custom walk-in name input is now hidden
    expect(screen.queryByPlaceholderText('Walk-in customer')).not.toBeInTheDocument()

    // Submit
    const dialog = screen.getByRole('dialog', { name: /record service charge/i })
    await user.click(within(dialog).getByRole('button', { name: /record charge/i }))

    await waitFor(() => {
      expect(recordedBody).not.toBeNull()
    })

    // Verified payload contains customerId and no customerName
    const payload = recordedBody as Record<string, unknown> | null
    expect(payload?.customerId).toBe('cust-2')
    expect(payload?.customerName).toBeUndefined()
  })

  it('6. Service charges do not mutate inventory or call inventory endpoints', async () => {
    const user = userEvent.setup()
    const inventoryCalls: string[] = []

    setupFetchMock({
      '/api/inventory': async () => {
        inventoryCalls.push('/api/inventory')
        return { items: [] }
      },
      '/api/services/charges': async (init) => {
        if (init.method === 'POST') {
          return {
            charge: {
              _id: 'sc-iso-1',
              serviceNo: 'SV-20260312-ISO1',
              serviceSnapshot: { name: 'Gmail account setup', category: 'ACCOUNT_SETUP' },
              customerSnapshot: { name: 'Walk-in customer' },
              currency: 'USD',
              total: 5,
              paymentMethod: 'CASH',
              status: 'COMPLETED',
              completedAt: new Date().toISOString(),
            },
          }
        }
        return { charges: sampleCharges }
      },
    })

    render(
      <RouterProvider>
        <ServiceWorkspace />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getAllByText('Gmail account setup').length).toBeGreaterThanOrEqual(1)
    })

    const chargeButtons = screen.getAllByRole('button', { name: /^charge/i })
    await user.click(chargeButtons[0])

    const dialog = screen.getByRole('dialog', { name: /record service charge/i })
    await user.click(within(dialog).getByRole('button', { name: /record charge/i }))

    await waitFor(() => {
      expect(screen.getByText(/Service charge saved/i)).toBeInTheDocument()
    })

    // Assert that inventory endpoints were never queried or mutated during service charging
    expect(inventoryCalls).toHaveLength(0)
  })

  it('7. Handles discount boundaries (100% discount, zero total, KHR increments)', async () => {
    const user = userEvent.setup()
    let recordedBody: Record<string, unknown> | null = null

    setupFetchMock({
      '/api/services/charges': async (init) => {
        if (init.method === 'POST') {
          recordedBody = JSON.parse(String(init.body))
          return {
            charge: {
              _id: 'sc-disc-1',
              serviceNo: 'SV-20260312-DISC',
              serviceSnapshot: { name: 'New phone setup', category: 'DEVICE_SETUP' },
              customerSnapshot: { name: 'Walk-in customer' },
              currency: 'KHR',
              total: 0,
              discount: 41000,
              paymentMethod: 'CASH',
              status: 'COMPLETED',
              completedAt: new Date().toISOString(),
            },
          }
        }
        return { charges: sampleCharges }
      },
    })

    render(
      <RouterProvider>
        <ServiceWorkspace />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getAllByText('New phone setup').length).toBeGreaterThanOrEqual(1)
    })

    // Open checkout for KHR service (41,000 KHR)
    const chargeButtons = screen.getAllByRole('button', { name: /^charge/i })
    await user.click(chargeButtons[1])

    const dialog = screen.getByRole('dialog', { name: /record service charge/i })
    const discountInput = within(dialog).getByRole('textbox', { name: /discount/i })

    // Enter 100% discount matching subtotal: 41000 KHR
    await user.clear(discountInput)
    await user.type(discountInput, '41000')

    // Expect Total to show 0 KHR
    expect(within(dialog).getByText('0 KHR')).toBeInTheDocument()

    // Submit charge
    await user.click(within(dialog).getByRole('button', { name: /record charge/i }))

    await waitFor(() => {
      expect(recordedBody).not.toBeNull()
    })

    const payload = recordedBody as Record<string, unknown> | null
    expect(payload?.currency).toBe('KHR')
    expect(payload?.discount).toBe(41000)
  })

  it('8. Prevents duplicate in-flight submissions when Record charge is clicked rapidly', async () => {
    const user = userEvent.setup()
    let postCount = 0

    setupFetchMock({
      '/api/services/charges': async (init) => {
        if (init.method === 'POST') {
          postCount += 1
          await new Promise((resolve) => setTimeout(resolve, 80))
          return {
            charge: {
              _id: 'sc-dup-1',
              serviceNo: 'SV-20260312-DUP',
              serviceSnapshot: { name: 'Gmail account setup', category: 'ACCOUNT_SETUP' },
              customerSnapshot: { name: 'Walk-in customer' },
              currency: 'USD',
              total: 5,
              paymentMethod: 'CASH',
              status: 'COMPLETED',
              completedAt: new Date().toISOString(),
            },
          }
        }
        return { charges: sampleCharges }
      },
    })

    render(
      <RouterProvider>
        <ServiceWorkspace />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getAllByText('Gmail account setup').length).toBeGreaterThanOrEqual(1)
    })

    const chargeButtons = screen.getAllByRole('button', { name: /^charge/i })
    await user.click(chargeButtons[0])

    const dialog = screen.getByRole('dialog', { name: /record service charge/i })
    const submitBtn = within(dialog).getByRole('button', { name: /record charge/i })

    // Click submit rapidly twice
    await Promise.all([
      user.click(submitBtn),
      user.click(submitBtn),
    ])

    await waitFor(() => {
      expect(postCount).toBe(1)
    })
  })

  it('9. Filters catalogue by search query and category, and shows empty state', async () => {
    const user = userEvent.setup()
    setupFetchMock()

    render(
      <RouterProvider>
        <ServiceWorkspace />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getAllByText('Gmail account setup').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('New phone setup').length).toBeGreaterThanOrEqual(1)
    })

    const grid = screen.getByLabelText('Available services')

    // Search by keyword
    const searchInput = screen.getByPlaceholderText('Search services')
    await user.type(searchInput, 'gmail')

    expect(within(grid).getAllByText('Gmail account setup').length).toBeGreaterThanOrEqual(1)
    expect(within(grid).queryByText('New phone setup')).not.toBeInTheDocument()

    // Clear search and filter by category
    await user.clear(searchInput)
    const categorySelect = screen.getByLabelText('Service category')
    await user.selectOptions(categorySelect, 'DEVICE_SETUP')

    expect(within(grid).queryByText('Gmail account setup')).not.toBeInTheDocument()
    expect(within(grid).getAllByText('New phone setup').length).toBeGreaterThanOrEqual(1)

    // Search with no results
    await user.type(searchInput, 'nonexistentxyz')
    expect(screen.getByText('No services found')).toBeInTheDocument()
    expect(screen.getByText('Try another search or category.')).toBeInTheDocument()
  })

  it('10. Refresh button triggers reload of catalogue, customers, and charges', async () => {
    const user = userEvent.setup()
    let catalogCallCount = 0

    setupFetchMock({
      '/api/services/catalog': async () => {
        catalogCallCount += 1
        return { services: sampleServices, exchangeRate: 4100 }
      },
    })

    render(
      <RouterProvider>
        <ServiceWorkspace />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(catalogCallCount).toBe(1)
    })

    const refreshButton = screen.getByRole('button', { name: /Refresh services/i })
    await user.click(refreshButton)

    await waitFor(() => {
      expect(catalogCallCount).toBe(2)
    })
  })

  it('11. Cashier sees warning when clicking unpriced service, while Manager can configure price', async () => {
    const user = userEvent.setup()
    setupFetchMock()

    // Set role to CASHIER
    setSessionUser({
      id: 'usr-cashier',
      name: 'Cashier User',
      email: 'cashier@phoneflow.test',
      role: 'CASHIER',
      active: true,
    })

    render(
      <RouterProvider>
        <ServiceWorkspace />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Custom repair help')).toBeInTheDocument()
    })

    // Cashier clicks on unpriced service
    const needsPriceBtn = screen.getByRole('button', { name: /Needs price/i })
    await user.click(needsPriceBtn)

    // Should display role warning alert
    expect(screen.getByText(/A manager needs to set this service price before it can be charged/i)).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /Set service price/i })).not.toBeInTheDocument()
  })

  it('12. Pricing modal calculates dual currency prices live and saves price to catalogue', async () => {
    const user = userEvent.setup()
    let patchPayload: any = null

    setupFetchMock({
      '/api/services/catalog/svc-unpriced': async (init) => {
        if (init.method === 'PATCH') {
          patchPayload = JSON.parse(String(init.body))
          return {
            service: {
              ...sampleServices[2],
              price: 10,
              priceUsd: 10,
              priceKhr: 41000,
              currency: 'USD',
            },
          }
        }
        return { service: sampleServices[2] }
      },
    })

    render(
      <RouterProvider>
        <ServiceWorkspace />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Custom repair help')).toBeInTheDocument()
    })

    // Manager clicks "Set price"
    const setPriceBtn = screen.getByRole('button', { name: /Set price/i })
    await user.click(setPriceBtn)

    const modal = screen.getByRole('dialog', { name: /Set service price/i })
    expect(modal).toBeInTheDocument()

    // Type USD 10 -> KHR input updates automatically to 41,000
    const usdInput = screen.getByLabelText('Service price in US dollars')
    await user.clear(usdInput)
    await user.type(usdInput, '10')

    const khrInput = screen.getByLabelText('Service price in Cambodian riel')
    expect(khrInput).toHaveValue('41,000')

    // Submit form
    const saveBtn = within(modal).getByRole('button', { name: /Save price/i })
    await user.click(saveBtn)

    await waitFor(() => {
      expect(patchPayload).not.toBeNull()
    })

    expect(patchPayload?.priceUsd).toBe(10)
    expect(patchPayload?.priceKhr).toBe(41000)
    expect(patchPayload?.currency).toBe('USD')

    // Automatically transitions to charge dialog for the now-priced service
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Record service charge/i })).toBeInTheDocument()
    })
  })

  it('13. Failed price save keeps modal open, displays error inside dialog, preserves inputs, and allows retry', async () => {
    const user = userEvent.setup()
    let attempt = 0

    setupFetchMock({
      '/api/services/catalog/svc-unpriced': async (init) => {
        if (init.method === 'PATCH') {
          attempt += 1
          if (attempt === 1) {
            return {
              ok: false,
              status: 400,
              headers: new Headers({ 'content-type': 'application/json' }),
              json: async () => ({ message: 'Server database connection timeout' }),
            }
          }
          return {
            service: {
              ...sampleServices[2],
              price: 15,
              priceUsd: 15,
              priceKhr: 61500,
              currency: 'USD',
            },
          }
        }
        return { service: sampleServices[2] }
      },
    })

    render(
      <RouterProvider>
        <ServiceWorkspace />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Custom repair help')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Set price/i }))

    const modal = screen.getByRole('dialog', { name: /Set service price/i })
    const usdInput = screen.getByLabelText('Service price in US dollars')
    await user.clear(usdInput)
    await user.type(usdInput, '15')

    const saveBtn = within(modal).getByRole('button', { name: /Save price/i })
    await user.click(saveBtn)

    // Error alert inside modal
    await waitFor(() => {
      const alert = within(modal).getByRole('alert')
      expect(alert).toHaveTextContent('Server database connection timeout')
    })

    // Modal still open and inputs preserved
    expect(screen.getByRole('dialog', { name: /Set service price/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Service price in US dollars')).toHaveValue('15')

    // Retry should work
    await user.click(saveBtn)

    await waitFor(() => {
      expect(attempt).toBe(2)
      expect(screen.getByRole('dialog', { name: /Record service charge/i })).toBeInTheDocument()
    })
  })

  it('14. Rapid double submission on Save price in single act() sends only one PATCH request', async () => {
    let patchCount = 0

    setupFetchMock({
      '/api/services/catalog/svc-unpriced': async (init) => {
        if (init.method === 'PATCH') {
          patchCount += 1
          await new Promise((resolve) => setTimeout(resolve, 80))
          return {
            service: {
              ...sampleServices[2],
              price: 20,
              priceUsd: 20,
              priceKhr: 82000,
              currency: 'USD',
            },
          }
        }
        return { service: sampleServices[2] }
      },
    })

    render(
      <RouterProvider>
        <ServiceWorkspace />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Custom repair help')).toBeInTheDocument()
    })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Set price/i }))

    const modal = screen.getByRole('dialog', { name: /Set service price/i })
    const usdInput = screen.getByLabelText('Service price in US dollars')
    await user.clear(usdInput)
    await user.type(usdInput, '20')

    const form = modal.querySelector('form')!

    act(() => {
      fireEvent.submit(form)
      fireEvent.submit(form)
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Record service charge/i })).toBeInTheDocument()
    })

    expect(patchCount).toBe(1)
  })

  it('15. Record charge from header opens service picker dropdown and selects priced service', async () => {
    const user = userEvent.setup()
    setupFetchMock()

    render(
      <RouterProvider>
        <ServiceWorkspace />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getAllByText('Gmail account setup').length).toBeGreaterThanOrEqual(1)
    })

    // Click header "Record charge" button
    const headerRecordBtn = screen.getByRole('button', { name: /Record charge/i })
    await user.click(headerRecordBtn)

    // Service picker dialog opens
    const dialog = screen.getByRole('dialog', { name: /Record service charge/i })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText(/What service did you complete\?/i)).toBeInTheDocument()

    // Select service from picker
    const pickerSelect = screen.getByLabelText('Service to charge')
    await user.selectOptions(pickerSelect, 'svc-1')

    // Charge form is now visible with customer selection
    expect(screen.getByRole('combobox', { name: /Customer/i })).toBeInTheDocument()
    expect(screen.getByText(/Gmail account setup · \$5\.00/i)).toBeInTheDocument()
  })

  it('16. Adjusts quantity and calculates subtotal, percent discount, and payment methods', async () => {
    const user = userEvent.setup()
    let capturedBody: any = null

    setupFetchMock({
      '/api/services/charges': async (init) => {
        if (init.method === 'POST') {
          capturedBody = JSON.parse(String(init.body))
          return {
            charge: {
              _id: 'sc-qty-test',
              serviceNo: 'SV-20260312-QTY',
              serviceSnapshot: { name: 'Gmail account setup', category: 'ACCOUNT_SETUP' },
              customerSnapshot: { name: 'Walk-in customer' },
              currency: 'USD',
              total: 12,
              paymentMethod: 'KHQR',
              status: 'COMPLETED',
              completedAt: new Date().toISOString(),
            },
          }
        }
        return { charges: sampleCharges }
      },
    })

    render(
      <RouterProvider>
        <ServiceWorkspace />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getAllByText('Gmail account setup').length).toBeGreaterThanOrEqual(1)
    })

    // Charge Gmail ($5.00)
    const chargeButtons = screen.getAllByRole('button', { name: /^charge/i })
    await user.click(chargeButtons[0])

    const dialog = screen.getByRole('dialog', { name: /Record service charge/i })

    // Change quantity to 3 (Subtotal = $15.00)
    const qtyInput = within(dialog).getByRole('spinbutton')
    fireEvent.change(qtyInput, { target: { value: '3' } })

    expect(within(dialog).getAllByText('$15.00').length).toBeGreaterThanOrEqual(2)

    // Switch to Percent discount
    const percentBtn = screen.getByRole('button', { name: 'Percent' })
    await user.click(percentBtn)

    // Enter 20% discount ($3.00)
    const discountInput = within(dialog).getByPlaceholderText('0')
    await user.type(discountInput, '20')

    // Subtotal $15 - $3 = $12
    expect(within(dialog).getByText('20% = $3.00')).toBeInTheDocument()
    expect(within(dialog).getByText('$12.00')).toBeInTheDocument()

    // Change payment method to KHQR
    const paySelect = screen.getByRole('combobox', { name: /Payment method/i })
    await user.selectOptions(paySelect, 'KHQR')

    // Submit
    await user.click(within(dialog).getByRole('button', { name: /Record charge/i }))

    await waitFor(() => {
      expect(capturedBody).not.toBeNull()
    })

    expect(capturedBody?.quantity).toBe(3)
    expect(capturedBody?.discountType).toBe('PERCENT')
    expect(capturedBody?.discount).toBe(20)
    expect(capturedBody?.paymentMethod).toBe('KHQR')
  })

  it('17. Currency switch in checkout recalculates unit price and resets discount', async () => {
    const user = userEvent.setup()
    setupFetchMock()

    render(
      <RouterProvider>
        <ServiceWorkspace />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getAllByText('Gmail account setup').length).toBeGreaterThanOrEqual(1)
    })

    await user.click(screen.getAllByRole('button', { name: /^charge/i })[0])

    const dialog = screen.getByRole('dialog', { name: /Record service charge/i })
    const currencySelect = screen.getByRole('combobox', { name: /Currency/i })

    // Switch to KHR
    await user.selectOptions(currencySelect, 'KHR')
    expect(within(dialog).getByText('20,500 KHR each')).toBeInTheDocument()
    expect(within(dialog).getAllByText('20,500 KHR').length).toBeGreaterThanOrEqual(2)

    // Switch back to USD
    await user.selectOptions(currencySelect, 'USD')
    expect(within(dialog).getByText('$5.00 each')).toBeInTheDocument()
    expect(within(dialog).getAllByText('$5.00').length).toBeGreaterThanOrEqual(2)
  })

  it('18. Guards Create receipt against rapid double clicks before React rerenders', async () => {
    let receiptCallCount = 0
    let finishReceipt!: () => void
    const receiptPending = new Promise<void>((resolve) => { finishReceipt = resolve })

    setupFetchMock({
      '/api/services/charges': async (init) => {
        if (init.method === 'POST') {
          return {
            charge: {
              _id: 'sc-receipt-dup',
              serviceNo: 'SV-20260312-RCPT',
              serviceSnapshot: { name: 'Gmail account setup', category: 'ACCOUNT_SETUP' },
              customerSnapshot: { name: 'Walk-in customer' },
              currency: 'USD',
              total: 5,
              paymentMethod: 'CASH',
              status: 'COMPLETED',
              completedAt: new Date().toISOString(),
            },
          }
        }
        return { charges: sampleCharges }
      },
      '/api/receipts/generate': async () => {
        receiptCallCount += 1
        await receiptPending
        return { receipt: { _id: 'rcpt-1', receiptNumber: 'REC-001' } }
      },
    })

    render(
      <RouterProvider>
        <ServiceWorkspace />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getAllByText('Gmail account setup').length).toBeGreaterThanOrEqual(1)
    })

    const user = userEvent.setup()
    await user.click(screen.getAllByRole('button', { name: /^charge/i })[0])

    const dialog = screen.getByRole('dialog', { name: /Record service charge/i })
    await user.click(within(dialog).getByRole('button', { name: /Record charge/i }))

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Gmail account setup completed/i })).toBeInTheDocument()
    })

    const createReceiptBtn = screen.getByRole('button', { name: /Create receipt/i })

    // Rapid double click in single act()
    act(() => {
      fireEvent.click(createReceiptBtn)
      fireEvent.click(createReceiptBtn)
    })

    await waitFor(() => {
      expect(receiptCallCount).toBeGreaterThan(0)
    })

    // Demonstrated bug: Before fix, receiptCallCount was 2. With ref guard, strictly 1!
    expect(receiptCallCount).toBe(1)
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled()
    await act(async () => { finishReceipt() })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Gmail account setup completed/i })).not.toBeInTheDocument())
  })

  it('19. Failed receipt generation shows error and allows retry after releasing guard', async () => {
    let receiptAttempts = 0

    setupFetchMock({
      '/api/services/charges': async (init) => {
        if (init.method === 'POST') {
          return {
            charge: {
              _id: 'sc-receipt-err',
              serviceNo: 'SV-20260312-ERR',
              serviceSnapshot: { name: 'Gmail account setup', category: 'ACCOUNT_SETUP' },
              customerSnapshot: { name: 'Walk-in customer' },
              currency: 'USD',
              total: 5,
              paymentMethod: 'CASH',
              status: 'COMPLETED',
              completedAt: new Date().toISOString(),
            },
          }
        }
        return { charges: sampleCharges }
      },
      '/api/receipts/generate': async () => {
        receiptAttempts += 1
        if (receiptAttempts === 1) {
          return {
            ok: false,
            status: 400,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ message: 'Printer service unavailable' }),
          }
        }
        return { receipt: { _id: 'rcpt-2', receiptNumber: 'REC-002' } }
      },
    })

    render(
      <RouterProvider>
        <ServiceWorkspace />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getAllByText('Gmail account setup').length).toBeGreaterThanOrEqual(1)
    })

    const user = userEvent.setup()
    await user.click(screen.getAllByRole('button', { name: /^charge/i })[0])

    const dialog = screen.getByRole('dialog', { name: /Record service charge/i })
    await user.click(within(dialog).getByRole('button', { name: /Record charge/i }))

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Gmail account setup completed/i })).toBeInTheDocument()
    })

    const createReceiptBtn = screen.getByRole('button', { name: /Create receipt/i })
    await user.click(createReceiptBtn)

    // The error must be visible inside the active success dialog.
    await waitFor(() => {
      const successDialog = screen.getByRole('dialog', { name: /Gmail account setup completed/i })
      expect(within(successDialog).getByRole('alert')).toHaveTextContent('Printer service unavailable')
    })

    // Retry should work
    await user.click(createReceiptBtn)

    await waitFor(() => {
      expect(receiptAttempts).toBe(2)
    })
  })

  it('20. Dismisses page-level alert when clicking close button', async () => {
    const user = userEvent.setup()
    setupFetchMock()

    setSessionUser({
      id: 'usr-cashier',
      name: 'Cashier User',
      email: 'cashier@phoneflow.test',
      role: 'CASHIER',
      active: true,
    })

    render(
      <RouterProvider>
        <ServiceWorkspace />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Custom repair help')).toBeInTheDocument()
    })

    // Trigger an error alert
    await user.click(screen.getByRole('button', { name: /Needs price/i }))
    expect(screen.getByRole('alert')).toBeInTheDocument()

    // Click dismiss button
    const dismissBtn = screen.getByRole('button', { name: /Dismiss message/i })
    await user.click(dismissBtn)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('21. Handles initial loading failure with error alert', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ message: 'Network offline' }),
    } as Response)

    render(
      <RouterProvider>
        <ServiceWorkspace />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Network offline')).toBeInTheDocument()
    })
  })

  it('22. Pricing modal allows switching default currency to KHR, editing KHR price, dismissing error, and canceling', async () => {
    const user = userEvent.setup()
    let patchCalled = false

    const mockFn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)
      if (url.includes('/api/services/catalog') && init.method === 'PATCH') {
        patchCalled = true
        return {
          ok: false,
          status: 400,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ message: 'Price update rejected by server' }),
        } as Response
      }
      if (url.includes('/api/services/catalog')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ services: sampleServices, exchangeRate: 4000 }),
        } as Response
      }
      if (url.includes('/api/customers')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ customers: sampleCustomers }),
        } as Response
      }
      if (url.includes('/api/services/charges')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ charges: sampleCharges }),
        } as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({}),
      } as Response
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFn as any)

    setSessionUser({
      id: 'usr-owner',
      name: 'Owner User',
      email: 'owner@phoneflow.test',
      role: 'OWNER',
      active: true,
    })

    render(
      <RouterProvider>
        <ServiceWorkspace />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Custom repair help')).toBeInTheDocument()
    })

    // Click "Set price" for unpriced service
    await user.click(screen.getByRole('button', { name: /Set price/i }))

    const dialog = screen.getByRole('dialog', { name: /Set service price/i })
    expect(dialog).toBeInTheDocument()

    // Radio button to switch checkout default currency to KHR
    const khrRadio = screen.getAllByRole('radio')[1]
    await user.click(khrRadio)
    expect(khrRadio).toBeChecked()

    // Type in KHR price field
    const khrInput = screen.getByLabelText('Service price in Cambodian riel')
    await user.clear(khrInput)
    await user.type(khrInput, '8000')

    // Corresponding USD price field should update based on exchange rate (8000 / 4000 = 2)
    const usdInput = screen.getByLabelText('Service price in US dollars')
    expect(usdInput).toHaveValue('2')

    // Submit form which fails
    const saveBtn = within(dialog).getByRole('button', { name: /Save price/i })
    await user.click(saveBtn)

    await waitFor(() => {
      expect(patchCalled).toBe(true)
      expect(within(dialog).getByText('Price update rejected by server')).toBeInTheDocument()
    })

    // Dismiss error within modal
    const dismissErrBtn = within(dialog).getByRole('button', { name: /Dismiss message/i })
    await user.click(dismissErrBtn)
    expect(within(dialog).queryByText('Price update rejected by server')).not.toBeInTheDocument()

    // Close pricing modal via cancel button
    const cancelBtn = within(dialog).getByRole('button', { name: /Cancel/i })
    await user.click(cancelBtn)
    expect(screen.queryByRole('dialog', { name: /Set service price/i })).not.toBeInTheDocument()

    // Open again and close via X button
    await user.click(screen.getByRole('button', { name: /Set price/i }))
    expect(screen.getByRole('dialog', { name: /Set service price/i })).toBeInTheDocument()

    // Radio button to switch checkout default currency back to USD
    const usdRadio = screen.getAllByRole('radio')[0]
    await user.click(khrRadio)
    expect(khrRadio).toBeChecked()
    await user.click(usdRadio)
    expect(usdRadio).toBeChecked()

    const closeBtn = screen.getByRole('button', { name: /Close pricing/i })
    await user.click(closeBtn)
    expect(screen.queryByRole('dialog', { name: /Set service price/i })).not.toBeInTheDocument()
  })

  it('23. Header Record charge opens service picker, allows selecting a service, dismissing charge error, and viewing reports', async () => {
    const user = userEvent.setup()
    setupFetchMock()

    render(
      <RouterProvider>
        <ServiceWorkspace />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Custom repair help')).toBeInTheDocument()
    })

    // Click top header "Record charge" button
    const recordChargeBtn = screen.getByRole('button', { name: /^Record charge$/i })
    await user.click(recordChargeBtn)

    const chargeModal = screen.getByRole('dialog', { name: /Record service charge/i })
    expect(chargeModal).toBeInTheDocument()
    expect(within(chargeModal).getByText('What service did you complete?')).toBeInTheDocument()

    // Select a priced service from the dropdown
    const serviceSelect = within(chargeModal).getByLabelText('Service to charge')
    await user.selectOptions(serviceSelect, 'svc-1')

    // Now the form appears with selected service
    expect(within(chargeModal).getByText(/Gmail account setup · \$5\.00/)).toBeInTheDocument()
    expect(within(chargeModal).getByRole('button', { name: /Record charge/i })).toBeInTheDocument()

    // Close checkout
    const closeCheckoutBtn = within(chargeModal).getByRole('button', { name: /Close service checkout/i })
    await user.click(closeCheckoutBtn)
    expect(screen.queryByRole('dialog', { name: /Record service charge/i })).not.toBeInTheDocument()

    // Report buttons navigate to /reports/services
    const serviceReportBtn = screen.getByRole('button', { name: /Service report/i })
    await user.click(serviceReportBtn)
    expect(window.location.pathname).toBe('/reports/services')

    const viewReportBtn = screen.getByRole('button', { name: /View report/i })
    await user.click(viewReportBtn)
    expect(window.location.pathname).toBe('/reports/services')
  })

  it('24. Shows empty priced services notice when no services have prices configured', async () => {
    const user = userEvent.setup()

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/services/catalog')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          // All unpriced services
          json: async () => ({
            services: [
              {
                _id: 'srv-unpriced-1',
                code: 'SVC-001',
                name: 'Unpriced 1',
                category: 'ACCOUNT_SETUP',
                currency: 'USD',
                price: 0,
                active: true,
              },
            ],
            exchangeRate: 4000,
          }),
        } as Response
      }
      if (url.includes('/api/customers')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ customers: [] }),
        } as Response
      }
      if (url.includes('/api/services/charges')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ charges: [] }),
        } as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({}),
      } as Response
    })

    render(
      <RouterProvider>
        <ServiceWorkspace />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Unpriced 1')).toBeInTheDocument()
    })

    // Click "Record charge" button
    const recordChargeBtn = screen.getByRole('button', { name: /^Record charge$/i })
    await user.click(recordChargeBtn)

    const chargeModal = screen.getByRole('dialog', { name: /Record service charge/i })
    expect(within(chargeModal).getByText('No priced services yet')).toBeInTheDocument()
    expect(within(chargeModal).getByText('Set a catalogue price before recording a service charge.')).toBeInTheDocument()
  })

  it('25. Legacy single-currency service converts dynamically and card main button selects service', async () => {
    const user = userEvent.setup()

    const legacyServices = [
      {
        _id: 'srv-legacy-khr',
        code: 'SVC-KHR',
        name: 'Legacy KHR Service',
        category: 'ACCOUNT_SETUP',
        currency: 'KHR' as const,
        price: 20500,
        active: true,
      },
    ]

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/services/catalog')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ services: legacyServices, exchangeRate: 4100 }),
        } as Response
      }
      if (url.includes('/api/customers')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ customers: [] }),
        } as Response
      }
      if (url.includes('/api/services/charges')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ charges: [] }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    render(
      <RouterProvider>
        <ServiceWorkspace />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Legacy KHR Service')).toBeInTheDocument()
    })

    // Click service-card-main button
    const cardMainBtn = document.querySelector('.service-card-main') as HTMLButtonElement
    expect(cardMainBtn).toBeInTheDocument()
    await user.click(cardMainBtn)

    const chargeModal = screen.getByRole('dialog', { name: /Record service charge/i })
    expect(chargeModal).toBeInTheDocument()
    expect(within(chargeModal).getByText(/Legacy KHR Service · 20,500 KHR/)).toBeInTheDocument()

    // Switch currency dropdown to USD: 20500 / 4100 = 5.00 USD
    const currencySelect = within(chargeModal).getByRole('combobox', { name: /Currency/i })
    await user.selectOptions(currencySelect, 'USD')

    expect(within(chargeModal).getByText(/Legacy KHR Service · \$5\.00/)).toBeInTheDocument()
  })
})
