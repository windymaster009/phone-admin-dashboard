import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { printReceiptWindow } from '../receipts/receipt-print'
import CustomerPreorderWorkspace from './CustomerPreorderWorkspace'

vi.mock('../receipts/receipt-print', () => ({ printReceiptWindow: vi.fn(async () => true) }))

const preorder = {
  _id: 'order-1', preorderNo: 'PO-20261016-ONE', customerName: 'Sela', customerPhone: '0882982042',
  category: 'ACCESSORY', productName: 'Vivo Y02s case', quantity: 1, status: 'REQUESTED',
  events: [{ action: 'REQUESTED', at: '2026-10-16T01:00:00.000Z' }], createdAt: '2026-10-16T01:00:00.000Z',
}
const response = (payload: unknown) => ({ ok: true, status: 200, headers: new Headers(), json: async () => payload }) as Response

describe('CustomerPreorderWorkspace', () => {
  beforeEach(() => { vi.restoreAllMocks(); vi.clearAllMocks() })

  it('opens an older customer preorder from global search and clears the URL on close', async () => {
    window.history.replaceState({}, '', '/customer-preorders?openPreorder=order-1')
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = String(input)
      if (path.includes('/api/customer-preorders/repair-parts')) return response({ repairParts: [] })
      if (path.includes('/api/customer-preorders/order-1')) return response({ preorder })
      if (path.includes('/api/customer-preorders')) return response({ preorders: [] })
      if (path.includes('/api/suppliers')) return response({ suppliers: [] })
      if (path.includes('/api/trades')) return response({ trades: [] })
      throw new Error(`Unexpected request: ${path}`)
    })
    try {
      const user = userEvent.setup()
      render(<CustomerPreorderWorkspace />)
      const dialog = await screen.findByRole('dialog', { name: preorder.preorderNo })
      expect(within(dialog).getAllByText(/Sela/).length).toBeGreaterThan(0)
      await user.click(within(dialog).getAllByRole('button', { name: 'Close' }).at(-1)!)
      expect(new URLSearchParams(window.location.search).has('openPreorder')).toBe(false)
    } finally {
      window.history.replaceState({}, '', '/')
    }
  })

  it('shows a separate customer preorder queue and supplier-order step', async () => {
    const orders: Record<string, unknown>[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.includes('/api/customer-preorders/repair-parts')) return response({ repairParts: [] })
      if (path.includes('/api/customer-preorders/order-1/order')) {
        orders.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
        return response({ preorder: { ...preorder, status: 'ORDERED', supplierName: 'Parts shop', events: [...preorder.events, { action: 'ORDERED', note: 'Supplier: Parts shop', at: '2026-10-17T01:00:00.000Z' }] } })
      }
      if (path.includes('/api/customer-preorders')) return response({ preorders: [preorder] })
      if (path.includes('/api/suppliers')) return response({ suppliers: [{ _id: 'supplier-1', name: 'Parts shop', phone: '012345678' }] })
      if (path.includes('/api/trades')) return response({ trades: [] })
      throw new Error(`Unexpected request: ${path}`)
    })
    const user = userEvent.setup()
    render(<CustomerPreorderWorkspace />)
    expect(screen.getByRole('heading', { name: 'Take a preorder' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Track an order' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New preorder' })).toBeInTheDocument()
    const preorderRow = await screen.findByRole('button', { name: /Vivo Y02s case/ })
    expect(preorderRow).toHaveClass('record-list-row')
    expect(within(preorderRow).getByText('Requested')).toBeInTheDocument()
    await user.click(preorderRow)
    const dialog = await screen.findByRole('dialog', { name: preorder.preorderNo })
    expect(dialog.querySelector('.operation-form.preorder-detail')).not.toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Mark ordered' })).toBeDisabled()
    const supplier = await within(dialog).findByRole('combobox', { name: 'Supplier' })
    expect(await within(supplier).findByRole('option', { name: 'Parts shop — 012345678' })).toBeInTheDocument()
    expect(within(dialog).getByText(/does not create a purchase or charge the customer/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel preorder' })).toBeInTheDocument()
    await user.selectOptions(supplier, 'supplier-1')
    await user.click(within(dialog).getByRole('button', { name: 'Mark ordered' }))
    expect(orders).toEqual([{ supplierId: 'supplier-1', expectedAt: '' }])
    expect(await within(dialog).findByText('Supplier: Parts shop')).toBeInTheDocument()
  })

  it('requires a registered supplier before marking a preorder ordered', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = String(input)
      if (path.includes('/api/customer-preorders/repair-parts')) return response({ repairParts: [] })
      if (path.includes('/api/customer-preorders')) return response({ preorders: [preorder] })
      if (path.includes('/api/suppliers')) return response({ suppliers: [] })
      if (path.includes('/api/trades')) return response({ trades: [] })
      throw new Error(`Unexpected request: ${path}`)
    })
    const user = userEvent.setup()
    render(<CustomerPreorderWorkspace />)
    await user.click(await screen.findByRole('button', { name: /Open preorder PO-20261016-ONE/ }))
    const dialog = screen.getByRole('dialog', { name: preorder.preorderNo })
    expect(await within(dialog).findByText('Add a supplier in Suppliers first.')).toBeInTheDocument()
    expect(within(dialog).getByRole('combobox', { name: 'Supplier' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Mark ordered' })).toBeDisabled()
  })

  it('prints an ordered customer preorder confirmation without prices', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = String(input)
      if (path.includes('/api/customer-preorders/repair-parts')) return response({ repairParts: [] })
      if (path.includes('/api/customer-preorders')) return response({ preorders: [{ ...preorder, status: 'ORDERED', supplierName: 'Internal supplier' }] })
      if (path.includes('/api/trades')) return response({ trades: [] })
      throw new Error(`Unexpected request: ${path}`)
    })
    const user = userEvent.setup()
    render(<CustomerPreorderWorkspace />)
    await user.click(await screen.findByRole('button', { name: /Open preorder PO-20261016-ONE/ }))
    const dialog = screen.getByRole('dialog', { name: preorder.preorderNo })
    await user.click(within(dialog).getByRole('button', { name: 'Print preorder' }))
    await waitFor(() => expect(printReceiptWindow).toHaveBeenCalledOnce())
    const options = vi.mocked(printReceiptWindow).mock.calls[0][0]
    expect(options.layout).toBe('THERMAL')
    expect(options.markup).toContain(preorder.preorderNo)
    expect(options.markup).toContain(preorder.customerName)
    expect(options.markup).toContain(preorder.productName)
    expect(options.markup).not.toContain('Internal supplier')
    expect(options.markup).not.toMatch(/\$|price|cost/i)
  })

  it('uses the repair purchase picker for arrival and confirms the selected product', async () => {
    const ordered = { ...preorder, status: 'ORDERED', supplierName: 'Parts shop' }
    const writes: Record<string, unknown>[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.includes('/api/customer-preorders/repair-parts')) return response({ repairParts: [] })
      if (path.includes('/api/customer-preorders/order-1/receive')) {
        writes.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
        return response({ preorder: { ...ordered, status: 'ARRIVED', inventoryItem: 'item-2' } })
      }
      if (path.includes('/api/customer-preorders')) return response({ preorders: [ordered] })
      if (path.includes('/api/trades?type=BUY')) return response({ trades: [
        { _id: 'buy-1', tradeNo: 'BY-UNRELATED', type: 'BUY', status: 'COMPLETED', createdAt: '2026-10-17T01:00:00.000Z', items: [{ inventoryItem: 'item-1', name: 'Phone battery', quantity: 1 }] },
        { _id: 'buy-2', tradeNo: 'BY-CASE', type: 'BUY', status: 'COMPLETED', createdAt: '2026-10-17T02:00:00.000Z', supplier: { _id: 'supplier-1', name: 'Parts shop' }, items: [{ inventoryItem: 'item-2', name: 'Vivo case', quantity: 1 }] },
        { _id: 'buy-old', tradeNo: 'BY-OLD', type: 'BUY', status: 'COMPLETED', createdAt: '2026-10-15T01:00:00.000Z', items: [{ inventoryItem: 'item-3', name: 'Old case', quantity: 1 }] },
      ] })
      if (path.includes('/api/trades?type=SELL')) return response({ trades: [] })
      throw new Error(`Unexpected request: ${path}`)
    })

    const user = userEvent.setup()
    render(<CustomerPreorderWorkspace />)
    await user.click(await screen.findByRole('button', { name: /Open preorder PO-20261016-ONE/ }))
    const dialog = screen.getByRole('dialog', { name: preorder.preorderNo })
    const search = await within(dialog).findByRole('combobox', { name: 'Find purchase for Vivo Y02s case' })
    await waitFor(() => expect(search).toBeEnabled())
    expect(within(dialog).getByRole('button', { name: 'Mark arrived' })).toBeDisabled()
    expect(within(dialog).queryByRole('combobox', { name: 'Purchased product' })).not.toBeInTheDocument()
    await user.click(search)
    const results = within(dialog).getByRole('listbox', { name: 'Recorded purchases for Vivo Y02s case' })
    expect(within(results).getAllByRole('option')).toHaveLength(2)
    expect(within(results).queryByRole('option', { name: /BY-OLD/ })).not.toBeInTheDocument()
    await user.type(search, 'Parts shop')
    expect(within(results).getAllByRole('option')).toHaveLength(1)
    await user.click(within(results).getByRole('option', { name: /BY-CASE/ }))
    expect(within(dialog).getByText(/Product names differ/)).toBeInTheDocument()
    const receive = within(dialog).getByRole('button', { name: 'Mark arrived' })
    expect(receive).toBeDisabled()
    expect(writes).toHaveLength(0)
    await user.click(within(dialog).getByRole('checkbox', { name: /I checked that this purchase contains the product/ }))
    await user.click(receive)
    await waitFor(() => expect(writes).toEqual([{ purchaseTradeId: 'buy-2', inventoryItemId: 'item-2' }]))
    expect(await within(dialog).findByRole('heading', { name: 'Customer pickup' })).toBeInTheDocument()
  })

  it('shows the arrival action even when no completed purchase is eligible yet', async () => {
    const ordered = { ...preorder, status: 'ORDERED' }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = String(input)
      if (path.includes('/api/customer-preorders/repair-parts')) return response({ repairParts: [] })
      if (path.includes('/api/customer-preorders')) return response({ preorders: [ordered] })
      if (path.includes('/api/trades')) return response({ trades: [] })
      throw new Error(`Unexpected request: ${path}`)
    })
    const user = userEvent.setup()
    render(<CustomerPreorderWorkspace />)
    await user.click(await screen.findByRole('button', { name: /Open preorder PO-20261016-ONE/ }))
    const dialog = screen.getByRole('dialog', { name: preorder.preorderNo })
    const search = within(dialog).getByRole('combobox', { name: 'Find purchase for Vivo Y02s case' })
    await waitFor(() => expect(search).toHaveAttribute('placeholder', 'No eligible completed purchases yet'))
    expect(within(dialog).getByRole('button', { name: 'Mark arrived' })).toBeDisabled()
  })

  it('shows preorder history as a newest-first timeline with dates and notes', async () => {
    const withHistory = { ...preorder, events: [
      { action: 'REQUESTED', at: '2026-10-16T01:00:00.000Z' },
      { action: 'ORDERED', note: 'Supplier confirmed delivery', at: '2026-10-17T01:00:00.000Z' },
    ] }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = String(input)
      if (path.includes('/api/customer-preorders/repair-parts')) return response({ repairParts: [] })
      if (path.includes('/api/customer-preorders')) return response({ preorders: [withHistory] })
      if (path.includes('/api/suppliers')) return response({ suppliers: [] })
      if (path.includes('/api/trades')) return response({ trades: [] })
      throw new Error(`Unexpected request: ${path}`)
    })
    const user = userEvent.setup()
    render(<CustomerPreorderWorkspace />)
    await user.click(await screen.findByRole('button', { name: /Open preorder PO-20261016-ONE/ }))
    const dialog = screen.getByRole('dialog', { name: preorder.preorderNo })
    const history = within(dialog).getByRole('heading', { name: 'History' }).closest('section') as HTMLElement
    const entries = within(history).getAllByRole('listitem')
    expect(entries).toHaveLength(2)
    expect(within(entries[0]).getByText('Ordered')).toBeInTheDocument()
    expect(within(entries[0]).getByText('Supplier confirmed delivery')).toBeInTheDocument()
    expect(within(entries[0]).getByText('17 Oct 2026')).toHaveAttribute('datetime', '2026-10-17T01:00:00.000Z')
    expect(within(entries[1]).getByText('Requested')).toBeInTheDocument()
  })

  it('confirms cancellation in an app dialog before changing the preorder', async () => {
    const cancelRequests: { reason: string }[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.includes('/api/customer-preorders/repair-parts')) return response({ repairParts: [] })
      if (path.includes('/api/customer-preorders/order-1/cancel')) {
        const body = JSON.parse(String(init?.body)) as { reason: string }
        cancelRequests.push(body)
        return response({ preorder: { ...preorder, status: 'CANCELLED', cancellationReason: body.reason } })
      }
      if (path.includes('/api/customer-preorders')) return response({ preorders: [preorder] })
      if (path.includes('/api/suppliers')) return response({ suppliers: [] })
      if (path.includes('/api/trades')) return response({ trades: [] })
      throw new Error(`Unexpected request: ${path}`)
    })
    const user = userEvent.setup()
    render(<CustomerPreorderWorkspace />)
    await user.click(await screen.findByRole('button', { name: /Open preorder PO-20261016-ONE/ }))
    await user.click(within(screen.getByRole('dialog', { name: preorder.preorderNo })).getByRole('button', { name: 'Cancel preorder' }))
    const dialog = screen.getByRole('dialog', { name: 'Cancel preorder' })
    expect(within(dialog).getByText(/purchased remains in stock/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel preorder' })).toBeDisabled()
    expect(cancelRequests).toHaveLength(0)
    await user.type(within(dialog).getByRole('textbox', { name: 'Reason for cancellation' }), 'Customer changed their mind')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel preorder' }))
    expect(await screen.findByText(/Cancelled: Customer changed their mind/)).toBeInTheDocument()
    expect(cancelRequests).toEqual([{ reason: 'Customer changed their mind' }])
  })

  it('offers searchable existing customers while keeping walk-in details possible', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = String(input)
      if (path.includes('/api/customer-preorders/repair-parts')) return response({ repairParts: [] })
      if (path.includes('/api/customer-preorders')) return response({ preorders: [] })
      if (path.includes('/api/customers')) return response({ customers: [{ _id: 'customer-1', name: 'Sela', phone: '0882982042' }] })
      throw new Error(`Unexpected request: ${path}`)
    })
    const user = userEvent.setup()
    render(<CustomerPreorderWorkspace />)
    await user.click(await screen.findByRole('button', { name: 'New preorder' }))
    const dialog = await screen.findByRole('dialog', { name: 'New customer preorder' })
    expect(within(dialog).getByText(/No deposit is recorded here/)).toBeInTheDocument()
    const category = within(dialog).getByRole('combobox', { name: 'Product category' })
    expect(category.parentElement?.querySelector('svg.lucide-chevron-down')).not.toBeNull()
    await user.selectOptions(category, 'TABLET')
    expect(category).toHaveValue('TABLET')
    await user.type(within(dialog).getByLabelText('Customer name'), 'Sel')
    await user.click(await within(dialog).findByRole('button', { name: /Sela · 0882982042/ }))
    expect(within(dialog).getByLabelText('Phone number')).toHaveValue('0882982042')
  })

  it('shows repair-part preorders in the same queue and opens their repair job', async () => {
    const openRepair = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = String(input)
      if (path.includes('/api/customer-preorders/repair-parts')) return response({ repairParts: [{
        repairId: 'repair-1', repairNo: 'RP-20261020-TEST', partId: 'part-1',
        customerName: 'Sela', device: 'Vivo Y02s', name: 'Screen', quantity: 1,
        supplierName: 'Parts shop', status: 'ORDERED', createdAt: '2026-10-20T01:00:00.000Z',
      }] })
      if (path.includes('/api/customer-preorders')) return response({ preorders: [preorder] })
      throw new Error(`Unexpected request: ${path}`)
    })
    const user = userEvent.setup()
    render(<CustomerPreorderWorkspace onOpenRepair={openRepair} />)

    const repairRow = await screen.findByRole('button', { name: 'Open repair RP-20261020-TEST for preordered Screen' })
    expect(within(repairRow).getByText(/Repair part · RP-20261020-TEST/)).toBeInTheDocument()
    expect(within(repairRow).getByText('Ordered')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open preorder PO-20261016-ONE/ })).toBeInTheDocument()
    await user.click(repairRow)
    expect(openRepair).toHaveBeenCalledWith('repair-1')
  })
})
