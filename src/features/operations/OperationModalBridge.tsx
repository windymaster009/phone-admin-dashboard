import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useRouter } from '../../app/routing'
import QRCode from 'react-qr-code'
import khqrLogo from '../../../server/integrations/payway/img/khqr.svg'
import {
  AlertTriangle,
  Banknote,
  Camera,
  CalendarRange,
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
import type { Pawn } from '../../types/domain'
import { safeStorage } from '../../lib/storage'
import MoneyInput from '../../components/MoneyInput'
import AutoCalculateToggle from '../../components/AutoCalculateToggle'
import OperationWorkflowStepper, { type WorkflowStep } from '../../components/OperationWorkflowStepper'
import OperationWorkflowFooter from '../../components/OperationWorkflowFooter'
import OperationSectionCard from '../../components/OperationSectionCard'
import SegmentedControl, { type SegmentedControlOption } from '../../components/SegmentedControl'
import KeyValueSummary from '../../components/KeyValueSummary'
import SerializedDeviceFields from '../../components/SerializedDeviceFields'
import { getPawnAutoCalculatePreference, PAWN_AUTO_CALCULATE_EVENT, savePawnAutoCalculatePreference } from '../../lib/pawnPreferences'
import { BarcodeGraphic, pawnInventoryLabelCode, printInventoryLabel, printInventoryLabels, sanitizeCode } from '../inventory/barcode'
import OperationModalShell from './OperationModalShell'
import CameraBarcodeReader from '../../components/scanner/CameraBarcodeReader'
import ScannerWorkflow from '../../components/scanner/ScannerWorkflow'
import ScannerTriggerButton, { PRODUCT_SCANNER_EVENT } from '../../components/scanner/ScannerTriggerButton'
import { notifyPawnCreated } from '../pawns/pawnEvents'
import { ModalKind, StockCategory, Customer, InventoryItem, RelatedPawn, Supplier, SellerType, PurchaseCurrency, SaleCurrency, PawnCurrency, PurchaseInventoryMode, PawnCustomerMode, SalePaymentMethod, SalePaymentPhase, StockAdjustmentMode, StockAdjustmentStatus, PawnValuationSnapshot, CreatedPawn, CompletedStockAdjustment, SaleDraft, SaleKhqr, CreatedSaleTrade, CompletedSale, completedSaleFromTrade, paywayImageSource, PurchaseDevice, newPurchaseDevice, canRestockExisting, localDateValue, roundPawnAmount, pawnAmountText, pawnEquivalentAmountText, money, riel, saleAmountText, inventorySalePrice, inventoryNativeSalePriceText } from './operationDomain'
import './pawn-guide.css'


function parsePlaceholderAlert(message?: string): ModalKind | null {
  const value = String(message || '').toLowerCase()
  if (value.startsWith('add stock') || value.startsWith('adjust stock')) return 'stock'
  if (value.startsWith('new purchase')) return 'purchase'
  if (value.startsWith('new sale')) return 'sale'
  if (value.startsWith('new pawn')) return 'pawn'
  return null
}

function canOfferForSale(item: InventoryItem) {
  return item.status === 'IN_STOCK'
    && item.quantity > 0
    && (!item.relatedPawn || item.relatedPawn.status === 'FORFEITED')
}

export default function OperationModalBridge() {
  const { navigate } = useRouter()
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
  const [pawnBrand, setPawnBrand] = useState('')
  const [pawnModel, setPawnModel] = useState('')
  const [pawnStorage, setPawnStorage] = useState('')
  const [pawnRam, setPawnRam] = useState('')
  const [pawnColor, setPawnColor] = useState('')
  const [pawnCondition, setPawnCondition] = useState('GOOD')
  const [pawnBatteryHealth, setPawnBatteryHealth] = useState('85')
  const [pawnCarrierLock, setPawnCarrierLock] = useState('UNLOCKED')
  const [pawnAccessories, setPawnAccessories] = useState<string[]>([])
  const [pawnScannerOpen, setPawnScannerOpen] = useState(false)
  const [scanCode, setScanCode] = useState('')
  const [scannedItem, setScannedItem] = useState<InventoryItem | null>(null)
  const [scannedPawn, setScannedPawn] = useState<RelatedPawn | null>(null)
  const [labelItems, setLabelItems] = useState<InventoryItem[]>([])
  const [saleItemId, setSaleItemId] = useState('')
  const [saleCustomerId, setSaleCustomerId] = useState('')
  const [saleQuantity, setSaleQuantity] = useState('1')
  const [saleDiscount, setSaleDiscount] = useState('0')
  const [saleManualPriceEnabled, setSaleManualPriceEnabled] = useState(false)
  const [saleManualPrice, setSaleManualPrice] = useState('')
  const [saleWarrantyDays, setSaleWarrantyDays] = useState('')
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
  const [saleScannerOpen, setSaleScannerOpen] = useState(false)
  const [saleScannerError, setSaleScannerError] = useState('')
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
  const [purchaseAmountPaidTouched, setPurchaseAmountPaidTouched] = useState(false)
  const [purchaseNotes, setPurchaseNotes] = useState('')
  const [purchaseDevices, setPurchaseDevices] = useState<PurchaseDevice[]>(() => [newPurchaseDevice()])
  const [purchaseStep, setPurchaseStep] = useState<1 | 2>(1)
  const [purchaseAttempted, setPurchaseAttempted] = useState(false)
  const [purchaseInventoryLoading, setPurchaseInventoryLoading] = useState(false)
  const [suppliersLoading, setSuppliersLoading] = useState(false)
  const [customersLoading, setCustomersLoading] = useState(false)
  const [currencyNotice, setCurrencyNotice] = useState('')
  const [usdKhrRate, setUsdKhrRate] = useState(4100)
  const [imeiScanDeviceId, setImeiScanDeviceId] = useState<string | null>(null)
  const [imeiScanError, setImeiScanError] = useState('')
  const imeiInputs = useRef(new Map<string, HTMLInputElement>())
  const submittingPurchaseRef = useRef(false)
  const submittingSaleRef = useRef(false)
  const submittingPawnRef = useRef(false)
  const submittingStockRef = useRef(false)
  const scanRequestSeqRef = useRef(0)
  const scanInFlightRef = useRef(false)
  const pendingSaleItemIdRef = useRef<string | null>(null)

  useEffect(() => {
    // A lookup belongs to the dialog that started it, not the next operation.
    if (scanInFlightRef.current) {
      scanInFlightRef.current = false
      setBusy(false)
    }
    return () => { scanRequestSeqRef.current++ }
  }, [kind])

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

  function changePawnAutoCalculate(nextValue: boolean) {
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
  useEffect(() => {
    if (!purchaseAmountPaidTouched) {
      const formatted = purchaseTotal > 0
        ? (purchaseCurrency === 'KHR' ? String(Math.round(purchaseTotal)) : String(Number(purchaseTotal.toFixed(2))))
        : '0'
      setPurchaseAmountPaid(formatted)
    }
  }, [purchaseTotal, purchaseCurrency, purchaseAmountPaidTouched])
  const purchasePaid = Math.max(0, Number(purchaseAmountPaid) || 0)
  const purchaseBalance = Math.max(0, purchaseTotal - purchasePaid)
  const purchasePaymentStatus = purchasePaid <= 0 ? 'UNPAID' : purchasePaid < purchaseTotal ? 'PARTIAL' : 'PAID'
  const purchasePaidUsdDecimalsInvalid = purchaseCurrency === 'USD' && (() => {
    const parts = String(purchaseAmountPaid).trim().split('.')
    return parts.length > 2 || Boolean(parts[1] && parts[1].length > 2)
  })()
  const purchasePaidInvalid = purchasePaid > purchaseTotal
    || (purchaseCurrency === 'KHR' && (!Number.isInteger(purchasePaid) || purchasePaid % 100 !== 0))
    || purchasePaidUsdDecimalsInvalid
  const selectedSaleItem = inventory.find((item) => item._id === saleItemId)
  const canManuallyPriceSale = getSessionUser()?.role === 'OWNER'
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
  const savedSaleUnitPrice = inventorySalePrice(selectedSaleItem, saleCurrency, usdKhrRate)
  const saleUnitPrice = saleManualPriceEnabled ? Number(saleManualPrice) : savedSaleUnitPrice
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
  const saleReceivedAmount = saleAmountPaid === '' ? saleTotal : Math.max(0, Number(saleAmountPaid) || 0)
  const saleBalance = Math.max(0, saleTotal - saleReceivedAmount)
  const saleChangeDue = Math.max(0, saleReceivedAmount - saleTotal)
  const salePriceInvalid = Boolean(selectedSaleItem && (!Number.isFinite(saleUnitPrice) || saleUnitPrice <= 0
    || (saleCurrency === 'KHR' && (!Number.isInteger(saleUnitPrice) || saleUnitPrice % 100 !== 0))))
  const saleStockPricingInvalid = configuredMinimumSalePrice > saleUnitPrice
  const saleDiscountInvalid = saleDiscountAmount > saleMaximumDiscount
    || (saleCurrency === 'KHR' && (!Number.isInteger(saleDiscountAmount) || saleDiscountAmount % 100 !== 0))
  const salePaidInvalid = salePaymentMethod === 'CASH' && (!Number.isFinite(saleReceivedAmount)
    || (saleCurrency === 'KHR' && (!Number.isInteger(saleReceivedAmount) || saleReceivedAmount % 100 !== 0)))
  const saleWarrantyDayCount = Number(saleWarrantyDays)
  const saleWarrantyInvalid = saleWarrantyDays.trim() === ''
    || !Number.isInteger(saleWarrantyDayCount)
    || saleWarrantyDayCount < 0
    || saleWarrantyDayCount > 3650
  const saleActionDisabled = busy
    || saleInventoryLoading
    || !saleItemId
    || salePriceInvalid
    || saleStockPricingInvalid
    || saleDiscountInvalid
    || salePaidInvalid
    || saleWarrantyInvalid
    || saleTotal < (saleCurrency === 'KHR' ? 100 : 0.01)
  const saleActionLabel = busy
    ? salePaymentMethod === 'KHQR' ? 'Generating KHQR...' : 'Saving sale...'
    : saleInventoryLoading
      ? 'Loading stock...'
      : !saleItemId
        ? 'Select a product first'
        : salePriceInvalid
          ? 'Enter a valid price'
          : saleStockPricingInvalid
            ? 'Price is below minimum'
            : saleDiscountInvalid
              ? 'Reduce discount'
              : salePaidInvalid
                ? 'Check amount paid'
                : saleWarrantyInvalid
                  ? 'Enter warranty days'
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
    const handleOpenOperation = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: ModalKind; itemId?: string; item?: InventoryItem }>).detail
      if (detail?.kind) {
        setError('')
        if (detail.kind === 'purchase') {
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
          setPurchaseAmountPaidTouched(false)
          setPurchaseNotes('')
          setPurchaseDevices([newPurchaseDevice()])
          setPurchaseStep(1)
          setPurchaseAttempted(false)
          setCurrencyNotice('')
          setImeiScanDeviceId(null)
          setImeiScanError('')
        }
        if (detail.kind === 'pawn') {
          setPawnCreated(null)
          setPawnAttempted(false)
          setPawnStep(1)
          setPawnImei('')
          setPawnBrand('')
          setPawnModel('')
          setPawnStorage('')
          setPawnRam('')
          setPawnColor('')
        }
        if (detail.kind === 'sale') {
          setSaleCompleted(null)
          setSaleDraft(null)
          setSalePaymentPhase('WAITING')
          setSalePaymentStatus('Waiting for payment')
          setSaleKhqr(null)
          setSaleNotes('')
          setSaleNotesOpen(false)
          setSaleScannerOpen(false)
          setSaleScannerError('')

          const preselectedId = detail.itemId || detail.item?._id || ''
          pendingSaleItemIdRef.current = preselectedId || null

          if (preselectedId) {
            setSaleItemId(preselectedId)
            if (detail.item) {
              setSaleCurrency(detail.item.pricingCurrency === 'KHR' ? 'KHR' : 'USD')
            }
            setSaleQuantity('1')
            setSaleDiscount('0')
            setSaleManualPriceEnabled(false)
            setSaleManualPrice('')
            setSaleWarrantyDays('')
            setSaleAmountPaid('')
            setSalePaymentMethod('CASH')
          } else {
            setSaleItemId('')
            setSaleQuantity('1')
            setSaleDiscount('0')
            setSaleManualPriceEnabled(false)
            setSaleManualPrice('')
            setSaleWarrantyDays('')
            setSaleAmountPaid('')
            setSalePaymentMethod('CASH')
            setSaleCurrency('USD')
          }
        }
        setKind(detail.kind)
      }
    }
    window.addEventListener('phoneflow:open-operation', handleOpenOperation)
    return () => window.removeEventListener('phoneflow:open-operation', handleOpenOperation)
  }, [])

  useEffect(() => {
    const openScanner = () => {
      setError('')
      setScanCode('')
      setScannedItem(null)
      setScannedPawn(null)
      setKind('scan')
    }
    window.addEventListener(PRODUCT_SCANNER_EVENT, openScanner)
    return () => window.removeEventListener(PRODUCT_SCANNER_EVENT, openScanner)
  }, [])

  useEffect(() => {
    const openPawn = () => {
      setError('')
      setPawnCreated(null)
      setPawnAttempted(false)
      setPawnStep(1)
      setPawnImei('')
      setPawnBrand('')
      setPawnModel('')
      setPawnStorage('')
      setPawnRam('')
      setPawnColor('')
      setKind('pawn')
    }
    window.addEventListener('phoneflow:open-pawn', openPawn)
    return () => window.removeEventListener('phoneflow:open-pawn', openPawn)
  }, [])

  useEffect(() => {
    let active = true
    if (!kind) return
    if (kind === 'stock') {
      setStockInventoryLoading(true)
      api<{ items: InventoryItem[] }>('/inventory')
        .then((result) => {
          if (active) setInventory(Array.isArray(result?.items) ? result.items : [])
        })
        .catch((reason: Error) => {
          if (active) setError(reason.message)
        })
        .finally(() => {
          if (active) setStockInventoryLoading(false)
        })
    }
    if (kind === 'sale' || kind === 'pawn' || kind === 'purchase') {
      setCustomersLoading(true)
      api<{ customers: Customer[] }>('/customers')
        .then((result) => {
          if (active) setCustomers(Array.isArray(result?.customers) ? result.customers : [])
        })
        .catch((reason: Error) => {
          if (active) setError(reason.message)
        })
        .finally(() => {
          if (active) setCustomersLoading(false)
        })
    }
    if (kind === 'sale') {
      setSaleInventoryLoading(true)
      api<{ items: InventoryItem[] }>('/inventory?status=IN_STOCK')
        .then(async (result) => {
          if (!active) return
          const items = Array.isArray(result?.items) ? result.items : []
          let available = items.filter(canOfferForSale)
          const targetId = pendingSaleItemIdRef.current
          if (targetId) {
            let found = available.find((item) => item._id === targetId)
            if (!found) {
              try {
                const result = await api<{ item: InventoryItem }>(`/inventory/${encodeURIComponent(targetId)}`)
                if (!active) return
                if (result.item && canOfferForSale(result.item)) {
                  found = result.item
                  available = [result.item, ...available]
                }
              } catch {
                // The item may have been sold or archived since the stock modal opened.
              }
            }
            if (found) {
              setSaleItemId(found._id)
              setSaleCurrency(found.pricingCurrency === 'KHR' ? 'KHR' : 'USD')
            } else {
              setSaleItemId('')
              setError('This product is no longer available for sale. Choose another item.')
            }
          }
          if (!active) return
          setInventory(available)
        })
        .catch((reason: Error) => {
          if (active) setError(reason.message)
        })
        .finally(() => {
          if (active) setSaleInventoryLoading(false)
        })
      api<{ usdKhr: number }>('/exchange-rates')
        .then((result) => {
          if (active) setUsdKhrRate(result.usdKhr)
        })
        .catch(() => {
          if (active) setUsdKhrRate(4100)
        })
      api<{ enabled: boolean; configured: boolean }>('/payway/config')
        .then((result) => {
          if (!active) return
          const available = Boolean(result?.enabled && result?.configured)
          setPaywayAvailable(available)
          if (!available) {
            setSalePaymentMethod('CASH')
            setSaleKhqr(null)
            setSaleDraft(null)
          }
        })
        .catch(() => {
          if (active) setPaywayAvailable(false)
        })
    }
    if (kind === 'purchase') {
      setSuppliersLoading(true)
      api<{ suppliers: Supplier[] }>('/suppliers')
        .then((result) => {
          if (active) setSuppliers(Array.isArray(result?.suppliers) ? result.suppliers : [])
        })
        .catch((reason: Error) => {
          if (active) setError(reason.message)
        })
        .finally(() => {
          if (active) setSuppliersLoading(false)
        })
      api<{ usdKhr: number }>('/exchange-rates')
        .then((result) => {
          if (active) setUsdKhrRate(result.usdKhr)
        })
        .catch(() => {
          if (active) setUsdKhrRate(4100)
        })
      setPurchaseInventoryLoading(true)
      api<{ items: InventoryItem[] }>('/inventory')
        .then((result) => {
          if (active) setInventory(Array.isArray(result?.items) ? result.items : [])
        })
        .catch((reason: Error) => {
          if (active) setError(reason.message)
        })
        .finally(() => {
          if (active) setPurchaseInventoryLoading(false)
        })
    }
    if (kind === 'pawn') {
      const saved = safeStorage.getItem('phoneflow_last_valuation', 'session')
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
          if (active) {
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
          }
        } catch {
          if (active) {
            setPawnValuation(null)
            setError('The calculator valuation could not be imported. Review the contract values before continuing.')
          }
        } finally {
          safeStorage.removeItem('phoneflow_last_valuation', 'session')
        }
      }
      if (!importedExchangeRate) {
        api<{ usdKhr: number }>('/exchange-rates')
          .then((result) => {
            if (active) setUsdKhrRate(result.usdKhr)
          })
          .catch(() => {
            if (active) setUsdKhrRate(4100)
          })
      }
    }
    return () => {
      active = false
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
    setPawnBrand('')
    setPawnModel('')
    setPawnStorage('')
    setPawnRam('')
    setPawnColor('')
    setPawnCondition('GOOD')
    setPawnBatteryHealth('85')
    setPawnCarrierLock('UNLOCKED')
    setPawnAccessories([])
    setPawnScannerOpen(false)
    setScanCode('')
    setScannedItem(null)
    setScannedPawn(null)
    setLabelItems([])
    pendingSaleItemIdRef.current = null
    setSaleItemId('')
    setSaleCustomerId('')
    setSaleQuantity('1')
    setSaleDiscount('0')
    setSaleManualPriceEnabled(false)
    setSaleManualPrice('')
    setSaleWarrantyDays('')
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
    setSaleScannerOpen(false)
    setSaleScannerError('')
    khqrFinalizing.current = false
    khqrChecking.current = false
    submittingPurchaseRef.current = false
    submittingSaleRef.current = false
    submittingPawnRef.current = false
    submittingStockRef.current = false
    scanRequestSeqRef.current++
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
    setPurchaseAmountPaidTouched(false)
    setPurchaseNotes('')
    setPurchaseDevices([newPurchaseDevice()])
    setPurchaseStep(1)
    setPurchaseAttempted(false)
    setPurchaseInventoryLoading(false)
    setSuppliersLoading(false)
    setCustomersLoading(false)
    setCurrencyNotice('')
    setImeiScanDeviceId(null)
    setImeiScanError('')
  }

  const close = () => {
    if (busy) return
    if (kind === 'stock' && stockAdjustmentComplete) {
      resetAndClose()
      return
    }
    if (kind === 'pawn' && pawnCreated) {
      resetAndClose()
      return
    }
    if (saleQrZoomed) {
      setSaleQrZoomed(false)
      return
    }
    if (kind === 'sale' && saleCompleted) {
      resetAndClose()
      return
    }
    if (kind === 'sale' && saleKhqr) {
      if (salePaymentPhase === 'COMPLETED') {
        resetAndClose()
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
    navigate('/stock')
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

  const printCreatedPawnLabel = () => {
    if (!pawnCreated?.pawn) return
    const p = pawnCreated.pawn
    const linkedItem = typeof p.inventoryItem === 'object' ? p.inventoryItem : null
    const labelCode = pawnInventoryLabelCode(linkedItem?.sku, p.itemSnapshot?.sku, linkedItem?.barcode)
    if (!labelCode) {
      window.alert('This pawn has no valid stock SKU or barcode. Open its stock record before printing a label.')
      return
    }
    printInventoryLabel({
      sku: labelCode,
      barcode: labelCode,
      name: linkedItem?.name || p.itemSnapshot?.name || 'Collateral Phone',
      brand: linkedItem?.brand || p.itemSnapshot?.brand,
      model: [linkedItem?.model || p.itemSnapshot?.model, linkedItem?.storage || p.itemSnapshot?.storage, linkedItem?.color || p.itemSnapshot?.color].filter(Boolean).join(' '),
      imei1: linkedItem?.imei1 || p.itemSnapshot?.imei,
      sellPrice: 0,
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
    const seq = ++scanRequestSeqRef.current
    scanInFlightRef.current = true
    setBusy(true)
    setError('')
    setScannedItem(null)
    setScannedPawn(null)
    try {
      const result = await api<{ item: InventoryItem; relatedPawn?: RelatedPawn | null }>(`/inventory/scan/${encodeURIComponent(code)}`)
      if (scanRequestSeqRef.current !== seq) return
      setScanCode(code)
      setScannedItem(result.item)
      setScannedPawn(result.relatedPawn || null)
    } catch (reason) {
      if (scanRequestSeqRef.current === seq) {
        setError(reason instanceof Error ? reason.message : 'Unable to find this product')
      }
    } finally {
      if (scanRequestSeqRef.current === seq) {
        scanInFlightRef.current = false
        setBusy(false)
      }
    }
  }, [])

  const handleCameraError = useCallback((message: string) => setError(message), [])

  function sellScannedProduct() {
    if (!scannedItem || !canOfferForSale({ ...scannedItem, relatedPawn: scannedPawn }) || scannedItem.sellPrice <= 0) return
    pendingSaleItemIdRef.current = scannedItem._id
    setInventory((current) => current.some((item) => item._id === scannedItem._id) ? current : [scannedItem, ...current])
    setSaleItemId(scannedItem._id)
    setSaleCurrency(scannedItem.pricingCurrency === 'KHR' ? 'KHR' : 'USD')
    setSaleDiscount('0')
    setSaleManualPriceEnabled(false)
    setSaleManualPrice('')
    setSaleWarrantyDays('')
    setSaleAmountPaid('')
    setError('')
    setKind('sale')
  }

  function applyScannedSaleItem(code: string) {
    const cleaned = code.trim()
    const digitsOnly = cleaned.replace(/\D/g, '')
    const found = inventory.find((item) =>
      (item.barcode && item.barcode.toLowerCase() === cleaned.toLowerCase()) ||
      (item.sku && item.sku.toLowerCase() === cleaned.toLowerCase()) ||
      (item.imei1 && (item.imei1 === cleaned || (digitsOnly.length === 15 && item.imei1 === digitsOnly)))
    )
    if (!found) {
      setSaleScannerError(`No available stock item matched code "${cleaned}".`)
      return
    }
    if (found.status !== 'IN_STOCK' || found.quantity < 1) {
      setSaleScannerError(`"${found.name}" is not available to sell (${found.quantity} in stock).`)
      return
    }
    setSaleItemId(found._id)
    setSaleCurrency(found.pricingCurrency === 'KHR' ? 'KHR' : 'USD')
    setSalePaymentMethod('CASH')
    setSaleQuantity('1')
    setSaleDiscount('0')
    setSaleManualPriceEnabled(false)
    setSaleManualPrice('')
    setSaleWarrantyDays('')
    setSaleAmountPaid('')
    setSaleScannerOpen(false)
    setSaleScannerError('')
    setError('')
  }

  async function submitStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submittingStockRef.current || busy) return
    if (!selectedStockItem || !stockAdjustmentValid) {
      setError('Select an item and complete the required adjustment details')
      return
    }
    submittingStockRef.current = true
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
      submittingStockRef.current = false
      setBusy(false)
    }
  }

  function updatePurchaseDevice(id: string, update: Partial<PurchaseDevice>) {
    setPurchaseDevices((current) => current.map((device) => device.id === id ? { ...device, ...update } : device))
  }

  function updatePurchaseCategory(id: string, category: StockCategory) {
    setPurchaseDevices((current) => current.map((device) => {
      if (device.id !== id) return device
      const isPhoneOrTablet = category === 'PHONE' || category === 'TABLET'
      return {
        ...device,
        category,
        quantity: category === 'PHONE' ? '1' : device.quantity || '1',
        inventoryMode: 'NEW',
        existingInventoryItem: '',
        brand: (category === 'PHONE' || category === 'TABLET' || category === 'ACCESSORY') ? device.brand : '',
        model: isPhoneOrTablet ? device.model : '',
        storage: isPhoneOrTablet ? device.storage : '',
        color: isPhoneOrTablet ? device.color : '',
        imei: category === 'PHONE' ? device.imei : '',
        ram: category === 'PHONE' ? device.ram : '',
        batteryHealth: category === 'PHONE' ? device.batteryHealth : '',
        carrierLock: category === 'PHONE' ? device.carrierLock : 'UNKNOWN',
        accessoriesIncluded: category === 'PHONE' ? device.accessoriesIncluded : [],
        compatibleModels: category === 'SPARE_PART' ? device.compatibleModels : '',
        oemQuality: category === 'SPARE_PART' ? device.oemQuality : '',
        name: !isPhoneOrTablet ? device.name : '',
        sku: category !== 'PHONE' ? device.sku : '',
      }
    }))
  }

  function updatePurchaseInventoryMode(id: string, mode: PurchaseInventoryMode) {
    setPurchaseDevices((current) => current.map((device) => {
      if (device.id !== id) return device
      if (mode === 'EXISTING') {
        return {
          ...device,
          inventoryMode: 'EXISTING',
          existingInventoryItem: '',
          imei: '',
          brand: '',
          model: '',
          storage: '',
          ram: '',
          color: '',
          name: '',
          sku: '',
          batteryHealth: '',
          carrierLock: 'UNKNOWN',
          accessoriesIncluded: [],
          compatibleModels: '',
          oemQuality: '',
          notes: '',
        }
      }
      return {
        ...device,
        inventoryMode: 'NEW',
        existingInventoryItem: '',
      }
    }))
  }

  function handlePurchaseCurrencyChange(nextCurrency: PurchaseCurrency) {
    if (nextCurrency === purchaseCurrency) return
    const hasEnteredPrices = purchaseDevices.some((item) => item.purchasePrice.trim() !== '') || (purchaseAmountPaid.trim() !== '' && purchaseAmountPaid !== '0')
    setPurchaseCurrency(nextCurrency)
    setPurchaseAmountPaidTouched(false)
    if (hasEnteredPrices) {
      setPurchaseDevices((current) => current.map((item) => ({ ...item, purchasePrice: '' })))
      setPurchaseAmountPaid('0')
      setCurrencyNotice(`Switched to ${nextCurrency}. Previously entered purchase prices and amount paid were cleared to prevent currency confusion.`)
    } else {
      setCurrencyNotice('')
    }
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
    const targetDeviceId = imeiScanDeviceId
    setPurchaseDevices((current) => current.map((device) => device.id === targetDeviceId ? { ...device, imei } : device))
    setImeiScanDeviceId(null)
    setImeiScanError('')
    window.setTimeout(() => imeiInputs.current.get(targetDeviceId)?.focus(), 0)
  }, [imeiScanDeviceId])

  function purchaseItemErrors(item: PurchaseDevice) {
    const errors: Record<string, string> = {}
    const price = Number(item.purchasePrice)
    const quantity = Number(item.quantity)
    const validGigabytes = (value: string) => Number.isFinite(Number(value)) && Number(value) > 0

    if (!Number.isFinite(price) || price <= 0 || item.purchasePrice.trim() === '') {
      errors.purchasePrice = 'Enter a valid unit purchase price greater than zero'
    } else if (purchaseCurrency === 'KHR') {
      if (!Number.isInteger(price) || price % 100 !== 0) {
        errors.purchasePrice = 'Use a whole KHR amount in increments of 100'
      }
    } else {
      const priceStr = item.purchasePrice.trim()
      const parts = priceStr.split('.')
      if (parts.length > 2 || (parts[1] && parts[1].length > 2)) {
        errors.purchasePrice = 'USD purchase price cannot exceed 2 decimal places'
      }
    }

    if (item.category !== 'PHONE' && (!Number.isInteger(quantity) || quantity < 1)) {
      errors.quantity = 'Quantity must be at least 1'
    }

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
      if (item.category === 'SPARE_PART' && !item.compatibleModels.trim()) errors.compatibleModels = 'Compatible models are required'
      if (item.category === 'SPARE_PART' && !item.oemQuality) errors.oemQuality = 'Select OEM quality'
    }
    return errors
  }

  function sanitizePurchaseItem(device: PurchaseDevice) {
    const base = {
      category: device.category,
      purchasePrice: Number(device.purchasePrice),
    }
    if (device.inventoryMode === 'EXISTING') {
      return {
        ...base,
        inventoryItem: device.existingInventoryItem,
        quantity: Math.max(1, Number(device.quantity) || 1),
      }
    }
    const common = {
      ...base,
      condition: device.condition || 'NEW',
      notes: device.notes.trim() || undefined,
    }
    if (device.category === 'PHONE') {
      return {
        ...common,
        imei: device.imei.trim(),
        brand: device.brand.trim(),
        model: device.model.trim(),
        storage: device.storage.trim(),
        ram: device.ram.trim() || undefined,
        color: device.color.trim(),
        batteryHealth: device.batteryHealth ? Number(device.batteryHealth) : undefined,
        carrierLock: device.carrierLock || 'UNKNOWN',
        accessoriesIncluded: device.accessoriesIncluded.length > 0 ? device.accessoriesIncluded : undefined,
        quantity: 1,
      }
    }
    if (device.category === 'TABLET') {
      return {
        ...common,
        brand: device.brand.trim(),
        model: device.model.trim(),
        storage: device.storage.trim(),
        color: device.color.trim(),
        sku: sanitizeCode(device.sku) || undefined,
        quantity: Math.max(1, Number(device.quantity) || 1),
      }
    }
    if (device.category === 'ACCESSORY') {
      return {
        ...common,
        name: device.name.trim(),
        brand: device.brand.trim(),
        sku: sanitizeCode(device.sku) || undefined,
        quantity: Math.max(1, Number(device.quantity) || 1),
      }
    }
    if (device.category === 'SPARE_PART') {
      return {
        ...common,
        name: device.name.trim(),
        compatibleModels: device.compatibleModels.trim(),
        oemQuality: device.oemQuality || undefined,
        sku: sanitizeCode(device.sku) || undefined,
        quantity: Math.max(1, Number(device.quantity) || 1),
      }
    }
    return {
      ...common,
      name: device.name.trim(),
      sku: sanitizeCode(device.sku) || undefined,
      quantity: Math.max(1, Number(device.quantity) || 1),
    }
  }

  const purchaseSellerValid = sellerType === 'EXISTING_SUPPLIER'
    ? Boolean(supplierId)
    : sellerType === 'EXISTING_CUSTOMER'
      ? Boolean(sellerCustomerId)
      : sellerType === 'WALK_IN'
        ? true
        : Boolean(sellerName.trim()) && (sellerType !== 'NEW_CUSTOMER' || Boolean(sellerPhone.trim()))
  const existingPurchaseIds = purchaseDevices.filter((item) => item.inventoryMode === 'EXISTING').map((item) => item.existingInventoryItem).filter(Boolean)
  const purchaseItemsValid = purchaseDevices.length > 0
    && new Set(existingPurchaseIds).size === existingPurchaseIds.length
    && purchaseDevices.every((item) => Object.keys(purchaseItemErrors(item)).length === 0)

  const purchaseSteps: WorkflowStep[] = useMemo(() => [
    {
      id: 'seller',
      title: 'Seller & purchase',
      description: 'Step 1 · Seller and payment details',
      status: purchaseStep === 1 ? 'active' : purchaseSellerValid ? 'complete' : 'pending',
    },
    {
      id: 'items',
      title: 'Items & payment',
      description: 'Step 2 · Products and settlement',
      status: purchaseStep === 2 ? 'active' : purchaseItemsValid ? 'complete' : 'pending',
    },
  ], [purchaseStep, purchaseSellerValid, purchaseItemsValid])

  const sellerTypeOptions: SegmentedControlOption<SellerType>[] = useMemo(() => [
    { value: 'EXISTING_CUSTOMER', label: 'Existing customer' },
    { value: 'EXISTING_SUPPLIER', label: 'Existing supplier' },
    { value: 'WALK_IN', label: 'Walk-in customer' },
    { value: 'NEW_CUSTOMER', label: 'New customer' },
    { value: 'NEW_SUPPLIER', label: 'New supplier' },
  ], [])

  const pawnSteps: WorkflowStep[] = useMemo(() => [
    {
      id: 'customer',
      title: 'Customer verification',
      description: 'Step 1 · Identity and ownership',
      status: pawnStep === 1 ? 'active' : pawnCustomerValid ? 'complete' : 'pending',
      ariaLabel: 'Step 1 of 2: Customer verification',
    },
    {
      id: 'collateral',
      title: 'Collateral & terms',
      description: 'Step 2 · Device, valuation, and loan',
      status: pawnStep === 2 ? 'active' : 'pending',
      ariaLabel: 'Step 2 of 2: Collateral and contract terms',
    },
  ], [pawnStep, pawnCustomerValid])

  const pawnCustomerOptions: SegmentedControlOption<PawnCustomerMode>[] = useMemo(() => [
    { value: 'EXISTING', label: 'Existing customer', id: 'pawn-customer-tab-existing' },
    { value: 'NEW', label: 'New customer', id: 'pawn-customer-tab-new' },
  ], [])

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
    if (submittingPurchaseRef.current || busy) return
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
          : purchasePaidUsdDecimalsInvalid
            ? 'Amount paid cannot have more than 2 decimal places'
            : new Set(existingPurchaseIds).size !== existingPurchaseIds.length
              ? 'Add each existing product only once per purchase'
              : 'Complete the highlighted item fields')
      return
    }
    submittingPurchaseRef.current = true
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
      items: purchaseDevices.map(sanitizePurchaseItem),
    }
    try {
      const result = await api<{ trade?: { items?: { inventoryItem?: InventoryItem }[] } }>('/trades', { method: 'POST', body: JSON.stringify(payload) })
      if (sellerType === 'NEW_CUSTOMER') {
        window.dispatchEvent(new CustomEvent('phoneflow:customers-updated'))
      } else if (sellerType === 'NEW_SUPPLIER') {
        window.dispatchEvent(new CustomEvent('phoneflow:suppliers-updated'))
      }
      const purchasedItems = Array.isArray(result?.trade?.items)
        ? (result.trade.items.map((item) => item?.inventoryItem).filter(Boolean) as InventoryItem[])
        : []
      if (purchasedItems.length > 0) {
        setLabelItems(purchasedItems)
        setKind('label')
      } else {
        resetAndClose()
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save purchase')
    } finally {
      submittingPurchaseRef.current = false
      setBusy(false)
    }
  }

  async function submitSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submittingSaleRef.current || busy) return
    setError('')
    const selected = inventory.find((item) => item._id === saleItemId)
    if (!selected) {
      setError('Select an available inventory item')
      return
    }
    const quantity = selected.category === 'PHONE' ? 1 : Number(saleQuantity || 1)
    const unitPrice = saleManualPriceEnabled
      ? Number(saleManualPrice)
      : inventorySalePrice(selected, saleCurrency, usdKhrRate)
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
      setError(`Quantity must be between 1 and ${selected.quantity}`)
      return
    }
    const invalidKhrAmount = saleCurrency === 'KHR' && (!Number.isInteger(unitPrice) || unitPrice % 100 !== 0 || !Number.isInteger(discount) || discount % 100 !== 0)
    if (!Number.isFinite(unitPrice) || unitPrice <= 0 || minimumUnitPrice > unitPrice || !Number.isFinite(discount) || discount < 0 || discount > maximumDiscount || invalidKhrAmount) {
      setError(minimumUnitPrice > unitPrice
        ? 'Fix this product\'s minimum selling price in Stock Information before completing the sale'
        : discount > maximumDiscount
        ? `Discount cannot exceed ${saleAmountText(maximumDiscount, saleCurrency)}`
        : invalidKhrAmount
          ? 'KHR prices and discounts must use whole 100 KHR increments'
          : 'Set a valid selling price in Stock Information before completing this sale')
      return
    }
    const amountReceived = salePaymentMethod === 'KHQR' ? total : saleAmountPaid === '' ? total : Number(saleAmountPaid)
    if (!Number.isFinite(amountReceived) || amountReceived < 0 || (saleCurrency === 'KHR' && (!Number.isInteger(amountReceived) || amountReceived % 100 !== 0))) {
      setError(saleCurrency === 'KHR' ? 'Amount received must use whole 100 KHR increments' : 'Enter a valid amount received')
      return
    }
    const amountPaid = Math.min(total, amountReceived)
    const payload: SaleDraft = {
      type: 'SELL' as const,
      customer: saleCustomerId || undefined,
      items: [{ inventoryItem: selected._id, name: selected.name, quantity, unitPrice, manualUnitPrice: saleManualPriceEnabled || undefined }],
      discount,
      amountPaid,
      amountReceived,
      paymentMethod: salePaymentMethod,
      currency: saleCurrency,
      exchangeRate: saleCurrency === 'KHR' ? usdKhrRate : 1,
      warrantyDays: saleWarrantyDayCount,
      notes: saleNotes,
    }
    submittingSaleRef.current = true
    setBusy(true)
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
            manualUnitPrice: saleManualPriceEnabled || undefined,
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
      submittingSaleRef.current = false
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
    if (submittingPawnRef.current || busy) return
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
    submittingPawnRef.current = true
    setBusy(true)
    const brand = String(form.get('brand') || pawnBrand || '').trim()
    const model = String(form.get('model') || pawnModel || '').trim()
    const storage = String(form.get('storage') || pawnStorage || '').trim()
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
        ram: String(form.get('ram') || pawnRam || ''),
        color: String(form.get('color') || pawnColor || ''),
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
      const result = await api<{ pawn: Pawn }>('/pawns', { method: 'POST', body: JSON.stringify(payload) })
      setPawnCreated({ pawnNo: result.pawn.pawnNo, principal: result.pawn.principal, currency: result.pawn.currency || pawnCurrency, pawn: result.pawn })
      notifyPawnCreated(result.pawn)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create pawn contract')
    } finally {
      submittingPawnRef.current = false
      setBusy(false)
    }
  }

  if (!kind) return null

  return (
    <OperationModalShell
      kind={kind}
      error={error}
      busy={busy}
      compact={kind === 'label' || (kind === 'sale' && Boolean(saleKhqr || saleCompleted)) || (kind === 'pawn' && Boolean(pawnCreated)) || (kind === 'stock' && Boolean(stockAdjustmentComplete))}
      className={kind === 'purchase' && purchaseStep === 2 ? 'purchase-modal-step-2' : undefined}
      dismissible={!(kind === 'sale' && saleKhqr && !saleCompleted)}
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
        <footer className="operation-modal-actions"><button type="button" className="primary-button record-created-done" onClick={() => resetAndClose()}><CheckCircle2 size={16} /> Done</button></footer>
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
        <OperationWorkflowStepper steps={purchaseSteps} ariaLabel="Purchase progress" />

        {purchaseStep === 1 && <>
        <div className="purchase-step-content">
        <OperationSectionCard
          title="Seller and purchase details"
          description="Choose who is selling, then record the date, payment method, and currency."
        >
          {currencyNotice && (
            <div className="purchase-currency-notice" role="status">
              <AlertTriangle size={16} />
              <span>{currencyNotice}</span>
            </div>
          )}
          <SegmentedControl
            label="Seller type"
            value={sellerType}
            options={sellerTypeOptions}
            className="purchase-seller-tabs"
            onChange={setSellerType}
          />
          <div className="operation-form-grid purchase-fields-grid">
            {sellerType === 'EXISTING_SUPPLIER' ? (
              <label className={`operation-wide ${purchaseAttempted && !supplierId ? 'field-invalid' : ''}`}>
                Supplier
                <select
                  required
                  disabled={suppliersLoading || suppliers.length === 0}
                  value={supplierId}
                  onChange={(event) => setSupplierId(event.target.value)}
                >
                  <option value="" disabled>
                    {suppliersLoading ? 'Loading suppliers...' : suppliers.length === 0 ? 'No suppliers registered yet' : 'Select supplier'}
                  </option>
                  {suppliers.map((supplier) => (
                    <option key={supplier._id} value={supplier._id}>
                      {supplier.name}{supplier.phone ? ` — ${supplier.phone}` : ''}
                    </option>
                  ))}
                </select>
                {purchaseAttempted && !supplierId && <small>Select a supplier</small>}
                {!suppliersLoading && suppliers.length === 0 && <small className="field-hint">Add suppliers in the Suppliers section first, or choose New supplier.</small>}
              </label>
            ) : sellerType === 'EXISTING_CUSTOMER' ? (
              <label className={`operation-wide ${purchaseAttempted && !sellerCustomerId ? 'field-invalid' : ''}`}>
                Customer
                <select
                  required
                  disabled={customersLoading || customers.length === 0}
                  value={sellerCustomerId}
                  onChange={(event) => setSellerCustomerId(event.target.value)}
                >
                  <option value="" disabled>
                    {customersLoading ? 'Loading customers...' : customers.length === 0 ? 'No customers registered yet' : 'Select customer'}
                  </option>
                  {customers.map((customer) => (
                    <option key={customer._id} value={customer._id}>
                      {customer.name}{customer.phone ? ` — ${customer.phone}` : ' — No phone recorded'}
                    </option>
                  ))}
                </select>
                {purchaseAttempted && !sellerCustomerId && <small>Select a customer</small>}
                {!customersLoading && customers.length === 0 && <small className="field-hint">Add customers in the Customers section first, or choose Walk-in / New customer.</small>}
              </label>
            ) : <>
              <label className={purchaseAttempted && sellerType !== 'WALK_IN' && !sellerName.trim() ? 'field-invalid' : ''}>Seller name {sellerType === 'WALK_IN' && <small className="optional-marker">Optional</small>}<input required={sellerType !== 'WALK_IN'} value={sellerName} onChange={(event) => setSellerName(event.target.value)} placeholder={sellerType === 'NEW_SUPPLIER' ? 'Supplier or business name' : 'Customer name'} />{purchaseAttempted && sellerType !== 'WALK_IN' && !sellerName.trim() && <small>Seller name is required</small>}</label>
              <label className={purchaseAttempted && sellerType === 'NEW_CUSTOMER' && !sellerPhone.trim() ? 'field-invalid' : ''}>Phone number {sellerType !== 'NEW_CUSTOMER' && <small className="optional-marker">Optional</small>}<input required={sellerType === 'NEW_CUSTOMER'} value={sellerPhone} onChange={(event) => setSellerPhone(event.target.value)} placeholder="012 345 678" />{purchaseAttempted && sellerType === 'NEW_CUSTOMER' && !sellerPhone.trim() && <small>Phone number is required for a new customer</small>}</label>
              <label>National ID <small className="optional-marker">Optional</small><input value={sellerNationalId} onChange={(event) => setSellerNationalId(event.target.value)} /></label>
            </>}
            <label>Purchase date<input type="date" required value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} /></label>
            <label>Payment method<select value={purchasePaymentMethod} onChange={(event) => setPurchasePaymentMethod(event.target.value)}><option value="CASH">Cash</option><option value="BANK">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label>
            <label>Currency<select value={purchaseCurrency} onChange={(event) => handlePurchaseCurrencyChange(event.target.value as PurchaseCurrency)}><option value="USD">USD — US Dollar</option><option value="KHR">KHR — Khmer Riel</option></select></label>
            <label className="operation-wide">Purchase notes <small className="optional-marker">Optional</small><textarea rows={2} value={purchaseNotes} onChange={(event) => setPurchaseNotes(event.target.value)} /></label>
          </div>
        </OperationSectionCard>
        </div>

        <OperationWorkflowFooter
          summary={{
            stepText: 'Step 1 of 2',
            detailText: 'Seller & purchase',
          }}
          secondaryAction={
            <button type="button" className="ghost-button" onClick={close}>Cancel</button>
          }
          primaryAction={
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setPurchaseAttempted(true)
                if (purchaseSellerValid) {
                  setError('')
                  setPurchaseAttempted(false)
                  setPurchaseStep(2)
                } else {
                  setError('Complete the required seller information')
                }
              }}
            >
              Continue to items
            </button>
          }
        />
        </>}

        {purchaseStep === 2 && <>
        <div className="purchase-step-content">
        <OperationSectionCard
          marker="2"
          title="Inventory items"
          description="Choose a category for each item. The required fields adjust automatically."
          badge={`${purchaseDevices.length} item${purchaseDevices.length === 1 ? '' : 's'}`}
          className="devices-section"
        >
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

                {canRestockExisting(device.category) && <fieldset className="purchase-inventory-mode"><legend>Product record</legend><button type="button" className={device.inventoryMode === 'NEW' ? 'active' : ''} onClick={() => updatePurchaseInventoryMode(device.id, 'NEW')}><Plus size={16} /><span>New product<small>Create a new SKU</small></span>{device.inventoryMode === 'NEW' && <CheckCircle2 size={16} />}</button><button type="button" className={device.inventoryMode === 'EXISTING' ? 'active' : ''} onClick={() => updatePurchaseInventoryMode(device.id, 'EXISTING')}><RefreshCw size={16} /><span>Existing product<small>Increase current quantity</small></span>{device.inventoryMode === 'EXISTING' && <CheckCircle2 size={16} />}</button></fieldset>}

                {device.inventoryMode === 'EXISTING' ? <>
                  <div className="device-group-label"><span>Existing inventory product</span><small>Only quantity-based products can be restocked</small></div>
                  <label className={`device-existing-product ${purchaseAttempted && itemErrors.existingInventoryItem ? 'field-invalid' : ''}`}>Product<select required disabled={purchaseInventoryLoading || existingOptions.length === 0} value={device.existingInventoryItem} onChange={(event) => updatePurchaseDevice(device.id, { existingInventoryItem: event.target.value })}><option value="" disabled>{purchaseInventoryLoading ? 'Loading inventory...' : existingOptions.length === 0 ? `No existing ${device.category.replace('_', ' ').toLowerCase()} products in stock` : 'Select an existing product'}</option>{existingOptions.map((item) => <option key={item._id} value={item._id}>{item.name} — {item.sku} — Qty {item.quantity}</option>)}</select>{purchaseAttempted && itemErrors.existingInventoryItem && <small>{itemErrors.existingInventoryItem}</small>}</label>
                  {existingItem && <div className="purchase-existing-summary"><span className="stock-adjustment-result-icon"><Package size={19} /></span><p><strong>{existingItem.name}</strong><small>{existingItem.sku} · {existingItem.category.replace('_', ' ')}</small></p><div><span>Current stock</span><strong>{existingItem.quantity}</strong></div><div><span>After purchase</span><strong>{existingItem.quantity + Math.max(1, Number(device.quantity) || 1)}</strong></div></div>}
                  <label className={purchaseAttempted && itemErrors.quantity ? 'field-invalid' : ''}>Quantity purchased<input required type="number" min="1" step="1" value={device.quantity} onChange={(event) => updatePurchaseDevice(device.id, { quantity: event.target.value })} />{purchaseAttempted && itemErrors.quantity && <small>{itemErrors.quantity}</small>}</label>
                </> : <>
                <div className="device-group-label"><span>Product identity</span><small>Required identification information</small></div>
                {device.category === 'PHONE' ? (
                  <SerializedDeviceFields
                    asContainer={false}
                    showGroupHeading={false}
                    values={{
                      imei: device.imei,
                      brand: device.brand,
                      model: device.model,
                      storage: device.storage,
                      ram: device.ram,
                      color: device.color,
                    }}
                    errors={purchaseAttempted ? itemErrors : undefined}
                    onChange={(field, value) => updatePurchaseDevice(device.id, { [field]: value })}
                    onScan={() => openImeiScanner(device.id)}
                    imeiRef={(node) => {
                      if (node) imeiInputs.current.set(device.id, node)
                      else imeiInputs.current.delete(device.id)
                    }}
                  >
                    <label>Battery health <small className="optional-marker">Optional</small><div className="device-unit-input"><input type="number" min="0" max="100" step="1" value={device.batteryHealth} onChange={(event) => updatePurchaseDevice(device.id, { batteryHealth: event.target.value })} placeholder="88" /><span>%</span></div></label>
                    <label>Carrier lock<select value={device.carrierLock} onChange={(event) => updatePurchaseDevice(device.id, { carrierLock: event.target.value })}><option value="UNKNOWN">Unknown</option><option value="UNLOCKED">Unlocked</option><option value="LOCKED">Carrier locked</option></select></label>
                    <fieldset className="device-accessories"><legend>Accessories included</legend>{['BOX', 'CHARGER', 'CABLE', 'CASE', 'EARPHONES'].map((accessory) => <label key={accessory}><input type="checkbox" checked={device.accessoriesIncluded.includes(accessory)} onChange={(event) => updatePurchaseDevice(device.id, { accessoriesIncluded: event.target.checked ? [...device.accessoriesIncluded, accessory] : device.accessoriesIncluded.filter((item) => item !== accessory) })} /> {accessory.charAt(0) + accessory.slice(1).toLowerCase()}</label>)}</fieldset>
                  </SerializedDeviceFields>
                ) : device.category === 'TABLET' ? (
                  <SerializedDeviceFields
                    asContainer={false}
                    showGroupHeading={false}
                    showImei={false}
                    showRam={false}
                    values={{
                      brand: device.brand,
                      model: device.model,
                      storage: device.storage,
                      color: device.color,
                    }}
                    errors={purchaseAttempted ? itemErrors : undefined}
                    onChange={(field, value) => updatePurchaseDevice(device.id, { [field]: value })}
                  >
                    <label>SKU <small className="optional-marker">Optional — generated if empty</small><input value={device.sku} onChange={(event) => updatePurchaseDevice(device.id, { sku: event.target.value.toUpperCase() })} placeholder="Optional — generated if empty" /></label>
                    <label className={purchaseAttempted && itemErrors.quantity ? 'field-invalid' : ''}>Quantity<input required type="number" min="1" step="1" value={device.quantity} onChange={(event) => updatePurchaseDevice(device.id, { quantity: event.target.value })} />{purchaseAttempted && itemErrors.quantity && <small>{itemErrors.quantity}</small>}</label>
                  </SerializedDeviceFields>
                ) : <>
                  <label className={purchaseAttempted && itemErrors.name ? 'field-invalid' : ''}>{device.category === 'SPARE_PART' ? 'Part name' : 'Item name'}<input required value={device.name} onChange={(event) => updatePurchaseDevice(device.id, { name: event.target.value })} placeholder={device.category === 'ACCESSORY' ? 'USB-C charger' : device.category === 'SPARE_PART' ? 'OLED display assembly' : 'Product name'} />{purchaseAttempted && itemErrors.name && <small>{itemErrors.name}</small>}</label>
                  {device.category === 'ACCESSORY' && <label className={purchaseAttempted && itemErrors.brand ? 'field-invalid' : ''}>Brand<input required value={device.brand} onChange={(event) => updatePurchaseDevice(device.id, { brand: event.target.value })} placeholder="Anker" />{purchaseAttempted && itemErrors.brand && <small>{itemErrors.brand}</small>}</label>}
                  <label className={purchaseAttempted && itemErrors.sku ? 'field-invalid' : ''}>SKU <small className="optional-marker">Optional — generated if empty</small><input value={device.sku} onChange={(event) => updatePurchaseDevice(device.id, { sku: event.target.value.toUpperCase() })} placeholder="Optional — generated if empty" />{purchaseAttempted && itemErrors.sku && <small>{itemErrors.sku}</small>}</label>
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
        </OperationSectionCard>
        <OperationSectionCard
          marker={<CheckCircle2 size={17} />}
          title="Payment settlement"
          description="Confirm what was paid after reviewing the complete purchase total."
          className="purchase-settlement-card"
        >
          <div className="operation-form-grid purchase-fields-grid"><label className={purchasePaidInvalid ? 'field-invalid' : ''}>Amount paid ({purchaseCurrency})<MoneyInput currency={purchaseCurrency} minimum={0} maximum={purchaseTotal || undefined} value={purchaseAmountPaid} onValueChange={(nextValue) => { setPurchaseAmountPaidTouched(true); setPurchaseAmountPaid(nextValue) }} placeholder={purchaseCurrency === 'KHR' ? '0' : '0.00'} />{purchasePaid > purchaseTotal ? <small>Amount paid cannot exceed the total</small> : purchaseCurrency === 'KHR' && purchasePaidInvalid ? <small>Use a whole KHR amount in increments of 100</small> : null}</label></div>
          <KeyValueSummary
            className="purchase-payment-summary"
            columns={4}
            items={[
              {
                id: 'purchase-summary-total',
                label: 'Total amount',
                value: purchaseCurrency === 'KHR' ? `${purchaseTotal.toLocaleString()} ៛` : `$${purchaseTotal.toFixed(2)}`,
              },
              {
                id: 'purchase-summary-paid',
                label: 'Amount paid',
                value: purchaseCurrency === 'KHR' ? `${purchasePaid.toLocaleString()} ៛` : `$${purchasePaid.toFixed(2)}`,
              },
              {
                id: 'purchase-summary-balance',
                label: 'Balance due',
                value: purchaseCurrency === 'KHR' ? `${purchaseBalance.toLocaleString()} ៛` : `$${purchaseBalance.toFixed(2)}`,
              },
              {
                id: 'purchase-summary-status',
                label: 'Payment status',
                value: <span className={`payment-state ${purchasePaymentStatus.toLowerCase()}`}>{purchasePaymentStatus}</span>,
              },
            ]}
          />
        </OperationSectionCard>
        </div>
        <OperationWorkflowFooter
          summary={{
            stepText: `Step 2 of 2 · ${purchaseDevices.length} item${purchaseDevices.length === 1 ? '' : 's'}`,
            detailText: purchaseCurrency === 'KHR' ? `${purchaseTotal.toLocaleString()} ៛` : `$${purchaseTotal.toFixed(2)}`,
          }}
          secondaryAction={
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                setError('')
                setPurchaseAttempted(false)
                setPurchaseStep(1)
              }}
            >
              Back
            </button>
          }
          primaryAction={
            <button
              className="primary-button"
              disabled={busy}
              aria-disabled={!purchaseItemsValid || purchasePaidInvalid}
            >
              {busy ? 'Saving purchase...' : purchaseItemsValid && !purchasePaidInvalid ? 'Complete purchase' : 'Complete required fields'}
            </button>
          }
        />
        </>}
      </form>}

      {kind === 'purchase' && imeiScanDeviceId && (
        <OperationModalShell
          scanner
          compact
          icon={<Camera size={20} />}
          eyebrow="Camera active"
          title="Point camera at the IMEI"
          description="The IMEI will be filled automatically when the 15-digit barcode is detected."
          error={imeiScanError}
          onClose={() => {
            const returnId = imeiScanDeviceId
            setImeiScanDeviceId(null)
            setImeiScanError('')
            window.setTimeout(() => imeiInputs.current.get(returnId)?.focus(), 0)
          }}
          className="purchase-scanner-modal"
          ariaLabel="Point camera at the IMEI"
        >
          <CameraBarcodeReader
            autoStart
            readerId="phoneflow-imei-reader"
            onScan={applyScannedImei}
            onError={setImeiScanError}
          />
        </OperationModalShell>
      )}

      {kind === 'scan' && (!scannedItem ? <ScannerWorkflow
        code={scanCode}
        onCodeChange={(value) => { setScanCode(value); if (error) setError('') }}
        onSubmit={findScannedProduct}
        onCameraError={handleCameraError}
        busy={busy}
        introDescription="Use a barcode scanner for the fastest checkout, or open the camera on this device."
        methodTitle="Barcode scanner"
        methodDescription="Keep this field selected, then scan the label."
        inputId="barcode-code"
        inputLabel="Barcode, SKU, IMEI, or serial number"
        placeholder="Scan or enter product code"
        submitLabel="Find product"
        helpText="Works with barcode, SKU, IMEI, and serial number. Most scanners press Enter automatically."
      /> : <div className="scanner-workflow has-result">
          <div className="scan-success-banner"><span><CheckCircle2 size={22} /></span><div><strong>Product found</strong><small>Code {scannedItem.barcode || scannedItem.sku} matched an inventory record.</small></div></div>
          <article className="scanned-product-card">
            <div className="scanned-product-heading"><span className="operation-modal-icon"><Package size={20} /></span><div><span className="eyebrow">Ready to continue</span><h3>{scannedItem.name}</h3><p>{[scannedItem.brand, scannedItem.model].filter(Boolean).join(' ') || scannedItem.sku}</p></div><span className={`status-badge status-${scannedItem.status.toLowerCase().replaceAll('_', '-')}`}>{scannedItem.status.replaceAll('_', ' ')}</span></div>
            <div className="scanned-product-details">
              <div><span>Inventory</span><p><small>SKU</small><strong>{scannedItem.sku}</strong></p><p><small>Available</small><strong>{scannedItem.quantity}</strong></p></div>
              <div><span>Product</span><p><small>{scannedItem.category === 'PHONE' ? 'IMEI' : 'Category'}</small><strong>{scannedItem.category === 'PHONE' ? scannedItem.imei1 || 'Not recorded' : scannedItem.category.replaceAll('_', ' ')}</strong></p><p><small>Condition</small><strong>{scannedItem.condition?.replaceAll('_', ' ') || 'Not recorded'}</strong></p></div>
              <div className="price-group"><span>Shop price</span><strong>{scannedItem.sellPrice > 0 ? `$${scannedItem.sellPrice.toFixed(2)}` : 'Not set'}</strong><small>{scannedItem.sellPrice > 0 ? 'Current selling price' : 'Set a price in Stock Information first'}</small></div>
            </div>
            {scannedPawn && <div className="scanned-pawn-link" role="note"><span><HandCoins size={18} /></span><div><small>Linked pawn contract</small><strong>{scannedPawn.pawnNo}</strong><p>This product is collateral for {scannedPawn.customer?.name || 'a pawn customer'}.</p></div><b>{scannedPawn.status.replaceAll('_', ' ')}</b></div>}
            <footer className="scanner-result-actions"><ScannerTriggerButton label="Scan another" onClick={() => { setScannedItem(null); setScannedPawn(null); setScanCode(''); setError('') }} /><div><button type="button" className="ghost-button" onClick={close}>Close</button><button type="button" className="primary-button" onClick={sellScannedProduct} disabled={!canOfferForSale({ ...scannedItem, relatedPawn: scannedPawn }) || scannedItem.sellPrice <= 0}><ShoppingCart size={17} /> Sell product</button></div></footer>
          </article>
      </div>)}

      {kind === 'label' && labelItems.length > 0 && <div className="label-prompt">
        <div className="label-success"><span><Printer size={21} /></span><div><h3>Print barcode labels now?</h3><p>{labelItems.length} inventory item{labelItems.length === 1 ? ' was' : 's were'} added. You can also print later from Stock Information.</p></div></div>
        <div className="barcode-label-preview-list">{labelItems.slice(0, 3).map((item) => <article className="barcode-label-preview" key={item._id || item.sku || item.barcode}><strong>{item.name}</strong><small>{item.imei1 || sanitizeCode(item.sku) || sanitizeCode(item.barcode)}</small><BarcodeGraphic item={item} compact /></article>)}{labelItems.length > 3 && <p>+ {labelItems.length - 3} more label{labelItems.length - 3 === 1 ? '' : 's'}</p>}</div>
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
          <button type="button" className="secondary-button pawn-label-print" onClick={printCreatedPawnLabel}><ScanLine size={16} /> Print label</button>
          <button type="button" className="primary-button record-created-done" onClick={() => resetAndClose()}><CheckCircle2 size={16} /> Done</button>
        </footer>
      </section>}

      {kind === 'pawn' && !pawnCreated && <form className="operation-form purchase-workflow-form pawn-workflow-form" onSubmit={submitPawn}>
        <OperationWorkflowStepper steps={pawnSteps} ariaLabel="Pawn contract progress" />

        {pawnStep === 1 && <>
          <div className="purchase-step-content">
            <OperationSectionCard
              marker="1"
              title="Customer verification"
              description="Choose the collateral owner and confirm ownership. Recording a National ID is optional."
            >
              <SegmentedControl
                label="Customer type"
                value={pawnCustomerMode}
                options={pawnCustomerOptions}
                ariaControls="pawn-customer-panel"
                className="pawn-customer-tabs"
                onChange={(mode) => { setPawnCustomerMode(mode); setPawnOwnershipConfirmed(false); setError('') }}
              />
              <div id="pawn-customer-panel" role="tabpanel" aria-labelledby={pawnCustomerMode === 'EXISTING' ? 'pawn-customer-tab-existing' : 'pawn-customer-tab-new'} className="operation-form-grid purchase-fields-grid">
                {pawnCustomerMode === 'EXISTING' ? <label className={`operation-wide ${pawnAttempted && !pawnCustomerId ? 'field-invalid' : ''}`}>Customer<select required value={pawnCustomerId} onChange={(event) => { setPawnCustomerId(event.target.value); setPawnOwnershipConfirmed(false); setError('') }}><option value="" disabled>Select customer</option>{customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.name}{customer.phone ? ` — ${customer.phone}` : ' — No phone recorded'}{customer.nationalIdNumber ? ' — ID recorded' : ' — ID not provided'}</option>)}</select>{pawnAttempted && !pawnCustomerId && <small>Select a customer</small>}</label> : <>
                  <label className={pawnAttempted && !pawnWalkInName.trim() ? 'field-invalid' : ''}>Customer name<input required value={pawnWalkInName} onChange={(event) => setPawnWalkInName(event.target.value)} placeholder="Full name" />{pawnAttempted && !pawnWalkInName.trim() && <small>Name is required</small>}</label>
                  <label>Phone number <small className="optional-marker">Optional</small><input value={pawnWalkInPhone} onChange={(event) => setPawnWalkInPhone(event.target.value)} placeholder="012 345 678" /></label>
                  <label>National ID <small className="optional-marker">Optional</small><input value={pawnWalkInNationalId} onChange={(event) => { setPawnWalkInNationalId(event.target.value); setPawnOwnershipConfirmed(false) }} placeholder="Leave blank to protect privacy" /></label>
                  <label>Address <small className="optional-marker">Optional</small><input value={pawnWalkInAddress} onChange={(event) => setPawnWalkInAddress(event.target.value)} placeholder="Current address" /></label>
                </>}
              </div>
              {pawnCustomerMode === 'EXISTING' && selectedPawnCustomer && (
                <KeyValueSummary
                  className="pawn-customer-summary"
                  columns={3}
                  items={[
                    { id: 'customer', label: 'Customer', value: selectedPawnCustomer.name },
                    { id: 'phone', label: 'Phone', value: selectedPawnCustomer.phone || 'Not recorded' },
                    {
                      id: 'national-id',
                      label: 'National ID',
                      value: selectedPawnCustomer.nationalIdNumber || 'Not provided (optional)',
                      tone: selectedPawnCustomer.nationalIdNumber ? 'success' : 'muted',
                    },
                  ]}
                />
              )}
              <label
                htmlFor="pawn-ownership-checkbox"
                className={`pawn-verification-check ${pawnAttempted && !pawnCustomerValid ? 'field-invalid' : ''}`}
              >
                <input
                  id="pawn-ownership-checkbox"
                  type="checkbox"
                  checked={pawnOwnershipConfirmed}
                  onChange={(event) => setPawnOwnershipConfirmed(event.target.checked)}
                  aria-describedby="pawn-ownership-explanation"
                />
                <span className="pawn-verification-text">
                  <strong className="pawn-verification-desktop-title">Customer identity and collateral ownership confirmed</strong>
                  <strong className="pawn-verification-mobile-title">Confirm identity and collateral ownership</strong>
                  <small className="pawn-verification-desktop-desc">
                    {pawnCustomerHasId ? 'I checked the recorded National ID and confirmed this customer owns the phone.' : 'No National ID will be stored. I confirmed ownership using the information and evidence available to the shop.'}
                  </small>
                  <small className="pawn-verification-mobile-desc">
                    {pawnCustomerHasId ? 'National ID checked.' : 'No National ID will be stored.'}
                  </small>
                  <span id="pawn-ownership-explanation" className="sr-only">
                    {pawnCustomerHasId ? 'I checked the recorded National ID and confirmed this customer owns the phone.' : 'No National ID will be stored. I confirmed ownership using the information and evidence available to the shop.'}
                  </span>
                </span>
              </label>
            </OperationSectionCard>
          </div>
          <OperationWorkflowFooter
            summary={{
              stepText: 'Step 1 of 2',
              detailText: 'Customer verification',
            }}
            secondaryAction={<button type="button" className="ghost-button" onClick={close}>Cancel</button>}
            primaryAction={<button type="button" className="primary-button" onClick={() => { setPawnAttempted(true); if (pawnCustomerValid) { setError(''); setPawnStep(2) } else setError('Select a customer and confirm identity and collateral ownership first') }}>Continue to collateral</button>}
          />
        </>}

        {pawnStep === 2 && <>
          <div className="purchase-step-content">
            <OperationSectionCard
              marker="2"
              title="Phone collateral"
              description="The phone is saved as a serialized inventory item with PAWNED status."
              badge="1 phone"
              className="devices-section"
            >
              <article className="purchase-device-card">
                <header><div className="pawn-device-heading"><span><Smartphone size={17} /></span><p><strong>Serialized phone</strong><small>Quantity is always 1 and the IMEI must be unique.</small></p></div></header>
                <SerializedDeviceFields
                  asContainer
                  includeNames
                  showGroupHeading
                  values={{
                    imei: pawnImei,
                    brand: pawnBrand,
                    model: pawnModel,
                    storage: pawnStorage,
                    ram: pawnRam,
                    color: pawnColor,
                  }}
                  onChange={(field, value) => {
                    if (field === 'imei') setPawnImei(value)
                    else if (field === 'brand') setPawnBrand(value)
                    else if (field === 'model') setPawnModel(value)
                    else if (field === 'storage') setPawnStorage(value)
                    else if (field === 'ram') setPawnRam(value)
                    else if (field === 'color') setPawnColor(value)
                  }}
                  onScan={() => setPawnScannerOpen(true)}
                />
              </article>
            </OperationSectionCard>

            <OperationSectionCard
              marker={<HandCoins size={17} />}
              title="Phone valuation and contract terms"
              description="Assess the device, calculate a safe offer, and finish the contract without leaving this workflow."
              className="pawn-terms-card"
            >
              {pawnValuation && <div className="pawn-imported-valuation"><CheckCircle2 size={18} /><div><strong>Standalone calculator offer imported</strong><small>Valuation {pawnValuation.id || 'draft'} · Values are locked to the verified assessment.</small></div><span>Maximum {pawnAmountText(maximumPawn, pawnCurrency)}</span></div>}

              <div className="pawn-inline-assessment">
                <div className="pawn-assessment-heading"><div><span>1. Resale value and condition</span><small>Use a recent second-hand selling price and inspect the actual phone.</small></div>{pawnValuation ? <b>Imported</b> : <AutoCalculateToggle checked={pawnAutoCalculate} onChange={changePawnAutoCalculate} />}</div>
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
                <fieldset className="pawn-term-selector operation-wide">
                  <legend>Pawn term</legend>
                  <div role="radiogroup" aria-label="Pawn term">
                    {([{ days: 3, label: '3 Days' }, { days: 7, label: '1 Week' }, { days: 15, label: 'Half Month' }, { days: 30, label: '1 Month' }] as const).map((term, index, terms) => (
                      <button
                        key={term.days}
                        type="button"
                        role="radio"
                        aria-checked={pawnTermDays === term.days}
                        className={pawnTermDays === term.days ? 'active' : ''}
                        onClick={() => setPawnTermDays(term.days)}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                            event.preventDefault()
                            const next = terms[(index + 1) % terms.length]
                            setPawnTermDays(next.days)
                            event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[(index + 1) % terms.length]?.focus()
                          } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                            event.preventDefault()
                            const prev = terms[(index - 1 + terms.length) % terms.length]
                            setPawnTermDays(prev.days)
                            event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[(index - 1 + terms.length) % terms.length]?.focus()
                          }
                        }}
                      >
                        <strong>{term.label}</strong>
                        <small>{term.days} days</small>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <label className="operation-wide">Contract notes <small className="optional-marker">Optional</small><textarea name="notes" rows={2} /></label>
              </div>
              <KeyValueSummary
                className="pawn-contract-summary"
                columns={4}
                items={[
                  { id: 'principal', label: 'Principal', value: pawnAmountText(Number(pawnPrincipal) || 0, pawnCurrency) },
                  { id: 'due-date', label: 'Calculated due date', value: pawnCalculatedDueDate },
                  { id: 'daily-fee', className: 'daily-fee-summary', label: 'Daily pawn fee', value: `${pawnEffectiveDailyFeeRate.toLocaleString(undefined, { maximumFractionDigits: 2 })}% / day · ${pawnAmountText(pawnDailyFeeAmount, pawnCurrency)} / day` },
                  { id: 'total-due', label: 'Total to redeem at due', value: pawnAmountText(pawnTotalAtDue, pawnCurrency) },
                ]}
              />
            </OperationSectionCard>
          </div>
          <OperationWorkflowFooter
            summary={{
              stepText: 'Step 2 of 2',
              detailText: `${pawnAmountText(Number(pawnPrincipal || 0), pawnCurrency)} principal`,
            }}
            secondaryAction={<button type="button" className="ghost-button" onClick={() => { setError(''); setPawnStep(1) }}>Back</button>}
            primaryAction={<button className="primary-button" disabled={busy || !pawnAssessment.eligible || maximumPawn <= 0 || pawnPrincipalAmount <= 0 || pawnPrincipalAmount > maximumPawn}>{busy ? 'Saving contract...' : !pawnAssessment.eligible ? 'Activation lock must be removed' : maximumPawn <= 0 ? 'Enter valuation details' : pawnPrincipalAmount <= 0 ? 'Enter principal' : pawnPrincipalAmount > maximumPawn ? 'Principal exceeds maximum' : 'Create pawn contract'}</button>}
          />
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
        <OperationWorkflowFooter
          className="record-created-actions"
          secondaryAction={
            <button type="button" className="secondary-button" onClick={printCompletedSaleReceipt} data-modal-initial-focus>
              <Printer size={16} /> Print receipt
            </button>
          }
          primaryAction={
            <button type="button" className="primary-button record-created-done" onClick={() => resetAndClose()}>
              <CheckCircle2 size={16} /> Done
            </button>
          }
        />
      </section>}

      {kind === 'sale' && !saleKhqr && !saleCompleted && <form className="operation-form sale-form" onSubmit={submitSale}>
        <div className="sale-form-scroll">
          <div className="operation-form-grid">
            <label className="sale-customer-field">Customer<select value={saleCustomerId} onChange={(event) => setSaleCustomerId(event.target.value)}><option value="">Walk-in customer</option>{customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.name}{customer.phone ? ` — ${customer.phone}` : ' — No phone recorded'}</option>)}</select></label>
            <div className="operation-wide sale-inventory-field">
              <div className="sale-inventory-heading">
                <label htmlFor="sale-inventory-select">Inventory item</label>
                <ScannerTriggerButton
                  label="Scan item"
                  onClick={() => {
                    setSaleScannerError('')
                    setSaleScannerOpen(true)
                  }}
                />
              </div>
              <select
                id="sale-inventory-select"
                data-modal-initial-focus
                required
                value={saleItemId}
                disabled={saleInventoryLoading || (!saleInventoryLoading && inventory.length === 0)}
                onChange={(event) => {
                  const nextId = event.target.value
                  const nextItem = inventory.find((item) => item._id === nextId)
                  setSaleItemId(nextId)
                  setSaleCurrency(nextItem?.pricingCurrency === 'KHR' ? 'KHR' : 'USD')
                  setSalePaymentMethod('CASH')
                  setSaleQuantity('1')
                  setSaleDiscount('0')
                  setSaleManualPriceEnabled(false)
                  setSaleManualPrice('')
                  setSaleWarrantyDays('')
                  setSaleAmountPaid('')
                }}
              >
                <option value="" disabled>
                  {saleInventoryLoading ? 'Loading available stock...' : inventory.length === 0 ? 'No stock available to sell' : 'Select available stock'}
                </option>
                {inventory.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.name}{item.imei1 ? ` — ${item.imei1}` : ''} — Qty {item.quantity} — {inventoryNativeSalePriceText(item)}
                  </option>
                ))}
              </select>
              {!saleInventoryLoading && inventory.length === 0 && <small>Add an in-stock product before creating a sale.</small>}
            </div>
            <label>Currency<select value={saleCurrency} onChange={(event) => {
              setSaleCurrency(event.target.value as SaleCurrency)
              setSalePaymentMethod('CASH')
              setSaleDiscount('0')
              setSaleManualPriceEnabled(false)
              setSaleManualPrice('')
              setSaleAmountPaid('')
            }}><option value="USD">USD — US Dollar</option><option value="KHR">KHR — Cambodian Riel</option></select><small>1 USD = {riel.format(usdKhrRate)} KHR</small></label>
            <label>Quantity<input type="number" min="1" max={selectedSaleItem?.quantity} value={effectiveSaleQuantity} disabled={!saleItemId || selectedSaleItem?.category === 'PHONE'} onChange={(event) => { setSaleQuantity(event.target.value); setSaleDiscount('0'); setSaleAmountPaid('') }} /></label>
            <div className={`sale-price-display${salePriceInvalid || saleStockPricingInvalid ? ' needs-price' : ''}${saleManualPriceEnabled ? ' manual-price' : ''}`} role="group" aria-label={`Selling price in ${saleCurrency}`}>
              <div className="sale-price-heading"><span>Selling price ({saleCurrency})</span>{canManuallyPriceSale && selectedSaleItem && <button type="button" className="sale-price-mode-button" aria-pressed={saleManualPriceEnabled} onClick={() => { const next = !saleManualPriceEnabled; setSaleManualPriceEnabled(next); setSaleManualPrice(next ? String(savedSaleUnitPrice) : ''); setSaleDiscount('0'); setSaleAmountPaid('') }}>{saleManualPriceEnabled ? 'Use saved price' : 'Enter manually'}</button>}</div>
              {saleManualPriceEnabled ? <MoneyInput required currency={saleCurrency} minimum={configuredMinimumSalePrice > 0 ? configuredMinimumSalePrice : 0} value={saleManualPrice} onValueChange={(value) => { setSaleManualPrice(value); setSaleDiscount('0'); setSaleAmountPaid('') }} placeholder={saleCurrency === 'KHR' ? '0' : '0.00'} /> : <strong>{selectedSaleItem ? saleAmountText(saleUnitPrice, saleCurrency) : 'Select a product'}</strong>}
              {selectedSaleItem
                ? salePriceInvalid || saleStockPricingInvalid
                  ? <button type="button" className="sale-price-configure" onClick={openSelectedSaleItemPricing}><Banknote size={13} aria-hidden="true" />{saleStockPricingInvalid ? 'Fix price' : 'Set price'}</button>
                  : <small>{saleManualPriceEnabled ? `Manual price for this sale only${configuredMinimumSalePrice > 0 ? ` · Minimum ${saleAmountText(configuredMinimumSalePrice, saleCurrency)}` : ''}` : 'Configured in Stock Information'}</small>
                : <small>Choose inventory first</small>}
            </div>
            <label className={saleDiscountInvalid ? 'field-invalid' : ''}>Discount ({saleCurrency})<MoneyInput currency={saleCurrency} minimum={0} maximum={saleMaximumDiscount} value={saleDiscount} disabled={!saleItemId} onValueChange={setSaleDiscount} placeholder={saleCurrency === 'KHR' ? '0' : '0.00'} />{selectedSaleItem && <small>{saleCurrency === 'KHR' && saleDiscountAmount % 100 !== 0 ? 'Use a whole KHR amount in increments of 100' : `${saleDiscountInvalid ? 'Maximum discount is' : 'Maximum allowed:'} ${saleAmountText(saleMaximumDiscount, saleCurrency)}`}</small>}</label>
            <label className={`sale-warranty-field${saleWarrantyInvalid && saleWarrantyDays !== '' ? ' field-invalid' : ''}`}>Warranty period<div className="sale-warranty-input"><CalendarRange size={16} aria-hidden="true" /><input required type="number" inputMode="numeric" min="0" max="3650" step="1" value={saleWarrantyDays} onChange={(event) => setSaleWarrantyDays(event.target.value)} placeholder="Enter days" /><span>days</span></div><small>{saleWarrantyDays === '' ? 'Enter 0 when this sale has no refund warranty.' : saleWarrantyInvalid ? 'Use a whole number from 0 to 3650.' : saleWarrantyDayCount === 0 ? 'No refund warranty for this sale.' : `Refundable for ${saleWarrantyDayCount} day${saleWarrantyDayCount === 1 ? '' : 's'} after the sale.`}</small></label>
            {paywayAvailable && saleCurrency === 'USD' && <fieldset className="sale-payment-method operation-wide">
              <legend>How will the customer pay?</legend>
              <button type="button" className={salePaymentMethod === 'CASH' ? 'active cash' : 'cash'} onClick={() => setSalePaymentMethod('CASH')}>
                <span><Banknote size={20} /></span><p><strong>Pay with cash</strong><small>Record payment immediately</small></p>{salePaymentMethod === 'CASH' && <CheckCircle2 size={18} />}
              </button>
              <button type="button" className={salePaymentMethod === 'KHQR' ? 'active khqr' : 'khqr'} onClick={() => setSalePaymentMethod('KHQR')}>
                <span className="khqr-payment-option-logo"><img src={khqrLogo} alt="" /></span><p><strong>Pay with KHQR</strong><small>{paywayAvailable ? 'ABA PayWay sandbox' : 'PayWay unavailable'}</small></p>{salePaymentMethod === 'KHQR' && <CheckCircle2 size={18} />}
              </button>
            </fieldset>}
            {salePaymentMethod === 'CASH' && <label className={`sale-amount-received operation-wide${salePaidInvalid ? ' field-invalid' : ''}`}>Amount received ({saleCurrency}) <small className="optional-marker">Change is calculated automatically</small><MoneyInput currency={saleCurrency} minimum={0} value={saleAmountPaid} onValueChange={setSaleAmountPaid} placeholder={saleCurrency === 'KHR' ? riel.format(Math.round(saleTotal)) : saleTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />{salePaidInvalid ? <small>Use a valid {saleCurrency === 'KHR' ? 'whole KHR amount in increments of 100' : 'cash amount'}.</small> : saleChangeDue > 0 ? <small>Change due: {saleAmountText(saleChangeDue, saleCurrency)}</small> : null}</label>}
            <section className="sale-summary operation-wide" aria-labelledby="sale-summary-title">
              <header><div><span>Sale summary</span><strong id="sale-summary-title">{selectedSaleItem ? `${selectedSaleItem.name} × ${effectiveSaleQuantity}` : 'No item selected'}</strong></div><b>{salePaymentMethod === 'KHQR' ? 'KHQR' : 'Cash'}</b></header>
              <div className="sale-summary-calculation">
                <span><small>Subtotal</small><strong>{saleAmountText(saleSubtotal, saleCurrency)}</strong></span>
                <span><small>Discount</small><strong>− {saleAmountText(saleDiscountAmount, saleCurrency)}</strong></span>
                <span className="total"><small>Total</small><strong>{saleAmountText(saleTotal, saleCurrency)}</strong></span>
                <span><small>Received</small><strong>{saleAmountText(salePaymentMethod === 'KHQR' ? saleTotal : saleReceivedAmount, saleCurrency)}</strong></span>
                <span className={salePaymentMethod === 'KHQR' || saleBalance <= 0 ? 'settled' : 'due'}><small>{saleChangeDue > 0 ? 'Change' : 'Balance'}</small><strong>{saleAmountText(salePaymentMethod === 'KHQR' ? 0 : saleChangeDue > 0 ? saleChangeDue : saleBalance, saleCurrency)}</strong></span>
              </div>
            </section>
            <div className="sale-notes operation-wide">
              <button type="button" className="sale-note-toggle" aria-expanded={saleNotesOpen} onClick={() => setSaleNotesOpen((open) => !open)}><span><strong>{saleNotesOpen ? 'Sale note' : 'Add sale note'}</strong><small>Optional details for this transaction</small></span>{saleNotesOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</button>
              {saleNotesOpen && <label>Notes<textarea rows={3} value={saleNotes} onChange={(event) => setSaleNotes(event.target.value)} /></label>}
            </div>
          </div>
        </div>
        <OperationWorkflowFooter
          className="sale-actions"
          summary={
            <div className="sale-total">
              <span>Total</span>
              <strong>{saleAmountText(saleTotal, saleCurrency)}</strong>
            </div>
          }
          secondaryAction={
            <button type="button" className="ghost-button" onClick={close}>
              Cancel
            </button>
          }
          primaryAction={
            <button
              type="submit"
              className="primary-button"
              disabled={saleActionDisabled}
              title={!saleItemId ? 'Choose an inventory product before continuing' : undefined}
            >
              {busy || saleInventoryLoading ? (
                <LoaderCircle className="spinning" size={17} />
              ) : salePaymentMethod === 'KHQR' ? (
                <img className="khqr-action-logo" src={khqrLogo} alt="" />
              ) : (
                <Banknote size={17} />
              )}
              {saleActionLabel}
            </button>
          }
        />
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
        <OperationWorkflowFooter
          className="sale-khqr-actions"
        >
          {salePaymentPhase === 'COMPLETED' ? (
            <button type="button" className="primary-button khqr-done-button" onClick={resetAndClose}>
              <CheckCircle2 size={16} /> Done
            </button>
          ) : salePaymentPhase === 'CANCELLED' ? (
            <>
              <button type="button" className="ghost-button" onClick={resetAndClose}>Close</button>
              <button type="button" className="primary-button" onClick={restartKhqrPayment}>Start another payment</button>
            </>
          ) : (
            <>
              <button type="button" className="ghost-button" onClick={cancelKhqrPayment} disabled={busy}>Cancel payment</button>
              {saleKhqr.deeplink && <a className="primary-button khqr-mobile-link" href={saleKhqr.deeplink}>Open ABA Mobile</a>}
              <button type="button" className="secondary-button" onClick={() => void checkKhqrPayment()} disabled={busy}>
                <RefreshCw size={16} /> Check now
              </button>
            </>
          )}
        </OperationWorkflowFooter>
        {saleQrZoomed && <div className="khqr-zoom-backdrop" role="presentation">
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

      {kind === 'sale' && saleScannerOpen && (
        <OperationModalShell
          scanner
          compact
          icon={<ScanLine size={20} />}
          eyebrow="Barcode scanner"
          title="Scan product barcode, SKU, or IMEI"
          description="Point camera at the product label or device barcode."
          error={saleScannerError}
          onClose={() => {
            setSaleScannerOpen(false)
            setSaleScannerError('')
            window.setTimeout(() => document.getElementById('sale-inventory-select')?.focus(), 0)
          }}
          className="sale-scanner-modal"
          ariaLabel="Scan product barcode, SKU, or IMEI"
        >
          <CameraBarcodeReader
            autoStart
            readerId="phoneflow-sale-item-reader"
            onScan={applyScannedSaleItem}
            onError={setSaleScannerError}
          />
        </OperationModalShell>
      )}

      {kind === 'pawn' && pawnScannerOpen && <div className="imei-scanner-backdrop" role="presentation">
        <section className="imei-scanner-dialog" role="dialog" aria-modal="true" aria-labelledby="pawn-imei-scanner-title">
          <header><span><Camera size={20} /></span><div><small>CAMERA ACTIVE</small><h3 id="pawn-imei-scanner-title">Point camera at the IMEI</h3><p>The IMEI will be filled automatically when the 15-digit barcode is detected.</p></div><button type="button" onClick={() => setPawnScannerOpen(false)} aria-label="Close IMEI scanner"><X size={18} /></button></header>
          <CameraBarcodeReader autoStart readerId="phoneflow-pawn-imei-reader" onScan={(code) => { const imei = code.replace(/\D/g, '').slice(0, 15); if (imei.length !== 15) { setError('The scanned value is not a valid 15-digit IMEI'); return }; setPawnImei(imei); setPawnScannerOpen(false); setError('') }} onError={setError} />
        </section>
      </div>}
    </OperationModalShell>
  )
}
