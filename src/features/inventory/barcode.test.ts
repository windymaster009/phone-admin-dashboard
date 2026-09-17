import { describe, expect, it, vi } from 'vitest'
import JsBarcode from 'jsbarcode'
import {
  barcodeValue,
  printInventoryLabel,
  printInventoryLabels,
  sanitizeCode,
  type LabelItem,
} from './barcode'

vi.mock('jsbarcode', () => {
  const fn = vi.fn((element: SVGElement, text: string) => {
    element.setAttribute('data-barcode-encoded', text)
  })
  return { default: fn }
})

describe('barcode module', () => {
  describe('sanitizeCode', () => {
    it('returns empty string for null, undefined, and blank strings', () => {
      expect(sanitizeCode(null)).toBe('')
      expect(sanitizeCode(undefined)).toBe('')
      expect(sanitizeCode('')).toBe('')
      expect(sanitizeCode('   ')).toBe('')
    })

    it('returns empty string for placeholder values like NULL, undefined, N/A, none', () => {
      expect(sanitizeCode('NULL')).toBe('')
      expect(sanitizeCode('null')).toBe('')
      expect(sanitizeCode('undefined')).toBe('')
      expect(sanitizeCode('UNDEFINED')).toBe('')
      expect(sanitizeCode('N/A')).toBe('')
      expect(sanitizeCode('none')).toBe('')
      expect(sanitizeCode('[null]')).toBe('')
      expect(sanitizeCode('blank')).toBe('')
    })

    it('trims and returns legitimate codes', () => {
      expect(sanitizeCode('  PF-20260917-KNT7I  ')).toBe('PF-20260917-KNT7I')
      expect(sanitizeCode('SKU-123')).toBe('SKU-123')
  })
})
  describe('barcodeValue', () => {
    it('returns valid non-legacy barcode PF-20260917-KNT7I when SKU is literal "NULL"', () => {
      const item: LabelItem = {
        sku: 'NULL',
        barcode: 'PF-20260917-KNT7I',
        name: 'Samsung Galaxy S24',
        sellPrice: 800,
      }
      expect(barcodeValue(item)).toBe('PF-20260917-KNT7I')
    })

    it('returns valid non-legacy barcode PF-20260917-KNT7I even when SKU is valid and shorter', () => {
      const item: LabelItem = {
        sku: 'IPH-13',
        barcode: 'PF-20260917-KNT7I',
        name: 'iPhone 13',
        sellPrice: 500,
      }
      expect(barcodeValue(item)).toBe('PF-20260917-KNT7I')
    })

    it('returns barcode when barcode is shorter or equal length to SKU', () => {
      const item: LabelItem = {
        sku: 'LONG-SKU-IDENTIFIER-12345',
        barcode: '12345',
        name: 'Accessory',
        sellPrice: 15,
      }
      expect(barcodeValue(item)).toBe('12345')
    })

    it('falls back to SKU when barcode is missing and SKU is valid', () => {
      const item: LabelItem = {
        sku: 'SKU-ONLY',
        name: 'Item without barcode',
        sellPrice: 25,
      }
      expect(barcodeValue(item)).toBe('SKU-ONLY')
    })

    it('falls back to SKU when barcode is a legacy placeholder starting with PF-LEGACY-', () => {
      const item: LabelItem = {
        sku: 'SKU-PHONE-1',
        barcode: 'PF-LEGACY-00123',
        name: 'Legacy Phone',
        sellPrice: 200,
      }
      expect(barcodeValue(item)).toBe('SKU-PHONE-1')
    })

    it('never returns literal "NULL" when barcode is missing and SKU is "NULL"', () => {
      const item: LabelItem = {
        sku: 'NULL',
        name: 'Invalid Item',
        sellPrice: 10,
      }
      expect(barcodeValue(item)).toBe('')
    })

    it('uses the valid legacy barcode when SKU is "NULL"', () => {
      const item: LabelItem = {
        sku: 'NULL',
        barcode: 'PF-LEGACY-ABC123',
        name: 'Legacy Bad SKU Item',
        sellPrice: 10,
      }
      expect(barcodeValue(item)).toBe('PF-LEGACY-ABC123')
    })

    it('never returns literal "NULL" when barcode is literal "NULL" and SKU is "NULL"', () => {
      const item: LabelItem = {
        sku: 'NULL',
        barcode: 'NULL',
        name: 'Corrupted Item',
        sellPrice: 10,
      }
      expect(barcodeValue(item)).toBe('')
    })

    it('falls back to valid SKU when barcode is literal "NULL"', () => {
      const item: LabelItem = {
        sku: 'VALID-SKU-001',
        barcode: 'NULL',
        name: 'Bad Barcode Valid SKU',
        sellPrice: 50,
      }
      expect(barcodeValue(item)).toBe('VALID-SKU-001')
    })
  })

  describe('printInventoryLabels and scanner read verification', () => {
    const sampleItem: LabelItem = {
      sku: 'SKU-001',
      barcode: 'BC-001',
      name: 'Test Device',
      brand: 'BrandX',
      model: 'ModelY',
      imei1: '123456789012345',
      sellPrice: 199.99,
    }

    it('returns false immediately when item list is empty', () => {
      const result = printInventoryLabels([])
      expect(result).toBe(false)
    })

    it('alerts user and returns false when popup window is blocked', () => {
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined)

      const result = printInventoryLabels([sampleItem])
      expect(result).toBe(false)
      expect(alertSpy).toHaveBeenCalledWith('Allow pop-ups for PhoneFlow, then try printing the labels again.')

      openSpy.mockRestore()
      alertSpy.mockRestore()
    })

    it('encodes PF-20260917-KNT7I in bars AND prints matching value beneath, never printing "NULL"', () => {
      let writtenHtml = ''
      const mockDoc = {
        write: vi.fn((html: string) => { writtenHtml = html }),
        close: vi.fn(),
      }
      const mockWindow = {
        document: mockDoc,
        print: vi.fn(),
        close: vi.fn(),
      }
      vi.spyOn(window, 'open').mockReturnValue(mockWindow as unknown as Window)

      const targetItem: LabelItem = {
        sku: 'NULL',
        barcode: 'PF-20260917-KNT7I',
        name: 'Samsung Galaxy S24 Ultra',
        brand: 'Samsung',
        model: 'S24 Ultra',
        imei1: '358912345678901',
        sellPrice: 950,
      }

      const result = printInventoryLabel(targetItem)
      expect(result).toBe(true)

      // 1. Verify barcode bars encode PF-20260917-KNT7I
      expect(JsBarcode).toHaveBeenCalledWith(
        expect.any(SVGElement),
        'PF-20260917-KNT7I',
        expect.any(Object),
      )

      // 2. Verify printed scan-value text beneath bars matches the barcode
      expect(writtenHtml).toContain('<p class="scan-value">PF-20260917-KNT7I</p>')

      // 3. Verify scanner reading the barcode reads the exact printed value
      const encodedMatch = writtenHtml.match(/data-barcode-encoded="([^"]+)"/)
      const scanValueMatch = writtenHtml.match(/<p class="scan-value">([^<]+)<\/p>/)
      expect(encodedMatch).not.toBeNull()
      expect(scanValueMatch).not.toBeNull()
      // Scanner read string === printed human-readable string
      expect(encodedMatch![1]).toBe(scanValueMatch![1])
      expect(scanValueMatch![1]).toBe('PF-20260917-KNT7I')

      // 4. Verify "NULL" is never displayed in scan-value or meta
      expect(writtenHtml).not.toContain('<p class="scan-value">NULL</p>')
      expect(writtenHtml).not.toContain('>NULL<')
    })

    it('falls back to SKU in bars and printed value for legacy barcode', () => {
      let writtenHtml = ''
      const mockDoc = {
        write: vi.fn((html: string) => { writtenHtml = html }),
        close: vi.fn(),
      }
      const mockWindow = {
        document: mockDoc,
        print: vi.fn(),
        close: vi.fn(),
      }
      vi.spyOn(window, 'open').mockReturnValue(mockWindow as unknown as Window)

      const legacyItem: LabelItem = {
        sku: 'SKU-LEGACY-001',
        barcode: 'PF-LEGACY-ABC001',
        name: 'Older iPhone X',
        sellPrice: 220,
      }

      const result = printInventoryLabel(legacyItem)
      expect(result).toBe(true)

      expect(JsBarcode).toHaveBeenCalledWith(
        expect.any(SVGElement),
        'SKU-LEGACY-001',
        expect.any(Object),
      )
      expect(writtenHtml).toContain('<p class="scan-value">SKU-LEGACY-001</p>')

      // Scanner read value matches printed text
      const encodedMatch = writtenHtml.match(/data-barcode-encoded="([^"]+)"/)
      const scanValueMatch = writtenHtml.match(/<p class="scan-value">([^<]+)<\/p>/)
      expect(encodedMatch![1]).toBe('SKU-LEGACY-001')
      expect(scanValueMatch![1]).toBe('SKU-LEGACY-001')
    })

    it('falls back to SKU in bars and printed value when barcode is missing', () => {
      let writtenHtml = ''
      const mockDoc = {
        write: vi.fn((html: string) => { writtenHtml = html }),
        close: vi.fn(),
      }
      const mockWindow = {
        document: mockDoc,
        print: vi.fn(),
        close: vi.fn(),
      }
      vi.spyOn(window, 'open').mockReturnValue(mockWindow as unknown as Window)

      const noBarcodeItem: LabelItem = {
        sku: 'SKU-FALLBACK-99',
        name: 'Cable USB-C',
        sellPrice: 15,
      }

      const result = printInventoryLabel(noBarcodeItem)
      expect(result).toBe(true)

      expect(JsBarcode).toHaveBeenCalledWith(
        expect.any(SVGElement),
        'SKU-FALLBACK-99',
        expect.any(Object),
      )
      expect(writtenHtml).toContain('<p class="scan-value">SKU-FALLBACK-99</p>')
    })

    it('refuses to print a label when SKU is "NULL" and barcode is missing', () => {
      let writtenHtml = ''
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined)
      const mockDoc = {
        write: vi.fn((html: string) => { writtenHtml = html }),
        close: vi.fn(),
      }
      const mockWindow = {
        document: mockDoc,
        print: vi.fn(),
        close: vi.fn(),
      }
      vi.spyOn(window, 'open').mockReturnValue(mockWindow as unknown as Window)

      const badItem: LabelItem = {
        sku: 'NULL',
        name: 'Mystery Product',
        sellPrice: 0,
      }

      const result = printInventoryLabel(badItem)
      expect(result).toBe(false)
      expect(window.open).not.toHaveBeenCalled()
      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('no valid barcode or SKU'))

      // Must not call JsBarcode with empty or "NULL"
      expect(JsBarcode).not.toHaveBeenCalledWith(expect.any(SVGElement), 'NULL', expect.any(Object))
      expect(JsBarcode).not.toHaveBeenCalledWith(expect.any(SVGElement), '', expect.any(Object))

      // Must not contain "NULL" in scan-value or meta
      expect(writtenHtml).not.toContain('<p class="scan-value">')
      expect(writtenHtml).not.toContain('>NULL<')
    })

    it('alerts user and returns false when popup window is opened but immediately closed', () => {
      const openSpy = vi.spyOn(window, 'open').mockReturnValue({ closed: true } as unknown as Window)
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined)

      const result = printInventoryLabels([sampleItem])
      expect(result).toBe(false)
      expect(alertSpy).toHaveBeenCalledWith('Allow pop-ups for PhoneFlow, then try printing the labels again.')

      openSpy.mockRestore()
      alertSpy.mockRestore()
    })

    it('does not contain inline <script> tags to avoid CSP blocking in Edge and Chrome', () => {
      let writtenHtml = ''
      const mockDoc = {
        write: vi.fn((html: string) => { writtenHtml = html }),
        close: vi.fn(),
      }
      const mockWindow = {
        document: mockDoc,
        print: vi.fn(),
        close: vi.fn(),
      }
      vi.spyOn(window, 'open').mockReturnValue(mockWindow as unknown as Window)

      printInventoryLabel(sampleItem)
      expect(writtenHtml).not.toContain('<script')
      expect(writtenHtml).not.toContain('</script>')
      expect(writtenHtml).not.toContain('window.onload')
    })

    it('renders manual print and close controls in a .no-print toolbar and hooks up event listeners', () => {
      let writtenHtml = ''
      const printBtn = { onclick: null as (() => void) | null }
      const closeBtn = { onclick: null as (() => void) | null }
      const mockDoc = {
        write: vi.fn((html: string) => { writtenHtml = html }),
        close: vi.fn(),
        getElementById: vi.fn((id: string) => {
          if (id === 'manual-print-btn') return printBtn
          if (id === 'manual-close-btn') return closeBtn
          return null
        }),
      }
      const printFn = vi.fn()
      const closeFn = vi.fn()
      const focusFn = vi.fn()
      const mockWindow = {
        document: mockDoc,
        print: printFn,
        close: closeFn,
        focus: focusFn,
        addEventListener: vi.fn(),
      }
      vi.spyOn(window, 'open').mockReturnValue(mockWindow as unknown as Window)

      printInventoryLabel(sampleItem)

      expect(writtenHtml).toContain('id="manual-print-btn"')
      expect(writtenHtml).toContain('id="manual-close-btn"')
      expect(writtenHtml).toContain('.no-print{display:none !important}')

      expect(printBtn.onclick).toBeTypeOf('function')
      expect(closeBtn.onclick).toBeTypeOf('function')

      // Clicking manual print button invokes popup.print()
      printBtn.onclick!()
      expect(focusFn).toHaveBeenCalled()
      expect(printFn).toHaveBeenCalled()

      // Clicking manual close button invokes popup.close()
      closeBtn.onclick!()
      expect(closeFn).toHaveBeenCalled()
    })

    it('triggers auto-print only once when DOM is ready', () => {
      vi.useFakeTimers()
      try {
        const mockDoc = {
          write: vi.fn(),
          close: vi.fn(),
          readyState: 'complete',
        }
        const printFn = vi.fn()
        const focusFn = vi.fn()
        const mockWindow = {
          document: mockDoc,
          print: printFn,
          focus: focusFn,
          addEventListener: vi.fn(),
        }
        vi.spyOn(window, 'open').mockReturnValue(mockWindow as unknown as Window)

        printInventoryLabel(sampleItem)
        expect(printFn).not.toHaveBeenCalled()

        vi.advanceTimersByTime(200)
        expect(printFn).toHaveBeenCalledTimes(1)

        // Advancing time further does not trigger it again
        vi.advanceTimersByTime(500)
        expect(printFn).toHaveBeenCalledTimes(1)
      } finally {
        vi.useRealTimers()
      }
    })

    it('prints shared labels correctly for both Stock Information and Pawn Management items', () => {
      let writtenHtml = ''
      const mockDoc = {
        write: vi.fn((html: string) => { writtenHtml = html }),
        close: vi.fn(),
      }
      const mockWindow = {
        document: mockDoc,
        print: vi.fn(),
        close: vi.fn(),
      }
      vi.spyOn(window, 'open').mockReturnValue(mockWindow as unknown as Window)

      const stockItem: LabelItem = {
        sku: 'STK-IPHONE15-128',
        barcode: 'PF-20260917-ABC12',
        name: 'iPhone 15 Blue 128GB',
        brand: 'Apple',
        model: 'iPhone 15 128GB Blue',
        imei1: '358901234567890',
        sellPrice: 799,
      }

      const pawnItem: LabelItem = {
        sku: 'PWN-20260917-XYZ99',
        barcode: 'PW-20260917-XYZ99',
        name: 'MacBook Air M2 256GB',
        brand: 'Apple',
        model: 'MacBook Air M2 8GB 256GB Midnight',
        imei1: 'C02G1234MD6R',
        sellPrice: 0,
      }

      printInventoryLabels([stockItem, pawnItem])

      // Stock item checks: encodes barcode, shows scan-value and sell price
      expect(writtenHtml).toContain('iPhone 15 Blue 128GB')
      expect(writtenHtml).toContain('<p class="scan-value">PF-20260917-ABC12</p>')
      expect(writtenHtml).toContain('<p class="price">$799.00</p>')

      // Pawn item checks: encodes pawn number barcode, shows scan-value, hides $0.00 price
      expect(writtenHtml).toContain('MacBook Air M2 256GB')
      expect(writtenHtml).toContain('<p class="scan-value">PW-20260917-XYZ99</p>')
      expect(writtenHtml).not.toContain('<p class="price">$0.00</p>')
      expect(writtenHtml).toContain('IMEI C02G1234MD6R')
    })
  })
})
