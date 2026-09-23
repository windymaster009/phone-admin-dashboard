import { describe, expect, it } from 'vitest'
import { formatReceiptDate, formatReceiptDateTime } from './receipt-date'

describe('receipt dates', () => {
  it('uses zero-padded day/month/year without month names on every receipt', () => {
    expect(formatReceiptDate('2026-09-21T06:17:21.248Z')).toBe('21/09/2026')
    expect(formatReceiptDate('2026-10-01T06:17:21.248Z')).toBe('01/10/2026')
    expect(formatReceiptDateTime('2026-09-21T06:17:21.248Z')).toMatch(/^21\/09\/2026 \d{2}:\d{2}$/)
  })

  it('keeps missing and invalid dates readable', () => {
    expect(formatReceiptDate()).toBe('—')
    expect(formatReceiptDate('bad-date')).toBe('—')
    expect(formatReceiptDateTime('bad-date')).toBe('—')
  })
})
