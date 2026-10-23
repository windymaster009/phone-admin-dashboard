import { describe, expect, it } from 'vitest'
import { preorderConfirmationMarkup } from './PreorderConfirmation'

describe('preorderConfirmationMarkup', () => {
  it('escapes customer data and never includes internal supplier or financial details', () => {
    const markup = preorderConfirmationMarkup({
      preorderNo: 'PO-TEST', customerName: '<Sela & Co>', customerPhone: '012345678',
      category: 'ACCESSORY', productName: 'Case <Blue>', quantity: 2,
      specifications: 'Matte finish', status: 'ORDERED', createdAt: '2026-10-23T01:00:00.000Z',
      expectedAt: '2026-10-30T01:00:00.000Z',
    })
    expect(markup).toContain('PO-TEST')
    expect(markup).toContain('&lt;Sela &amp; Co&gt;')
    expect(markup).toContain('Case &lt;Blue&gt;')
    expect(markup).toContain('Estimated arrival')
    expect(markup).toContain('2')
    expect(markup).not.toContain('<Sela & Co>')
    expect(markup).not.toMatch(/\$|price|cost|supplier/i)
  })
})
