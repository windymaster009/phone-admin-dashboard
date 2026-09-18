import type { Pawn } from '../../types/domain'

export type ModalKind = 'stock' | 'purchase' | 'sale' | 'pawn' | 'scan' | 'label'
export type StockCategory = 'PHONE' | 'TABLET' | 'ACCESSORY' | 'SPARE_PART' | 'OTHER'

export type Customer = {
  _id: string
  name: string
  phone: string
  nationalIdNumber?: string
}

export type InventoryItem = {
  _id: string
  name: string
  sku: string
  category: StockCategory
  quantity: number
  sellPrice: number
  minimumSellPrice?: number
  pricingCurrency?: 'USD' | 'KHR'
  pricingExchangeRate?: number
  listedSellPrice?: number
  listedMinimumSellPrice?: number
  khrSellPrice?: number
  khrMinimumSellPrice?: number
  buyPrice?: number
  barcode?: string
  brand?: string
  model?: string
  condition?: string
  status: string
  imei1?: string
  relatedPawn?: { status: string } | null
}

export type RelatedPawn = {
  _id: string
  pawnNo: string
  status: string
  customer?: { _id: string; name: string }
}

export type Supplier = {
  _id: string
  name: string
  phone?: string
  nationalIdNumber?: string
}

export type SellerType = 'EXISTING_CUSTOMER' | 'EXISTING_SUPPLIER' | 'WALK_IN' | 'NEW_CUSTOMER' | 'NEW_SUPPLIER'
export type PurchaseCurrency = 'USD' | 'KHR'
export type SaleCurrency = PurchaseCurrency
export type PawnCurrency = 'USD' | 'KHR'
export type PurchaseInventoryMode = 'NEW' | 'EXISTING'
export type PawnCustomerMode = 'EXISTING' | 'NEW'
export type SalePaymentMethod = 'CASH' | 'KHQR'
export type SalePaymentPhase = 'WAITING' | 'SCANNED' | 'APPROVED' | 'COMPLETED' | 'CANCELLING' | 'CANCELLED' | 'ERROR'
export type StockAdjustmentMode = 'ADD' | 'REMOVE' | 'SET'
export type StockAdjustmentStatus = 'IN_STOCK' | 'REPAIR' | 'ARCHIVED'

export type PawnValuationSnapshot = {
  id?: string
  source?: string
  calculationMode?: 'AUTO' | 'MANUAL'
  createdAt?: string
  currency?: PawnCurrency
  exchangeRate?: number
  marketPrice?: number
  ageMonths?: number
  condition?: string
  batteryHealth?: number
  lockStatus?: string
  accessoryState?: string
  accessoriesIncluded?: string[]
  repairCost?: number
  pawnRate?: number
  eligible?: boolean
  ageDeduction?: number
  conditionDeduction?: number
  batteryDeduction?: number
  accessoryDeduction?: number
  carrierLockDeduction?: number
  estimatedValue?: number
  maximumPawn?: number
  usdKhrRate?: number
}

export type CreatedPawn = {
  pawnNo: string
  principal: number
  currency: PawnCurrency
  pawn?: Pawn
}

export type CompletedStockAdjustment = {
  itemName: string
  detail: string
}

export type SaleDraft = {
  type: 'SELL'
  customer?: string
  items: Array<{ inventoryItem: string; name: string; quantity: number; unitPrice: number; manualUnitPrice?: boolean }>
  discount: number
  amountPaid: number
  amountReceived: number
  paymentMethod: SalePaymentMethod
  currency: SaleCurrency
  exchangeRate: number
  warrantyDays: number
  notes: string
}

export type SaleKhqr = {
  transactionId: string
  amount: number
  currency: 'USD'
  qrImage: string
  qrString: string
  deeplink?: string
  expiresAt: string
  environment: 'sandbox' | 'production'
}

export type CreatedSaleTrade = {
  tradeNo: string
  currency?: SaleCurrency
  transactionTotal?: number
  transactionAmountPaid?: number
  transactionBalance?: number
  total: number
  amountPaid: number
  balance: number
  paymentMethod?: string
  items?: Array<{ name?: string; quantity?: number }>
}

export type CompletedSale = {
  tradeNo: string
  currency: SaleCurrency
  total: number
  amountPaid: number
  balance: number
  paymentMethod: SalePaymentMethod
  itemName: string
  quantity: number
}

export function completedSaleFromTrade(
  trade: CreatedSaleTrade,
  fallback: Pick<CompletedSale, 'currency' | 'paymentMethod' | 'itemName' | 'quantity'>,
): CompletedSale {
  return {
    tradeNo: trade.tradeNo,
    currency: trade.currency === 'KHR' || trade.currency === 'USD' ? trade.currency : fallback.currency,
    total: Number(trade.transactionTotal ?? trade.total) || 0,
    amountPaid: Number(trade.transactionAmountPaid ?? trade.amountPaid) || 0,
    balance: Number(trade.transactionBalance ?? trade.balance) || 0,
    paymentMethod: trade.paymentMethod === 'KHQR' ? 'KHQR' : fallback.paymentMethod,
    itemName: trade.items?.[0]?.name || fallback.itemName,
    quantity: Number(trade.items?.[0]?.quantity) || fallback.quantity,
  }
}

export function paywayImageSource(value: string) {
  const source = value.trim()
  if (!source || /^(data:|https?:|blob:)/i.test(source)) return source
  return `data:image/png;base64,${source}`
}

export type PurchaseDevice = {
  id: string
  collapsed: boolean
  inventoryMode: PurchaseInventoryMode
  existingInventoryItem: string
  category: StockCategory
  name: string
  sku: string
  quantity: string
  imei: string
  brand: string
  model: string
  storage: string
  ram: string
  color: string
  condition: string
  batteryHealth: string
  carrierLock: string
  compatibleModels: string
  oemQuality: string
  purchasePrice: string
  accessoriesIncluded: string[]
  notes: string
}

export function newPurchaseDevice(): PurchaseDevice {
  return {
    id: crypto.randomUUID(), collapsed: false, inventoryMode: 'NEW', existingInventoryItem: '', category: 'PHONE', name: '', sku: '', quantity: '1', imei: '', brand: '', model: '', storage: '', ram: '', color: '',
    condition: 'GOOD', batteryHealth: '', carrierLock: 'UNKNOWN', compatibleModels: '', oemQuality: '', purchasePrice: '', accessoriesIncluded: [], notes: '',
  }
}

export function canRestockExisting(category: StockCategory) {
  return category === 'ACCESSORY' || category === 'SPARE_PART' || category === 'OTHER'
}

export function localDateValue() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

export function roundPawnAmount(value: number, currency: PawnCurrency) {
  return currency === 'KHR'
    ? Math.round((Number(value) || 0) / 100) * 100
    : Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100
}

export function pawnAmountText(value: number, currency: PawnCurrency) {
  return currency === 'KHR'
    ? `${roundPawnAmount(value, currency).toLocaleString()} KHR`
    : `$${(Number(value) || 0).toFixed(2)}`
}

export function pawnEquivalentAmountText(value: number, currency: PawnCurrency, usdKhrRate: number) {
  return currency === 'KHR'
    ? `≈ $${((Number(value) || 0) / usdKhrRate).toFixed(2)}`
    : `≈ ${(Math.round(((Number(value) || 0) * usdKhrRate) / 100) * 100).toLocaleString()} KHR`
}

export const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export const riel = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export function saleAmountText(value: number, currency: SaleCurrency) {
  return currency === 'KHR' ? `${riel.format(Math.round(value))} KHR` : money.format(value)
}

export function inventorySalePrice(item: InventoryItem | undefined, currency: SaleCurrency, exchangeRate: number, minimum = false) {
  if (!item) return 0
  const normalizedUsd = Math.max(0, Number(minimum ? item.minimumSellPrice : item.sellPrice) || 0)
  const explicitKhr = Number(minimum ? item.khrMinimumSellPrice : item.khrSellPrice)
  const listed = Number(minimum ? item.listedMinimumSellPrice : item.listedSellPrice)
  const savedKhr = Number.isFinite(explicitKhr)
    ? Math.max(0, explicitKhr)
    : item.pricingCurrency === 'KHR' && Number.isFinite(listed)
      ? Math.max(0, listed)
      : 0
  if (currency === 'USD') {
    if (normalizedUsd > 0) return normalizedUsd
    const savedExchangeRate = Number(item.pricingExchangeRate) > 0 ? Number(item.pricingExchangeRate) : exchangeRate
    return savedKhr > 0 ? Math.round((savedKhr / savedExchangeRate) * 100) / 100 : 0
  }
  if (savedKhr > 0) return savedKhr
  return Math.round((normalizedUsd * exchangeRate) / 100) * 100
}

export function inventoryNativeSalePriceText(item: InventoryItem) {
  const currency: SaleCurrency = item.pricingCurrency === 'KHR' ? 'KHR' : 'USD'
  const rate = Number(item.pricingExchangeRate) > 0 ? Number(item.pricingExchangeRate) : 4100
  return saleAmountText(inventorySalePrice(item, currency, rate), currency)
}
