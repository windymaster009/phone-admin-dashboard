import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ShippingWorkspace from './ShippingWorkspace'

const shipment = {
  _id: 'shipment-1',
  shipmentNo: 'SHP-20261020-ABC123',
  recipientName: 'Dara',
  recipientPhone: '012 345 678',
  address: 'Sen Sok, Phnom Penh',
  shippingDate: '2026-10-20T00:00:00.000Z',
  courierName: 'J&T',
  trackingNumber: 'JT123456',
  items: [{ _id: 'item-1', name: 'iPhone 15 Pro Max', quantity: 1, imei: '350000000000001' }],
  status: 'SHIPPED',
  labelPrintCount: 1,
  events: [{ _id: 'event-1', action: 'SHIPPED', at: '2026-10-20T04:00:00.000Z' }],
  createdAt: '2026-10-20T03:00:00.000Z',
}

function response(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

describe('ShippingWorkspace', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/shipments/summary')) {
        return response({ summary: { counts: { PREPARING: 0, READY_TO_SHIP: 0, SHIPPED: 1, DELIVERED: 0, CANCELLED: 0 }, labelsPrinted: 1 } })
      }
      if (url.includes('/api/shipments?')) return response({ shipments: [shipment] })
      if (url.includes('/api/customers')) return response({ customers: [] })
      return response({})
    })
  })

  it('shows shipments that are currently on shipping', async () => {
    render(<ShippingWorkspace />)
    expect(await screen.findByRole('heading', { name: 'Shipping' })).toBeInTheDocument()
    expect(await screen.findByText('SHP-20261020-ABC123')).toBeInTheDocument()
    expect(screen.getAllByText('On Shipping').length).toBeGreaterThan(0)
    expect(screen.getByText('iPhone 15 Pro Max', { exact: false })).toBeInTheDocument()
  })

  it('opens a manual shipment form with recipient and product fields', async () => {
    const user = userEvent.setup()
    render(<ShippingWorkspace />)
    await screen.findByRole('heading', { name: 'Shipping' })
    await user.click(screen.getByRole('button', { name: /New shipment/i }))

    const dialog = await screen.findByRole('dialog', { name: /New shipment/i })
    expect(dialog).toHaveTextContent('Recipient')
    expect(screen.getByLabelText('Recipient name')).toBeInTheDocument()
    expect(screen.getByLabelText('Phone number')).toBeInTheDocument()
    expect(screen.getByLabelText('Delivery address')).toBeInTheDocument()
    expect(screen.getByLabelText('Product / phone')).toBeInTheDocument()
  })
})
