import { describe, expect, it, vi } from 'vitest'
import {
  barcodeValue,
  printInventoryLabel,
  printInventoryLabels,
  type LabelItem,
} from './barcode'

describe('barcode module', () => {
  describe('barcodeValue', () => {
    it('returns sku if barcode starts with PF-LEGACY- and sku is present', () => {
      const item: LabelItem = {
        sku: 'SKU-PHONE-1',
        barcode: 'PF-LEGACY-00123',
        name: 'Legacy Phone',
        sellPrice: 200,
      }
      expect(barcodeValue(item)).toBe('SKU-PHONE-1')
    })

    it('prefers shorter SKU over long barcode', () => {
      const item: LabelItem = {
        sku: 'IPH-13',
        barcode: '880609123456789',
        name: 'iPhone 13',
        sellPrice: 500,
      }
      expect(barcodeValue(item)).toBe('IPH-13')
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

    it('falls back to sku if barcode is not set', () => {
      const item: LabelItem = {
        sku: 'SKU-ONLY',
        name: 'Item without barcode',
        sellPrice: 25,
      }
      expect(barcodeValue(item)).toBe('SKU-ONLY')
    })
  })

  describe('printInventoryLabels', () => {
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

    it('writes label markup and triggers print when popup succeeds', () => {
      const mockDoc = {
        write: vi.fn(),
        close: vi.fn(),
      }
      const mockWindow = {
        document: mockDoc,
        print: vi.fn(),
        close: vi.fn(),
      }
      vi.spyOn(window, 'open').mockReturnValue(mockWindow as unknown as Window)

      const result = printInventoryLabel(sampleItem)
      expect(result).toBe(true)
      expect(mockDoc.write).toHaveBeenCalledWith(expect.stringContaining('Test Device'))
      expect(mockDoc.write).toHaveBeenCalledWith(expect.stringContaining('BrandX ModelY'))
      expect(mockDoc.write).toHaveBeenCalledWith(expect.stringContaining('$199.99'))
      expect(mockDoc.close).toHaveBeenCalled()
    })
  })
})
