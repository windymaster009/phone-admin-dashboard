import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setSessionUser } from '../../lib/api'
import CustomerPage from './CustomerPage'

type CustomerRecord = {
  _id: string
  name: string
  phone: string
  nationalIdNumber?: string
  address?: string
  notes?: string
  active?: boolean
  createdAt: string
}

const initialCustomers: CustomerRecord[] = [
  {
    _id: 'cust-1',
    name: 'Sokha Chan',
    phone: '012345678',
    nationalIdNumber: 'ID-123456',
    address: 'Phnom Penh, Cambodia',
    notes: 'Longtime loyal customer',
    active: true,
    createdAt: '2026-01-15T08:00:00.000Z',
  },
  {
    _id: 'cust-2',
    name: 'Bopha Vorn',
    phone: '098765432',
    nationalIdNumber: '',
    address: 'Siem Reap',
    notes: '',
    active: true,
    createdAt: '2026-02-10T10:30:00.000Z',
  },
  {
    _id: 'cust-3',
    name: 'Dara Keo',
    phone: '077112233',
    nationalIdNumber: 'ID-998877',
    address: 'Battambang',
    notes: 'Occasional buyer',
    active: false,
    createdAt: '2026-02-20T14:15:00.000Z',
  },
]

describe('CustomerPage Regression & Workflow Tests', () => {
  let customerList: CustomerRecord[]

  beforeEach(() => {
    customerList = structuredClone(initialCustomers)
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

  function setupCustomerFetchMock(customHandlers: Record<string, (url: string, init: RequestInit) => Promise<Response> | Response> = {}) {
    const mockFn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)

      for (const [pattern, handler] of Object.entries(customHandlers)) {
        if (url.includes(pattern)) {
          return handler(url, init)
        }
      }

      if (url.includes('/api/customers') && init.method === 'POST') {
        const body = JSON.parse(String(init.body || '{}'))
        const newCustomer: CustomerRecord = {
          _id: `cust-${Date.now()}`,
          name: body.name,
          phone: body.phone,
          nationalIdNumber: body.nationalIdNumber,
          address: body.address,
          notes: body.notes,
          active: true,
          createdAt: new Date().toISOString(),
        }
        customerList.unshift(newCustomer)
        return new Response(JSON.stringify({ customer: newCustomer }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (url.includes('/api/customers/') && init.method === 'PATCH') {
        const id = url.split('/api/customers/')[1].split('?')[0]
        const body = JSON.parse(String(init.body || '{}'))
        const target = customerList.find((c) => c._id === id)
        if (target) {
          Object.assign(target, body)
        }
        return new Response(JSON.stringify({ customer: target }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (url.includes('/api/customers/') && init.method === 'DELETE') {
        const id = url.split('/api/customers/')[1].split('?')[0]
        customerList = customerList.filter((c) => c._id !== id)
        return new Response(JSON.stringify({ message: 'Customer deleted' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (url.includes('/api/customers')) {
        return new Response(JSON.stringify({ customers: [...customerList] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    window.fetch = mockFn as unknown as typeof fetch
    globalThis.fetch = mockFn as unknown as typeof fetch
    return mockFn
  }

  it('1. Creating a customer updates the list without refreshing', async () => {
    const user = userEvent.setup()
    setupCustomerFetchMock()

    render(<CustomerPage />)

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument()
    })
    const table = screen.getByRole('table')
    expect(within(table).getByText('Sokha Chan')).toBeInTheDocument()
    expect(within(table).getByText('Bopha Vorn')).toBeInTheDocument()

    // Open Add Customer dialog
    const addButton = screen.getByRole('button', { name: /add customer/i })
    await user.click(addButton)

    const dialog = screen.getByRole('dialog', { name: /add customer/i })
    expect(dialog).toBeInTheDocument()

    // Fill form inside dialog
    const nameInput = within(dialog).getByLabelText(/full name/i)
    const phoneInput = within(dialog).getByLabelText(/phone number/i)
    const idInput = within(dialog).getByLabelText(/national id number/i)
    const addressInput = within(dialog).getByLabelText(/address/i)
    const notesInput = within(dialog).getByLabelText(/notes/i)

    await user.type(nameInput, 'Kosal Chea')
    await user.type(phoneInput, '011223344')
    await user.type(idInput, 'ID-778899')
    await user.type(addressInput, 'Kampot, Cambodia')
    await user.type(notesInput, 'Referred by Sokha')

    // Submit save
    const saveButton = within(dialog).getByRole('button', { name: /save customer/i })
    await user.click(saveButton)

    // Verify dialog closes and success modal appears
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /add customer/i })).not.toBeInTheDocument()
    })
    expect(screen.getByText('Kosal Chea added')).toBeInTheDocument()

    // Dismiss success modal
    await user.click(screen.getByRole('button', { name: /done/i }))

    // List updated with the new record without page refresh
    const updatedTable = screen.getByRole('table')
    expect(within(updatedTable).getByText('Kosal Chea')).toBeInTheDocument()
    expect(within(updatedTable).getByText('011223344')).toBeInTheDocument()
    expect(within(updatedTable).getByText('ID-778899')).toBeInTheDocument()
  })

  it('2. Editing updates the correct record and preserves unrelated fields', async () => {
    const user = userEvent.setup()
    let patchPayload: Record<string, unknown> | null = null

    setupCustomerFetchMock({
      '/api/customers/cust-1': (url, init) => {
        if (init.method === 'PATCH') {
          patchPayload = JSON.parse(String(init.body || '{}'))
          const target = customerList.find((c) => c._id === 'cust-1')!
          Object.assign(target, patchPayload)
          return new Response(JSON.stringify({ customer: target }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({}), { status: 200 })
      },
    })

    render(<CustomerPage />)
    await waitFor(() => {
      expect(within(screen.getByRole('table')).getByText('Sokha Chan')).toBeInTheDocument()
    })

    // Click Edit button for Sokha Chan
    const editBtns = screen.getAllByRole('button', { name: 'Edit Sokha Chan' })
    await user.click(editBtns[0])

    const dialog = screen.getByRole('dialog', { name: /edit customer/i })
    expect(dialog).toBeInTheDocument()

    // Verify initial values pre-populated
    const phoneInput = within(dialog).getByLabelText(/phone number/i) as HTMLInputElement
    expect(phoneInput.value).toBe('012345678')

    // Change phone number only
    await user.clear(phoneInput)
    await user.type(phoneInput, '012999888')

    // Save changes
    const saveButton = within(dialog).getByRole('button', { name: /save changes/i })
    await user.click(saveButton)

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /edit customer/i })).not.toBeInTheDocument()
    })
    expect(screen.getByText('Sokha Chan updated')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /done/i }))

    // Assert patch payload contained expected updated values
    expect(patchPayload).toEqual({
      name: 'Sokha Chan',
      phone: '012999888',
      nationalIdNumber: 'ID-123456',
      address: 'Phnom Penh, Cambodia',
      notes: 'Longtime loyal customer',
    })

    // Assert list display updated
    expect(within(screen.getByRole('table')).getByText('012999888')).toBeInTheDocument()

    // Unrelated fields like active and createdAt are preserved on the record
    const target = customerList.find((c) => c._id === 'cust-1')!
    expect(target.active).toBe(true)
    expect(target.createdAt).toBe('2026-01-15T08:00:00.000Z')
  })

  it('3. Failed saves keep entered values and show an error inside the active dialog', async () => {
    const user = userEvent.setup()

    setupCustomerFetchMock({
      '/api/customers': (url, init) => {
        if (init.method === 'POST') {
          return new Response(JSON.stringify({ message: 'Customer phone number already exists', requestId: 'req-save-fail' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ customers: [...customerList] }), { status: 200 })
      },
    })

    render(<CustomerPage />)
    await waitFor(() => {
      expect(within(screen.getByRole('table')).getByText('Sokha Chan')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /add customer/i }))
    const dialog = screen.getByRole('dialog', { name: /add customer/i })

    const nameInput = within(dialog).getByLabelText(/full name/i) as HTMLInputElement
    const phoneInput = within(dialog).getByLabelText(/phone number/i) as HTMLInputElement
    const addressInput = within(dialog).getByLabelText(/address/i) as HTMLInputElement

    await user.type(nameInput, 'Failed Customer')
    await user.type(phoneInput, '099000111')
    await user.type(addressInput, 'Takeo Province')

    // Submit
    const saveButton = within(dialog).getByRole('button', { name: /save customer/i })
    await user.click(saveButton)

    // Error is shown inside the dialog
    await waitFor(() => {
      expect(within(dialog).getByText(/Customer phone number already exists/i)).toBeInTheDocument()
    })

    // Dialog remains open
    expect(dialog).toBeInTheDocument()

    // Form inputs retain their entered values
    expect(nameInput.value).toBe('Failed Customer')
    expect(phoneInput.value).toBe('099000111')
    expect(addressInput.value).toBe('Takeo Province')
  })

  it('4. Repeated submission while a request is pending sends only one request', async () => {
    let postCount = 0
    let resolvePendingPost!: (res: Response) => void
    const pendingPromise = new Promise<Response>((r) => { resolvePendingPost = r })

    setupCustomerFetchMock({
      '/api/customers': (url, init) => {
        if (init.method === 'POST') {
          postCount += 1
          return pendingPromise
        }
        return new Response(JSON.stringify({ customers: [...customerList] }), { status: 200 })
      },
    })

    render(<CustomerPage />)
    await waitFor(() => {
      expect(within(screen.getByRole('table')).getByText('Sokha Chan')).toBeInTheDocument()
    })

    const addButton = screen.getByRole('button', { name: /add customer/i })
    fireEvent.click(addButton)

    const dialog = screen.getByRole('dialog', { name: /add customer/i })
    const form = dialog.querySelector('form')!
    const nameInput = within(dialog).getByLabelText(/full name/i)
    fireEvent.change(nameInput, { target: { value: 'Single Request Customer' } })

    // Fire first submit (starts pending request)
    fireEvent.submit(form)
    expect(postCount).toBe(1)

    // Fire second submit while request is still pending
    fireEvent.submit(form)
    // Also fire a third submit
    fireEvent.submit(form)

    // Should still have sent ONLY ONE request
    expect(postCount).toBe(1)

    // Now resolve the pending request
    resolvePendingPost(new Response(JSON.stringify({
      customer: {
        _id: 'cust-single-req',
        name: 'Single Request Customer',
        phone: '',
        active: true,
        createdAt: new Date().toISOString(),
      },
    }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /add customer/i })).not.toBeInTheDocument()
    })
    expect(postCount).toBe(1)
  })

  it('5. Search, filtering, empty results, and loading/error states work', async () => {
    const user = userEvent.setup()
    setupCustomerFetchMock()

    render(<CustomerPage />)
    await waitFor(() => {
      expect(within(screen.getByRole('table')).getByText('Sokha Chan')).toBeInTheDocument()
    })
    const table = screen.getByRole('table')
    expect(within(table).getByText('Bopha Vorn')).toBeInTheDocument()
    expect(within(table).getByText('Dara Keo')).toBeInTheDocument()

    const searchInput = screen.getByPlaceholderText(/search name, phone, national id, or address/i)

    // Search by name
    await user.type(searchInput, 'Bopha')
    expect(within(screen.getByRole('table')).getByText('Bopha Vorn')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).queryByText('Sokha Chan')).not.toBeInTheDocument()
    expect(within(screen.getByRole('table')).queryByText('Dara Keo')).not.toBeInTheDocument()

    // Search by phone
    await user.clear(searchInput)
    await user.type(searchInput, '077112233')
    expect(within(screen.getByRole('table')).getByText('Dara Keo')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).queryByText('Sokha Chan')).not.toBeInTheDocument()

    // Search by address
    await user.clear(searchInput)
    await user.type(searchInput, 'Battambang')
    expect(within(screen.getByRole('table')).getByText('Dara Keo')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).queryByText('Sokha Chan')).not.toBeInTheDocument()

    // Search with no matching result shows "No matching customers"
    await user.clear(searchInput)
    await user.type(searchInput, 'NonExistentPersonXYZ')
    expect(within(screen.getByRole('table')).getByText('No matching customers')).toBeInTheDocument()

    // Clear search restores all
    await user.clear(searchInput)
    expect(within(screen.getByRole('table')).getByText('Sokha Chan')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('Bopha Vorn')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('Dara Keo')).toBeInTheDocument()
  })

  it('6. Empty results when shop has 0 customers', async () => {
    customerList = []
    setupCustomerFetchMock()

    render(<CustomerPage />)
    expect(await screen.findByText('No customers yet')).toBeInTheDocument()
    expect(screen.getByText(/Add the first customer so they can be selected/i)).toBeInTheDocument()
  })

  it('7. Initial loading error shows top-level alert', async () => {
    setupCustomerFetchMock({
      '/api/customers': () => new Response(JSON.stringify({ message: 'Failed to fetch customer list', requestId: 'req-load-fail' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    })

    render(<CustomerPage />)
    expect(await screen.findByText(/Failed to fetch customer list/i)).toBeInTheDocument()
  })

  it('8. Customer deletion: cancellation performs no deletion', async () => {
    const user = userEvent.setup()
    let deleteCalled = false

    setupCustomerFetchMock({
      '/api/customers/cust-2': (url, init) => {
        if (init.method === 'DELETE') {
          deleteCalled = true
          return new Response(JSON.stringify({ message: 'Customer deleted' }), { status: 200 })
        }
        return new Response(JSON.stringify({}), { status: 200 })
      },
    })

    render(<CustomerPage />)
    await waitFor(() => {
      expect(within(screen.getByRole('table')).getByText('Bopha Vorn')).toBeInTheDocument()
    })

    // Click delete icon for Bopha Vorn
    const deleteIconBtns = screen.getAllByRole('button', { name: 'Delete Bopha Vorn' })
    await user.click(deleteIconBtns[0])

    const alertdialog = screen.getByRole('alertdialog', { name: /delete “bopha vorn”?/i })
    expect(alertdialog).toBeInTheDocument()

    // Click Cancel
    const cancelBtn = within(alertdialog).getByRole('button', { name: /cancel/i })
    await user.click(cancelBtn)

    // Dialog closed, no DELETE request called, record still present
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(deleteCalled).toBe(false)
    expect(within(screen.getByRole('table')).getByText('Bopha Vorn')).toBeInTheDocument()
  })

  it('9. Failed deletion keeps record visible and shows error inside the dialog', async () => {
    const user = userEvent.setup()

    setupCustomerFetchMock({
      '/api/customers/cust-1': (url, init) => {
        if (init.method === 'DELETE') {
          return new Response(JSON.stringify({
            message: 'This customer is linked to transaction history. Deactivate them instead.',
          }), {
            status: 409,
            headers: { 'content-type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({}), { status: 200 })
      },
    })

    render(<CustomerPage />)
    await waitFor(() => {
      expect(within(screen.getByRole('table')).getByText('Sokha Chan')).toBeInTheDocument()
    })

    const deleteIconBtns = screen.getAllByRole('button', { name: 'Delete Sokha Chan' })
    await user.click(deleteIconBtns[0])

    const alertdialog = screen.getByRole('alertdialog', { name: /delete “sokha chan”?/i })
    const confirmBtn = within(alertdialog).getByRole('button', { name: /^delete$/i })
    await user.click(confirmBtn)

    // Error is shown inside the alertdialog
    await waitFor(() => {
      expect(within(alertdialog).getByText(/This customer is linked to transaction history/i)).toBeInTheDocument()
    })

    // Dialog remains open
    expect(alertdialog).toBeInTheDocument()

    // Sokha Chan is still visible in the customer list
    expect(within(screen.getByRole('table')).getByText('Sokha Chan')).toBeInTheDocument()
  })

  it('10. Successful deletion removes record and shows success only after API confirms it', async () => {
    const user = userEvent.setup()
    let resolveDelete!: (res: Response) => void
    const pendingDelete = new Promise<Response>((r) => { resolveDelete = r })

    setupCustomerFetchMock({
      '/api/customers/cust-2': (url, init) => {
        if (init.method === 'DELETE') {
          return pendingDelete
        }
        return new Response(JSON.stringify({}), { status: 200 })
      },
    })

    render(<CustomerPage />)
    await waitFor(() => {
      expect(within(screen.getByRole('table')).getByText('Bopha Vorn')).toBeInTheDocument()
    })

    const deleteIconBtns = screen.getAllByRole('button', { name: 'Delete Bopha Vorn' })
    await user.click(deleteIconBtns[0])

    const alertdialog = screen.getByRole('alertdialog', { name: /delete “bopha vorn”?/i })
    const confirmBtn = within(alertdialog).getByRole('button', { name: /^delete$/i })

    // Confirm delete
    await user.click(confirmBtn)

    // While pending: success modal is NOT shown, Bopha Vorn is still in the document
    expect(screen.queryByText('Bopha Vorn deleted')).not.toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('Bopha Vorn')).toBeInTheDocument()

    // Resolve delete
    customerList = customerList.filter((c) => c._id !== 'cust-2')
    resolveDelete(new Response(JSON.stringify({ message: 'Customer deleted' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    // Now success modal appears
    await waitFor(() => {
      expect(screen.getByText('Bopha Vorn deleted')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /done/i }))

    // Bopha Vorn removed from the list
    expect(within(screen.getByRole('table')).queryByText('Bopha Vorn')).not.toBeInTheDocument()
  })

  it('11. Repeated delete clicks while deletion is pending sends only one request', async () => {
    let deleteCount = 0
    let resolvePendingDelete!: (res: Response) => void
    const pendingPromise = new Promise<Response>((r) => { resolvePendingDelete = r })

    setupCustomerFetchMock({
      '/api/customers/cust-2': (url, init) => {
        if (init.method === 'DELETE') {
          deleteCount += 1
          return pendingPromise
        }
        return new Response(JSON.stringify({}), { status: 200 })
      },
    })

    render(<CustomerPage />)
    await waitFor(() => {
      expect(within(screen.getByRole('table')).getByText('Bopha Vorn')).toBeInTheDocument()
    })

    const deleteIconBtns = screen.getAllByRole('button', { name: 'Delete Bopha Vorn' })
    fireEvent.click(deleteIconBtns[0])

    const alertdialog = screen.getByRole('alertdialog', { name: /delete “bopha vorn”?/i })
    const confirmBtn = within(alertdialog).getByRole('button', { name: /^delete$/i })

    // Fire first delete
    fireEvent.click(confirmBtn)
    expect(deleteCount).toBe(1)

    // Fire repeated delete while request is still pending
    fireEvent.click(confirmBtn)
    fireEvent.click(confirmBtn)

    // Count should be strictly 1
    expect(deleteCount).toBe(1)

    // Resolve
    customerList = customerList.filter((c) => c._id !== 'cust-2')
    resolvePendingDelete(new Response(JSON.stringify({ message: 'Customer deleted' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    await waitFor(() => {
      expect(screen.getByText('Bopha Vorn deleted')).toBeInTheDocument()
    })
    expect(deleteCount).toBe(1)
  })
})
