import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RepairWorkspace from './RepairWorkspace'

const summary = {
  counts: {
    total: 1,
    received: 0,
    checking: 0,
    waitingApproval: 1,
    inRepair: 0,
    ready: 0,
    completed: 0,
    cancelled: 0,
  },
  approvedValue: 130,
  pendingValue: 30,
}

const repair = {
  _id: 'repair-1',
  repairNo: 'RP-000128',
  customerSnapshot: {
    name: 'Dara',
    phone: '012 345 678',
    nationalIdNumber: '123456789',
    address: 'Phnom Penh',
  },
  device: {
    brand: 'Apple',
    model: 'iPhone 13 Pro',
    imei: '350000000000001',
    color: 'Blue',
    condition: 'Normal',
    accessoriesReceived: ['Case'],
  },
  initialProblem: 'Broken screen',
  status: 'WAITING_APPROVAL',
  receivedAt: '2026-10-15T03:24:00.000Z',
  createdAt: '2026-10-15T03:24:00.000Z',
  items: [
    {
      _id: 'item-screen',
      repairType: 'Screen replacement',
      problemDescription: 'Broken screen',
      partCost: 100,
      serviceFee: 30,
      customerPrice: 130,
      status: 'APPROVED',
    },
    {
      _id: 'item-battery',
      repairType: 'Battery replacement',
      problemDescription: 'Battery health low during inspection',
      partCost: 20,
      serviceFee: 10,
      customerPrice: 30,
      status: 'PENDING_APPROVAL',
    },
  ],
  timeline: [
    {
      _id: 'timeline-1',
      action: 'CREATE',
      label: 'Repair received',
      note: 'Broken screen',
      at: '2026-10-15T03:24:00.000Z',
      user: { name: 'WindY', role: 'OWNER' },
    },
  ],
  totals: {
    partCost: 100,
    serviceFee: 30,
    approvedTotal: 130,
    pendingTotal: 30,
    potentialTotal: 160,
    grossProfit: 30,
  },
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('RepairWorkspace', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/repairs')) return jsonResponse({ repairs: [repair] })
      if (url.includes('/api/customers?includeInactive=true')) {
        return jsonResponse({
          customers: [{
            _id: 'customer-1',
            name: 'Dara',
            phone: '012 345 678',
            nationalIdNumber: '123456789',
            address: 'Phnom Penh',
            active: true,
          }],
        })
      }
      if (url.endsWith('/api/repairs/summary')) return jsonResponse({ summary })
      if (url.endsWith('/api/repairs/repair-1')) return jsonResponse({ repair })
      return jsonResponse({})
    })
  })

  it('shows repair status and separates approved, pending, and potential totals', async () => {
    const user = userEvent.setup()
    render(<RepairWorkspace />)

    expect(await screen.findByRole('heading', { name: 'Customer Repair' })).toBeInTheDocument()
    expect(screen.getByText('RP-000128')).toBeInTheDocument()
    expect(screen.getByText('Waiting Approval')).toBeInTheDocument()

    await user.click(screen.getByText('RP-000128'))

    const dialog = await screen.findByRole('dialog', { name: /RP-000128/i })
    expect(within(dialog).getByText('Screen replacement')).toBeInTheDocument()
    expect(within(dialog).getByText('Battery replacement')).toBeInTheDocument()
    expect(within(dialog).getAllByText('$130.00').length).toBeGreaterThan(0)
    expect(within(dialog).getAllByText('$30.00').length).toBeGreaterThan(0)
    expect(within(dialog).getAllByText('$160.00').length).toBeGreaterThan(0)
    expect(within(dialog).getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Decline' })).toBeInTheDocument()
  })

  it('calculates the initial customer price from part cost plus service fee', async () => {
    const user = userEvent.setup()
    render(<RepairWorkspace />)

    await screen.findByRole('heading', { name: 'Customer Repair' })
    await user.click(screen.getByRole('button', { name: /New repair/i }))

    const dialog = await screen.findByRole('dialog', { name: /New repair ticket/i })
    const partCost = within(dialog).getByLabelText('Part cost')
    const serviceFee = within(dialog).getByLabelText('Service fee')
    const customerPrice = within(dialog).getByLabelText('Customer price')

    fireEvent.change(partCost, { target: { value: '100' } })
    fireEvent.change(serviceFee, { target: { value: '30' } })

    await waitFor(() => expect(customerPrice).toHaveValue(130))
    expect(within(dialog).getByText('$130.00')).toBeInTheDocument()
  })
})
