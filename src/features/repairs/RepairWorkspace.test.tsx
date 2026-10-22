import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RepairWorkspace from './RepairWorkspace'

const repair = {
  _id: 'repair-1', repairNo: 'RP-20261016-ONE', customerName: 'Sela', customerPhone: '0882982042',
  device: 'Vivo Y02s', issue: 'Broken screen', status: 'IN_PROGRESS',
  parts: [{ _id: 'part-1', source: 'STOCK', status: 'RESERVED', name: 'Vivo screen', quantity: 1, sku: 'SCREEN-1' }],
  events: [{ action: 'RECEIVED', at: '2026-10-16T01:00:00.000Z' }],
  createdAt: '2026-10-16T01:00:00.000Z',
}

function response(payload: unknown) {
  return { ok: true, status: 200, headers: new Headers(), json: async () => payload } as Response
}

describe('RepairWorkspace', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('opens the existing repair form from the shared action card', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ repairs: [] }))
    const user = userEvent.setup()
    render(<RepairWorkspace />)

    const actionCard = screen.getByRole('region', { name: 'Repair actions' })
    expect(within(actionCard).getByRole('heading', { name: 'Take in a repair' })).toBeInTheDocument()
    await user.click(within(actionCard).getByRole('button', { name: 'New repair' }))
    const dialog = screen.getByRole('dialog', { name: 'New repair' })
    expect(within(dialog).getByLabelText('Customer name')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Create repair' })).toBeInTheDocument()
  })

  it('opens a linked repair preorder even when the repair is outside the recent list', async () => {
    const linked = { ...repair, status: 'WAITING_PARTS', parts: [{ _id: 'part-1', source: 'PREORDER', status: 'ORDERED', name: 'Screen', quantity: 1, supplierName: 'Parts shop' }] }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = String(input)
      if (path.includes('/api/repairs/repair-1')) return response({ repair: linked })
      if (path.includes('/api/repairs')) return response({ repairs: [] })
      if (path.includes('/api/inventory')) return response({ items: [] })
      if (path.includes('/api/trades')) return response({ trades: [] })
      throw new Error(`Unexpected request: ${path}`)
    })
    render(<RepairWorkspace openRepairId="repair-1" />)
    const dialog = await screen.findByRole('dialog', { name: repair.repairNo })
    expect(within(dialog).getByText('1 × Screen')).toBeInTheDocument()
    expect(within(dialog).getByText(/Preorder · Parts shop · Ordered/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Manage arrival' })).toHaveAttribute('aria-expanded', 'false')
    expect(within(dialog).queryByRole('combobox', { name: 'Find purchase for Screen' })).not.toBeInTheDocument()
  })

  it('shows repair history and the stock/preorder controls in the reused operation modal', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = String(input)
      if (path.includes('/api/repairs')) return response({ repairs: [repair] })
      if (path.includes('/api/inventory')) return response({ items: [{ _id: 'stock-1', name: 'Vivo screen', sku: 'SCREEN-1', category: 'SPARE_PART', status: 'IN_STOCK', quantity: 2 }] })
      if (path.includes('/api/trades')) return response({ trades: [] })
      throw new Error(`Unexpected request: ${path}`)
    })
    const user = userEvent.setup()
    render(<RepairWorkspace />)
    const actionCard = screen.getByRole('region', { name: 'Repair actions' })
    expect(within(actionCard).getByRole('heading', { name: 'Take in a repair' })).toBeInTheDocument()
    expect(within(actionCard).getByRole('button', { name: 'New repair' })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /Vivo Y02s/ }))
    const dialog = await screen.findByRole('dialog', { name: 'RP-20261016-ONE' })
    expect(dialog.querySelector('.operation-form.repair-detail')).not.toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Reserve stock part' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Add preorder' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Mark installed' })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Manage part' }))
    expect(within(dialog).getByRole('button', { name: 'Mark installed' })).toBeInTheDocument()
    expect(within(dialog).getByText(/This records the need only; it does not change stock or finances/)).toBeInTheDocument()
    expect(within(dialog).getAllByRole('button', { name: 'Close' })).toHaveLength(1)
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: repair.repairNo })).not.toBeInTheDocument()
  })

  it('shows newest repair events first with one date heading per day', async () => {
    const repairWithHistory = { ...repair, events: [
      { action: 'RECEIVED', at: '2026-10-14T06:00:00.000Z' },
      { action: 'PART_ORDERED', note: '1 × screen from fker', at: '2026-10-16T01:00:00.000Z' },
      { action: 'PART_RELEASED', note: '1 × screen', at: '2026-10-16T02:00:00.000Z' },
    ] }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = String(input)
      if (path.includes('/api/repairs')) return response({ repairs: [repairWithHistory] })
      if (path.includes('/api/inventory')) return response({ items: [] })
      if (path.includes('/api/trades')) return response({ trades: [] })
      throw new Error(`Unexpected request: ${path}`)
    })

    const user = userEvent.setup()
    render(<RepairWorkspace />)
    await user.click(await screen.findByRole('button', { name: /Vivo Y02s/ }))
    const dialog = await screen.findByRole('dialog', { name: repair.repairNo })
    const history = within(dialog).getByRole('heading', { name: 'History' }).closest('section') as HTMLElement
    expect([...history.querySelectorAll('time')].map((time) => time.textContent)).toEqual(['16 Oct 2026', '14 Oct 2026'])
    expect([...history.querySelectorAll('li strong')].map((title) => title.textContent)).toEqual(['Part Released', 'Part Ordered', 'Received'])
    expect(within(history).getByText('1 × screen from fker')).toBeInTheDocument()
  })

  it('searches stock with the purchase picker and reserves only the selected part', async () => {
    const writes: Record<string, unknown>[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.includes('/api/repairs/repair-1/parts/reserve')) {
        writes.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
        return response({ repair })
      }
      if (path.includes('/api/repairs')) return response({ repairs: [repair] })
      if (path.includes('/api/inventory')) return response({ items: [
        { _id: 'stock-screen', name: 'Vivo screen', sku: 'SCREEN-1', category: 'SPARE_PART', status: 'IN_STOCK', quantity: 2 },
        { _id: 'stock-charger', name: 'USB charger', sku: 'CHARGER-1', category: 'ACCESSORY', status: 'IN_STOCK', quantity: 4 },
      ] })
      if (path.includes('/api/trades')) return response({ trades: [] })
      throw new Error(`Unexpected request: ${path}`)
    })

    const user = userEvent.setup()
    render(<RepairWorkspace />)
    await user.click(await screen.findByRole('button', { name: /Vivo Y02s/ }))
    const dialog = await screen.findByRole('dialog', { name: repair.repairNo })
    const picker = await within(dialog).findByRole('combobox', { name: 'Available product' })
    expect(picker).toHaveAttribute('type', 'text')
    await user.type(picker, 'SCREEN-1')
    const options = within(within(dialog).getByRole('listbox', { name: 'Available stock parts' })).getAllByRole('option')
    expect(options).toHaveLength(1)
    await user.click(options[0])

    expect(picker).toHaveValue('Vivo screen')
    expect(within(dialog).getByText('After reserve')).toBeInTheDocument()
    const quantity = within(dialog).getByRole('spinbutton', { name: 'Quantity' })
    await user.clear(quantity)
    await user.type(quantity, '3')
    expect(within(dialog).getByRole('button', { name: 'Reserve stock part' })).toBeDisabled()
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Only 2 available')
    await user.clear(quantity)
    await user.type(quantity, '1')
    await user.click(within(dialog).getByRole('button', { name: 'Reserve stock part' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ inventoryItemId: 'stock-screen', quantity: 1 })
  })

  it('shows eligible purchases before searching, filters them on demand, and requires confirmation before receiving', async () => {
    const orderedRepair = { ...repair, status: 'WAITING_PARTS', parts: [{ _id: 'part-1', source: 'PREORDER', status: 'ORDERED', name: 'Screen', quantity: 1, supplierName: 'Parts shop' }] }
    const writes: Record<string, unknown>[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.includes('/api/repairs/repair-1/parts/part-1/receive')) {
        writes.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
        return response({ repair: orderedRepair })
      }
      if (path.includes('/api/repairs')) return response({ repairs: [orderedRepair] })
      if (path.includes('/api/inventory')) return response({ items: [] })
      if (path.includes('/api/trades')) return response({ trades: [
        { _id: 'buy-1', tradeNo: 'BY-UNRELATED', type: 'BUY', status: 'COMPLETED', createdAt: '2026-10-21T01:00:00.000Z', items: [{ inventoryItem: 'item-1', name: 'Phone battery', quantity: 1 }] },
        { _id: 'buy-2', tradeNo: 'BY-SCREEN', type: 'BUY', status: 'COMPLETED', createdAt: '2026-10-21T02:00:00.000Z', supplier: { name: 'Parts shop' }, items: [{ inventoryItem: 'item-2', name: 'Screen Pro', quantity: 1 }] },
      ] })
      throw new Error(`Unexpected request: ${path}`)
    })

    const user = userEvent.setup()
    render(<RepairWorkspace />)
    await user.click(await screen.findByRole('button', { name: /Vivo Y02s/ }))
    const dialog = await screen.findByRole('dialog', { name: repair.repairNo })
    const toggle = within(dialog).getByRole('button', { name: 'Manage arrival' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveTextContent('Minimize')
    const search = within(dialog).getByRole('combobox', { name: 'Find purchase for Screen' })
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(within(dialog).queryByRole('combobox', { name: 'Find purchase for Screen' })).not.toBeInTheDocument()
    await user.click(toggle)
    expect(within(dialog).getByRole('combobox', { name: 'Find purchase for Screen' })).toBe(search)
    await user.click(search)
    const results = within(dialog).getByRole('listbox', { name: 'Recorded purchases for Screen' })
    expect(within(results).getAllByRole('option')).toHaveLength(2)
    expect(within(results).getByRole('option', { name: /BY-UNRELATED/ })).toBeInTheDocument()
    expect(within(results).getByRole('option', { name: /BY-SCREEN/ })).toBeInTheDocument()
    await user.type(search, 'missing part')
    expect(within(results).getByText(/No matching purchase/)).toBeInTheDocument()
    await user.clear(search)
    expect(within(results).getAllByRole('option')).toHaveLength(2)
    await user.type(search, 'BY-SCREEN')
    expect(within(results).getAllByRole('option')).toHaveLength(1)
    expect(within(results).queryByRole('option', { name: /BY-UNRELATED/ })).not.toBeInTheDocument()
    await user.click(within(results).getByRole('option', { name: /BY-SCREEN/ }))
    expect(within(dialog).getByText(/Product names differ/)).toBeInTheDocument()
    const receive = within(dialog).getByRole('button', { name: 'Receive & reserve this part' })
    expect(receive).toBeDisabled()
    expect(writes).toHaveLength(0)
    await user.click(within(dialog).getByRole('checkbox', { name: /I checked that this purchase contains the part/ }))
    await user.click(receive)
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ purchaseTradeId: 'buy-2', inventoryItemId: 'item-2', confirmedMatch: true })
  })

  it('records customer approval through the in-app dialog only after a note is entered', async () => {
    const writes: Record<string, unknown>[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.includes('/api/repairs/repair-1/status')) {
        writes.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
        return response({ repair: { ...repair, status: 'IN_PROGRESS' } })
      }
      if (path.includes('/api/repairs')) return response({ repairs: [{ ...repair, status: 'APPROVAL' }] })
      if (path.includes('/api/inventory')) return response({ items: [] })
      if (path.includes('/api/trades')) return response({ trades: [] })
      throw new Error(`Unexpected request: ${path}`)
    })
    const user = userEvent.setup()
    render(<RepairWorkspace />)
    await user.click(await screen.findByRole('button', { name: /Vivo Y02s/ }))
    await user.click(screen.getByRole('button', { name: /Customer approved.*start repair/ }))

    const approval = screen.getByRole('dialog', { name: 'Record customer approval' })
    expect(screen.queryByRole('dialog', { name: repair.repairNo })).not.toBeInTheDocument()
    expect(writes).toHaveLength(0)
    const save = within(approval).getByRole('button', { name: 'Start repair' })
    expect(save).toBeDisabled()
    await user.type(within(approval).getByLabelText('How did the customer approve?'), 'By phone')
    await user.click(save)
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ status: 'IN_PROGRESS', note: 'By phone' })
    await screen.findByRole('dialog', { name: repair.repairNo })
  })

  it('lets the user back out of cancellation without changing the repair', async () => {
    const write = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.includes('/api/repairs/repair-1/status')) { write(init); return response({ repair }) }
      if (path.includes('/api/repairs')) return response({ repairs: [repair] })
      if (path.includes('/api/inventory')) return response({ items: [] })
      if (path.includes('/api/trades')) return response({ trades: [] })
      throw new Error(`Unexpected request: ${path}`)
    })
    const user = userEvent.setup()
    render(<RepairWorkspace />)
    await user.click(await screen.findByRole('button', { name: /Vivo Y02s/ }))
    await user.click(screen.getByRole('button', { name: 'Cancel repair' }))
    const cancellation = screen.getByRole('dialog', { name: 'Cancel repair' })
    expect(within(cancellation).getByText(/Unused reserved parts return to stock/)).toBeInTheDocument()
    expect(within(cancellation).getByRole('button', { name: 'Cancel repair' })).toBeDisabled()
    await user.click(within(cancellation).getByRole('button', { name: 'Go back' }))
    expect(write).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: repair.repairNo })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel repair' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Cancel repair' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: repair.repairNo })).toBeInTheDocument()
    expect(write).not.toHaveBeenCalled()
  })

  it('keeps the approval note visible if saving fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = String(input)
      if (path.includes('/api/repairs/repair-1/status')) return { ok: false, status: 409, headers: new Headers(), json: async () => ({ message: 'Repair changed elsewhere' }) } as Response
      if (path.includes('/api/repairs')) return response({ repairs: [{ ...repair, status: 'APPROVAL' }] })
      if (path.includes('/api/inventory')) return response({ items: [] })
      if (path.includes('/api/trades')) return response({ trades: [] })
      throw new Error(`Unexpected request: ${path}`)
    })
    const user = userEvent.setup()
    render(<RepairWorkspace />)
    await user.click(await screen.findByRole('button', { name: /Vivo Y02s/ }))
    await user.click(screen.getByRole('button', { name: /Customer approved.*start repair/ }))
    const approval = screen.getByRole('dialog', { name: 'Record customer approval' })
    await user.type(within(approval).getByLabelText('How did the customer approve?'), 'In person')
    await user.click(within(approval).getByRole('button', { name: 'Start repair' }))
    expect(await within(approval).findByRole('alert')).toHaveTextContent('Repair changed elsewhere')
    expect(within(approval).getByLabelText('How did the customer approve?')).toHaveValue('In person')
  })

  it('uses an in-app pickup confirmation without writing when the user goes back', async () => {
    const write = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.includes('/api/repairs/repair-1/status')) { write(init); return response({ repair }) }
      if (path.includes('/api/repairs')) return response({ repairs: [{ ...repair, status: 'READY_PICKUP', parts: [] }] })
      if (path.includes('/api/inventory')) return response({ items: [] })
      if (path.includes('/api/trades')) return response({ trades: [] })
      throw new Error(`Unexpected request: ${path}`)
    })
    const user = userEvent.setup()
    render(<RepairWorkspace />)
    await user.click(await screen.findByRole('button', { name: /Vivo Y02s/ }))
    await user.click(screen.getByRole('button', { name: 'Handed to customer' }))
    const pickup = screen.getByRole('dialog', { name: 'Confirm pickup' })
    expect(within(pickup).getByText(/payment separately in Service charges/)).toBeInTheDocument()
    await user.click(within(pickup).getByRole('button', { name: 'Go back' }))
    expect(write).not.toHaveBeenCalled()
  })
})
