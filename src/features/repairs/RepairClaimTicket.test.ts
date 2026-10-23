import { describe, expect, it } from 'vitest'
import { repairClaimTicketMarkup } from './RepairClaimTicket'

describe('repairClaimTicketMarkup', () => {
  it('escapes customer/device text and keeps the claim ticket free of internal pricing', () => {
    const markup = repairClaimTicketMarkup({
      repairNo: 'RP-TEST', customerName: '<Sela & Co>', customerPhone: '012345678',
      device: 'Vivo <Y02s>', issue: 'Screen & glass', status: 'CANCELLED',
      createdAt: '2026-10-23T01:00:00.000Z',
    })
    expect(markup).toContain('&lt;Sela &amp; Co&gt;')
    expect(markup).toContain('Vivo &lt;Y02s&gt;')
    expect(markup).toContain('Screen &amp; glass')
    expect(markup).toContain('This repair was cancelled')
    expect(markup).not.toContain('<Sela & Co>')
    expect(markup).not.toMatch(/\$|price|cost|supplier/i)
  })
})
