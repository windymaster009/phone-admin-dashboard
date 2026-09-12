import { render, screen, waitFor, within } from '@testing-library/react'
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
})
