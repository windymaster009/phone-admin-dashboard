import test from 'node:test'
import assert from 'node:assert/strict'
import { recalculateTicketStatus, ticketTotals } from './repairRoutes.js'

test('repair totals keep unapproved work out of approved customer total', () => {
  const ticket = {
    items: [
      {
        repairType: 'Screen replacement',
        partCost: 100,
        serviceFee: 30,
        customerPrice: 130,
        status: 'APPROVED',
      },
      {
        repairType: 'Battery replacement',
        partCost: 20,
        serviceFee: 10,
        customerPrice: 30,
        status: 'PENDING_APPROVAL',
      },
    ],
  }

  assert.deepEqual(ticketTotals(ticket), {
    partCost: 100,
    serviceFee: 30,
    approvedTotal: 130,
    pendingTotal: 30,
    potentialTotal: 160,
    grossProfit: 30,
  })
})

test('pending discovered work puts the ticket into waiting approval', () => {
  const ticket = {
    status: 'IN_REPAIR',
    items: [
      { status: 'IN_PROGRESS' },
      { status: 'PENDING_APPROVAL' },
    ],
  }

  recalculateTicketStatus(ticket)
  assert.equal(ticket.status, 'WAITING_APPROVAL')
})

test('approval returns a repair with active work to in repair', () => {
  const ticket = {
    status: 'WAITING_APPROVAL',
    items: [
      { status: 'IN_PROGRESS' },
      { status: 'APPROVED' },
    ],
  }

  recalculateTicketStatus(ticket)
  assert.equal(ticket.status, 'IN_REPAIR')
})

test('declined extra work does not block a completed original repair from pickup', () => {
  const ticket = {
    status: 'WAITING_APPROVAL',
    items: [
      { status: 'DONE' },
      { status: 'DECLINED' },
    ],
  }

  recalculateTicketStatus(ticket)
  assert.equal(ticket.status, 'READY_FOR_PICKUP')
})
