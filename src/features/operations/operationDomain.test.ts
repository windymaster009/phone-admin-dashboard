import { describe, expect, it } from 'vitest'
import {
  canRestockExisting,
  completedSaleFromTrade,
  inventoryNativeSalePriceText,
  inventorySalePrice,
  localDateValue,
  newPurchaseDevice,
  pawnAmountText,
  pawnEquivalentAmountText,
  paywayImageSource,
  roundPawnAmount,
  saleAmountText,
  type CreatedSaleTrade,
  type InventoryItem,
} from './operationDomain'

describe('operationDomain', () => {
  describe('roundPawnAmount and pawn text formatters', () => {
    it('rounds KHR amounts to nearest 100', () => {
      expect(roundPawnAmount(1234, 'KHR')).toBe(1200)
      expect(roundPawnAmount(1260, 'KHR')).toBe(1300)
      expect(roundPawnAmount(0, 'KHR')).toBe(0)
      expect(roundPawnAmount(NaN, 'KHR')).toBe(0)
    })

    it('rounds USD amounts to 2 decimal places', () => {
      expect(roundPawnAmount(12.3456, 'USD')).toBe(12.35)
      expect(roundPawnAmount(10, 'USD')).toBe(10)
      expect(roundPawnAmount(0, 'USD')).toBe(0)
      expect(roundPawnAmount(NaN, 'USD')).toBe(0)
    })

    it('formats pawnAmountText correctly', () => {
      expect(pawnAmountText(500, 'USD')).toBe('$500.00')
      expect(pawnAmountText(12.5, 'USD')).toBe('$12.50')
      expect(pawnAmountText(410000, 'KHR')).toBe('410,000 KHR')
    })

    it('formats pawnEquivalentAmountText across currencies', () => {
      // KHR -> USD equivalent
      expect(pawnEquivalentAmountText(410000, 'KHR', 4100)).toBe('≈ $100.00')
      // USD -> KHR equivalent (100 * 4100 = 410,000)
      expect(pawnEquivalentAmountText(100, 'USD', 4100)).toBe('≈ 410,000 KHR')
    })
  })

  describe('saleAmountText', () => {
    it('formats USD and KHR sales amounts', () => {
      expect(saleAmountText(250, 'USD')).toBe('$250.00')
      expect(saleAmountText(1025000, 'KHR')).toBe('1,025,000 KHR')
    })
  })

  describe('inventorySalePrice', () => {
    const usdItem: InventoryItem = {
      _id: 'item-1',
      name: 'Phone',
      sku: 'SKU-1',
      category: 'PHONE',
      quantity: 1,
      sellPrice: 600,
      minimumSellPrice: 550,
      pricingCurrency: 'USD',
      status: 'IN_STOCK',
    }

    it('returns 0 if item is undefined', () => {
      expect(inventorySalePrice(undefined, 'USD', 4100)).toBe(0)
    })

    it('returns normalized USD price when item is priced in USD', () => {
      expect(inventorySalePrice(usdItem, 'USD', 4100)).toBe(600)
      expect(inventorySalePrice(usdItem, 'USD', 4100, true)).toBe(550)
    })

    it('converts USD item to KHR using given exchange rate', () => {
      // 600 * 4100 = 2,460,000
      expect(inventorySalePrice(usdItem, 'KHR', 4100)).toBe(2460000)
      // 550 * 4100 = 2,255,000
      expect(inventorySalePrice(usdItem, 'KHR', 4100, true)).toBe(2255000)
    })

    it('uses explicit KHR prices when item is priced in KHR', () => {
      const khrItem: InventoryItem = {
        _id: 'item-2',
        name: 'Accessory',
        sku: 'ACC-1',
        category: 'ACCESSORY',
        quantity: 10,
        sellPrice: 0,
        pricingCurrency: 'KHR',
        khrSellPrice: 20500,
        khrMinimumSellPrice: 16400,
        pricingExchangeRate: 4100,
        status: 'IN_STOCK',
      }
      expect(inventorySalePrice(khrItem, 'KHR', 4100)).toBe(20500)
      expect(inventorySalePrice(khrItem, 'KHR', 4100, true)).toBe(16400)
      // Converts to USD: 20500 / 4100 = 5.00
      expect(inventorySalePrice(khrItem, 'USD', 4100)).toBe(5)
    })

    it('formats native inventory sale price text', () => {
      expect(inventoryNativeSalePriceText(usdItem)).toBe('$600.00')
      const khrItem: InventoryItem = {
        _id: 'item-3',
        name: 'Cable',
        sku: 'CBL-1',
        category: 'ACCESSORY',
        quantity: 10,
        sellPrice: 0,
        pricingCurrency: 'KHR',
        khrSellPrice: 12000,
        pricingExchangeRate: 4100,
        status: 'IN_STOCK',
      }
      expect(inventoryNativeSalePriceText(khrItem)).toBe('12,000 KHR')
    })
  })

  describe('completedSaleFromTrade', () => {
    it('maps trade fields and uses fallback when properties are missing', () => {
      const trade: CreatedSaleTrade = {
        tradeNo: 'TR-100',
        currency: 'USD',
        transactionTotal: 250,
        transactionAmountPaid: 200,
        transactionBalance: 50,
        total: 250,
        amountPaid: 200,
        balance: 50,
        paymentMethod: 'KHQR',
        items: [{ name: 'iPhone 13', quantity: 1 }],
      }

      const fallback = {
        currency: 'USD' as const,
        paymentMethod: 'CASH' as const,
        itemName: 'Default Item',
        quantity: 1,
      }

      const completed = completedSaleFromTrade(trade, fallback)
      expect(completed.tradeNo).toBe('TR-100')
      expect(completed.currency).toBe('USD')
      expect(completed.total).toBe(250)
      expect(completed.amountPaid).toBe(200)
      expect(completed.balance).toBe(50)
      expect(completed.paymentMethod).toBe('KHQR')
      expect(completed.itemName).toBe('iPhone 13')
      expect(completed.quantity).toBe(1)
    })

    it('uses fallback values when trade items or amounts are absent', () => {
      const emptyTrade: CreatedSaleTrade = {
        tradeNo: 'TR-101',
        total: 0,
        amountPaid: 0,
        balance: 0,
      }

      const fallback = {
        currency: 'KHR' as const,
        paymentMethod: 'CASH' as const,
        itemName: 'Fallback Item',
        quantity: 2,
      }

      const completed = completedSaleFromTrade(emptyTrade, fallback)
      expect(completed.tradeNo).toBe('TR-101')
      expect(completed.currency).toBe('KHR')
      expect(completed.paymentMethod).toBe('CASH')
      expect(completed.itemName).toBe('Fallback Item')
      expect(completed.quantity).toBe(2)
    })
  })

  describe('paywayImageSource', () => {
    it('preserves data, http, https, and blob URLs', () => {
      expect(paywayImageSource('data:image/png;base64,abc')).toBe('data:image/png;base64,abc')
      expect(paywayImageSource('https://payway.ababank.com/qr.png')).toBe('https://payway.ababank.com/qr.png')
      expect(paywayImageSource('blob:http://localhost/123')).toBe('blob:http://localhost/123')
      expect(paywayImageSource('')).toBe('')
    })

    it('prepends base64 prefix to raw base64 string', () => {
      expect(paywayImageSource('iVBORw0KGgoAAAANS')).toBe('data:image/png;base64,iVBORw0KGgoAAAANS')
    })
  })

  describe('newPurchaseDevice', () => {
    it('creates initial device draft with unique ID and default phone category', () => {
      const dev1 = newPurchaseDevice()
      const dev2 = newPurchaseDevice()
      expect(dev1.id).toBeDefined()
      expect(dev1.id).not.toBe(dev2.id)
      expect(dev1.category).toBe('PHONE')
      expect(dev1.quantity).toBe('1')
      expect(dev1.condition).toBe('GOOD')
      expect(dev1.inventoryMode).toBe('NEW')
    })
  })

  describe('canRestockExisting', () => {
    it('allows restocking only for accessories, spare parts, and other', () => {
      expect(canRestockExisting('ACCESSORY')).toBe(true)
      expect(canRestockExisting('SPARE_PART')).toBe(true)
      expect(canRestockExisting('OTHER')).toBe(true)
      expect(canRestockExisting('PHONE')).toBe(false)
      expect(canRestockExisting('TABLET')).toBe(false)
    })
  })

  describe('localDateValue', () => {
    it('returns ISO date string of length 10 (YYYY-MM-DD)', () => {
      const date = localDateValue()
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })
})
