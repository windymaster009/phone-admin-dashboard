import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setSessionUser } from '../../lib/api'
import SupplierWorkspace from './SupplierWorkspace'

type SupplierRecord = {
  _id: string
  name: string
  phone?: string
  nationalIdNumber?: string
  notes?: string
  active: boolean
  createdAt: string
}

const initialSuppliers: SupplierRecord[] = [
  {
    _id: 'sup-1',
    name: 'Angkor Tech Supplies',
    phone: '023111222',
    nationalIdNumber: 'ID-SUP-01',
    notes: 'Primary screen and battery supplier',
    active: true,
    createdAt: '2026-01-10T08:00:00.000Z',
  },
  {
    _id: 'sup-2',
    name: 'Mekong Mobile Wholesaler',
    phone: '081333444',
    nationalIdNumber: '',
    notes: 'Used phones in bulk',
    active: true,
    createdAt: '2026-02-01T11:00:00.000Z',
  },
  {
    _id: 'sup-3',
    name: 'Bayon Accessories',
    phone: '092555666',
    nationalIdNumber: 'ID-SUP-03',
    notes: 'Cases and chargers',
    active: false,
    createdAt: '2026-02-15T15:30:00.000Z',
  },
]

describe('SupplierWorkspace Regression & Workflow Tests', () => {
  let supplierList: SupplierRecord[]

  beforeEach(() => {
    supplierList = structuredClone(initialSuppliers)
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

  function setupSupplierFetchMock(customHandlers: Record<string, (url: string, init: RequestInit) => Promise<Response> | Response> = {}) {
    const mockFn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)

      for (const [pattern, handler] of Object.entries(customHandlers)) {
        if (url.includes(pattern)) {
          return handler(url, init)
        }
      }

      if (url.includes('/api/suppliers') && init.method === 'POST') {
        const body = JSON.parse(String(init.body || '{}'))
        const newSupplier: SupplierRecord = {
          _id: `sup-${Date.now()}`,
          name: body.name,
          phone: body.phone,
          nationalIdNumber: body.nationalIdNumber,
          notes: body.notes,
          active: true,
          createdAt: new Date().toISOString(),
        }
        supplierList.unshift(newSupplier)
        return new Response(JSON.stringify({ supplier: newSupplier }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (url.includes('/api/suppliers/') && init.method === 'PATCH') {
        const id = url.split('/api/suppliers/')[1].split('?')[0]
        const body = JSON.parse(String(init.body || '{}'))
        const target = supplierList.find((s) => s._id === id)
        if (target) {
          Object.assign(target, body)
        }
        return new Response(JSON.stringify({ supplier: target }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (url.includes('/api/suppliers/') && init.method === 'DELETE') {
        const id = url.split('/api/suppliers/')[1].split('?')[0]
        supplierList = supplierList.filter((s) => s._id !== id)
        return new Response(JSON.stringify({ message: 'Supplier deleted' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (url.includes('/api/suppliers')) {
        return new Response(JSON.stringify({ suppliers: [...supplierList] }), {
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

  it('1. Creating a supplier updates the list without refreshing', async () => {
    const user = userEvent.setup()
    setupSupplierFetchMock()

    render(<SupplierWorkspace />)

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument()
    })
    const table = screen.getByRole('table')
    expect(within(table).getByText('Angkor Tech Supplies')).toBeInTheDocument()
    expect(within(table).getByText('Mekong Mobile Wholesaler')).toBeInTheDocument()

    // Click Add supplier button
    const addButton = screen.getByRole('button', { name: /add supplier/i })
    await user.click(addButton)

    const dialog = screen.getByRole('dialog', { name: /add supplier/i })
    expect(dialog).toBeInTheDocument()

    const nameInput = within(dialog).getByLabelText(/supplier name/i)
    const phoneInput = within(dialog).getByLabelText(/phone number/i)
    const idInput = within(dialog).getByLabelText(/national id/i)
    const notesInput = within(dialog).getByLabelText(/notes/i)

    await user.type(nameInput, 'Khmer Parts Hub')
    await user.type(phoneInput, '015999888')
    await user.type(idInput, 'ID-KPH-99')
    await user.type(notesInput, 'OEM screen assemblies')

    const saveButton = within(dialog).getByRole('button', { name: /save supplier/i })
    await user.click(saveButton)

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /add supplier/i })).not.toBeInTheDocument()
    })
    expect(screen.getByText('Khmer Parts Hub added')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /done/i }))

    // Record appears without page refresh
    const updatedTable = screen.getByRole('table')
    expect(within(updatedTable).getByText('Khmer Parts Hub')).toBeInTheDocument()
    expect(within(updatedTable).getByText('015999888')).toBeInTheDocument()
    expect(within(updatedTable).getByText('ID-KPH-99')).toBeInTheDocument()
  })

  it('2. Editing updates the correct record and preserves unrelated fields', async () => {
    const user = userEvent.setup()
    let patchPayload: Record<string, unknown> | null = null

    setupSupplierFetchMock({
      '/api/suppliers/sup-1': (url, init) => {
        if (init.method === 'PATCH') {
          patchPayload = JSON.parse(String(init.body || '{}'))
          const target = supplierList.find((s) => s._id === 'sup-1')!
          Object.assign(target, patchPayload)
          return new Response(JSON.stringify({ supplier: target }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({}), { status: 200 })
      },
    })

    render(<SupplierWorkspace />)
    await waitFor(() => {
      expect(within(screen.getByRole('table')).getByText('Angkor Tech Supplies')).toBeInTheDocument()
    })

    const editBtns = screen.getAllByRole('button', { name: 'Edit Angkor Tech Supplies' })
    await user.click(editBtns[0])

    const dialog = screen.getByRole('dialog', { name: /edit supplier/i })
    expect(dialog).toBeInTheDocument()

    const phoneInput = within(dialog).getByLabelText(/phone number/i) as HTMLInputElement
    expect(phoneInput.value).toBe('023111222')

    await user.clear(phoneInput)
    await user.type(phoneInput, '023777888')

    const saveButton = within(dialog).getByRole('button', { name: /save changes/i })
    await user.click(saveButton)

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /edit supplier/i })).not.toBeInTheDocument()
    })
    expect(screen.getByText('Angkor Tech Supplies updated')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /done/i }))

    expect(patchPayload).toEqual({
      name: 'Angkor Tech Supplies',
      phone: '023777888',
      nationalIdNumber: 'ID-SUP-01',
      notes: 'Primary screen and battery supplier',
    })

    expect(within(screen.getByRole('table')).getByText('023777888')).toBeInTheDocument()

    const target = supplierList.find((s) => s._id === 'sup-1')!
    expect(target.active).toBe(true)
    expect(target.createdAt).toBe('2026-01-10T08:00:00.000Z')
  })

  it('3. Failed saves keep entered values and show an error inside the active dialog', async () => {
    const user = userEvent.setup()

    setupSupplierFetchMock({
      '/api/suppliers': (url, init) => {
        if (init.method === 'POST') {
          return new Response(JSON.stringify({ message: 'Supplier name already in use' }), {
            status: 409,
            headers: { 'content-type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ suppliers: [...supplierList] }), { status: 200 })
      },
    })

    render(<SupplierWorkspace />)
    await waitFor(() => {
      expect(within(screen.getByRole('table')).getByText('Angkor Tech Supplies')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /add supplier/i }))
    const dialog = screen.getByRole('dialog', { name: /add supplier/i })

    const nameInput = within(dialog).getByLabelText(/supplier name/i) as HTMLInputElement
    const phoneInput = within(dialog).getByLabelText(/phone number/i) as HTMLInputElement
    const notesInput = within(dialog).getByLabelText(/notes/i) as HTMLInputElement

    await user.type(nameInput, 'Duplicate Supplier')
    await user.type(phoneInput, '088776655')
    await user.type(notesInput, 'Should stay in inputs')

    const saveButton = within(dialog).getByRole('button', { name: /save supplier/i })
    await user.click(saveButton)

    await waitFor(() => {
      expect(within(dialog).getByText(/Supplier name already in use/i)).toBeInTheDocument()
    })

    expect(dialog).toBeInTheDocument()
    expect(nameInput.value).toBe('Duplicate Supplier')
    expect(phoneInput.value).toBe('088776655')
    expect(notesInput.value).toBe('Should stay in inputs')
  })

  it('4. Repeated submission while a request is pending sends only one request', async () => {
    let postCount = 0
    let resolvePendingPost!: (res: Response) => void
    const pendingPromise = new Promise<Response>((r) => { resolvePendingPost = r })

    setupSupplierFetchMock({
      '/api/suppliers': (url, init) => {
        if (init.method === 'POST') {
          postCount += 1
          return pendingPromise
        }
        return new Response(JSON.stringify({ suppliers: [...supplierList] }), { status: 200 })
      },
    })

    render(<SupplierWorkspace />)
    await waitFor(() => {
      expect(within(screen.getByRole('table')).getByText('Angkor Tech Supplies')).toBeInTheDocument()
    })

    const addButton = screen.getByRole('button', { name: /add supplier/i })
    fireEvent.click(addButton)

    const dialog = screen.getByRole('dialog', { name: /add supplier/i })
    const form = dialog.querySelector('form')!
    const nameInput = within(dialog).getByLabelText(/supplier name/i)
    fireEvent.change(nameInput, { target: { value: 'Single Request Supplier' } })

    // Fire first submit (starts pending request)
    fireEvent.submit(form)
    expect(postCount).toBe(1)

    // Fire repeated submits while still pending
    fireEvent.submit(form)
    fireEvent.submit(form)

    expect(postCount).toBe(1)

    // Resolve request
    resolvePendingPost(new Response(JSON.stringify({
      supplier: {
        _id: 'sup-single-req',
        name: 'Single Request Supplier',
        active: true,
        createdAt: new Date().toISOString(),
      },
    }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /add supplier/i })).not.toBeInTheDocument()
    })
    expect(postCount).toBe(1)
  })

  it('5. Search, filtering, empty results, and loading/error states work', async () => {
    const user = userEvent.setup()
    setupSupplierFetchMock()

    render(<SupplierWorkspace />)
    await waitFor(() => {
      expect(within(screen.getByRole('table')).getByText('Angkor Tech Supplies')).toBeInTheDocument()
    })
    const table = screen.getByRole('table')
    expect(within(table).getByText('Mekong Mobile Wholesaler')).toBeInTheDocument()
    expect(within(table).getByText('Bayon Accessories')).toBeInTheDocument()

    const searchInput = screen.getByPlaceholderText(/search supplier, phone, national id, or notes/i)

    // Search by name
    await user.type(searchInput, 'Mekong')
    expect(within(screen.getByRole('table')).getByText('Mekong Mobile Wholesaler')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).queryByText('Angkor Tech Supplies')).not.toBeInTheDocument()
    expect(within(screen.getByRole('table')).queryByText('Bayon Accessories')).not.toBeInTheDocument()

    // Search by phone
    await user.clear(searchInput)
    await user.type(searchInput, '092555666')
    expect(within(screen.getByRole('table')).getByText('Bayon Accessories')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).queryByText('Angkor Tech Supplies')).not.toBeInTheDocument()

    // Search by notes
    await user.clear(searchInput)
    await user.type(searchInput, 'battery supplier')
    expect(within(screen.getByRole('table')).getByText('Angkor Tech Supplies')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).queryByText('Mekong Mobile Wholesaler')).not.toBeInTheDocument()

    // Search with no match shows "No matching suppliers"
    await user.clear(searchInput)
    await user.type(searchInput, 'UnknownVendor999')
    expect(within(screen.getByRole('table')).getByText('No matching suppliers')).toBeInTheDocument()

    // Clear search restores all
    await user.clear(searchInput)
    expect(within(screen.getByRole('table')).getByText('Angkor Tech Supplies')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('Mekong Mobile Wholesaler')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('Bayon Accessories')).toBeInTheDocument()
  })

  it('6. Empty results when shop has 0 suppliers', async () => {
    supplierList = []
    setupSupplierFetchMock()

    render(<SupplierWorkspace />)
    expect(await screen.findByText('No suppliers yet')).toBeInTheDocument()
    expect(screen.getByText(/Add a supplier so employees can select it/i)).toBeInTheDocument()
  })

  it('7. Initial loading error shows top-level alert', async () => {
    setupSupplierFetchMock({
      '/api/suppliers': () => new Response(JSON.stringify({ message: 'Failed to fetch supplier directory', requestId: 'req-sup-fail' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    })

    render(<SupplierWorkspace />)
    expect(await screen.findByText(/Failed to fetch supplier directory/i)).toBeInTheDocument()
  })

  it('8. Supplier deletion: cancellation performs no deletion', async () => {
    const user = userEvent.setup()
    let deleteCalled = false

    setupSupplierFetchMock({
      '/api/suppliers/sup-2': (url, init) => {
        if (init.method === 'DELETE') {
          deleteCalled = true
          return new Response(JSON.stringify({ message: 'Supplier deleted' }), { status: 200 })
        }
        return new Response(JSON.stringify({}), { status: 200 })
      },
    })

    render(<SupplierWorkspace />)
    await waitFor(() => {
      expect(within(screen.getByRole('table')).getByText('Mekong Mobile Wholesaler')).toBeInTheDocument()
    })

    const deleteIconBtns = screen.getAllByRole('button', { name: 'Delete Mekong Mobile Wholesaler' })
    await user.click(deleteIconBtns[0])

    const alertdialog = screen.getByRole('alertdialog', { name: /delete “mekong mobile wholesaler”?/i })
    expect(alertdialog).toBeInTheDocument()

    const cancelBtn = within(alertdialog).getByRole('button', { name: /cancel/i })
    await user.click(cancelBtn)

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(deleteCalled).toBe(false)
    expect(within(screen.getByRole('table')).getByText('Mekong Mobile Wholesaler')).toBeInTheDocument()
  })

  it('9. Failed deletion keeps record visible and shows error inside the dialog', async () => {
    const user = userEvent.setup()

    setupSupplierFetchMock({
      '/api/suppliers/sup-1': (url, init) => {
        if (init.method === 'DELETE') {
          return new Response(JSON.stringify({
            message: 'This supplier is linked to transaction history. Deactivate them instead.',
          }), {
            status: 409,
            headers: { 'content-type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({}), { status: 200 })
      },
    })

    render(<SupplierWorkspace />)
    await waitFor(() => {
      expect(within(screen.getByRole('table')).getByText('Angkor Tech Supplies')).toBeInTheDocument()
    })

    const deleteIconBtns = screen.getAllByRole('button', { name: 'Delete Angkor Tech Supplies' })
    await user.click(deleteIconBtns[0])

    const alertdialog = screen.getByRole('alertdialog', { name: /delete “angkor tech supplies”?/i })
    const confirmBtn = within(alertdialog).getByRole('button', { name: /^delete$/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(within(alertdialog).getByText(/This supplier is linked to transaction history/i)).toBeInTheDocument()
    })

    expect(alertdialog).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('Angkor Tech Supplies')).toBeInTheDocument()
  })

  it('10. Successful deletion removes record and shows success only after API confirms it', async () => {
    const user = userEvent.setup()
    let resolveDelete!: (res: Response) => void
    const pendingDelete = new Promise<Response>((r) => { resolveDelete = r })

    setupSupplierFetchMock({
      '/api/suppliers/sup-2': (url, init) => {
        if (init.method === 'DELETE') {
          return pendingDelete
        }
        return new Response(JSON.stringify({}), { status: 200 })
      },
    })

    render(<SupplierWorkspace />)
    await waitFor(() => {
      expect(within(screen.getByRole('table')).getByText('Mekong Mobile Wholesaler')).toBeInTheDocument()
    })

    const deleteIconBtns = screen.getAllByRole('button', { name: 'Delete Mekong Mobile Wholesaler' })
    await user.click(deleteIconBtns[0])

    const alertdialog = screen.getByRole('alertdialog', { name: /delete “mekong mobile wholesaler”?/i })
    const confirmBtn = within(alertdialog).getByRole('button', { name: /^delete$/i })

    await user.click(confirmBtn)

    // While pending: success modal not shown, supplier still in table
    expect(screen.queryByText('Mekong Mobile Wholesaler deleted')).not.toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('Mekong Mobile Wholesaler')).toBeInTheDocument()

    // Resolve delete
    supplierList = supplierList.filter((s) => s._id !== 'sup-2')
    resolveDelete(new Response(JSON.stringify({ message: 'Supplier deleted' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    await waitFor(() => {
      expect(screen.getByText('Mekong Mobile Wholesaler deleted')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /done/i }))
    expect(within(screen.getByRole('table')).queryByText('Mekong Mobile Wholesaler')).not.toBeInTheDocument()
  })

  it('11. Repeated delete clicks while deletion is pending sends only one request', async () => {
    let deleteCount = 0
    let resolvePendingDelete!: (res: Response) => void
    const pendingPromise = new Promise<Response>((r) => { resolvePendingDelete = r })

    setupSupplierFetchMock({
      '/api/suppliers/sup-2': (url, init) => {
        if (init.method === 'DELETE') {
          deleteCount += 1
          return pendingPromise
        }
        return new Response(JSON.stringify({}), { status: 200 })
      },
    })

    render(<SupplierWorkspace />)
    await waitFor(() => {
      expect(within(screen.getByRole('table')).getByText('Mekong Mobile Wholesaler')).toBeInTheDocument()
    })

    const deleteIconBtns = screen.getAllByRole('button', { name: 'Delete Mekong Mobile Wholesaler' })
    fireEvent.click(deleteIconBtns[0])

    const alertdialog = screen.getByRole('alertdialog', { name: /delete “mekong mobile wholesaler”?/i })
    const confirmBtn = within(alertdialog).getByRole('button', { name: /^delete$/i })

    fireEvent.click(confirmBtn)
    expect(deleteCount).toBe(1)

    fireEvent.click(confirmBtn)
    fireEvent.click(confirmBtn)

    expect(deleteCount).toBe(1)

    supplierList = supplierList.filter((s) => s._id !== 'sup-2')
    resolvePendingDelete(new Response(JSON.stringify({ message: 'Supplier deleted' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    await waitFor(() => {
      expect(screen.getByText('Mekong Mobile Wholesaler deleted')).toBeInTheDocument()
    })
    expect(deleteCount).toBe(1)
  })

  it('12. Active/inactive toggle handles confirmation and updates status', async () => {
    const user = userEvent.setup()
    let patchPayload: Record<string, unknown> | null = null

    // Confirm window mock
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    setupSupplierFetchMock({
      '/api/suppliers/sup-1': (url, init) => {
        if (init.method === 'PATCH') {
          patchPayload = JSON.parse(String(init.body || '{}'))
          const target = supplierList.find((s) => s._id === 'sup-1')!
          Object.assign(target, patchPayload)
          return new Response(JSON.stringify({ supplier: target }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({}), { status: 200 })
      },
    })

    render(<SupplierWorkspace />)
    await waitFor(() => {
      expect(within(screen.getByRole('table')).getByText('Angkor Tech Supplies')).toBeInTheDocument()
    })

    // Toggle active status of Angkor Tech Supplies (currently Active)
    const toggleBtns = screen.getAllByRole('button', { name: 'Deactivate Angkor Tech Supplies' })
    await user.click(toggleBtns[0])

    expect(confirmSpy).toHaveBeenCalledWith('Deactivate Angkor Tech Supplies? They will no longer appear in New Purchase.')
    expect(patchPayload).toEqual({ active: false })

    // Verify it updated to Inactive
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Activate Angkor Tech Supplies' }).length).toBeGreaterThanOrEqual(1)
    })
  })
})
