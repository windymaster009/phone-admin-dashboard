import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import QRCode from 'react-qr-code'
import khqrLogo from '../../../server/integrations/payway/img/khqr.svg'
import {
  AlertTriangle,
  Banknote,
  Barcode,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  HandCoins,
  LoaderCircle,
  Maximize2,
  Minus,
  Package,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  ScanLine,
  Search,
  ShoppingCart,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react'
import { api, getSessionUser } from '../../lib/api'
import MoneyInput from '../../components/MoneyInput'
import { getPawnAutoCalculatePreference, PAWN_AUTO_CALCULATE_EVENT, savePawnAutoCalculatePreference } from '../../lib/pawnPreferences'
import { BarcodeGraphic, printInventoryLabels } from '../inventory/barcode'

type ModalKind = 'stock' | 'purchase' | 'sale' | 'pawn' | 'scan' | 'label'
type StockCategory = 'PHONE' | 'TABLET' | 'ACCESSORY' | 'SPARE_PART' | 'OTHER'

type Customer = {
  _id: string
  name: string
  phone: string
  nationalIdNumber?: string
}

type InventoryItem = {
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
}

type Supplier = {
  _id: string
  name: string
  phone?: string
  nationalIdNumber?: string
}

type SellerType = 'EXISTING_CUSTOMER' | 'EXISTING_SUPPLIER' | 'WALK_IN' | 'NEW_CUSTOMER' | 'NEW_SUPPLIER'
type PurchaseCurrency = 'USD' | 'KHR'
type SaleCurrency = PurchaseCurrency
type PawnCurrency = 'USD' | 'KHR'
type PurchaseInventoryMode = 'NEW' | 'EXISTING'
type PawnCustomerMode = 'EXISTING' | 'NEW'
type SalePaymentMethod = 'CASH' | 'KHQR'
type SalePaymentPhase = 'WAITING' | 'SCANNED' | 'APPROVED' | 'COMPLETED' | 'CANCELLING' | 'CANCELLED' | 'ERROR'
type StockAdjustmentMode = 'ADD' | 'REMOVE' | 'SET'
type StockAdjustmentStatus = 'IN_STOCK' | 'REPAIR' | 'ARCHIVED'

type PawnValuationSnapshot = {
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

type CreatedPawn = {
  pawnNo: string
  principal: number
  currency: PawnCurrency
}

type CompletedStockAdjustment = {
  itemName: string
  detail: string
}

type SaleDraft = {
  type: 'SELL'
  customer?: string
  items: Array<{ inventoryItem: string; name: string; quantity: number; unitPrice: number }>
  discount: number
  amountPaid: number
  paymentMethod: SalePaymentMethod
  currency: SaleCurrency
  exchangeRate: number
  notes: string
}

type SaleKhqr = {
  transactionId: string
  amount: number
  currency: 'USD'
  qrImage: string
  qrString: string
  deeplink?: string
  expiresAt: string
  environment: 'sandbox' | 'production'
}

type CreatedSaleTrade = {
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

type CompletedSale = {
  tradeNo: string
  currency: SaleCurrency
  total: number
  amountPaid: number
  balance: number
  paymentMethod: SalePaymentMethod
  itemName: string
  quantity: number
}

function completedSaleFromTrade(
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

function paywayImageSource(value: string) {
  const source = value.trim()
  if (!source || /^(data:|https?:|blob:)/i.test(source)) return source
  return `data:image/png;base64,${source}`
}

type PurchaseDevice = {
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

function newPurchaseDevice(): PurchaseDevice {
  return {
    id: crypto.randomUUID(), collapsed: false, inventoryMode: 'NEW', existingInventoryItem: '', category: 'PHONE', name: '', sku: '', quantity: '1', imei: '', brand: '', model: '', storage: '', ram: '', color: '',
    condition: 'GOOD', batteryHealth: '', carrierLock: 'UNKNOWN', compatibleModels: '', oemQuality: '', purchasePrice: '', accessoriesIncluded: [], notes: '',
  }
}

function canRestockExisting(category: StockCategory) {
  return category === 'ACCESSORY' || category === 'SPARE_PART' || category === 'OTHER'
}

function localDateValue() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function roundPawnAmount(value: number, currency: PawnCurrency) {
  return currency === 'KHR'
    ? Math.round((Number(value) || 0) / 100) * 100
    : Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100
}

function pawnAmountText(value: number, currency: PawnCurrency) {
  return currency === 'KHR'
    ? `${roundPawnAmount(value, currency).toLocaleString()} KHR`
    : `$${(Number(value) || 0).toFixed(2)}`
}

function pawnEquivalentAmountText(value: number, currency: PawnCurrency, usdKhrRate: number) {
  return currency === 'KHR'
    ? `≈ $${((Number(value) || 0) / usdKhrRate).toFixed(2)}`
    : `≈ ${(Math.round(((Number(value) || 0) * usdKhrRate) / 100) * 100).toLocaleString()} KHR`
}

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const riel = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function saleAmountText(value: number, currency: SaleCurrency) {
  return currency === 'KHR' ? `${riel.format(Math.round(value))} KHR` : money.format(value)
}

function inventorySalePrice(item: InventoryItem | undefined, currency: SaleCurrency, exchangeRate: number, minimum = false) {
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

function inventoryNativeSalePriceText(item: InventoryItem) {
  const currency: SaleCurrency = item.pricingCurrency === 'KHR' ? 'KHR' : 'USD'
  const rate = Number(item.pricingExchangeRate) > 0 ? Number(item.pricingExchangeRate) : 4100
  return saleAmountText(inventorySalePrice(item, currency, rate), currency)
}

const modalMeta: Record<ModalKind, { title: string; description: string; icon: ReactNode }> = {
  stock: {
    title: 'Adjust stock',
    description: 'Correct the count or status of an existing inventory item.',
    icon: <Package size={21} />,
  },
  purchase: {
    title: 'New purchase',
    description: 'Buy one or more products and add them to inventory.',
    icon: <Package size={21} />,
  },
  sale: {
    title: 'New sale',
    description: 'Sell an available inventory item to a customer.',
    icon: <ShoppingCart size={21} />,
  },
  pawn: {
    title: 'New pawn contract',
    description: 'Register customer collateral, value, principal, and due date.',
    icon: <HandCoins size={21} />,
  },
  scan: {
    title: 'Scan product',
    description: 'Use a barcode scanner, type a code, or scan with this device camera.',
    icon: <ScanLine size={21} />,
  },
  label: {
    title: 'Purchase completed',
    description: 'The product was added to stock and its barcode label is ready.',
    icon: <Printer size={21} />,
  },
}

function parsePlaceholderAlert(message?: string): ModalKind | null {
  const value = String(message || '').toLowerCase()
  if (value.startsWith('add stock') || value.startsWith('adjust stock')) return 'stock'
  if (value.startsWith('new purchase')) return 'purchase'
  if (value.startsWith('new sale')) return 'sale'
  if (value.startsWith('new pawn')) return 'pawn'
  return null
}

function ModalShell({
  kind,
  error,
  busy,
  onClose,
  compact = false,
  dismissible = true,
  dismissOnBackdrop = true,
  dismissOnEscape = true,
  children,
}: {
  kind: ModalKind
  error: string
  busy: boolean
  onClose: () => void
  compact?: boolean
  dismissible?: boolean
  dismissOnBackdrop?: boolean
  dismissOnEscape?: boolean
  children: ReactNode
}) {
  const meta = modalMeta[kind]
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy && dismissible && dismissOnEscape) onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    document.body.classList.add('operation-modal-open')
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.body.classList.remove('operation-modal-open')
    }
  }, [busy, dismissible, dismissOnEscape, onClose])

  useEffect(() => {
    const dialog = dialogRef.current
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusableSelector = 'button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(focusableSelector) || [])
    const frame = window.requestAnimationFrame(() => {
      const preferred = dialog?.querySelector<HTMLElement>('[data-modal-initial-focus]')
      ;(preferred || focusable()[0])?.focus()
    })
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const elements = focusable()
      if (!elements.length) return
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    dialog?.addEventListener('keydown', trapFocus)
    return () => {
      window.cancelAnimationFrame(frame)
      dialog?.removeEventListener('keydown', trapFocus)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [kind, compact])

  return (
    <div className="operation-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy && dismissible && dismissOnBackdrop) onClose()
    }}>
      <section ref={dialogRef} className={`operation-modal operation-modal-${kind}${compact ? ' operation-modal-compact' : ''}`} role="dialog" aria-modal="true" aria-label={meta.title}>
        <header className="operation-modal-header">
          <span className="operation-modal-icon">{meta.icon}</span>
          <div>
            <span className="eyebrow">PhoneFlow operation</span>
            <h2>{meta.title}</h2>
            <p>{meta.description}</p>
          </div>
          {dismissible && <button type="button" className="operation-modal-close" onClick={onClose} disabled={busy} aria-label="Close">
            <X size={19} />
          </button>}
        </header>
        {error && <div className="operation-modal-error"><AlertTriangle size={17} /> {error}</div>}
        {children}
      </section>
    </div>
  )
}

function CameraBarcodeReader({ onScan, onError, readerId = 'phoneflow-barcode-reader', autoStart = false }: { onScan: (code: string) => void; onError: (message: string) => void; readerId?: string; autoStart?: boolean }) {
  const [active, setActive] = useState(autoStart)

  useEffect(() => {
    if (!active) return
    let scanner: import('html5-qrcode').Html5Qrcode | null = null
    let disposed = false

    async function startCamera() {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
      if (disposed) return
      scanner = new Html5Qrcode(readerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
        ],
        verbose: false,
      })
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 280, height: 130 } },
        (decodedText) => {
          if (disposed) return
          setActive(false)
          onScan(decodedText)
        },
        () => undefined,
      )
    }

    void startCamera().catch((reason: Error) => {
      setActive(false)
      onError(reason.message || 'Unable to start the camera. Check camera permission and try again.')
    })

    return () => {
      disposed = true
      if (scanner?.isScanning) void scanner.stop().finally(() => scanner?.clear())
      else scanner?.clear()
    }
  }, [active, onError, onScan, readerId])

  return (
    <div className={`camera-scanner ${autoStart ? 'automatic' : ''}`}>
      <div id={readerId} className={active ? 'active' : ''} />
      {!autoStart && <button type="button" className="secondary-button" onClick={() => setActive((value) => !value)}>
        <Camera size={17} /> {active ? 'Stop camera' : 'Scan with camera'}
      </button>}
      {!autoStart && <small>Camera scanning requires permission and works on localhost or HTTPS.</small>}
    </div>
  )
}

export default function OperationModalBridge() {
  const [kind, setKind] = useState<ModalKind | null>(null)
  const [stockSearch, setStockSearch] = useState('')
  const [selectedStockItem, setSelectedStockItem] = useState<InventoryItem | null>(null)
  const [stockAdjustmentMode, setStockAdjustmentMode] = useState<StockAdjustmentMode>('ADD')
  const [stockAdjustmentQuantity, setStockAdjustmentQuantity] = useState('1')
  const [stockAdjustmentStatus, setStockAdjustmentStatus] = useState<StockAdjustmentStatus>('IN_STOCK')
  const [stockAdjustmentReason, setStockAdjustmentReason] = useState('')
  const [stockAdjustmentNotes, setStockAdjustmentNotes] = useState('')
  const [stockInventoryLoading, setStockInventoryLoading] = useState(false)
  const [stockAdjustmentComplete, setStockAdjustmentComplete] = useState<CompletedStockAdjustment | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [estimatedValue, setEstimatedValue] = useState(0)
  const [pawnAutoCalculate, setPawnAutoCalculate] = useState(getPawnAutoCalculatePreference)
  const [pawnPercentage, setPawnPercentage] = useState(45)
  const [pawnPrincipal, setPawnPrincipal] = useState('')
  const [pawnPrincipalLimitMessage, setPawnPrincipalLimitMessage] = useState('')
  const [pawnTermDays, setPawnTermDays] = useState<3 | 7 | 15 | 30>(7)
  const [pawnDailyFeeRate, setPawnDailyFeeRate] = useState('2.5')
  const [pawnFeeAtDue, setPawnFeeAtDue] = useState('')
  const [pawnValuation, setPawnValuation] = useState<PawnValuationSnapshot | null>(null)
  const [pawnCreated, setPawnCreated] = useState<CreatedPawn | null>(null)
  const [pawnCurrency, setPawnCurrency] = useState<PawnCurrency>('USD')
  const [pawnMarketPrice, setPawnMarketPrice] = useState(0)
  const [pawnAgeMonths, setPawnAgeMonths] = useState(0)
  const [pawnRepairCost, setPawnRepairCost] = useState(0)
  const [pawnCustomerId, setPawnCustomerId] = useState('')
  const [pawnOwnershipConfirmed, setPawnOwnershipConfirmed] = useState(false)
  const [pawnCustomerMode, setPawnCustomerMode] = useState<PawnCustomerMode>('EXISTING')
  const [pawnWalkInName, setPawnWalkInName] = useState('')
  const [pawnWalkInPhone, setPawnWalkInPhone] = useState('')
  const [pawnWalkInNationalId, setPawnWalkInNationalId] = useState('')
  const [pawnWalkInAddress, setPawnWalkInAddress] = useState('')
  const [pawnStep, setPawnStep] = useState<1 | 2>(1)
  const [pawnAttempted, setPawnAttempted] = useState(false)
  const [pawnImei, setPawnImei] = useState('')
  const [pawnCondition, setPawnCondition] = useState('GOOD')
  const [pawnBatteryHealth, setPawnBatteryHealth] = useState('85')
  const [pawnCarrierLock, setPawnCarrierLock] = useState('UNLOCKED')
  const [pawnAccessories, setPawnAccessories] = useState<string[]>([])
  const [pawnScannerOpen, setPawnScannerOpen] = useState(false)
  const [scanCode, setScanCode] = useState('')
  const [scannedItem, setScannedItem] = useState<InventoryItem | null>(null)
  const [labelItems, setLabelItems] = useState<InventoryItem[]>([])
  const [saleItemId, setSaleItemId] = useState('')
  const [saleCustomerId, setSaleCustomerId] = useState('')
  const [saleQuantity, setSaleQuantity] = useState('1')
  const [saleDiscount, setSaleDiscount] = useState('0')
  const [saleAmountPaid, setSaleAmountPaid] = useState('')
  const [saleNotes, setSaleNotes] = useState('')
  const [saleNotesOpen, setSaleNotesOpen] = useState(false)
  const [salePaymentMethod, setSalePaymentMethod] = useState<SalePaymentMethod>('CASH')
  const [saleCurrency, setSaleCurrency] = useState<SaleCurrency>('USD')
  const [saleKhqr, setSaleKhqr] = useState<SaleKhqr | null>(null)
  const [saleQrZoomed, setSaleQrZoomed] = useState(false)
  const [saleDraft, setSaleDraft] = useState<SaleDraft | null>(null)
  const [salePaymentStatus, setSalePaymentStatus] = useState('Waiting for payment')
  const [salePaymentPhase, setSalePaymentPhase] = useState<SalePaymentPhase>('WAITING')
  const [saleCompleted, setSaleCompleted] = useState<CompletedSale | null>(null)
  const [paywayAvailable, setPaywayAvailable] = useState(false)
  const [saleInventoryLoading, setSaleInventoryLoading] = useState(false)
  const khqrFinalizing = useRef(false)
  const khqrChecking = useRef(false)
  const khqrCancellationRequested = useRef(false)
  const [sellerType, setSellerType] = useState<SellerType>('WALK_IN')
  const [supplierId, setSupplierId] = useState('')
  const [sellerCustomerId, setSellerCustomerId] = useState('')
  const [sellerName, setSellerName] = useState('')
  const [sellerPhone, setSellerPhone] = useState('')
  const [sellerNationalId, setSellerNationalId] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(localDateValue)
  const [purchasePaymentMethod, setPurchasePaymentMethod] = useState('CASH')
  const [purchaseCurrency, setPurchaseCurrency] = useState<PurchaseCurrency>('USD')
  const [purchaseAmountPaid, setPurchaseAmountPaid] = useState('0')
  const [purchaseNotes, setPurchaseNotes] = useState('')
  const [purchaseDevices, setPurchaseDevices] = useState<PurchaseDevice[]>(() => [newPurchaseDevice()])
  const [purchaseStep, setPurchaseStep] = useState<1 | 2>(1)
  const [purchaseAttempted, setPurchaseAttempted] = useState(false)
  const [purchaseInventoryLoading, setPurchaseInventoryLoading] = useState(false)
  const [usdKhrRate, setUsdKhrRate] = useState(4100)
  const [imeiScanDeviceId, setImeiScanDeviceId] = useState<string | null>(null)
  const [imeiScanError, setImeiScanError] = useState('')
  const imeiInputs = useRef(new Map<string, HTMLInputElement>())

  useEffect(() => {
    const syncPreference = (event: Event) => setPawnAutoCalculate((event as CustomEvent<boolean>).detail)
    window.addEventListener(PAWN_AUTO_CALCULATE_EVENT, syncPreference)
    return () => window.removeEventListener(PAWN_AUTO_CALCULATE_EVENT, syncPreference)
  }, [])

  const pawnAssessment = useMemo(() => {
    const marketPrice = Math.max(0, pawnMarketPrice)
    const ageRate = Math.min(Math.max(pawnAgeMonths, 0) * 0.0125, 0.5)
    const conditionRates: Record<string, number> = { LIKE_NEW: 0.05, GOOD: 0.12, FAIR: 0.22, DAMAGED: 0.4 }
    const conditionRate = conditionRates[pawnCondition] ?? 0.12
    const battery = Math.min(100, Math.max(0, Number(pawnBatteryHealth) || 0))
    const batteryRate = battery >= 85 ? 0 : battery >= 80 ? 0.04 : battery >= 70 ? 0.08 : 0.12
    const essentialAccessories = pawnAccessories.filter((accessory) => ['BOX', 'CHARGER', 'CABLE'].includes(accessory))
    const accessoryRate = essentialAccessories.length === 0
      ? 0.05
      : !pawnAccessories.includes('CHARGER') || !pawnAccessories.includes('CABLE')
        ? 0.03
        : !pawnAccessories.includes('BOX') ? 0.01 : 0
    const carrierLockRate = pawnCarrierLock === 'LOCKED' ? 0.1 : 0
    const eligible = pawnCarrierLock !== 'ACTIVATION_LOCKED'
    const rawAgeDeduction = marketPrice * ageRate
    const rawConditionDeduction = marketPrice * conditionRate
    const rawBatteryDeduction = marketPrice * batteryRate
    const rawAccessoryDeduction = marketPrice * accessoryRate
    const rawCarrierLockDeduction = marketPrice * carrierLockRate
    const round = (value: number) => roundPawnAmount(value, pawnCurrency)
    const estimated = eligible
      ? Math.max(0, marketPrice - rawAgeDeduction - rawConditionDeduction - rawBatteryDeduction - rawAccessoryDeduction - rawCarrierLockDeduction - Math.max(0, pawnRepairCost))
      : 0
    const estimatedValue = round(estimated)
    return {
      eligible,
      ageRate,
      conditionRate,
      batteryRate,
      ageDeduction: round(rawAgeDeduction),
      conditionDeduction: round(rawConditionDeduction),
      batteryDeduction: round(rawBatteryDeduction),
      accessoryDeduction: round(rawAccessoryDeduction),
      carrierLockDeduction: round(rawCarrierLockDeduction),
      estimatedValue,
      maximumPawn: round(estimatedValue * pawnPercentage / 100),
    }
  }, [pawnAccessories, pawnAgeMonths, pawnBatteryHealth, pawnCarrierLock, pawnCondition, pawnCurrency, pawnMarketPrice, pawnPercentage, pawnRepairCost])
  const effectiveEstimatedValue = pawnValuation
    ? estimatedValue
    : pawnAutoCalculate ? pawnAssessment.estimatedValue : pawnAssessment.eligible ? roundPawnAmount(pawnMarketPrice, pawnCurrency) : 0
  const maximumPawn = pawnValuation || !pawnAutoCalculate
    ? roundPawnAmount(Math.max(0, effectiveEstimatedValue * pawnPercentage / 100), pawnCurrency)
    : pawnAssessment.maximumPawn
  const pawnPrincipalAmount = Math.max(0, Number(pawnPrincipal) || 0)
  const pawnAutomaticTermFee = roundPawnAmount(pawnPrincipalAmount * (Number(pawnDailyFeeRate) || 0) / 100 * pawnTermDays, pawnCurrency)
  const pawnManualTermFee = roundPawnAmount(Math.max(0, Number(pawnFeeAtDue) || 0), pawnCurrency)
  const pawnTermFee = pawnAutoCalculate ? pawnAutomaticTermFee : pawnManualTermFee
  const pawnEffectiveDailyFeeRate = pawnAutoCalculate
    ? Math.max(0, Number(pawnDailyFeeRate) || 0)
    : pawnPrincipalAmount > 0
      ? Math.round((pawnManualTermFee / pawnPrincipalAmount / pawnTermDays * 100 + Number.EPSILON) * 100_000_000) / 100_000_000
      : 0
  const pawnDailyFeeAmount = roundPawnAmount(
    pawnPrincipalAmount * pawnEffectiveDailyFeeRate / 100,
    pawnCurrency,
  )
  const pawnMaximumFeeAtDue = roundPawnAmount(pawnPrincipalAmount * pawnTermDays, pawnCurrency)
  const pawnTotalAtDue = roundPawnAmount((Number(pawnPrincipal) || 0) + pawnTermFee, pawnCurrency)
  const pawnCalculatedDueDate = useMemo(() => {
    const date = new Date(Date.now() + pawnTermDays * 86_400_000)
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(date)
  }, [pawnTermDays])
  useEffect(() => {
    if (kind !== 'pawn' || pawnStep !== 2) return
    setPawnPrincipal((current) => {
      if (Number(current) > maximumPawn) return maximumPawn > 0 ? String(maximumPawn) : ''
      if (pawnValuation || !pawnAutoCalculate) return current
      return maximumPawn > 0 ? String(maximumPawn) : ''
    })
    setPawnPrincipalLimitMessage('')
  }, [kind, maximumPawn, pawnAutoCalculate, pawnStep, pawnValuation])

  function togglePawnAutoCalculate() {
    const nextValue = !pawnAutoCalculate
    if (nextValue) {
      if (pawnEffectiveDailyFeeRate > 0) setPawnDailyFeeRate(String(pawnEffectiveDailyFeeRate))
    } else {
      setPawnFeeAtDue(pawnAutomaticTermFee > 0 ? String(pawnAutomaticTermFee) : '')
    }
    savePawnAutoCalculatePreference(nextValue)
  }

  const selectedPawnCustomer = customers.find((customer) => customer._id === pawnCustomerId)
  const pawnCustomerHasId = pawnCustomerMode === 'EXISTING'
    ? Boolean(selectedPawnCustomer?.nationalIdNumber)
    : Boolean(pawnWalkInNationalId.trim())
  const pawnCustomerValid = pawnCustomerMode === 'EXISTING'
    ? Boolean(selectedPawnCustomer && pawnOwnershipConfirmed)
    : Boolean(pawnWalkInName.trim() && pawnOwnershipConfirmed)
  const purchaseTotal = useMemo(
    () => purchaseDevices.reduce((sum, item) => sum + Math.max(0, Number(item.purchasePrice) || 0) * (item.category === 'PHONE' ? 1 : Math.max(1, Number(item.quantity) || 1)), 0),
    [purchaseDevices],
  )
  const purchasePaid = Math.max(0, Number(purchaseAmountPaid) || 0)
  const purchaseBalance = Math.max(0, purchaseTotal - purchasePaid)
  const purchasePaymentStatus = purchasePaid <= 0 ? 'UNPAID' : purchasePaid < purchaseTotal ? 'PARTIAL' : 'PAID'
  const purchasePaidInvalid = purchasePaid > purchaseTotal
    || (purchaseCurrency === 'KHR' && (!Number.isInteger(purchasePaid) || purchasePaid % 100 !== 0))
  const selectedSaleItem = inventory.find((item) => item._id === saleItemId)
  const stockMatches = useMemo(() => {
    const search = stockSearch.trim().toLowerCase()
    return inventory.filter((item) => !search || [item.name, item.sku, item.barcode, item.imei1, item.brand, item.model]
      .some((value) => value?.toLowerCase().includes(search))).slice(0, 8)
  }, [inventory, stockSearch])
  const stockIsSerialized = selectedStockItem?.category === 'PHONE'
  const stockAdjustmentLocked = Boolean(selectedStockItem && (stockIsSerialized
    ? ['PAWNED', 'RESERVED', 'SOLD'].includes(selectedStockItem.status)
    : ['PAWNED', 'RESERVED'].includes(selectedStockItem.status)))
  const requestedStockQuantity = Number(stockAdjustmentQuantity)
  const resultingStockQuantity = selectedStockItem && !stockIsSerialized && Number.isInteger(requestedStockQuantity)
    ? stockAdjustmentMode === 'ADD'
      ? selectedStockItem.quantity + requestedStockQuantity
      : stockAdjustmentMode === 'REMOVE'
        ? selectedStockItem.quantity - requestedStockQuantity
        : requestedStockQuantity
    : null
  const stockAdjustmentValid = Boolean(
    selectedStockItem
    && stockAdjustmentReason
    && !stockAdjustmentLocked
    && (stockIsSerialized
      ? selectedStockItem.status !== stockAdjustmentStatus
      : Number.isInteger(requestedStockQuantity)
        && requestedStockQuantity >= (stockAdjustmentMode === 'SET' ? 0 : 1)
        && Number(resultingStockQuantity) >= 0),
  )
  const effectiveSaleQuantity = selectedSaleItem?.category === 'PHONE' ? 1 : Math.max(1, Number(saleQuantity) || 1)
  const saleUnitPrice = inventorySalePrice(selectedSaleItem, saleCurrency, usdKhrRate)
  const saleSubtotal = effectiveSaleQuantity * saleUnitPrice
  const configuredMinimumSalePrice = inventorySalePrice(selectedSaleItem, saleCurrency, usdKhrRate, true)
  const effectiveMinimumSalePrice = configuredMinimumSalePrice > 0
    ? configuredMinimumSalePrice
    : getSessionUser()?.role === 'CASHIER'
      ? saleUnitPrice
      : 0
  const saleMaximumDiscount = Math.max(0, saleSubtotal - effectiveSaleQuantity * effectiveMinimumSalePrice)
  const saleDiscountAmount = Math.max(0, Number(saleDiscount) || 0)
  const saleTotal = Math.max(0, saleSubtotal - saleDiscountAmount)
  const salePaidAmount = saleAmountPaid === '' ? saleTotal : Math.max(0, Number(saleAmountPaid) || 0)
  const saleBalance = Math.max(0, saleTotal - salePaidAmount)
  const salePriceInvalid = Boolean(selectedSaleItem && saleUnitPrice <= 0)
  const saleStockPricingInvalid = configuredMinimumSalePrice > saleUnitPrice
  const saleDiscountInvalid = saleDiscountAmount > saleMaximumDiscount
    || (saleCurrency === 'KHR' && (!Number.isInteger(saleDiscountAmount) || saleDiscountAmount % 100 !== 0))
  const salePaidInvalid = salePaymentMethod === 'CASH' && (salePaidAmount > saleTotal
    || (saleCurrency === 'KHR' && (!Number.isInteger(salePaidAmount) || salePaidAmount % 100 !== 0)))
  const saleActionDisabled = busy
    || saleInventoryLoading
    || !saleItemId
    || salePriceInvalid
    || saleStockPricingInvalid
    || saleDiscountInvalid
    || salePaidInvalid
    || saleTotal < (saleCurrency === 'KHR' ? 100 : 0.01)
  const saleActionLabel = busy
    ? salePaymentMethod === 'KHQR' ? 'Generating KHQR...' : 'Saving sale...'
    : saleInventoryLoading
      ? 'Loading stock...'
      : !saleItemId
        ? 'Select a product first'
        : salePriceInvalid || saleStockPricingInvalid
          ? 'Complete sale'
            : saleDiscountInvalid
              ? 'Reduce discount'
              : salePaidInvalid
                ? 'Check amount paid'
                : saleTotal < (saleCurrency === 'KHR' ? 100 : 0.01)
                  ? 'Enter a valid amount'
                  : salePaymentMethod === 'KHQR'
                    ? 'Generate KHQR'
                    : 'Complete sale'

  useEffect(() => {
    if (kind !== 'sale' || salePaymentMethod !== 'CASH' || !saleItemId) return
    setSaleAmountPaid(saleTotal > 0 ? String(saleTotal) : '')
  }, [kind, saleItemId, salePaymentMethod, saleTotal])

  useEffect(() => {
    const originalAlert = window.alert.bind(window)
    window.alert = (message?: unknown) => {
      const modal = parsePlaceholderAlert(String(message || ''))
      if (modal) {
        setError('')
        setKind(modal)
        return
      }
      originalAlert(String(message || ''))
    }
    return () => { window.alert = originalAlert }
  }, [])

  useEffect(() => {
    const openScanner = () => {
      setError('')
      setScanCode('')
      setScannedItem(null)
      setKind('scan')
    }
    window.addEventListener('phoneflow:open-scanner', openScanner)
    return () => window.removeEventListener('phoneflow:open-scanner', openScanner)
  }, [])

  useEffect(() => {
    const openPawn = () => {
      setError('')
      setPawnCreated(null)
      setPawnAttempted(false)
      setPawnStep(1)
      setKind('pawn')
    }
    window.addEventListener('phoneflow:open-pawn', openPawn)
    return () => window.removeEventListener('phoneflow:open-pawn', openPawn)
  }, [])

  useEffect(() => {
    if (!kind) return
    if (kind === 'stock') {
      setStockInventoryLoading(true)
      api<{ items: InventoryItem[] }>('/inventory')
        .then((result) => setInventory(result.items))
        .catch((reason: Error) => setError(reason.message))
        .finally(() => setStockInventoryLoading(false))
    }
    if (kind === 'sale' || kind === 'pawn' || kind === 'purchase') {
      api<{ customers: Customer[] }>('/customers')
        .then((result) => setCustomers(result.customers))
        .catch((reason: Error) => setError(reason.message))
    }
    if (kind === 'sale') {
      setSaleInventoryLoading(true)
      api<{ items: InventoryItem[] }>('/inventory?status=IN_STOCK')
        .then((result) => setInventory(result.items.filter((item) => item.quantity > 0)))
        .catch((reason: Error) => setError(reason.message))
        .finally(() => setSaleInventoryLoading(false))
      api<{ usdKhr: number }>('/exchange-rates')
        .then((result) => setUsdKhrRate(result.usdKhr))
        .catch(() => setUsdKhrRate(4100))
      api<{ enabled: boolean; configured: boolean }>('/payway/config')
        .then((result) => {
          const available = result.enabled && result.configured
          setPaywayAvailable(available)
          if (!available) {
            setSalePaymentMethod('CASH')
            setSaleKhqr(null)
            setSaleDraft(null)
          }
        })
        .catch(() => setPaywayAvailable(false))
    }
    if (kind === 'purchase') {
      api<{ suppliers: Supplier[] }>('/suppliers')
        .then((result) => setSuppliers(result.suppliers))
        .catch((reason: Error) => setError(reason.message))
      api<{ usdKhr: number }>('/exchange-rates')
        .then((result) => setUsdKhrRate(result.usdKhr))
        .catch(() => setUsdKhrRate(4100))
      setPurchaseInventoryLoading(true)
      api<{ items: InventoryItem[] }>('/inventory')
        .then((result) => setInventory(result.items))
        .catch((reason: Error) => setError(reason.message))
        .finally(() => setPurchaseInventoryLoading(false))
    }
    if (kind === 'pawn') {
      const saved = sessionStorage.getItem('phoneflow_last_valuation')
      let importedExchangeRate = false
      if (saved) {
        try {
          const valuation = JSON.parse(saved) as PawnValuationSnapshot
          if (valuation.eligible === false) throw new Error('This valuation is not eligible for a pawn contract')
          const valuationCurrency: PawnCurrency = valuation.currency === 'KHR' ? 'KHR' : 'USD'
          const valuationExchangeRate = Number(valuation.exchangeRate)
          if (valuationCurrency === 'KHR' && (valuationExchangeRate < 1000 || valuationExchangeRate > 10000)) {
            throw new Error('This KHR valuation does not have a valid exchange rate')
          }
          setPawnValuation(valuation)
          setPawnAutoCalculate(valuation.calculationMode !== 'MANUAL')
          setPawnCurrency(valuationCurrency)
          if (valuationCurrency === 'KHR') {
            setUsdKhrRate(valuationExchangeRate)
            importedExchangeRate = true
          }
          if (Number(valuation.estimatedValue) > 0) setEstimatedValue(Number(valuation.estimatedValue))
          if (Number(valuation.marketPrice) > 0) setPawnMarketPrice(Number(valuation.marketPrice))
          if (Number.isFinite(Number(valuation.ageMonths))) setPawnAgeMonths(Math.max(0, Number(valuation.ageMonths)))
          if (Number.isFinite(Number(valuation.repairCost))) setPawnRepairCost(Math.max(0, Number(valuation.repairCost)))
          if (Number(valuation.pawnRate) >= 40 && Number(valuation.pawnRate) <= 50) setPawnPercentage(Number(valuation.pawnRate))
          if (Number(valuation.maximumPawn) > 0) setPawnPrincipal(String(roundPawnAmount(Number(valuation.maximumPawn), valuationCurrency)))
          if (Number.isFinite(Number(valuation.batteryHealth))) setPawnBatteryHealth(String(Number(valuation.batteryHealth)))
          const conditionMap: Record<string, string> = { excellent: 'LIKE_NEW', good: 'GOOD', fair: 'FAIR', damaged: 'DAMAGED' }
          if (valuation.condition && conditionMap[valuation.condition]) setPawnCondition(conditionMap[valuation.condition])
          if (valuation.lockStatus === 'unlocked') setPawnCarrierLock('UNLOCKED')
          if (valuation.lockStatus === 'carrier_locked') setPawnCarrierLock('LOCKED')
          if (Array.isArray(valuation.accessoriesIncluded)) setPawnAccessories(valuation.accessoriesIncluded.filter((accessory) => ['BOX', 'CHARGER', 'CABLE', 'CASE', 'EARPHONES'].includes(accessory)))
          else if (valuation.accessoryState === 'complete') setPawnAccessories(['BOX', 'CHARGER', 'CABLE'])
          else if (valuation.accessoryState === 'missing_charger') setPawnAccessories(['BOX'])
          else if (valuation.accessoryState === 'phone_only') setPawnAccessories([])
        } catch {
          setPawnValuation(null)
          setError('The calculator valuation could not be imported. Review the contract values before continuing.')
        } finally {
          sessionStorage.removeItem('phoneflow_last_valuation')
        }
      }
      if (!importedExchangeRate) {
        api<{ usdKhr: number }>('/exchange-rates')
          .then((result) => setUsdKhrRate(result.usdKhr))
          .catch(() => setUsdKhrRate(4100))
      }
    }
  }, [kind])

  const resetAndClose = () => {
    const shouldRefresh = kind === 'label' && labelItems.length > 0
    setKind(null)
    setError('')
    setStockSearch('')
    setSelectedStockItem(null)
    setStockAdjustmentMode('ADD')
    setStockAdjustmentQuantity('1')
    setStockAdjustmentStatus('IN_STOCK')
    setStockAdjustmentReason('')
    setStockAdjustmentNotes('')
    setStockInventoryLoading(false)
    setStockAdjustmentComplete(null)
    setEstimatedValue(0)
    setPawnAutoCalculate(getPawnAutoCalculatePreference())
    setPawnPercentage(45)
    setPawnPrincipal('')
    setPawnPrincipalLimitMessage('')
    setPawnTermDays(7)
    setPawnDailyFeeRate('2.5')
    setPawnFeeAtDue('')
    setPawnValuation(null)
    setPawnCreated(null)
    setPawnCurrency('USD')
    setPawnMarketPrice(0)
    setPawnAgeMonths(0)
    setPawnRepairCost(0)
    setPawnCustomerId('')
    setPawnOwnershipConfirmed(false)
    setPawnCustomerMode('EXISTING')
    setPawnWalkInName('')
    setPawnWalkInPhone('')
    setPawnWalkInNationalId('')
    setPawnWalkInAddress('')
    setPawnStep(1)
    setPawnAttempted(false)
    setPawnImei('')
    setPawnCondition('GOOD')
    setPawnBatteryHealth('85')
    setPawnCarrierLock('UNLOCKED')
    setPawnAccessories([])
    setPawnScannerOpen(false)
    setScanCode('')
    setScannedItem(null)
    setLabelItems([])
    setSaleItemId('')
    setSaleCustomerId('')
    setSaleQuantity('1')
    setSaleDiscount('0')
    setSaleAmountPaid('')
    setSaleNotes('')
    setSaleNotesOpen(false)
    setSalePaymentMethod('CASH')
    setSaleCurrency('USD')
    setSaleKhqr(null)
    setSaleQrZoomed(false)
    setSaleDraft(null)
    setSalePaymentStatus('Waiting for payment')
    setSalePaymentPhase('WAITING')
    setSaleCompleted(null)
    setPaywayAvailable(false)
    setSaleInventoryLoading(false)
    khqrFinalizing.current = false
    khqrChecking.current = false
    setSellerType('WALK_IN')
    setSupplierId('')
    setSellerCustomerId('')
    setSellerName('')
    setSellerPhone('')
    setSellerNationalId('')
    setPurchaseDate(localDateValue())
    setPurchasePaymentMethod('CASH')
    setPurchaseCurrency('USD')
    setPurchaseAmountPaid('0')
    setPurchaseNotes('')
    setPurchaseDevices([newPurchaseDevice()])
    setPurchaseStep(1)
    setPurchaseAttempted(false)
    setPurchaseInventoryLoading(false)
    if (shouldRefresh) window.location.reload()
  }

  const close = () => {
    if (busy) return
    if (kind === 'stock' && stockAdjustmentComplete) {
      window.location.reload()
      return
    }
    if (kind === 'pawn' && pawnCreated) {
      window.location.reload()
      return
    }
    if (saleQrZoomed) {
      setSaleQrZoomed(false)
      return
    }
    if (kind === 'sale' && saleCompleted) {
      window.location.reload()
      return
    }
    if (kind === 'sale' && saleKhqr) {
      if (salePaymentPhase === 'COMPLETED') {
        window.location.reload()
        return
      }
      if (salePaymentPhase === 'CANCELLED') {
        resetAndClose()
        return
      }
      khqrCancellationRequested.current = true
      setBusy(true)
      setSalePaymentStatus('Closing payment request...')
      void api(`/payway/khqr/${encodeURIComponent(saleKhqr.transactionId)}/close`, { method: 'POST' })
        .catch((reason: Error) => {
          console.warn('Unable to close PayWay transaction:', reason.message)
        })
        .finally(() => {
          setBusy(false)
          resetAndClose()
        })
      return
    }
    resetAndClose()
  }

  const openSelectedSaleItemPricing = () => {
    if (!selectedSaleItem) return

    const item = selectedSaleItem
    resetAndClose()
    const navigationState = { view: 'inventory' }
    if (window.location.pathname !== '/stock') {
      window.history.pushState(navigationState, '', '/stock')
    }
    window.dispatchEvent(new PopStateEvent('popstate', { state: navigationState }))
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-stock-item', { detail: { item } }))
    }, 0)
  }

  const printCreatedPawnTicket = () => {
    if (!pawnCreated) return
    const reference = pawnCreated.pawnNo

    // Remove the completed operation before opening the receipt viewer so the
    // user does not return to a stale success dialog after printing.
    resetAndClose()
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-pawn-ticket', {
        detail: { reference },
      }))
    })
  }

  const printCompletedSaleReceipt = () => {
    if (!saleCompleted) return
    const { tradeNo: reference, currency } = saleCompleted

    resetAndClose()
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-trade-receipt', {
        detail: { reference, currency, refreshOnClose: true },
      }))
    })
  }

  const findScannedProduct = useCallback(async (rawCode: string) => {
    const code = rawCode.trim()
    if (!code) {
      setError('Scan or enter a barcode first')
      return
    }
    setBusy(true)
    setError('')
    setScannedItem(null)
    try {
      const result = await api<{ item: InventoryItem }>(`/inventory/scan/${encodeURIComponent(code)}`)
      setScanCode(code)
      setScannedItem(result.item)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to find this product')
    } finally {
      setBusy(false)
    }
  }, [])

  const handleCameraError = useCallback((message: string) => setError(message), [])

  function sellScannedProduct() {
    if (!scannedItem || scannedItem.status !== 'IN_STOCK' || scannedItem.quantity < 1 || scannedItem.sellPrice <= 0) return
    setInventory((current) => current.some((item) => item._id === scannedItem._id) ? current : [scannedItem, ...current])
    setSaleItemId(scannedItem._id)
    setSaleCurrency(scannedItem.pricingCurrency === 'KHR' ? 'KHR' : 'USD')
    setSaleDiscount('0')
    setSaleAmountPaid('')
    setError('')
    setKind('sale')
  }

  async function submitStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedStockItem || !stockAdjustmentValid) {
      setError('Select an item and complete the required adjustment details')
      return
    }
    setBusy(true)
    setError('')
    const payload = {
      mode: stockIsSerialized ? 'STATUS' : stockAdjustmentMode,
      quantity: stockIsSerialized ? undefined : requestedStockQuantity,
      status: stockIsSerialized ? stockAdjustmentStatus : undefined,
      reason: stockAdjustmentReason,
      notes: stockAdjustmentNotes,
    }
    try {
      await api(`/inventory/${selectedStockItem._id}/adjust`, { method: 'POST', body: JSON.stringify(payload) })
      const detail = stockIsSerialized
        ? `Status set to ${stockAdjustmentStatus.replaceAll('_', ' ').toLowerCase()}`
        : `Stock count is now ${Math.max(0, resultingStockQuantity ?? selectedStockItem.quantity)}`
      setStockAdjustmentComplete({ itemName: selectedStockItem.name, detail })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to adjust stock')
    } finally {
      setBusy(false)
    }
  }

  function updatePurchaseDevice(id: string, update: Partial<PurchaseDevice>) {
    setPurchaseDevices((current) => current.map((device) => device.id === id ? { ...device, ...update } : device))
  }

  function updatePurchaseCategory(id: string, category: StockCategory) {
    updatePurchaseDevice(id, {
      category,
      quantity: '1',
      inventoryMode: 'NEW',
      existingInventoryItem: '',
    })
  }

  function openImeiScanner(deviceId: string) {
    setImeiScanDeviceId(deviceId)
    setImeiScanError('')
  }

  const applyScannedImei = useCallback((rawCode: string) => {
    const imei = rawCode.replace(/\D/g, '')
    if (imei.length !== 15) {
      setImeiScanError(`IMEI must contain exactly 15 digits. The scan returned ${imei.length}.`)
      return
    }
    if (!imeiScanDeviceId) return
    setPurchaseDevices((current) => current.map((device) => device.id === imeiScanDeviceId ? { ...device, imei } : device))
    setImeiScanDeviceId(null)
    setImeiScanError('')
    window.setTimeout(() => imeiInputs.current.get(imeiScanDeviceId)?.focus(), 0)
  }, [imeiScanDeviceId])

  function purchaseItemErrors(item: PurchaseDevice) {
    const errors: Record<string, string> = {}
    const price = Number(item.purchasePrice)
    const quantity = Number(item.quantity)
    const validGigabytes = (value: string) => Number.isFinite(Number(value)) && Number(value) > 0
    if (!Number.isFinite(price) || price < 0 || item.purchasePrice === '') errors.purchasePrice = 'Enter a valid unit purchase price'
    else if (purchaseCurrency === 'KHR' && (!Number.isInteger(price) || price % 100 !== 0)) errors.purchasePrice = 'Use a whole KHR amount in increments of 100'
    if (item.category !== 'PHONE' && (!Number.isInteger(quantity) || quantity < 1)) errors.quantity = 'Quantity must be at least 1'
    if (item.inventoryMode === 'EXISTING') {
      if (!canRestockExisting(item.category)) errors.existingInventoryItem = 'Phones and tablets must be entered as new units'
      else if (!item.existingInventoryItem) errors.existingInventoryItem = 'Select an existing inventory product'
      return errors
    }
    if (item.category === 'PHONE') {
      if (!/^\d{15}$/.test(item.imei)) errors.imei = 'IMEI must contain exactly 15 digits'
      if (!item.brand.trim()) errors.brand = 'Brand is required'
      if (!item.model.trim()) errors.model = 'Model is required'
      if (!validGigabytes(item.storage)) errors.storage = 'Enter storage in GB'
      if (item.ram && !validGigabytes(item.ram)) errors.ram = 'Enter RAM in GB'
      if (!item.color.trim()) errors.color = 'Color is required'
    } else if (item.category === 'TABLET') {
      if (!item.brand.trim()) errors.brand = 'Brand is required'
      if (!item.model.trim()) errors.model = 'Model is required'
      if (!validGigabytes(item.storage)) errors.storage = 'Enter storage in GB'
      if (!item.color.trim()) errors.color = 'Color is required'
    } else {
      if (!item.name.trim()) errors.name = item.category === 'SPARE_PART' ? 'Part name is required' : 'Item name is required'
      if (item.category === 'ACCESSORY' && !item.brand.trim()) errors.brand = 'Brand is required'
      if (item.category === 'ACCESSORY' && !item.sku.trim()) errors.sku = 'SKU is required'
      if (item.category === 'SPARE_PART' && !item.compatibleModels.trim()) errors.compatibleModels = 'Compatible models are required'
      if (item.category === 'SPARE_PART' && !item.oemQuality) errors.oemQuality = 'Select OEM quality'
    }
    return errors
  }

  const purchaseSellerValid = sellerType === 'EXISTING_SUPPLIER'
    ? Boolean(supplierId)
    : sellerType === 'EXISTING_CUSTOMER'
      ? Boolean(sellerCustomerId)
      : Boolean(sellerName.trim()) && (sellerType !== 'NEW_CUSTOMER' || Boolean(sellerPhone.trim()))
  const existingPurchaseIds = purchaseDevices.filter((item) => item.inventoryMode === 'EXISTING').map((item) => item.existingInventoryItem).filter(Boolean)
  const purchaseItemsValid = purchaseDevices.length > 0
    && new Set(existingPurchaseIds).size === existingPurchaseIds.length
    && purchaseDevices.every((item) => Object.keys(purchaseItemErrors(item)).length === 0)

  function openPurchaseItem(id: string) {
    setPurchaseDevices((current) => current.map((item) => ({ ...item, collapsed: item.id !== id })))
  }

  function addPurchaseDevice() {
    const device = newPurchaseDevice()
    setPurchaseDevices((current) => [...current.map((item) => ({ ...item, collapsed: true })), device])
    window.setTimeout(() => imeiInputs.current.get(device.id)?.focus(), 0)
  }

  function removePurchaseDevice(id: string) {
    if (purchaseDevices.length === 1) return
    setPurchaseDevices((current) => current.filter((device) => device.id !== id))
    imeiInputs.current.delete(id)
  }

  async function submitPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPurchaseAttempted(true)
    if (!purchaseSellerValid) {
      setPurchaseStep(1)
      setError('Complete the required seller information before continuing')
      return
    }
    if (!purchaseItemsValid || purchasePaidInvalid) {
      const firstInvalid = purchaseDevices.find((item) => Object.keys(purchaseItemErrors(item)).length > 0)
      setPurchaseStep(2)
      if (firstInvalid) openPurchaseItem(firstInvalid.id)
      setError(purchasePaid > purchaseTotal
        ? 'Amount paid cannot exceed the purchase total'
        : purchaseCurrency === 'KHR' && (!Number.isInteger(purchasePaid) || purchasePaid % 100 !== 0)
          ? 'Amount paid must use whole 100 KHR increments'
        : new Set(existingPurchaseIds).size !== existingPurchaseIds.length
          ? 'Add each existing product only once per purchase'
          : 'Complete the highlighted item fields')
      return
    }
    setBusy(true)
    setError('')
    const payload = {
      type: 'BUY',
      sellerType,
      supplier: sellerType === 'EXISTING_SUPPLIER' ? supplierId : undefined,
      customer: sellerType === 'EXISTING_CUSTOMER' ? sellerCustomerId : undefined,
      seller: sellerType.startsWith('EXISTING_') ? undefined : { name: sellerName, phone: sellerPhone, nationalIdNumber: sellerNationalId },
      purchaseDate,
      paymentMethod: purchasePaymentMethod,
      currency: purchaseCurrency,
      exchangeRate: purchaseCurrency === 'KHR' ? usdKhrRate : 1,
      amountPaid: purchasePaid,
      notes: purchaseNotes,
      items: purchaseDevices.map(({ id: _id, collapsed: _collapsed, inventoryMode, existingInventoryItem, ...item }) => ({
        ...item,
        inventoryItem: inventoryMode === 'EXISTING' ? existingInventoryItem : undefined,
      })),
    }
    try {
      const result = await api<{ trade: { items: { inventoryItem: InventoryItem }[] } }>('/trades', { method: 'POST', body: JSON.stringify(payload) })
      const purchasedItems = result.trade.items.map((item) => item.inventoryItem).filter(Boolean)
      if (purchasedItems.length > 0) {
        setLabelItems(purchasedItems)
        setKind('label')
      } else {
        setKind(null)
        window.location.reload()
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save purchase')
    } finally {
      setBusy(false)
    }
  }

  async function submitSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const selected = inventory.find((item) => item._id === saleItemId)
    if (!selected) {
      setBusy(false)
      setError('Select an available inventory item')
      return
    }
    const quantity = selected.category === 'PHONE' ? 1 : Number(saleQuantity || 1)
    const unitPrice = inventorySalePrice(selected, saleCurrency, usdKhrRate)
    const discount = Number(saleDiscount || 0)
    const total = Math.max(0, quantity * unitPrice - discount)
    const configuredMinimum = inventorySalePrice(selected, saleCurrency, usdKhrRate, true)
    const minimumUnitPrice = configuredMinimum > 0
      ? configuredMinimum
      : getSessionUser()?.role === 'CASHIER'
        ? unitPrice
        : 0
    const maximumDiscount = Math.max(0, quantity * (unitPrice - minimumUnitPrice))
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > selected.quantity) {
      setBusy(false)
      setError(`Quantity must be between 1 and ${selected.quantity}`)
      return
    }
    const invalidKhrAmount = saleCurrency === 'KHR' && (!Number.isInteger(unitPrice) || unitPrice % 100 !== 0 || !Number.isInteger(discount) || discount % 100 !== 0)
    if (!Number.isFinite(unitPrice) || unitPrice <= 0 || minimumUnitPrice > unitPrice || !Number.isFinite(discount) || discount < 0 || discount > maximumDiscount || invalidKhrAmount) {
      setBusy(false)
      setError(minimumUnitPrice > unitPrice
        ? 'Fix this product\'s minimum selling price in Stock Information before completing the sale'
        : discount > maximumDiscount
        ? `Discount cannot exceed ${saleAmountText(maximumDiscount, saleCurrency)}`
        : invalidKhrAmount
          ? 'KHR prices and discounts must use whole 100 KHR increments'
          : 'Set a valid selling price in Stock Information before completing this sale')
      return
    }
    const amountPaid = salePaymentMethod === 'KHQR' ? total : saleAmountPaid === '' ? total : Number(saleAmountPaid)
    if (!Number.isFinite(amountPaid) || amountPaid < 0 || amountPaid > total || (saleCurrency === 'KHR' && (!Number.isInteger(amountPaid) || amountPaid % 100 !== 0))) {
      setBusy(false)
      setError(saleCurrency === 'KHR' ? 'Amount paid must use whole 100 KHR increments and cannot exceed the total' : 'Amount paid cannot be greater than the sale total')
      return
    }
    const payload: SaleDraft = {
      type: 'SELL' as const,
      customer: saleCustomerId || undefined,
      items: [{ inventoryItem: selected._id, name: selected.name, quantity, unitPrice }],
      discount,
      amountPaid,
      paymentMethod: salePaymentMethod,
      currency: saleCurrency,
      exchangeRate: saleCurrency === 'KHR' ? usdKhrRate : 1,
      notes: saleNotes,
    }
    try {
      if (salePaymentMethod === 'KHQR') {
        if (!paywayAvailable) throw new Error('ABA PayWay sandbox is not available. Check the server configuration.')
        khqrCancellationRequested.current = false
        const result = await api<SaleKhqr>('/payway/khqr', {
          method: 'POST',
          body: JSON.stringify({
            inventoryItem: selected._id,
            customer: saleCustomerId || undefined,
            quantity,
            unitPrice,
            discount,
          }),
        })
        setSaleDraft(payload)
        setSaleKhqr(result)
        setSalePaymentStatus('Waiting for payment')
        setSalePaymentPhase('WAITING')
      } else {
        if (payload.amountPaid > total) throw new Error('Amount paid cannot be greater than the sale total')
        const result = await api<{ trade: CreatedSaleTrade }>('/trades', { method: 'POST', body: JSON.stringify(payload) })
        setSaleCompleted(completedSaleFromTrade(result.trade, {
          currency: saleCurrency,
          paymentMethod: 'CASH',
          itemName: selected.name,
          quantity,
        }))
        setSalePaymentPhase('COMPLETED')
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to complete sale')
    } finally {
      setBusy(false)
    }
  }

  const checkKhqrPayment = useCallback(async () => {
    if (!saleKhqr || !saleDraft || khqrFinalizing.current || khqrChecking.current || khqrCancellationRequested.current) return
    khqrChecking.current = true
    try {
      const status = await api<{
        approved: boolean
        paymentStatus: string
        paymentStatusCode?: number
        amount?: number
        currency?: string
      }>(`/payway/khqr/${encodeURIComponent(saleKhqr.transactionId)}/status`)
      if (khqrCancellationRequested.current) return
      const normalizedStatus = String(status.paymentStatus || '').trim().toUpperCase()
      if (/SCANNED|PROCESSING|AUTHORI[ZS]ING/.test(normalizedStatus)) {
        setSalePaymentPhase('SCANNED')
        setSalePaymentStatus('QR scanned successfully')
      } else if (/CANCELLED|CANCELED|CLOSED/.test(normalizedStatus)) {
        khqrCancellationRequested.current = true
        setSalePaymentPhase('CANCELLED')
        setSalePaymentStatus('Payment cancelled')
      } else if (/DECLINED|FAILED|EXPIRED/.test(normalizedStatus)) {
        setSalePaymentPhase('ERROR')
        setSalePaymentStatus(normalizedStatus === 'EXPIRED' ? 'Payment request expired' : 'Payment was not completed')
      } else {
        setSalePaymentPhase(status.approved ? 'APPROVED' : 'WAITING')
        setSalePaymentStatus(status.approved ? 'Payment approved' : normalizedStatus || 'Waiting for payment')
      }
      if (!status.approved) return

      khqrFinalizing.current = true
      setSalePaymentPhase('APPROVED')
      setBusy(true)
      const result = await api<{ trade: CreatedSaleTrade }>('/trades', {
        method: 'POST',
        body: JSON.stringify({
          ...saleDraft,
          amountPaid: saleKhqr.amount,
          paymentMethod: 'KHQR',
          paywayTransactionId: saleKhqr.transactionId,
        }),
      })
      setSaleCompleted(completedSaleFromTrade(result.trade, {
        currency: saleDraft.currency,
        paymentMethod: 'KHQR',
        itemName: saleDraft.items[0]?.name || 'Sold item',
        quantity: saleDraft.items[0]?.quantity || 1,
      }))
      setSalePaymentStatus('Payment successful')
      setSalePaymentPhase('COMPLETED')
      setBusy(false)
    } catch (reason) {
      if (khqrFinalizing.current) {
        khqrFinalizing.current = false
        setBusy(false)
      }
      if (!khqrCancellationRequested.current) {
        setSalePaymentPhase('ERROR')
        setSalePaymentStatus('Unable to verify payment')
        setError(reason instanceof Error ? reason.message : 'Unable to verify KHQR payment')
      }
    } finally {
      khqrChecking.current = false
    }
  }, [saleDraft, saleKhqr])

  useEffect(() => {
    if (!saleKhqr || !saleDraft || salePaymentPhase === 'COMPLETED' || salePaymentPhase === 'CANCELLED' || salePaymentPhase === 'CANCELLING') return
    void checkKhqrPayment()
    const timer = window.setInterval(() => void checkKhqrPayment(), 3000)
    return () => window.clearInterval(timer)
  }, [checkKhqrPayment, saleDraft, saleKhqr, salePaymentPhase])

  async function cancelKhqrPayment() {
    if (!saleKhqr || busy) return
    khqrCancellationRequested.current = true
    setBusy(true)
    setError('')
    setSalePaymentStatus('Closing payment request...')
    setSalePaymentPhase('CANCELLING')
    try {
      await api(`/payway/khqr/${encodeURIComponent(saleKhqr.transactionId)}/close`, { method: 'POST' })
      setSalePaymentStatus('Payment cancelled')
      setSalePaymentPhase('CANCELLED')
      khqrFinalizing.current = false
    } catch (reason) {
      khqrCancellationRequested.current = false
      setSalePaymentStatus('Unable to cancel payment')
      setSalePaymentPhase('ERROR')
      setError(reason instanceof Error ? reason.message : 'Unable to close this KHQR request')
    } finally {
      setBusy(false)
    }
  }

  function restartKhqrPayment() {
    setSaleKhqr(null)
    setSaleDraft(null)
    setSaleQrZoomed(false)
    setSalePaymentStatus('Waiting for payment')
    setSalePaymentPhase('WAITING')
    setError('')
  }

  function changePawnCurrency(nextCurrency: PawnCurrency) {
    if (nextCurrency === pawnCurrency || pawnValuation) return
    const convert = (amount: number) => nextCurrency === 'KHR'
      ? Math.round((amount * usdKhrRate) / 100) * 100
      : Math.round((amount / usdKhrRate) * 100) / 100
    setPawnMarketPrice(convert(pawnMarketPrice))
    setPawnRepairCost(convert(pawnRepairCost))
    setPawnFeeAtDue((current) => current ? String(convert(Number(current))) : '')
    setPawnCurrency(nextCurrency)
  }

  async function submitPawn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    const requestedPrincipal = Number(form.get('principal') || 0)
    if (!Number.isFinite(requestedPrincipal) || requestedPrincipal <= 0) {
      setError('Enter a principal amount greater than zero.')
      return
    }
    if (requestedPrincipal > maximumPawn) {
      setPawnPrincipal(maximumPawn > 0 ? String(maximumPawn) : '')
      setPawnPrincipalLimitMessage(`Principal cannot exceed ${pawnAmountText(maximumPawn, pawnCurrency)}.`)
      setError(`Principal cannot exceed the approved maximum of ${pawnAmountText(maximumPawn, pawnCurrency)}.`)
      return
    }
    setBusy(true)
    const brand = String(form.get('brand') || '').trim()
    const model = String(form.get('model') || '').trim()
    const storage = String(form.get('storage') || '').trim()
    const conditionMap: Record<string, string> = { LIKE_NEW: 'excellent', GOOD: 'good', FAIR: 'fair', DAMAGED: 'damaged' }
    const lockStatus = pawnCarrierLock === 'ACTIVATION_LOCKED'
      ? 'activation_locked'
      : pawnCarrierLock === 'LOCKED' ? 'carrier_locked' : 'unlocked'
    const valuationSnapshot: PawnValuationSnapshot = pawnValuation || {
      id: `INLINE-${Date.now()}`,
      source: 'CALCULATOR',
      calculationMode: pawnAutoCalculate ? 'AUTO' : 'MANUAL',
      createdAt: new Date().toISOString(),
      currency: pawnCurrency,
      exchangeRate: pawnCurrency === 'KHR' ? usdKhrRate : 1,
      marketPrice: pawnMarketPrice,
      ageMonths: pawnAgeMonths,
      condition: conditionMap[pawnCondition] || 'good',
      batteryHealth: Number(pawnBatteryHealth) || 0,
      lockStatus,
      accessoriesIncluded: pawnAccessories,
      repairCost: pawnRepairCost,
      pawnRate: pawnPercentage,
      eligible: pawnAssessment.eligible,
      ageDeduction: pawnAssessment.ageDeduction,
      conditionDeduction: pawnAssessment.conditionDeduction,
      batteryDeduction: pawnAssessment.batteryDeduction,
      accessoryDeduction: pawnAssessment.accessoryDeduction,
      carrierLockDeduction: pawnAssessment.carrierLockDeduction,
      estimatedValue: effectiveEstimatedValue,
      maximumPawn,
    }
    const payload = {
      customer: pawnCustomerMode === 'EXISTING' ? pawnCustomerId : undefined,
      customerDetails: pawnCustomerMode === 'NEW' ? {
        name: pawnWalkInName,
        phone: pawnWalkInPhone,
        nationalIdNumber: pawnWalkInNationalId,
        address: pawnWalkInAddress,
      } : undefined,
      itemSnapshot: {
        name: [brand, model, storage ? `${storage.replace(/\s*GB$/i, '')}GB` : ''].filter(Boolean).join(' '),
        brand,
        model,
        imei: pawnImei,
        condition: pawnCondition,
        storage,
        ram: String(form.get('ram') || ''),
        color: String(form.get('color') || ''),
        batteryHealth: pawnBatteryHealth ? Number(pawnBatteryHealth) : undefined,
        carrierLock: pawnCarrierLock === 'ACTIVATION_LOCKED' ? 'UNKNOWN' : pawnCarrierLock,
        accessoriesIncluded: pawnAccessories,
      },
      estimatedValue: effectiveEstimatedValue,
      pawnPercentage,
      valuationSnapshot,
      principal: requestedPrincipal,
      currency: pawnCurrency,
      exchangeRate: pawnCurrency === 'KHR' ? usdKhrRate : 1,
      termDays: pawnTermDays,
      dailyFeeRate: pawnEffectiveDailyFeeRate,
      feeAtDue: pawnAutoCalculate ? undefined : pawnManualTermFee,
      ownershipConfirmed: pawnOwnershipConfirmed,
      identificationVerified: Boolean(pawnCustomerHasId && pawnOwnershipConfirmed),
      notes: String(form.get('notes') || ''),
    }
    try {
      const result = await api<{ pawn: CreatedPawn }>('/pawns', { method: 'POST', body: JSON.stringify(payload) })
      setPawnCreated({ pawnNo: result.pawn.pawnNo, principal: result.pawn.principal, currency: result.pawn.currency })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create pawn contract')
    } finally {
      setBusy(false)
    }
  }

  if (!kind) return null

  return (
    <ModalShell
      kind={kind}
      error={error}
      busy={busy}
      compact={kind === 'label' || (kind === 'sale' && Boolean(saleKhqr || saleCompleted)) || (kind === 'pawn' && Boolean(pawnCreated)) || (kind === 'stock' && Boolean(stockAdjustmentComplete))}
      dismissible={!(kind === 'sale' && saleKhqr && !saleCompleted)}
      dismissOnBackdrop={!['pawn', 'purchase', 'scan', 'stock'].includes(kind)}
      dismissOnEscape={kind !== 'pawn'}
      onClose={close}
    >
      {kind === 'stock' && stockAdjustmentComplete && <section className="record-created-workflow" role="status" aria-live="polite">
        <div className="record-created-card">
          <span className="record-created-check"><CheckCircle2 size={38} /></span>
          <div><span className="eyebrow">Stock updated</span><h3>Inventory adjustment saved</h3></div>
          <dl>
            <div><dt>Inventory item</dt><dd>{stockAdjustmentComplete.itemName}</dd></div>
            <div><dt>Result</dt><dd><span>{stockAdjustmentComplete.detail}</span></dd></div>
          </dl>
        </div>
        <footer className="operation-modal-actions"><button type="button" className="primary-button record-created-done" onClick={() => window.location.reload()}><CheckCircle2 size={16} /> Done</button></footer>
      </section>}

      {kind === 'stock' && !stockAdjustmentComplete && <form className="operation-form stock-adjustment-form" onSubmit={submitStock}>
        {!selectedStockItem ? <>
          <section className="stock-adjustment-intro">
            <span><Search size={19} /></span>
            <div><h3>Find an existing product</h3><p>Search by product name, SKU, barcode, IMEI, or serial number. A USB scanner can type directly into this field.</p></div>
          </section>
          <label className="stock-adjustment-search"><span className="stock-adjustment-search-label">Search inventory</span>
            <div><Search size={17} /><input autoFocus value={stockSearch} onChange={(event) => setStockSearch(event.target.value)} placeholder="Search or scan a product code" /></div>
          </label>
          <div className="stock-adjustment-results" role="list" aria-label="Matching inventory items">
            {stockInventoryLoading ? <div className="stock-adjustment-empty"><LoaderCircle className="spinning" size={19} /> Loading inventory...</div> : stockMatches.map((item) => <button type="button" role="listitem" key={item._id} onClick={() => {
              setSelectedStockItem(item)
              setStockAdjustmentMode('ADD')
              setStockAdjustmentQuantity('1')
              setStockAdjustmentStatus(item.status === 'REPAIR' || item.status === 'ARCHIVED' ? item.status : 'IN_STOCK')
              setError('')
            }}>
              <span className={`stock-adjustment-result-icon ${item.category === 'PHONE' ? 'phone' : ''}`}>{item.category === 'PHONE' ? <Smartphone size={19} /> : <Package size={19} />}</span>
              <p><strong>{item.name}</strong><small>{item.sku}{item.imei1 ? ` · IMEI ${item.imei1}` : ''}</small></p>
              <span><small>{item.category.replaceAll('_', ' ')}</small><strong>{item.category === 'PHONE' ? item.status.replaceAll('_', ' ') : `${item.quantity} in stock`}</strong></span>
            </button>)}
            {!stockInventoryLoading && stockMatches.length === 0 && <div className="stock-adjustment-empty"><Package size={19} /> No matching inventory item</div>}
          </div>
        </> : <>
          <section className="stock-adjustment-selected">
            <span className={`stock-adjustment-result-icon ${selectedStockItem.category === 'PHONE' ? 'phone' : ''}`}>{selectedStockItem.category === 'PHONE' ? <Smartphone size={21} /> : <Package size={21} />}</span>
            <div><span className="eyebrow">Selected inventory item</span><h3>{selectedStockItem.name}</h3><p>{selectedStockItem.sku}{selectedStockItem.imei1 ? ` · IMEI ${selectedStockItem.imei1}` : ''}</p></div>
            <div className="stock-adjustment-current"><small>{stockIsSerialized ? 'Current status' : 'Current quantity'}</small><strong>{stockIsSerialized ? selectedStockItem.status.replaceAll('_', ' ') : selectedStockItem.quantity}</strong></div>
            <button type="button" className="ghost-button" onClick={() => { setSelectedStockItem(null); setStockSearch(''); setStockAdjustmentReason(''); setError('') }}>Change item</button>
          </section>

          {stockAdjustmentLocked && <div className="stock-adjustment-lock"><AlertTriangle size={17} /><div><strong>This item is controlled by another workflow</strong><span>{selectedStockItem.status.replaceAll('_', ' ')} stock must be updated through its related sale, reservation, or pawn contract.</span></div></div>}

          {stockIsSerialized ? <section className="stock-adjustment-panel">
            <div className="stock-adjustment-section-heading"><div><span className="eyebrow">Serialized device</span><h3>Correct device status</h3><p>Phone quantity stays at one. Purchases, sales, and pawn contracts must use their own workflows.</p></div></div>
            <div className="stock-adjustment-status-options" role="radiogroup" aria-label="New device status">
              {(['IN_STOCK', 'REPAIR', 'ARCHIVED'] as StockAdjustmentStatus[]).map((status) => <button type="button" role="radio" aria-checked={stockAdjustmentStatus === status} disabled={stockAdjustmentLocked} className={stockAdjustmentStatus === status ? 'active' : ''} key={status} onClick={() => setStockAdjustmentStatus(status)}><span>{status === 'IN_STOCK' ? 'Available' : status === 'REPAIR' ? 'In repair' : 'Archived'}</span><small>{status === 'IN_STOCK' ? 'Ready to sell' : status === 'REPAIR' ? 'Temporarily unavailable' : 'Removed from active stock'}</small>{stockAdjustmentStatus === status && <CheckCircle2 size={17} />}</button>)}
            </div>
          </section> : <section className="stock-adjustment-panel">
            <div className="stock-adjustment-section-heading"><div><span className="eyebrow">Quantity adjustment</span><h3>How should the count change?</h3></div>{resultingStockQuantity !== null && <p><small>New quantity</small><strong>{Math.max(0, resultingStockQuantity)}</strong></p>}</div>
            <div className="stock-adjustment-mode-options" role="radiogroup" aria-label="Quantity adjustment method">
              <button type="button" role="radio" aria-checked={stockAdjustmentMode === 'ADD'} disabled={stockAdjustmentLocked} className={stockAdjustmentMode === 'ADD' ? 'active' : ''} onClick={() => setStockAdjustmentMode('ADD')}><Plus size={17} /><span>Add</span><small>Increase count</small></button>
              <button type="button" role="radio" aria-checked={stockAdjustmentMode === 'REMOVE'} disabled={stockAdjustmentLocked} className={stockAdjustmentMode === 'REMOVE' ? 'active' : ''} onClick={() => setStockAdjustmentMode('REMOVE')}><Minus size={17} /><span>Remove</span><small>Decrease count</small></button>
              <button type="button" role="radio" aria-checked={stockAdjustmentMode === 'SET'} disabled={stockAdjustmentLocked} className={stockAdjustmentMode === 'SET' ? 'active' : ''} onClick={() => setStockAdjustmentMode('SET')}><RefreshCw size={17} /><span>Set count</span><small>Replace current count</small></button>
            </div>
            <label>Quantity<input type="number" min={stockAdjustmentMode === 'SET' ? '0' : '1'} step="1" required disabled={stockAdjustmentLocked} value={stockAdjustmentQuantity} onChange={(event) => setStockAdjustmentQuantity(event.target.value)} /></label>
            {resultingStockQuantity !== null && resultingStockQuantity < 0 && <div className="stock-adjustment-warning"><AlertTriangle size={16} /> You cannot remove more than the current quantity.</div>}
          </section>}

          <div className="operation-form-grid stock-adjustment-details">
            <label>Reason<select required value={stockAdjustmentReason} onChange={(event) => setStockAdjustmentReason(event.target.value)}><option value="" disabled>Select a reason</option><option value="COUNT_CORRECTION">Count correction</option><option value="DAMAGED">Damaged stock</option><option value="LOST">Lost stock</option><option value="RETURNED">Returned item</option><option value="FOUND">Found stock</option><option value="OPENING_BALANCE">Opening balance</option><option value="OTHER">Other</option></select></label>
            <label>Note <small className="optional-marker">Optional</small><input maxLength={500} value={stockAdjustmentNotes} onChange={(event) => setStockAdjustmentNotes(event.target.value)} placeholder="Explain what was checked or corrected" /></label>
          </div>
        </>}
        <footer className="operation-modal-actions"><button type="button" className="ghost-button" onClick={close}>Cancel</button><button className="primary-button" disabled={busy || !stockAdjustmentValid}>{busy ? 'Saving adjustment...' : selectedStockItem ? 'Update stock' : 'Select an item first'}</button></footer>
      </form>}

      {kind === 'purchase' && <form className="operation-form purchase-workflow-form" noValidate onSubmit={submitPurchase}>
        <div className="purchase-stepper" role="group" aria-label="Purchase progress">
          <div aria-current={purchaseStep === 1 ? 'step' : undefined} aria-label="Step 1 of 2: Seller and purchase details" className={`purchase-step ${purchaseStep === 1 ? 'active' : purchaseSellerValid ? 'complete' : ''}`}><span>{purchaseSellerValid ? <CheckCircle2 size={17} /> : '1'}</span><p><strong>Seller & purchase</strong><small>Step 1 · Seller and payment details</small></p></div>
          <i />
          <div aria-current={purchaseStep === 2 ? 'step' : undefined} aria-label="Step 2 of 2: Items and settlement" className={`purchase-step ${purchaseStep === 2 ? 'active' : purchaseItemsValid ? 'complete' : ''}`}><span>{purchaseItemsValid ? <CheckCircle2 size={17} /> : '2'}</span><p><strong>Items & payment</strong><small>Step 2 · Products and settlement</small></p></div>
        </div>

        {purchaseStep === 1 && <>
        <div className="purchase-step-content">
        <section className="purchase-section-card">
          <div className="purchase-section-heading purchase-section-heading-plain"><div><h3>Seller and purchase details</h3><p>Choose who is selling, then record the date, payment method, and currency.</p></div></div>
          <div className="purchase-seller-tabs">
            <button type="button" className={sellerType === 'EXISTING_CUSTOMER' ? 'active' : ''} onClick={() => setSellerType('EXISTING_CUSTOMER')}>Existing customer</button>
            <button type="button" className={sellerType === 'EXISTING_SUPPLIER' ? 'active' : ''} onClick={() => setSellerType('EXISTING_SUPPLIER')}>Existing supplier</button>
            <button type="button" className={sellerType === 'WALK_IN' ? 'active' : ''} onClick={() => setSellerType('WALK_IN')}>Walk-in customer</button>
            <button type="button" className={sellerType === 'NEW_CUSTOMER' ? 'active' : ''} onClick={() => setSellerType('NEW_CUSTOMER')}>New customer</button>
            <button type="button" className={sellerType === 'NEW_SUPPLIER' ? 'active' : ''} onClick={() => setSellerType('NEW_SUPPLIER')}>New supplier</button>
          </div>
          <div className="operation-form-grid purchase-fields-grid">
            {sellerType === 'EXISTING_SUPPLIER' ? <label className={`operation-wide ${purchaseAttempted && !supplierId ? 'field-invalid' : ''}`}>Supplier<select required value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="" disabled>Select supplier</option>{suppliers.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.name}{supplier.phone ? ` — ${supplier.phone}` : ''}</option>)}</select>{purchaseAttempted && !supplierId && <small>Select a supplier</small>}</label> : sellerType === 'EXISTING_CUSTOMER' ? <label className={`operation-wide ${purchaseAttempted && !sellerCustomerId ? 'field-invalid' : ''}`}>Customer<select required value={sellerCustomerId} onChange={(event) => setSellerCustomerId(event.target.value)}><option value="" disabled>Select customer</option>{customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.name}{customer.phone ? ` — ${customer.phone}` : ' — No phone recorded'}</option>)}</select>{purchaseAttempted && !sellerCustomerId && <small>Select a customer</small>}</label> : <>
              <label className={purchaseAttempted && !sellerName.trim() ? 'field-invalid' : ''}>Seller name<input required value={sellerName} onChange={(event) => setSellerName(event.target.value)} placeholder={sellerType === 'NEW_SUPPLIER' ? 'Supplier or business name' : 'Customer name'} />{purchaseAttempted && !sellerName.trim() && <small>Seller name is required</small>}</label>
              <label className={purchaseAttempted && sellerType === 'NEW_CUSTOMER' && !sellerPhone.trim() ? 'field-invalid' : ''}>Phone number {sellerType !== 'NEW_CUSTOMER' && <small className="optional-marker">Optional</small>}<input required={sellerType === 'NEW_CUSTOMER'} value={sellerPhone} onChange={(event) => setSellerPhone(event.target.value)} placeholder="012 345 678" />{purchaseAttempted && sellerType === 'NEW_CUSTOMER' && !sellerPhone.trim() && <small>Phone number is required for a new customer</small>}</label>
              <label>National ID <small className="optional-marker">Optional</small><input value={sellerNationalId} onChange={(event) => setSellerNationalId(event.target.value)} /></label>
            </>}
            <label>Purchase date<input type="date" required value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} /></label>
            <label>Payment method<select value={purchasePaymentMethod} onChange={(event) => setPurchasePaymentMethod(event.target.value)}><option value="CASH">Cash</option><option value="BANK">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label>
            <label>Currency<select value={purchaseCurrency} onChange={(event) => setPurchaseCurrency(event.target.value as PurchaseCurrency)}><option value="USD">USD — US Dollar</option><option value="KHR">KHR — Khmer Riel</option></select></label>
            <label className="operation-wide">Purchase notes <small className="optional-marker">Optional</small><textarea rows={2} value={purchaseNotes} onChange={(event) => setPurchaseNotes(event.target.value)} /></label>
          </div>
        </section>
        </div>

        <footer className="operation-modal-actions"><div className="purchase-submit-summary"><span>Step 1 of 2</span><strong>Seller & purchase</strong></div><button type="button" className="ghost-button" onClick={close}>Cancel</button><button type="button" className="primary-button" onClick={() => { setPurchaseAttempted(true); if (purchaseSellerValid) { setError(''); setPurchaseAttempted(false); setPurchaseStep(2) } else setError('Complete the required seller information') }}>Continue to items</button></footer>
        </>}

        {purchaseStep === 2 && <>
        <div className="purchase-step-content">
        <section className="purchase-section-card devices-section">
          <div className="purchase-section-heading"><span>2</span><div><h3>Inventory items</h3><p>Choose a category for each item. The required fields adjust automatically.</p></div><b>{purchaseDevices.length} item{purchaseDevices.length === 1 ? '' : 's'}</b></div>
          <div className="purchase-device-list">
            {purchaseDevices.map((device, index) => {
              const itemErrors = { ...purchaseItemErrors(device) }
              if (device.existingInventoryItem && existingPurchaseIds.filter((id) => id === device.existingInventoryItem).length > 1) {
                itemErrors.existingInventoryItem = 'This product is already included in the purchase'
              }
              const itemComplete = Object.keys(itemErrors).length === 0
              const existingOptions = inventory.filter((item) => item.category === device.category && canRestockExisting(item.category))
              const existingItem = inventory.find((item) => item._id === device.existingInventoryItem)
              return <article className={`purchase-device-card ${device.collapsed ? 'collapsed' : ''} ${itemComplete ? 'complete' : purchaseAttempted ? 'invalid' : ''}`} key={device.id} onBlur={(event) => { if (itemComplete && !event.currentTarget.contains(event.relatedTarget as Node | null)) updatePurchaseDevice(device.id, { collapsed: true }) }}>
              <header><button type="button" className="device-collapse-button" onClick={() => device.collapsed ? openPurchaseItem(device.id) : updatePurchaseDevice(device.id, { collapsed: true })}><span>{itemComplete ? <CheckCircle2 size={17} /> : index + 1}</span><p><strong>{device.inventoryMode === 'EXISTING' ? 'RESTOCK' : device.category.replace('_', ' ')} {index + 1}</strong><small>{itemComplete ? existingItem ? `${existingItem.name} · ${device.quantity} unit${device.quantity === '1' ? '' : 's'}` : 'Ready to save' : device.category === 'PHONE' ? ([device.brand, device.model, device.storage].filter(Boolean).join(' ') || 'Enter phone information') : device.inventoryMode === 'EXISTING' ? 'Select an existing product' : (device.name || 'Enter item information')}{device.imei ? ` · ${device.imei}` : ''}</small></p>{device.collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}</button><button type="button" className="device-remove-button" onClick={() => removePurchaseDevice(device.id)} disabled={purchaseDevices.length === 1} aria-label={`Remove item ${index + 1}`}><Trash2 size={16} /></button></header>
              {!device.collapsed && <div className="device-fields-grid">
                {purchaseAttempted && Object.keys(itemErrors).length > 0 && <div className="item-validation-summary"><AlertTriangle size={15} /><span>Complete {Object.keys(itemErrors).length} highlighted field{Object.keys(itemErrors).length === 1 ? '' : 's'}.</span></div>}
                <label className="purchase-category-select">Category<select value={device.category} onChange={(event) => updatePurchaseCategory(device.id, event.target.value as StockCategory)}>{(['PHONE', 'TABLET', 'ACCESSORY', 'SPARE_PART', 'OTHER'] as StockCategory[]).map((value) => <option value={value} key={value}>{value.replace('_', ' ')}</option>)}</select></label>
                <fieldset className="purchase-category-picker"><legend>Category</legend>{(['PHONE', 'TABLET', 'ACCESSORY', 'SPARE_PART', 'OTHER'] as StockCategory[]).map((value) => <button type="button" key={value} className={device.category === value ? 'active' : ''} onClick={() => updatePurchaseCategory(device.id, value)}>{value.replace('_', ' ')}</button>)}</fieldset>

                {canRestockExisting(device.category) && <fieldset className="purchase-inventory-mode"><legend>Product record</legend><button type="button" className={device.inventoryMode === 'NEW' ? 'active' : ''} onClick={() => updatePurchaseDevice(device.id, { inventoryMode: 'NEW', existingInventoryItem: '' })}><Plus size={16} /><span>New product<small>Create a new SKU</small></span>{device.inventoryMode === 'NEW' && <CheckCircle2 size={16} />}</button><button type="button" className={device.inventoryMode === 'EXISTING' ? 'active' : ''} onClick={() => updatePurchaseDevice(device.id, { inventoryMode: 'EXISTING', existingInventoryItem: '' })}><RefreshCw size={16} /><span>Existing product<small>Increase current quantity</small></span>{device.inventoryMode === 'EXISTING' && <CheckCircle2 size={16} />}</button></fieldset>}

                {device.inventoryMode === 'EXISTING' ? <>
                  <div className="device-group-label"><span>Existing inventory product</span><small>Only quantity-based products can be restocked</small></div>
                  <label className={`device-existing-product ${purchaseAttempted && itemErrors.existingInventoryItem ? 'field-invalid' : ''}`}>Product<select required disabled={purchaseInventoryLoading || existingOptions.length === 0} value={device.existingInventoryItem} onChange={(event) => updatePurchaseDevice(device.id, { existingInventoryItem: event.target.value })}><option value="" disabled>{purchaseInventoryLoading ? 'Loading inventory...' : existingOptions.length === 0 ? `No existing ${device.category.replace('_', ' ').toLowerCase()} products` : 'Select an existing product'}</option>{existingOptions.map((item) => <option key={item._id} value={item._id}>{item.name} — {item.sku} — Qty {item.quantity}</option>)}</select>{purchaseAttempted && itemErrors.existingInventoryItem && <small>{itemErrors.existingInventoryItem}</small>}</label>
                  {existingItem && <div className="purchase-existing-summary"><span className="stock-adjustment-result-icon"><Package size={19} /></span><p><strong>{existingItem.name}</strong><small>{existingItem.sku} · {existingItem.category.replace('_', ' ')}</small></p><div><span>Current stock</span><strong>{existingItem.quantity}</strong></div><div><span>After purchase</span><strong>{existingItem.quantity + Math.max(1, Number(device.quantity) || 1)}</strong></div></div>}
                  <label className={purchaseAttempted && itemErrors.quantity ? 'field-invalid' : ''}>Quantity purchased<input required type="number" min="1" step="1" value={device.quantity} onChange={(event) => updatePurchaseDevice(device.id, { quantity: event.target.value })} />{purchaseAttempted && itemErrors.quantity && <small>{itemErrors.quantity}</small>}</label>
                </> : <>
                <div className="device-group-label"><span>Product identity</span><small>Required identification information</small></div>
                {device.category === 'PHONE' ? <>
                  <label className={`device-imei-field ${purchaseAttempted && itemErrors.imei ? 'field-invalid' : ''}`}><span>IMEI</span><div><input ref={(node) => { if (node) imeiInputs.current.set(device.id, node); else imeiInputs.current.delete(device.id) }} required inputMode="numeric" pattern="[0-9]{15}" maxLength={15} value={device.imei} onChange={(event) => updatePurchaseDevice(device.id, { imei: event.target.value.replace(/\D/g, '').slice(0, 15) })} placeholder="15-digit IMEI" /><button type="button" className="secondary-button" onClick={() => openImeiScanner(device.id)}><ScanLine size={16} /> Scan IMEI</button></div><small>{purchaseAttempted && itemErrors.imei ? itemErrors.imei : 'Scan with a handheld scanner or this device camera.'}</small></label>
                  <label className={purchaseAttempted && itemErrors.brand ? 'field-invalid' : ''}>Brand<input required value={device.brand} onChange={(event) => updatePurchaseDevice(device.id, { brand: event.target.value })} placeholder="Apple" />{purchaseAttempted && itemErrors.brand && <small>{itemErrors.brand}</small>}</label>
                  <label className={purchaseAttempted && itemErrors.model ? 'field-invalid' : ''}>Model<input required value={device.model} onChange={(event) => updatePurchaseDevice(device.id, { model: event.target.value })} placeholder="iPhone 13 Pro" />{purchaseAttempted && itemErrors.model && <small>{itemErrors.model}</small>}</label>
                  <label className={purchaseAttempted && itemErrors.storage ? 'field-invalid' : ''}>Storage<div className="device-unit-input"><input required type="number" min="1" step="1" value={device.storage} onChange={(event) => updatePurchaseDevice(device.id, { storage: event.target.value })} placeholder="128" /><span>GB</span></div>{purchaseAttempted && itemErrors.storage && <small>{itemErrors.storage}</small>}</label>
                  <label className={purchaseAttempted && itemErrors.ram ? 'field-invalid' : ''}>RAM <small className="optional-marker">Optional</small><div className="device-unit-input"><input type="number" min="1" step="1" value={device.ram} onChange={(event) => updatePurchaseDevice(device.id, { ram: event.target.value })} placeholder="6" /><span>GB</span></div>{purchaseAttempted && itemErrors.ram && <small>{itemErrors.ram}</small>}</label>
                  <label className={purchaseAttempted && itemErrors.color ? 'field-invalid' : ''}>Color<input required value={device.color} onChange={(event) => updatePurchaseDevice(device.id, { color: event.target.value })} placeholder="Blue" />{purchaseAttempted && itemErrors.color && <small>{itemErrors.color}</small>}</label>
                  <label>Battery health <small className="optional-marker">Optional</small><div className="device-unit-input"><input type="number" min="0" max="100" step="1" value={device.batteryHealth} onChange={(event) => updatePurchaseDevice(device.id, { batteryHealth: event.target.value })} placeholder="88" /><span>%</span></div></label>
                  <label>Carrier lock<select value={device.carrierLock} onChange={(event) => updatePurchaseDevice(device.id, { carrierLock: event.target.value })}><option value="UNKNOWN">Unknown</option><option value="UNLOCKED">Unlocked</option><option value="LOCKED">Carrier locked</option></select></label>
                  <fieldset className="device-accessories"><legend>Accessories included</legend>{['BOX', 'CHARGER', 'CABLE', 'CASE', 'EARPHONES'].map((accessory) => <label key={accessory}><input type="checkbox" checked={device.accessoriesIncluded.includes(accessory)} onChange={(event) => updatePurchaseDevice(device.id, { accessoriesIncluded: event.target.checked ? [...device.accessoriesIncluded, accessory] : device.accessoriesIncluded.filter((item) => item !== accessory) })} /> {accessory.charAt(0) + accessory.slice(1).toLowerCase()}</label>)}</fieldset>
                </> : <>
                  {device.category === 'TABLET' ? <>
                    <label className={purchaseAttempted && itemErrors.brand ? 'field-invalid' : ''}>Brand<input required value={device.brand} onChange={(event) => updatePurchaseDevice(device.id, { brand: event.target.value })} placeholder="Apple" />{purchaseAttempted && itemErrors.brand && <small>{itemErrors.brand}</small>}</label>
                    <label className={purchaseAttempted && itemErrors.model ? 'field-invalid' : ''}>Model<input required value={device.model} onChange={(event) => updatePurchaseDevice(device.id, { model: event.target.value })} placeholder="iPad Air" />{purchaseAttempted && itemErrors.model && <small>{itemErrors.model}</small>}</label>
                    <label className={purchaseAttempted && itemErrors.storage ? 'field-invalid' : ''}>Storage<div className="device-unit-input"><input required type="number" min="1" step="1" value={device.storage} onChange={(event) => updatePurchaseDevice(device.id, { storage: event.target.value })} placeholder="256" /><span>GB</span></div>{purchaseAttempted && itemErrors.storage && <small>{itemErrors.storage}</small>}</label>
                    <label className={purchaseAttempted && itemErrors.color ? 'field-invalid' : ''}>Color<input required value={device.color} onChange={(event) => updatePurchaseDevice(device.id, { color: event.target.value })} placeholder="Space Gray" />{purchaseAttempted && itemErrors.color && <small>{itemErrors.color}</small>}</label>
                    <label>SKU <small className="optional-marker">Optional</small><input value={device.sku} onChange={(event) => updatePurchaseDevice(device.id, { sku: event.target.value.toUpperCase() })} placeholder="Generated if empty" /></label>
                  </> : <>
                    <label className={purchaseAttempted && itemErrors.name ? 'field-invalid' : ''}>{device.category === 'SPARE_PART' ? 'Part name' : 'Item name'}<input required value={device.name} onChange={(event) => updatePurchaseDevice(device.id, { name: event.target.value })} placeholder={device.category === 'ACCESSORY' ? 'USB-C charger' : device.category === 'SPARE_PART' ? 'OLED display assembly' : 'Product name'} />{purchaseAttempted && itemErrors.name && <small>{itemErrors.name}</small>}</label>
                    {device.category === 'ACCESSORY' && <label className={purchaseAttempted && itemErrors.brand ? 'field-invalid' : ''}>Brand<input required value={device.brand} onChange={(event) => updatePurchaseDevice(device.id, { brand: event.target.value })} placeholder="Anker" />{purchaseAttempted && itemErrors.brand && <small>{itemErrors.brand}</small>}</label>}
                    <label className={purchaseAttempted && itemErrors.sku ? 'field-invalid' : ''}>SKU {device.category !== 'ACCESSORY' && <small className="optional-marker">Optional</small>}<input required={device.category === 'ACCESSORY'} value={device.sku} onChange={(event) => updatePurchaseDevice(device.id, { sku: event.target.value.toUpperCase() })} placeholder={device.category === 'ACCESSORY' ? 'Required SKU' : 'Generated if empty'} />{purchaseAttempted && itemErrors.sku && <small>{itemErrors.sku}</small>}</label>
                  </>}
                  {device.category === 'SPARE_PART' && <><label className={purchaseAttempted && itemErrors.compatibleModels ? 'field-invalid' : ''}>Compatible models<input required value={device.compatibleModels} onChange={(event) => updatePurchaseDevice(device.id, { compatibleModels: event.target.value })} placeholder="iPhone 13, iPhone 13 Pro" />{purchaseAttempted && itemErrors.compatibleModels && <small>{itemErrors.compatibleModels}</small>}</label><label className={purchaseAttempted && itemErrors.oemQuality ? 'field-invalid' : ''}>OEM quality<select required value={device.oemQuality} onChange={(event) => updatePurchaseDevice(device.id, { oemQuality: event.target.value })}><option value="" disabled>Select quality</option><option value="OEM">OEM</option><option value="ORIGINAL">Original</option><option value="AFTERMARKET_PREMIUM">Aftermarket premium</option><option value="AFTERMARKET">Aftermarket</option></select>{purchaseAttempted && itemErrors.oemQuality && <small>{itemErrors.oemQuality}</small>}</label></>}
                  <label className={purchaseAttempted && itemErrors.quantity ? 'field-invalid' : ''}>Quantity<input required type="number" min="1" step="1" value={device.quantity} onChange={(event) => updatePurchaseDevice(device.id, { quantity: event.target.value })} />{purchaseAttempted && itemErrors.quantity && <small>{itemErrors.quantity}</small>}</label>
                </>}
                </>}
                <div className="device-group-label"><span>Condition & purchase</span><small>Stock condition, cost, and optional notes</small></div>
                {device.inventoryMode === 'NEW' && <label>Condition<select value={device.condition} onChange={(event) => updatePurchaseDevice(device.id, { condition: event.target.value })}><option value="NEW">New</option><option value="LIKE_NEW">Like new</option><option value="GOOD">Good</option><option value="FAIR">Fair</option><option value="DAMAGED">Damaged</option></select></label>}
                <label className={purchaseAttempted && itemErrors.purchasePrice ? 'field-invalid' : ''}>Unit purchase price ({purchaseCurrency})<MoneyInput required currency={purchaseCurrency} minimum={0} value={device.purchasePrice} onValueChange={(value) => updatePurchaseDevice(device.id, { purchasePrice: value })} placeholder={purchaseCurrency === 'KHR' ? '0' : '0.00'} />{purchaseAttempted && itemErrors.purchasePrice && <small>{itemErrors.purchasePrice}</small>}</label>
                {device.inventoryMode === 'NEW' && <label className="device-notes-field">Item notes <small className="optional-marker">Optional</small><textarea rows={2} value={device.notes} onChange={(event) => updatePurchaseDevice(device.id, { notes: event.target.value })} /></label>}
              </div>}
            </article>})}
          </div>
          <button type="button" className="add-device-button" onClick={addPurchaseDevice}><Plus size={17} /> Add another item</button>
        </section>
        <section className="purchase-section-card purchase-settlement-card">
          <div className="purchase-section-heading"><span><CheckCircle2 size={17} /></span><div><h3>Payment settlement</h3><p>Confirm what was paid after reviewing the complete purchase total.</p></div></div>
          <div className="operation-form-grid purchase-fields-grid"><label className={purchasePaidInvalid ? 'field-invalid' : ''}>Amount paid ({purchaseCurrency})<MoneyInput currency={purchaseCurrency} minimum={0} maximum={purchaseTotal || undefined} value={purchaseAmountPaid} onValueChange={setPurchaseAmountPaid} placeholder={purchaseCurrency === 'KHR' ? '0' : '0.00'} />{purchasePaid > purchaseTotal ? <small>Amount paid cannot exceed the total</small> : purchaseCurrency === 'KHR' && purchasePaidInvalid ? <small>Use a whole KHR amount in increments of 100</small> : null}</label></div>
          <div className="purchase-payment-summary">
            <div><span>Total amount</span><strong>{purchaseCurrency === 'KHR' ? `${purchaseTotal.toLocaleString()} ៛` : `$${purchaseTotal.toFixed(2)}`}</strong></div>
            <div><span>Amount paid</span><strong>{purchaseCurrency === 'KHR' ? `${purchasePaid.toLocaleString()} ៛` : `$${purchasePaid.toFixed(2)}`}</strong></div>
            <div><span>Balance due</span><strong>{purchaseCurrency === 'KHR' ? `${purchaseBalance.toLocaleString()} ៛` : `$${purchaseBalance.toFixed(2)}`}</strong></div>
            <div><span>Payment status</span><strong className={`payment-state ${purchasePaymentStatus.toLowerCase()}`}>{purchasePaymentStatus}</strong></div>
          </div>
        </section>
        </div>
        <footer className="operation-modal-actions"><div className="purchase-submit-summary"><span>Step 2 of 2 · {purchaseDevices.length} item{purchaseDevices.length === 1 ? '' : 's'}</span><strong>{purchaseCurrency === 'KHR' ? `${purchaseTotal.toLocaleString()} ៛` : `$${purchaseTotal.toFixed(2)}`}</strong></div><button type="button" className="ghost-button" onClick={() => { setError(''); setPurchaseAttempted(false); setPurchaseStep(1) }}>Back</button><button className="primary-button" disabled={busy} aria-disabled={!purchaseItemsValid || purchasePaidInvalid}>{busy ? 'Saving purchase...' : purchaseItemsValid && !purchasePaidInvalid ? 'Complete purchase' : 'Complete required fields'}</button></footer>
        </>}
      </form>}

      {kind === 'purchase' && imeiScanDeviceId && <div className="imei-scanner-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setImeiScanDeviceId(null) }}>
        <section className="imei-scanner-dialog" role="dialog" aria-modal="true" aria-labelledby="imei-scanner-title">
          <header><span><Camera size={20} /></span><div><small>CAMERA ACTIVE</small><h3 id="imei-scanner-title">Point camera at the IMEI</h3><p>The IMEI will be filled automatically when the 15-digit barcode is detected.</p></div><button type="button" onClick={() => setImeiScanDeviceId(null)} aria-label="Close IMEI scanner"><X size={18} /></button></header>
          {imeiScanError && <div className="imei-scan-error"><AlertTriangle size={16} />{imeiScanError}</div>}
          <CameraBarcodeReader autoStart readerId="phoneflow-imei-reader" onScan={applyScannedImei} onError={setImeiScanError} />
        </section>
      </div>}

      {kind === 'scan' && <div className={`scanner-workflow ${scannedItem ? 'has-result' : ''}`}>
        {!scannedItem ? <>
          <div className="scanner-intro"><h3>How would you like to scan?</h3><p>Use a barcode scanner for the fastest checkout, or open the camera on this device.</p></div>
          <form className="scanner-code-form" onSubmit={(event) => { event.preventDefault(); void findScannedProduct(scanCode) }}>
            <div className="scanner-method-heading"><span><Barcode size={18} /></span><div><strong>Barcode scanner</strong><small>Keep this field selected, then scan the label.</small></div></div>
            <div className="scanner-input-row"><input id="barcode-code" aria-label="Barcode, SKU, IMEI, or serial number" autoFocus value={scanCode} onChange={(event) => setScanCode(event.target.value)} placeholder="Scan or enter product code" autoComplete="off" /><button className="primary-button" disabled={busy}>{busy ? 'Finding...' : 'Find product'}</button></div>
            <small>Works with barcode, SKU, IMEI, and serial number. Most scanners press Enter automatically.</small>
          </form>
          <div className="scanner-divider"><span>or use this device</span></div>
          <CameraBarcodeReader onScan={findScannedProduct} onError={handleCameraError} />
        </> : <>
          <div className="scan-success-banner"><span><CheckCircle2 size={22} /></span><div><strong>Product found</strong><small>Code {scannedItem.barcode || scannedItem.sku} matched an inventory record.</small></div></div>
          <article className="scanned-product-card">
            <div className="scanned-product-heading"><span className="operation-modal-icon"><Package size={20} /></span><div><span className="eyebrow">Ready to continue</span><h3>{scannedItem.name}</h3><p>{[scannedItem.brand, scannedItem.model].filter(Boolean).join(' ') || scannedItem.sku}</p></div><span className={`status-badge status-${scannedItem.status.toLowerCase().replaceAll('_', '-')}`}>{scannedItem.status.replaceAll('_', ' ')}</span></div>
            <div className="scanned-product-details">
              <div><span>Inventory</span><p><small>SKU</small><strong>{scannedItem.sku}</strong></p><p><small>Available</small><strong>{scannedItem.quantity}</strong></p></div>
              <div><span>Product</span><p><small>{scannedItem.category === 'PHONE' ? 'IMEI' : 'Category'}</small><strong>{scannedItem.category === 'PHONE' ? scannedItem.imei1 || 'Not recorded' : scannedItem.category.replaceAll('_', ' ')}</strong></p><p><small>Condition</small><strong>{scannedItem.condition?.replaceAll('_', ' ') || 'Not recorded'}</strong></p></div>
              <div className="price-group"><span>Shop price</span><strong>{scannedItem.sellPrice > 0 ? `$${scannedItem.sellPrice.toFixed(2)}` : 'Not set'}</strong><small>{scannedItem.sellPrice > 0 ? 'Current selling price' : 'Set a price in Stock Information first'}</small></div>
            </div>
            <footer className="scanner-result-actions"><button type="button" className="secondary-button" onClick={() => { setScannedItem(null); setScanCode(''); setError('') }}><ScanLine size={17} /> Scan another</button><div><button type="button" className="ghost-button" onClick={close}>Close</button><button type="button" className="primary-button" onClick={sellScannedProduct} disabled={scannedItem.status !== 'IN_STOCK' || scannedItem.quantity < 1 || scannedItem.sellPrice <= 0}><ShoppingCart size={17} /> Sell product</button></div></footer>
          </article>
        </>}
      </div>}

      {kind === 'label' && labelItems.length > 0 && <div className="label-prompt">
        <div className="label-success"><span><Printer size={21} /></span><div><h3>Print barcode labels now?</h3><p>{labelItems.length} inventory item{labelItems.length === 1 ? ' was' : 's were'} added. You can also print later from Stock Information.</p></div></div>
        <div className="barcode-label-preview-list">{labelItems.slice(0, 3).map((item) => <article className="barcode-label-preview" key={item.sku}><strong>{item.name}</strong><small>{item.imei1 || item.sku}</small><BarcodeGraphic item={item} compact /></article>)}{labelItems.length > 3 && <p>+ {labelItems.length - 3} more label{labelItems.length - 3 === 1 ? '' : 's'}</p>}</div>
        <footer className="operation-modal-actions"><button type="button" className="ghost-button" onClick={close}>Print later</button><button type="button" className="primary-button" onClick={() => { printInventoryLabels(labelItems); close() }}><Printer size={17} /> Print labels</button></footer>
      </div>}

      {kind === 'pawn' && pawnCreated && <section className="record-created-workflow" role="status" aria-live="polite">
        <div className="record-created-card">
          <span className="record-created-check"><CheckCircle2 size={38} /></span>
          <div>
            <span className="eyebrow">Contract saved</span>
            <h3>Pawn contract created</h3>
          </div>
          <dl>
            <div><dt>Pawn number</dt><dd>{pawnCreated.pawnNo}</dd></div>
            <div><dt>Principal</dt><dd>{pawnAmountText(pawnCreated.principal, pawnCreated.currency)}</dd></div>
            <div><dt>Inventory status</dt><dd><span>PAWNED</span></dd></div>
          </dl>
        </div>
        <footer className="operation-modal-actions record-created-actions">
          <button type="button" className="secondary-button" onClick={printCreatedPawnTicket}><Printer size={16} /> Print 80mm pawn ticket</button>
          <button type="button" className="primary-button record-created-done" onClick={() => window.location.reload()}><CheckCircle2 size={16} /> Done</button>
        </footer>
      </section>}

      {kind === 'pawn' && !pawnCreated && <form className="operation-form purchase-workflow-form pawn-workflow-form" onSubmit={submitPawn}>
        <div className="purchase-stepper" role="group" aria-label="Pawn contract progress">
          <div aria-current={pawnStep === 1 ? 'step' : undefined} aria-label="Step 1 of 2: Customer verification" className={`purchase-step ${pawnStep === 1 ? 'active' : pawnCustomerValid ? 'complete' : ''}`}><span>{pawnCustomerValid ? <CheckCircle2 size={17} /> : '1'}</span><p><strong>Customer verification</strong><small>Step 1 · Identity and ownership</small></p></div>
          <i />
          <div aria-current={pawnStep === 2 ? 'step' : undefined} aria-label="Step 2 of 2: Collateral and contract terms" className={`purchase-step ${pawnStep === 2 ? 'active' : ''}`}><span>2</span><p><strong>Collateral & terms</strong><small>Step 2 · Device, valuation, and loan</small></p></div>
        </div>

        {pawnStep === 1 && <>
          <div className="purchase-step-content">
            <section className="purchase-section-card">
              <div className="purchase-section-heading"><span>1</span><div><h3>Customer verification</h3><p>Choose the collateral owner and confirm ownership. Recording a National ID is optional.</p></div></div>
              <div className="purchase-seller-tabs pawn-customer-tabs">
                <button type="button" className={pawnCustomerMode === 'EXISTING' ? 'active' : ''} onClick={() => { setPawnCustomerMode('EXISTING'); setPawnOwnershipConfirmed(false); setError('') }}>Existing customer</button>
                <button type="button" className={pawnCustomerMode === 'NEW' ? 'active' : ''} onClick={() => { setPawnCustomerMode('NEW'); setPawnOwnershipConfirmed(false); setError('') }}>New customer</button>
              </div>
              <div className="operation-form-grid purchase-fields-grid">
                {pawnCustomerMode === 'EXISTING' ? <label className={`operation-wide ${pawnAttempted && !pawnCustomerId ? 'field-invalid' : ''}`}>Customer<select required value={pawnCustomerId} onChange={(event) => { setPawnCustomerId(event.target.value); setPawnOwnershipConfirmed(false); setError('') }}><option value="" disabled>Select customer</option>{customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.name}{customer.phone ? ` — ${customer.phone}` : ' — No phone recorded'}{customer.nationalIdNumber ? ' — ID recorded' : ' — ID not provided'}</option>)}</select>{pawnAttempted && !pawnCustomerId && <small>Select a customer</small>}</label> : <>
                  <label className={pawnAttempted && !pawnWalkInName.trim() ? 'field-invalid' : ''}>Customer name<input required value={pawnWalkInName} onChange={(event) => setPawnWalkInName(event.target.value)} placeholder="Full name" />{pawnAttempted && !pawnWalkInName.trim() && <small>Name is required</small>}</label>
                  <label>Phone number <small className="optional-marker">Optional</small><input value={pawnWalkInPhone} onChange={(event) => setPawnWalkInPhone(event.target.value)} placeholder="012 345 678" /></label>
                  <label>National ID <small className="optional-marker">Optional</small><input value={pawnWalkInNationalId} onChange={(event) => { setPawnWalkInNationalId(event.target.value); setPawnOwnershipConfirmed(false) }} placeholder="Leave blank to protect privacy" /></label>
                  <label>Address <small className="optional-marker">Optional</small><input value={pawnWalkInAddress} onChange={(event) => setPawnWalkInAddress(event.target.value)} placeholder="Current address" /></label>
                </>}
              </div>
              {pawnCustomerMode === 'EXISTING' && selectedPawnCustomer && <div className="pawn-customer-summary">
                <div><span>Customer</span><strong>{selectedPawnCustomer.name}</strong></div>
                <div><span>Phone</span><strong>{selectedPawnCustomer.phone || 'Not recorded'}</strong></div>
                <div><span>National ID</span><strong className={selectedPawnCustomer.nationalIdNumber ? 'verified' : 'optional'}>{selectedPawnCustomer.nationalIdNumber || 'Not provided (optional)'}</strong></div>
              </div>}
              <label className={`pawn-verification-check ${pawnAttempted && !pawnCustomerValid ? 'field-invalid' : ''}`}>
                <input type="checkbox" checked={pawnOwnershipConfirmed} onChange={(event) => setPawnOwnershipConfirmed(event.target.checked)} />
                <span><strong>Customer identity and collateral ownership confirmed</strong><small>{pawnCustomerHasId ? 'I checked the recorded National ID and confirmed this customer owns the phone.' : 'No National ID will be stored. I confirmed ownership using the information and evidence available to the shop.'}</small></span>
              </label>
            </section>
          </div>
          <footer className="operation-modal-actions"><div className="purchase-submit-summary"><span>Step 1 of 2</span><strong>Customer verification</strong></div><button type="button" className="ghost-button" onClick={close}>Cancel</button><button type="button" className="primary-button" onClick={() => { setPawnAttempted(true); if (pawnCustomerValid) { setError(''); setPawnStep(2) } else setError('Select a customer and confirm identity and collateral ownership first') }}>Continue to collateral</button></footer>
        </>}

        {pawnStep === 2 && <>
          <div className="purchase-step-content">
            <section className="purchase-section-card devices-section">
              <div className="purchase-section-heading"><span>2</span><div><h3>Phone collateral</h3><p>The phone is saved as a serialized inventory item with PAWNED status.</p></div><b>1 phone</b></div>
              <article className="purchase-device-card">
                <header><div className="pawn-device-heading"><span><Smartphone size={17} /></span><p><strong>Serialized phone</strong><small>Quantity is always 1 and the IMEI must be unique.</small></p></div></header>
                <div className="device-fields-grid">
                  <div className="device-group-label"><span>Product identity</span><small>Required identification information</small></div>
                  <label className="device-imei-field"><span>IMEI</span><div><input required inputMode="numeric" pattern="[0-9]{15}" maxLength={15} value={pawnImei} onChange={(event) => setPawnImei(event.target.value.replace(/\D/g, '').slice(0, 15))} placeholder="15-digit IMEI" /><button type="button" className="secondary-button" onClick={() => setPawnScannerOpen(true)}><ScanLine size={16} /> Scan IMEI</button></div><small>Scan with a handheld scanner or this device camera.</small></label>
                  <label>Brand<input name="brand" required placeholder="Apple" /></label>
                  <label>Model<input name="model" required placeholder="iPhone 13 Pro" /></label>
                  <label>Storage<div className="device-unit-input"><input name="storage" required type="number" min="1" step="1" placeholder="128" /><span>GB</span></div></label>
                  <label>RAM <small className="optional-marker">Optional</small><div className="device-unit-input"><input name="ram" type="number" min="1" step="1" placeholder="6" /><span>GB</span></div></label>
                  <label>Color<input name="color" required placeholder="Blue" /></label>
                </div>
              </article>
            </section>

            <section className="purchase-section-card pawn-terms-card">
              <div className="purchase-section-heading"><span><HandCoins size={17} /></span><div><h3>Phone valuation and contract terms</h3><p>Assess the device, calculate a safe offer, and finish the contract without leaving this workflow.</p></div></div>
              {pawnValuation && <div className="pawn-imported-valuation"><CheckCircle2 size={18} /><div><strong>Standalone calculator offer imported</strong><small>Valuation {pawnValuation.id || 'draft'} · Values are locked to the verified assessment.</small></div><span>Maximum {pawnAmountText(maximumPawn, pawnCurrency)}</span></div>}

              <div className="pawn-inline-assessment">
                <div className="pawn-assessment-heading"><div><span>1. Resale value and condition</span><small>Use a recent second-hand selling price and inspect the actual phone.</small></div>{pawnValuation ? <b>Imported</b> : <button type="button" className={`calculation-mode-toggle ${pawnAutoCalculate ? 'active' : ''}`} role="switch" aria-checked={pawnAutoCalculate} onClick={togglePawnAutoCalculate}><span aria-hidden="true" /><strong>Auto calculate</strong><small>{pawnAutoCalculate ? 'On' : 'Off'}</small></button>}</div>
                <div className="operation-form-grid pawn-assessment-grid">
                  <label>Valuation currency<select disabled={Boolean(pawnValuation)} value={pawnCurrency} onChange={(event) => changePawnCurrency(event.target.value as PawnCurrency)}><option value="USD">USD — US Dollar</option><option value="KHR">KHR — Cambodian Riel</option></select></label>
                  <label>Resale value ({pawnCurrency})<MoneyInput currency={pawnCurrency} minimum={pawnCurrency === 'KHR' ? 100 : 0.01} required readOnly={Boolean(pawnValuation)} value={pawnMarketPrice || ''} onValueChange={(value) => setPawnMarketPrice(Math.max(0, Number(value)))} /></label>
                  <label>Phone age<div className="device-unit-input"><input type="number" min="0" max="120" step="1" required readOnly={Boolean(pawnValuation)} value={pawnAgeMonths} onChange={(event) => setPawnAgeMonths(Math.max(0, Number(event.target.value)))} /><span>months</span></div></label>
                  <label>Physical condition<select disabled={Boolean(pawnValuation)} value={pawnCondition} onChange={(event) => setPawnCondition(event.target.value)}><option value="LIKE_NEW">Excellent / Like new</option><option value="GOOD">Good / Minor wear</option><option value="FAIR">Fair / Visible wear</option><option value="DAMAGED">Damaged / Repair needed</option></select></label>
                  <label>Battery health<div className="device-unit-input"><input type="number" min="0" max="100" step="1" required readOnly={Boolean(pawnValuation)} value={pawnBatteryHealth} onChange={(event) => setPawnBatteryHealth(event.target.value)} /><span>%</span></div></label>
                  <label>Lock status<select disabled={Boolean(pawnValuation)} value={pawnCarrierLock} onChange={(event) => setPawnCarrierLock(event.target.value)}><option value="UNLOCKED">Unlocked / IMEI clear</option><option value="LOCKED">Carrier locked (-10%)</option><option value="ACTIVATION_LOCKED">Activation or iCloud locked</option></select></label>
                  <label>Estimated repair cost ({pawnCurrency})<MoneyInput currency={pawnCurrency} readOnly={Boolean(pawnValuation)} value={pawnRepairCost || ''} onValueChange={(value) => setPawnRepairCost(Math.max(0, Number(value)))} /></label>
                  <fieldset className="device-accessories pawn-assessment-accessories"><legend>Included accessories</legend>{['BOX', 'CHARGER', 'CABLE', 'CASE', 'EARPHONES'].map((accessory) => <label key={accessory}><input type="checkbox" value={accessory} disabled={Boolean(pawnValuation)} checked={pawnAccessories.includes(accessory)} onChange={(event) => setPawnAccessories((current) => event.target.checked ? [...current, accessory] : current.filter((item) => item !== accessory))} /> {accessory.charAt(0) + accessory.slice(1).toLowerCase()}</label>)}</fieldset>
                </div>

                <div className="pawn-inline-policy">
                  <div><span>2. Shop lending policy</span><small>Keep resale value in reserve for price changes, storage, and collection risk.</small></div>
                  <label><div><strong>{pawnPercentage}%</strong><span>Loan-to-value</span><small>Recommended: 40–50%</small></div><input type="range" min="40" max="50" disabled={Boolean(pawnValuation)} value={pawnPercentage} onChange={(event) => setPawnPercentage(Number(event.target.value))} /></label>
                </div>

                {pawnAutoCalculate && <div className={`pawn-inline-offer ${pawnAssessment.eligible ? '' : 'blocked'}`}>
                  <div className="pawn-offer-total"><span>{pawnAssessment.eligible ? pawnAutoCalculate ? 'Recommended maximum principal' : 'Manual maximum principal' : 'Offer blocked'}</span><strong>{pawnAmountText(maximumPawn, pawnCurrency)}</strong>{pawnAssessment.eligible && <b>{pawnEquivalentAmountText(maximumPawn, pawnCurrency, usdKhrRate)}</b>}<small>{pawnAssessment.eligible ? `${pawnPercentage}% of ${pawnAmountText(effectiveEstimatedValue, pawnCurrency)} ${pawnAutoCalculate ? 'adjusted' : 'manually entered'} resale value` : 'Remove the activation lock before accepting this phone.'}</small><small>1 USD = {Math.round(usdKhrRate).toLocaleString()} KHR</small></div>
                  <dl>
                    <div><dt>Market price</dt><dd>{pawnAmountText(pawnMarketPrice, pawnCurrency)}</dd></div>
                    <div><dt>Age deduction</dt><dd>-{pawnAmountText(pawnAssessment.ageDeduction, pawnCurrency)}</dd></div>
                    <div><dt>Condition</dt><dd>-{pawnAmountText(pawnAssessment.conditionDeduction, pawnCurrency)}</dd></div>
                    <div><dt>Battery</dt><dd>-{pawnAmountText(pawnAssessment.batteryDeduction, pawnCurrency)}</dd></div>
                    <div><dt>Lock & accessories</dt><dd>-{pawnAmountText(pawnAssessment.carrierLockDeduction + pawnAssessment.accessoryDeduction, pawnCurrency)}</dd></div>
                    <div><dt>Repair cost</dt><dd>-{pawnAmountText(pawnRepairCost, pawnCurrency)}</dd></div>
                  </dl>
                </div>}
                {pawnAutoCalculate && <div className={`pawn-inline-inspection ${pawnAssessment.eligible ? '' : 'blocked'}`}><AlertTriangle size={16} /><div><strong>{pawnAssessment.eligible ? 'Physical inspection is still required' : 'Do not accept this phone as collateral'}</strong><small>{pawnAssessment.eligible ? 'Confirm IMEI ownership, display, cameras, speakers, charging, biometrics, and the repair estimate before approval.' : 'The customer must remove the activation or iCloud lock before this phone has pawn value.'}</small></div></div>}
              </div>

              <div className="pawn-contract-fields-heading"><span>3. Contract terms</span><small>The principal may be reduced, but cannot exceed the calculated maximum.</small></div>
              <div className="operation-form-grid purchase-fields-grid pawn-contract-fields">
                <label><span className="operation-label-heading">Principal ({pawnCurrency}) <small>Maximum {pawnAmountText(maximumPawn, pawnCurrency)}</small></span><MoneyInput name="principal" currency={pawnCurrency} minimum={pawnCurrency === 'KHR' ? 100 : 0.01} maximum={maximumPawn || undefined} clampToMaximum required value={pawnPrincipal} aria-describedby={pawnPrincipalLimitMessage ? 'pawn-principal-limit' : undefined} onValueChange={(value) => { setPawnPrincipal(value); setPawnPrincipalLimitMessage('') }} onMaximumExceeded={(limit) => setPawnPrincipalLimitMessage(`Principal capped at ${pawnAmountText(limit, pawnCurrency)}.`)} />{pawnPrincipalLimitMessage && <small id="pawn-principal-limit" className="operation-field-warning" role="status">{pawnPrincipalLimitMessage}</small>}</label>
                {pawnAutoCalculate ? <label>Daily pawn fee rate<div className="device-unit-input"><input type="number" min="0" max="100" step="0.01" required value={pawnDailyFeeRate} onChange={(event) => setPawnDailyFeeRate(event.target.value)} aria-label="Daily pawn fee rate" /><span>% / day</span></div><small className="pawn-daily-fee-help">Charges {pawnAmountText(pawnDailyFeeAmount, pawnCurrency)} per day.</small></label> : <label><span className="operation-label-heading">Fee at due date ({pawnCurrency}) <small>Maximum {pawnAmountText(pawnMaximumFeeAtDue, pawnCurrency)}</small></span><MoneyInput currency={pawnCurrency} maximum={pawnMaximumFeeAtDue || undefined} required value={pawnFeeAtDue} onValueChange={setPawnFeeAtDue} aria-label="Fee at due date" placeholder={pawnPrincipalAmount > 0 ? 'Enter total fee' : 'Enter principal first'} /><small className="pawn-daily-fee-help">Equivalent to {pawnEffectiveDailyFeeRate.toLocaleString(undefined, { maximumFractionDigits: 2 })}% / day · {pawnAmountText(pawnDailyFeeAmount, pawnCurrency)} / day.</small></label>}
                <fieldset className="pawn-term-selector operation-wide"><legend>Pawn term</legend><div role="radiogroup" aria-label="Pawn term">{([{ days: 3, label: '3 Days' }, { days: 7, label: '1 Week' }, { days: 15, label: 'Half Month' }, { days: 30, label: '1 Month' }] as const).map((term) => <button key={term.days} type="button" role="radio" aria-checked={pawnTermDays === term.days} className={pawnTermDays === term.days ? 'active' : ''} onClick={() => setPawnTermDays(term.days)}><strong>{term.label}</strong><small>{term.days} days</small></button>)}</div></fieldset>
                <label className="operation-wide">Contract notes <small className="optional-marker">Optional</small><textarea name="notes" rows={2} /></label>
              </div>
              <div className="pawn-contract-summary">
                <div><span>Principal</span><strong>{pawnAmountText(Number(pawnPrincipal) || 0, pawnCurrency)}</strong></div>
                <div><span>Calculated due date</span><strong>{pawnCalculatedDueDate}</strong></div>
                <div className="daily-fee-summary"><span>Daily pawn fee</span><strong>{pawnEffectiveDailyFeeRate.toLocaleString(undefined, { maximumFractionDigits: 2 })}% / day · {pawnAmountText(pawnDailyFeeAmount, pawnCurrency)} / day</strong></div>
                <div><span>Total to redeem at due</span><strong>{pawnAmountText(pawnTotalAtDue, pawnCurrency)}</strong></div>
              </div>
            </section>
          </div>
          <footer className="operation-modal-actions"><div className="purchase-submit-summary"><span>Step 2 of 2</span><strong>{pawnAmountText(Number(pawnPrincipal || 0), pawnCurrency)} principal</strong></div><button type="button" className="ghost-button" onClick={() => { setError(''); setPawnStep(1) }}>Back</button><button className="primary-button" disabled={busy || !pawnAssessment.eligible || maximumPawn <= 0 || pawnPrincipalAmount <= 0 || pawnPrincipalAmount > maximumPawn}>{busy ? 'Saving contract...' : !pawnAssessment.eligible ? 'Activation lock must be removed' : maximumPawn <= 0 ? 'Enter valuation details' : pawnPrincipalAmount <= 0 ? 'Enter principal' : pawnPrincipalAmount > maximumPawn ? 'Principal exceeds maximum' : 'Create pawn contract'}</button></footer>
        </>}
      </form>}

      {kind === 'sale' && saleCompleted && <section className="record-created-workflow sale-complete-workflow" role="status" aria-live="polite">
        <div className="record-created-card sale-complete-card">
          <span className="record-created-check"><CheckCircle2 size={34} /></span>
          <div>
            <span className="eyebrow">Sale saved</span>
            <h3>{saleCompleted.balance > 0 ? 'Sale recorded' : 'Payment successful'}</h3>
            <p>{saleCompleted.balance > 0 ? `${saleAmountText(saleCompleted.balance, saleCompleted.currency)} remains to be paid.` : 'The payment was received and inventory has been updated.'}</p>
          </div>
          <dl>
            <div><dt>Sale number</dt><dd>{saleCompleted.tradeNo}</dd></div>
            <div><dt>Total</dt><dd>{saleAmountText(saleCompleted.total, saleCompleted.currency)}</dd></div>
            <div><dt>Received</dt><dd>{saleAmountText(saleCompleted.amountPaid, saleCompleted.currency)}</dd></div>
            <div><dt>Balance</dt><dd><span>{saleAmountText(saleCompleted.balance, saleCompleted.currency)}</span></dd></div>
          </dl>
          <div className="sale-complete-item"><strong>{saleCompleted.itemName} × {saleCompleted.quantity}</strong><small>{saleCompleted.paymentMethod === 'KHQR' ? 'ABA KHQR payment' : 'Cash payment'}</small></div>
        </div>
        <footer className="operation-modal-actions record-created-actions">
          <button type="button" className="secondary-button" onClick={printCompletedSaleReceipt} data-modal-initial-focus><Printer size={16} /> Print receipt</button>
          <button type="button" className="primary-button record-created-done" onClick={() => window.location.reload()}><CheckCircle2 size={16} /> Done</button>
        </footer>
      </section>}

      {kind === 'sale' && !saleKhqr && !saleCompleted && <form className="operation-form sale-form" onSubmit={submitSale}>
        <div className="operation-form-grid">
          <label className="sale-customer-field">Customer<select value={saleCustomerId} onChange={(event) => setSaleCustomerId(event.target.value)}><option value="">Walk-in customer</option>{customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.name}{customer.phone ? ` — ${customer.phone}` : ' — No phone recorded'}</option>)}</select></label>
          <label className="operation-wide sale-inventory-field">Inventory item<select data-modal-initial-focus required value={saleItemId} disabled={saleInventoryLoading || (!saleInventoryLoading && inventory.length === 0)} onChange={(event) => {
            const nextId = event.target.value
            const nextItem = inventory.find((item) => item._id === nextId)
            setSaleItemId(nextId)
            setSaleCurrency(nextItem?.pricingCurrency === 'KHR' ? 'KHR' : 'USD')
            setSalePaymentMethod('CASH')
            setSaleQuantity('1')
            setSaleDiscount('0')
            setSaleAmountPaid('')
          }}><option value="" disabled>{saleInventoryLoading ? 'Loading available stock...' : inventory.length === 0 ? 'No stock available to sell' : 'Select available stock'}</option>{inventory.map((item) => <option key={item._id} value={item._id}>{item.name}{item.imei1 ? ` — ${item.imei1}` : ''} — Qty {item.quantity} — {inventoryNativeSalePriceText(item)}</option>)}</select>{!saleInventoryLoading && inventory.length === 0 && <small>Add an in-stock product before creating a sale.</small>}</label>
          <label>Currency<select value={saleCurrency} onChange={(event) => {
            setSaleCurrency(event.target.value as SaleCurrency)
            setSalePaymentMethod('CASH')
            setSaleDiscount('0')
            setSaleAmountPaid('')
          }}><option value="USD">USD — US Dollar</option><option value="KHR">KHR — Cambodian Riel</option></select><small>1 USD = {riel.format(usdKhrRate)} KHR</small></label>
          <label>Quantity<input type="number" min="1" max={selectedSaleItem?.quantity} value={effectiveSaleQuantity} disabled={!saleItemId || selectedSaleItem?.category === 'PHONE'} onChange={(event) => { setSaleQuantity(event.target.value); setSaleDiscount('0'); setSaleAmountPaid('') }} /></label>
          <div className={`sale-price-display${salePriceInvalid || saleStockPricingInvalid ? ' needs-price' : ''}`} role="group" aria-label={`Selling price in ${saleCurrency}`}>
            <span>Selling price ({saleCurrency})</span>
            <strong>{selectedSaleItem ? saleAmountText(saleUnitPrice, saleCurrency) : 'Select a product'}</strong>
            {selectedSaleItem
              ? salePriceInvalid || saleStockPricingInvalid
                ? <button type="button" className="sale-price-configure" onClick={openSelectedSaleItemPricing}><Banknote size={13} aria-hidden="true" />{saleStockPricingInvalid ? 'Fix price' : 'Set price'}</button>
                : <small>Configured in Stock Information</small>
              : <small>Choose inventory first</small>}
          </div>
          <label className={saleDiscountInvalid ? 'field-invalid' : ''}>Discount ({saleCurrency})<MoneyInput currency={saleCurrency} minimum={0} maximum={saleMaximumDiscount} value={saleDiscount} disabled={!saleItemId} onValueChange={setSaleDiscount} placeholder={saleCurrency === 'KHR' ? '0' : '0.00'} />{selectedSaleItem && <small>{saleCurrency === 'KHR' && saleDiscountAmount % 100 !== 0 ? 'Use a whole KHR amount in increments of 100' : `${saleDiscountInvalid ? 'Maximum discount is' : 'Maximum allowed:'} ${saleAmountText(saleMaximumDiscount, saleCurrency)}`}</small>}</label>
          {paywayAvailable && saleCurrency === 'USD' && <fieldset className="sale-payment-method operation-wide">
            <legend>How will the customer pay?</legend>
            <button type="button" className={salePaymentMethod === 'CASH' ? 'active cash' : 'cash'} onClick={() => setSalePaymentMethod('CASH')}>
              <span><Banknote size={20} /></span><p><strong>Pay with cash</strong><small>Record payment immediately</small></p>{salePaymentMethod === 'CASH' && <CheckCircle2 size={18} />}
            </button>
            <button type="button" className={salePaymentMethod === 'KHQR' ? 'active khqr' : 'khqr'} onClick={() => setSalePaymentMethod('KHQR')}>
              <span className="khqr-payment-option-logo"><img src={khqrLogo} alt="" /></span><p><strong>Pay with KHQR</strong><small>{paywayAvailable ? 'ABA PayWay sandbox' : 'PayWay unavailable'}</small></p>{salePaymentMethod === 'KHQR' && <CheckCircle2 size={18} />}
            </button>
          </fieldset>}
          {salePaymentMethod === 'CASH' && <label className={`sale-amount-received operation-wide${salePaidInvalid ? ' field-invalid' : ''}`}>Amount received ({saleCurrency}) <small className="optional-marker">Defaults to total</small><MoneyInput currency={saleCurrency} minimum={0} maximum={saleTotal || undefined} value={saleAmountPaid} onValueChange={setSaleAmountPaid} placeholder={saleCurrency === 'KHR' ? riel.format(Math.round(saleTotal)) : saleTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />{salePaidInvalid && <small>{saleCurrency === 'KHR' && salePaidAmount % 100 !== 0 ? 'Use a whole KHR amount in increments of 100' : `Amount received cannot exceed ${saleAmountText(saleTotal, saleCurrency)}`}</small>}</label>}
          <section className="sale-summary operation-wide" aria-labelledby="sale-summary-title">
            <header><div><span>Sale summary</span><strong id="sale-summary-title">{selectedSaleItem ? `${selectedSaleItem.name} × ${effectiveSaleQuantity}` : 'No item selected'}</strong></div><b>{salePaymentMethod === 'KHQR' ? 'KHQR' : 'Cash'}</b></header>
            <div className="sale-summary-calculation">
              <span><small>Subtotal</small><strong>{saleAmountText(saleSubtotal, saleCurrency)}</strong></span>
              <span><small>Discount</small><strong>− {saleAmountText(saleDiscountAmount, saleCurrency)}</strong></span>
              <span className="total"><small>Total</small><strong>{saleAmountText(saleTotal, saleCurrency)}</strong></span>
              <span><small>Received</small><strong>{saleAmountText(salePaymentMethod === 'KHQR' ? saleTotal : salePaidAmount, saleCurrency)}</strong></span>
              <span className={salePaymentMethod === 'KHQR' || saleBalance <= 0 ? 'settled' : 'due'}><small>Balance</small><strong>{saleAmountText(salePaymentMethod === 'KHQR' ? 0 : saleBalance, saleCurrency)}</strong></span>
            </div>
          </section>
          <div className="sale-notes operation-wide">
            <button type="button" className="sale-note-toggle" aria-expanded={saleNotesOpen} onClick={() => setSaleNotesOpen((open) => !open)}><span><strong>{saleNotesOpen ? 'Sale note' : 'Add sale note'}</strong><small>Optional details for this transaction</small></span>{saleNotesOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</button>
            {saleNotesOpen && <label>Notes<textarea rows={3} value={saleNotes} onChange={(event) => setSaleNotes(event.target.value)} /></label>}
          </div>
        </div>
        <footer className="operation-modal-actions"><div className="sale-total"><span>Total</span><strong>{saleAmountText(saleTotal, saleCurrency)}</strong></div><button type="button" className="ghost-button" onClick={close}>Cancel</button><button className="primary-button" disabled={saleActionDisabled} title={!saleItemId ? 'Choose an inventory product before continuing' : undefined}>{busy || saleInventoryLoading ? <LoaderCircle className="spinning" size={17} /> : salePaymentMethod === 'KHQR' ? <img className="khqr-action-logo" src={khqrLogo} alt="" /> : <Banknote size={17} />}{saleActionLabel}</button></footer>
      </form>}

      {kind === 'sale' && saleKhqr && !saleCompleted && <section className={`sale-khqr-workflow payment-${salePaymentPhase.toLowerCase()}`}>
        <div className="khqr-heading">
          <span><img src={khqrLogo} alt="" /></span>
          <div><span className="eyebrow">ABA KHQR</span><h3>{salePaymentPhase === 'COMPLETED' ? 'Payment successful' : salePaymentPhase === 'CANCELLED' ? 'Payment cancelled' : `Scan to pay $${saleKhqr.amount.toFixed(2)}`}</h3>{salePaymentPhase !== 'COMPLETED' && <p>{salePaymentPhase === 'CANCELLED' ? 'This QR has been closed and can no longer accept payment.' : 'Keep this window open. The sale completes automatically after PayWay approves the payment.'}</p>}</div>
          <b>{saleKhqr.environment === 'sandbox' ? 'SANDBOX TEST' : 'LIVE'}</b>
        </div>
        {salePaymentPhase === 'COMPLETED' ? <div className="khqr-success-card" role="status">
          <div className="khqr-success-confetti" aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <i key={index} />)}</div>
          <span className="khqr-success-check"><CheckCircle2 size={46} /></span>
          <strong>Payment Successful</strong>
          <p>Your payment of <b>${saleKhqr.amount.toFixed(2)}</b> has been confirmed through ABA PayWay.</p>
        </div> : <div className={`khqr-payment-card ${salePaymentPhase === 'CANCELLED' ? 'is-cancelled' : ''}`} role="button" tabIndex={salePaymentPhase === 'CANCELLED' ? -1 : 0} aria-label="Enlarge ABA KHQR payment card" onClick={() => { if (salePaymentPhase !== 'CANCELLED') setSaleQrZoomed(true) }} onKeyDown={(event) => { if (salePaymentPhase !== 'CANCELLED' && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setSaleQrZoomed(true) } }}>
          <article className="khqr-native-card" aria-label={`KHQR payment for $${saleKhqr.amount.toFixed(2)}`}>
            {saleKhqr.qrImage
              ? <img className="khqr-official-image" src={paywayImageSource(saleKhqr.qrImage)} alt={`Official ABA PayWay KHQR for $${saleKhqr.amount.toFixed(2)}`} />
              : <div className="khqr-qr-fallback">
                  <strong>ABA PayWay KHQR</strong>
                  {saleKhqr.qrString
                    ? <QRCode value={saleKhqr.qrString} size={300} level="M" bgColor="#ffffff" fgColor="#050505" />
                    : <span>QR code unavailable</span>}
                  <small>Scan with a KHQR-supported banking app</small>
                </div>}
          </article>
          <span className="khqr-zoom-hint" aria-hidden="true">
            <Maximize2 size={14} />
            Click to enlarge
          </span>
        </div>}
        {salePaymentPhase !== 'COMPLETED' && <div className={`khqr-inline-status status-${salePaymentPhase.toLowerCase()}`}>{salePaymentPhase === 'SCANNED' || salePaymentPhase === 'APPROVED' ? <CheckCircle2 size={15} /> : salePaymentPhase === 'CANCELLED' ? <X size={15} /> : <RefreshCw size={15} className={busy || salePaymentPhase === 'ERROR' ? '' : 'spinning'} />}<p><strong>{salePaymentStatus}</strong><small>{salePaymentPhase === 'CANCELLED' ? 'The cashier cancelled this payment request' : salePaymentPhase === 'SCANNED' ? 'Waiting for PayWay to approve the payment' : salePaymentPhase === 'ERROR' ? 'Use Check now to retry verification' : 'Checking securely with ABA PayWay every 3 seconds'}</small></p></div>}
        {salePaymentPhase !== 'COMPLETED' && <p className="khqr-security-note">{salePaymentPhase === 'CANCELLED' ? 'No sale was created and inventory was not deducted.' : 'Inventory will not be deducted until PayWay confirms payment.'}</p>}
        <footer className="operation-modal-actions">{salePaymentPhase === 'COMPLETED' ? <button type="button" className="primary-button khqr-done-button" onClick={() => window.location.reload()}><CheckCircle2 size={16} /> Done</button> : salePaymentPhase === 'CANCELLED' ? <><button type="button" className="ghost-button" onClick={resetAndClose}>Close</button><button type="button" className="primary-button" onClick={restartKhqrPayment}>Start another payment</button></> : <><button type="button" className="ghost-button" onClick={cancelKhqrPayment} disabled={busy}>Cancel payment</button>{saleKhqr.deeplink && <a className="primary-button khqr-mobile-link" href={saleKhqr.deeplink}>Open ABA Mobile</a>}<button type="button" className="secondary-button" onClick={() => void checkKhqrPayment()} disabled={busy}><RefreshCw size={16} /> Check now</button></>}</footer>
        {saleQrZoomed && <div className="khqr-zoom-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSaleQrZoomed(false) }}>
          <section className="khqr-zoom-dialog" role="dialog" aria-modal="true" aria-label={`Enlarged KHQR payment for $${saleKhqr.amount.toFixed(2)}`}>
            <button type="button" className="khqr-zoom-close" onClick={() => setSaleQrZoomed(false)} aria-label="Close enlarged KHQR"><X size={20} /></button>
            <div className="khqr-zoom-outline">
              <article className="khqr-zoom-card">
                {saleKhqr.qrImage
                  ? <img src={paywayImageSource(saleKhqr.qrImage)} alt={`Official ABA PayWay KHQR for $${saleKhqr.amount.toFixed(2)}`} />
                  : saleKhqr.qrString
                    ? <QRCode value={saleKhqr.qrString} size={420} level="M" bgColor="#ffffff" fgColor="#050505" />
                    : <span>QR code unavailable</span>}
              </article>
            </div>
            <p>Scan to pay ${saleKhqr.amount.toFixed(2)} · ABA PayWay KHQR</p>
          </section>
        </div>}
      </section>}

      {kind === 'pawn' && pawnScannerOpen && <div className="imei-scanner-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPawnScannerOpen(false) }}>
        <section className="imei-scanner-dialog" role="dialog" aria-modal="true" aria-labelledby="pawn-imei-scanner-title">
          <header><span><Camera size={20} /></span><div><small>CAMERA ACTIVE</small><h3 id="pawn-imei-scanner-title">Point camera at the IMEI</h3><p>The IMEI will be filled automatically when the 15-digit barcode is detected.</p></div><button type="button" onClick={() => setPawnScannerOpen(false)} aria-label="Close IMEI scanner"><X size={18} /></button></header>
          <CameraBarcodeReader autoStart readerId="phoneflow-pawn-imei-reader" onScan={(code) => { const imei = code.replace(/\D/g, '').slice(0, 15); if (imei.length !== 15) { setError('The scanned value is not a valid 15-digit IMEI'); return }; setPawnImei(imei); setPawnScannerOpen(false); setError('') }} onError={setError} />
        </section>
      </div>}
    </ModalShell>
  )
}
