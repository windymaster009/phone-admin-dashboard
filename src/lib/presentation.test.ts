import { describe, expect, it, vi } from 'vitest'
import {
  convertedKhr,
  currency,
  dateText,
  inventoryDualPriceText,
  inventoryListedPrice,
  inventoryPriceCurrency,
  inventoryPriceText,
  khrText,
  money,
  openOperationModal,
  pawnEquivalentText,
  pawnMoney,
  pawnUsdValue,
  purchaseSourceLabel,
  riel,
  titleStatus,
  tradePartyName,
  tradePartyPhone,
  tradeTransactionMoney,
} from './presentation'
import type { ExchangeRateData, InventoryItem, Pawn, Trade } from '../types/domain'

describe('presentation helpers', () => {
  describe('currency and number formatters', () => {
    it('formats USD values correctly with money and currency', () => {
      expect(money.format(100)).toBe('$100')
      expect(money.format(100.5)).toBe('$100.5')
      expect(money.format(1250.75)).toBe('$1,250.75')
      expect(currency.format(50)).toBe('$50')
      expect(currency.format(0)).toBe('$0')
    })

    it('formats KHR riel values without decimal places', () => {
      expect(riel.format(4100)).toBe('4,100')
      expect(riel.format(4100.9)).toBe('4,101')
      expect(riel.format(1000000)).toBe('1,000,000')
    })
  })

  const createTrade = (overrides: Partial<Trade>): Trade => ({
    _id: 't-default',
    tradeNo: 'TR-DEF',
    type: 'SELL',
    items: [],
    subtotal: 0,
    discount: 0,
    total: 0,
    amountPaid: 0,
    balance: 0,
    paymentMethod: 'CASH',
    status: 'COMPLETED',
    createdAt: '2026-09-01',
    ...overrides,
  })

  describe('trade party helpers', () => {
    it('returns supplier name for BUY trade if available', () => {
      const trade = createTrade({
        _id: 't-1',
        tradeNo: 'TR-1',
        type: 'BUY',
        supplier: { _id: 's-1', name: 'Global Supply', phone: '011-111' },
        total: 100,
        amountPaid: 100,
        balance: 0,
        currency: 'USD',
      })
      expect(tradePartyName(trade)).toBe('Global Supply')
      expect(tradePartyPhone(trade)).toBe('011-111')
    })

    it('returns sellerSnapshot or customer name as fallback for BUY trade', () => {
      const tradeSnapshot = createTrade({
        _id: 't-2',
        tradeNo: 'TR-2',
        type: 'BUY',
        sellerSnapshot: { name: 'Direct Seller', phone: '022-222' },
        total: 50,
        amountPaid: 50,
        balance: 0,
        currency: 'USD',
      })
      expect(tradePartyName(tradeSnapshot)).toBe('Direct Seller')
      expect(tradePartyPhone(tradeSnapshot)).toBe('022-222')

      const tradeCustomer = createTrade({
        _id: 't-3',
        tradeNo: 'TR-3',
        type: 'BUY',
        customer: { _id: 'c-1', name: 'Customer Seller', phone: '033-333' },
        total: 50,
        amountPaid: 50,
        balance: 0,
        currency: 'USD',
      })
      expect(tradePartyName(tradeCustomer)).toBe('Customer Seller')
      expect(tradePartyPhone(tradeCustomer)).toBe('033-333')
    })

    it('returns "Walk-in seller" when no party details exist for BUY trade', () => {
      const trade = createTrade({
        _id: 't-4',
        tradeNo: 'TR-4',
        type: 'BUY',
        total: 50,
        amountPaid: 50,
        balance: 0,
        currency: 'USD',
      })
      expect(tradePartyName(trade)).toBe('Walk-in seller')
      expect(tradePartyPhone(trade)).toBeUndefined()
    })

    it('returns customer name or "Walk-in customer" for SELL trade', () => {
      const tradeWithCustomer = createTrade({
        _id: 't-5',
        tradeNo: 'TR-5',
        type: 'SELL',
        customer: { _id: 'c-2', name: 'Alice Client', phone: '044-444' },
        total: 200,
        amountPaid: 200,
        balance: 0,
        currency: 'USD',
      })
      expect(tradePartyName(tradeWithCustomer)).toBe('Alice Client')
      expect(tradePartyPhone(tradeWithCustomer)).toBe('044-444')

      const tradeWalkIn = createTrade({
        _id: 't-6',
        tradeNo: 'TR-6',
        type: 'SELL',
        total: 200,
        amountPaid: 200,
        balance: 0,
        currency: 'USD',
      })
      expect(tradePartyName(tradeWalkIn)).toBe('Walk-in customer')
      expect(tradePartyPhone(tradeWalkIn)).toBeUndefined()
    })

    it('maps purchaseSourceLabel correctly', () => {
      expect(purchaseSourceLabel('EXISTING_SUPPLIER')).toBe('Supplier')
      expect(purchaseSourceLabel('NEW_SUPPLIER')).toBe('Supplier')
      expect(purchaseSourceLabel('EXISTING_CUSTOMER')).toBe('Customer')
      expect(purchaseSourceLabel('NEW_CUSTOMER')).toBe('Customer')
      expect(purchaseSourceLabel('WALK_IN')).toBe('Walk-in')
      expect(purchaseSourceLabel(undefined)).toBe('Legacy')
      expect(purchaseSourceLabel('OTHER')).toBe('Legacy')
    })

    it('formats tradeTransactionMoney for USD and KHR', () => {
      const usdTrade = createTrade({
        _id: 't-7',
        tradeNo: 'TR-7',
        type: 'SELL',
        currency: 'USD',
        total: 150,
        amountPaid: 150,
        balance: 0,
      })
      expect(tradeTransactionMoney(usdTrade, 150, 0)).toBe('$150')
      expect(tradeTransactionMoney(usdTrade, undefined, 200)).toBe('$200')

      const khrTrade = createTrade({
        _id: 't-8',
        tradeNo: 'TR-8',
        type: 'SELL',
        currency: 'KHR',
        total: 615000,
        amountPaid: 615000,
        balance: 0,
      })
      expect(tradeTransactionMoney(khrTrade, 615000, 0)).toBe('615,000 KHR')
    })
  })

  describe('inventory pricing presentation', () => {
    const baseItem: InventoryItem = {
      _id: 'i-1',
      name: 'Phone X',
      sku: 'SKU-PX',
      category: 'PHONE',
      quantity: 1,
      reorderLevel: 2,
      buyPrice: 400,
      sellPrice: 500,
      minimumSellPrice: 480,
      pricingCurrency: 'USD',
      status: 'IN_STOCK',
    }

    it('identifies pricing currency', () => {
      expect(inventoryPriceCurrency(baseItem)).toBe('USD')
      expect(inventoryPriceCurrency({ ...baseItem, pricingCurrency: 'KHR' })).toBe('KHR')
    })

    it('calculates inventoryListedPrice for USD items', () => {
      expect(inventoryListedPrice(baseItem)).toBe(500)
      expect(inventoryListedPrice(baseItem, true)).toBe(480)
    })

    it('calculates inventoryListedPrice for KHR items with explicit and converted values', () => {
      const explicitKhrItem: InventoryItem = {
        ...baseItem,
        pricingCurrency: 'KHR',
        khrSellPrice: 2050000,
        khrMinimumSellPrice: 1968000,
      }
      expect(inventoryListedPrice(explicitKhrItem)).toBe(2050000)
      expect(inventoryListedPrice(explicitKhrItem, true)).toBe(1968000)

      const convertedKhrItem: InventoryItem = {
        ...baseItem,
        pricingCurrency: 'KHR',
        pricingExchangeRate: 4100,
      }
      // (500 * 4100) / 100 rounded * 100 = 2,050,000
      expect(inventoryListedPrice(convertedKhrItem)).toBe(2050000)
    })

    it('formats inventoryPriceText and dualPriceText', () => {
      expect(inventoryPriceText(baseItem)).toBe('$500')
      const khrItem: InventoryItem = {
        ...baseItem,
        pricingCurrency: 'KHR',
        khrSellPrice: 2050000,
      }
      expect(inventoryPriceText(khrItem)).toBe('2,050,000 KHR')
      expect(inventoryDualPriceText(baseItem)).toBe('$500 · 2,050,000 KHR')
    })
  })

  describe('pawn calculations & presentation', () => {
    it('formats pawnMoney for USD and KHR', () => {
      expect(pawnMoney(350, 'USD')).toBe('$350')
      expect(pawnMoney(1435250, 'KHR')).toBe('1,435,300 KHR')
    })

    it('formats pawnEquivalentText', () => {
      const rateData: ExchangeRateData = {
        usdKhr: 4100,
        source: 'ABA PayWay',
        rateType: 'bank',
        configured: true,
        updatedAt: '2026-09-01',
      }
      expect(pawnEquivalentText(100, 'USD', null)).toBe('')
      expect(pawnEquivalentText(100, 'USD', rateData)).toBe('≈ 410,000 ៛')
      expect(pawnEquivalentText(410000, 'KHR', rateData)).toBe('≈ $100')
    })

    it('calculates pawnUsdValue', () => {
      const usdPawn: Pawn = {
        _id: 'p-1',
        pawnNo: 'PW-1',
        customer: { _id: 'c-1', name: 'Dara', phone: '012-345-678' },
        itemSnapshot: { name: 'Phone' },
        estimatedValue: 300,
        pawnPercentage: 66,
        principal: 200,
        currency: 'USD',
        interestRate: 3,
        startDate: '2026-09-01',
        dueDate: '2026-10-01',
        status: 'ACTIVE',
        identificationVerified: true,
        createdAt: '2026-09-01',
      }
      expect(pawnUsdValue(usdPawn, 200)).toBe(200)

      const khrPawn: Pawn = {
        ...usdPawn,
        currency: 'KHR',
        exchangeRate: 4100,
      }
      expect(pawnUsdValue(khrPawn, 820000)).toBe(200)
    })

    it('calculates convertedKhr and khrText', () => {
      const rate: ExchangeRateData = {
        usdKhr: 4100,
        source: 'ABA PayWay',
        rateType: 'bank',
        configured: true,
        updatedAt: '2026-09-01',
      }
      expect(convertedKhr(10, rate)).toBe(41000)
      expect(convertedKhr(10, null)).toBe(0)
      expect(khrText(10, rate)).toBe('≈ 41,000 ៛')
      expect(khrText(10, null)).toBe('')
    })
  })

  describe('utility presentation functions', () => {
    it('formats dateText nicely', () => {
      const result = dateText('2026-09-01T12:00:00Z')
      expect(result).toMatch(/Sep|September/)
      expect(result).toContain('2026')
    })

    it('formats titleStatus correctly', () => {
      expect(titleStatus('FORFEITED')).toBe('Claimed')
      expect(titleStatus('PAWN_FORFEIT')).toBe('Pawn claim')
      expect(titleStatus('IN_STOCK')).toBe('In Stock')
      expect(titleStatus('DUE_SOON')).toBe('Due Soon')
      expect(titleStatus('ACTIVE')).toBe('Active')
    })

    it('dispatches custom event in openOperationModal when known kind is given', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      openOperationModal('stock')
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'phoneflow:open-operation',
          detail: { kind: 'stock' },
        }),
      )

      openOperationModal('New Sale')
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'phoneflow:open-operation',
          detail: { kind: 'sale' },
        }),
      )
    })

    it('alerts user when unknown modal kind is given', () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined)
      openOperationModal('unknown-feature')
      expect(alertSpy).toHaveBeenCalledWith('unknown-feature form is coming next.')
    })
  })
})
