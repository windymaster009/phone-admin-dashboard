import { useEffect, useState } from 'react'
import { api } from './api'
import type { ExchangeRateData, InventoryItem, Pawn, PawnCurrency, Trade } from '../types/domain'

export const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})
export const tradePartyName = (trade: Trade) => trade.type === 'BUY'
  ? trade.supplier?.name || trade.sellerSnapshot?.name || trade.customer?.name || 'Walk-in seller'
  : trade.customer?.name || 'Walk-in customer'
export const tradePartyPhone = (trade: Trade) => trade.type === 'BUY'
  ? trade.supplier?.phone || trade.sellerSnapshot?.phone || trade.customer?.phone
  : trade.customer?.phone
export const purchaseSourceLabel = (sellerType?: string) => {
  if (sellerType?.includes('SUPPLIER')) return 'Supplier'
  if (sellerType?.includes('CUSTOMER')) return 'Customer'
  if (sellerType === 'WALK_IN') return 'Walk-in'
  return 'Legacy'
}
export const tradeTransactionMoney = (trade: Trade, original: number | undefined, fallback: number) => trade.currency === 'KHR' && original !== undefined
  ? `${Math.round(original).toLocaleString()} KHR`
  : money.format(original ?? fallback)
export const riel = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export function inventoryPriceCurrency(item: InventoryItem) {
  return item.pricingCurrency === 'KHR' ? 'KHR' : 'USD'
}

export function inventoryListedPrice(item: InventoryItem, minimum = false) {
  if (inventoryPriceCurrency(item) !== 'KHR') return Number(minimum ? item.minimumSellPrice : item.sellPrice) || 0
  const explicitKhr = Number(minimum ? item.khrMinimumSellPrice : item.khrSellPrice)
  if (Number.isFinite(explicitKhr)) return explicitKhr
  const listed = Number(minimum ? item.listedMinimumSellPrice : item.listedSellPrice)
  if (Number.isFinite(listed)) return listed
  const rate = Number(item.pricingExchangeRate) > 0 ? Number(item.pricingExchangeRate) : 4100
  return Math.round(((Number(minimum ? item.minimumSellPrice : item.sellPrice) || 0) * rate) / 100) * 100
}

export function inventoryPriceText(item: InventoryItem, minimum = false) {
  const value = inventoryListedPrice(item, minimum)
  return inventoryPriceCurrency(item) === 'KHR' ? `${riel.format(value)} KHR` : money.format(value)
}

export function inventoryDualPriceText(item: InventoryItem, minimum = false) {
  const usdValue = Number(minimum ? item.minimumSellPrice : item.sellPrice) || 0
  const explicitKhr = Number(minimum ? item.khrMinimumSellPrice : item.khrSellPrice)
  const legacyKhr = item.pricingCurrency === 'KHR' ? Number(minimum ? item.listedMinimumSellPrice : item.listedSellPrice) : Number.NaN
  const rate = Number(item.pricingExchangeRate) > 0 ? Number(item.pricingExchangeRate) : 4100
  const khrValue = Number.isFinite(explicitKhr)
    ? explicitKhr
    : Number.isFinite(legacyKhr)
      ? legacyKhr
      : Math.round((usdValue * rate) / 100) * 100
  return `${money.format(usdValue)} · ${riel.format(khrValue)} KHR`
}

export function pawnMoney(amount: number, currencyCode: PawnCurrency = 'USD') {
  return currencyCode === 'KHR'
    ? `${riel.format(Math.round((Number(amount) || 0) / 100) * 100)} KHR`
    : money.format(Number(amount) || 0)
}

export function pawnEquivalentText(amount: number, currencyCode: PawnCurrency, exchangeRate: ExchangeRateData | null, storedRate?: number) {
  if (!exchangeRate) return ''
  const usdKhrRate = currencyCode === 'KHR' && Number(storedRate) > 0
    ? Number(storedRate)
    : exchangeRate.usdKhr
  return currencyCode === 'KHR'
    ? `≈ ${money.format((Number(amount) || 0) / usdKhrRate)}`
    : khrText(amount, exchangeRate)
}

export function pawnUsdValue(pawn: Pawn, amount: number) {
  if (pawn.currency !== 'KHR') return Number(amount) || 0
  const rate = Number(pawn.exchangeRate)
  return rate > 0 ? (Number(amount) || 0) / rate : 0
}

export function useExchangeRate() {
  const [exchangeRate, setExchangeRate] = useState<ExchangeRateData | null>(null)

  useEffect(() => {
    api<ExchangeRateData>('/exchange-rates')
      .then(setExchangeRate)
      .catch(() => setExchangeRate(null))
  }, [])

  return exchangeRate
}

export function convertedKhr(amount: number, exchangeRate: ExchangeRateData | null) {
  if (!exchangeRate) return 0
  return Math.round((amount * exchangeRate.usdKhr) / 100) * 100
}

export function khrText(amount: number, exchangeRate: ExchangeRateData | null) {
  return exchangeRate ? `≈ ${riel.format(convertedKhr(amount, exchangeRate))} ៛` : ''
}
export const dateText = (value: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(value))
export const titleStatus = (status: string) => {
  if (status === 'FORFEITED') return 'Claimed'
  if (status === 'PAWN_FORFEIT') return 'Pawn claim'
  return status.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
}
export const openOperationModal = (kindOrLabel: string) => {
  const value = kindOrLabel.toLowerCase()
  let kind: 'stock' | 'purchase' | 'sale' | 'pawn' | null = null
  if (value.includes('stock')) kind = 'stock'
  else if (value.includes('purchase')) kind = 'purchase'
  else if (value.includes('sale')) kind = 'sale'
  else if (value.includes('pawn')) kind = 'pawn'

  if (kind) {
    window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind } }))
  } else {
    window.alert(`${kindOrLabel} form is coming next.`)
  }
}
export const comingNext = openOperationModal

