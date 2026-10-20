import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CustomerPreorderWorkspace from './CustomerPreorderWorkspace'

const preorder = {
  _id: 'order-1', preorderNo: 'PO-20261016-ONE', customerName: 'Sela', customerPhone: '0882982042',
  category: 'ACCESSORY', productName: 'Vivo Y02s case', quantity: 1, status: 'REQUESTED',
  events: [{ action: 'REQUESTED', at: '2026-10-16T01:00:00.000Z' }], createdAt: '2026-10-16T01:00:00.000Z',
}
const response = (payload: unknown) => ({ ok: true, status: 200, headers: new Headers(), json: async () => payload }) as Response

describe('CustomerPreorderWorkspace', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('shows a separate customer preorder queue and supplier-order step', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = String(input)
      if (path.includes('/api/customer-preorders')) return response({ preorders: [preorder] })
      if (path.includes('/api/trades')) return response({ trades: [] })
      throw new Error(`Unexpected request: ${path}`)
    })
    const user = userEvent.setup()
    render(<CustomerPreorderWorkspace />)
    expect(screen.getByRole('heading', { name: 'Take a preorder' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Track an order' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New preorder' })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /Vivo Y02s case/ }))
    const dialog = await screen.findByRole('dialog', { name: preorder.preorderNo })
    expect(dialog.querySelector('.operation-form.preorder-detail')).not.toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Mark ordered' })).toBeDisabled()
    expect(within(dialog).getByText(/does not create a purchase or charge the customer/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel preorder' })).toBeInTheDocument()
  })

  it('offers searchable existing customers while keeping walk-in details possible', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = String(input)
      if (path.includes('/api/customer-preorders')) return response({ preorders: [] })
      if (path.includes('/api/customers')) return response({ customers: [{ _id: 'customer-1', name: 'Sela', phone: '0882982042' }] })
      throw new Error(`Unexpected request: ${path}`)
    })
    const user = userEvent.setup()
    render(<CustomerPreorderWorkspace />)
    await user.click(await screen.findByRole('button', { name: 'New preorder' }))
    const dialog = await screen.findByRole('dialog', { name: 'New customer preorder' })
    expect(within(dialog).getByText(/No deposit is recorded here/)).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Customer name'), 'Sel')
    await user.click(await within(dialog).findByRole('button', { name: /Sela · 0882982042/ }))
    expect(within(dialog).getByLabelText('Customer phone')).toHaveValue('0882982042')
  })
})
