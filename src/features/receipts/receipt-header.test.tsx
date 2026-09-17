import { readFileSync } from 'node:fs'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ReceiptDocument, { receiptPrintStyles } from './ReceiptDocument'
import { SAMPLE_TEST_RECEIPT } from './receipt-print'

const previewStyles = readFileSync('src/features/receipts/receipt-center.css', 'utf8')

// Exercise the final CSS cascade: the old print header inherited space-between
// from A4 even though the preview stylesheet had already corrected it.
describe.each([
  ['print document', receiptPrintStyles],
  ['screen preview', previewStyles],
])('thermal header in %s', (_name, styles) => {
  it.each([
    ['short name', 'Shop', undefined],
    ['long name', 'A very long shop name with additional branch information', undefined],
    ['custom logo', 'PhoneFlow Test Store', '/test-logo.png'],
  ])('centers the complete header for %s', (_case, name, logoUrl) => {
    const receipt = {
      ...SAMPLE_TEST_RECEIPT,
      snapshot: {
        ...SAMPLE_TEST_RECEIPT.snapshot!,
        shop: { ...SAMPLE_TEST_RECEIPT.snapshot!.shop, name: name!, logoUrl },
      },
    }
    const { container } = render(<><style>{styles}</style><ReceiptDocument receipt={receipt} layout="THERMAL" /></>)
    const header = container.querySelector<HTMLElement>('.receipt-document-header')!
    const headerStyle = getComputedStyle(header)
    expect(headerStyle.display).toBe('flex')
    expect(headerStyle.flexDirection).toBe('column')
    expect(headerStyle.alignItems).toBe('center')
    expect(headerStyle.justifyContent).toBe('center')
    expect(headerStyle.width).toBe('100%')
    for (const selector of ['.receipt-shop', '.receipt-title']) {
      const style = getComputedStyle(header.querySelector(selector)!)
      expect(style.width).toBe('100%')
      expect(style.textAlign).toBe('center')
      expect(style.justifyItems).toBe('center')
      expect(style.gridTemplateColumns.replace(/\s/g, '')).toBe('minmax(0,1fr)')
      expect(style.overflowWrap).toBe('anywhere')
    }
    expect(header.textContent).toContain(name)
    expect(header.textContent).toContain(receipt.receiptNo)
  })

  it('preserves the separate A4 header layout', () => {
    const { container } = render(<><style>{styles}</style><ReceiptDocument receipt={SAMPLE_TEST_RECEIPT} layout="A4" /></>)
    const style = getComputedStyle(container.querySelector('.receipt-document-header')!)
    expect(style.display).toBe('flex')
    expect(style.justifyContent).toBe('space-between')
    expect(style.flexDirection).not.toBe('column')
  })
})
