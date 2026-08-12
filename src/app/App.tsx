import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  BarChart3,
  Bell,
  Building2,
  Boxes,
  Calculator,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Database,
  FileText,
  HandCoins,
  Grid2X2,
  LayoutDashboard,
  List,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  Package,
  Plus,
  RefreshCcw,
  ScanLine,
  Search,
  Settings,
  ShoppingCart,
  Smartphone,
  Server,
  Sun,
  Trash2,
  TrendingDown,
  Type,
  UserRound,
  Users,
  WalletCards,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import { api, type SessionUser } from '../lib/api'
import { getPawnAutoCalculatePreference, PAWN_AUTO_CALCULATE_EVENT, savePawnAutoCalculatePreference } from '../lib/pawnPreferences'
import LoadingState from '../components/LoadingState'
import MoneyInput from '../components/MoneyInput'
import { printInventoryLabel } from '../features/inventory/barcode'
import BackupStatusBridge from '../features/backup/BackupStatusBridge'
import SupplierWorkspace from '../features/suppliers/SupplierWorkspace'
import '../features/backup/backup-status.css'

type NavKey =
  | 'dashboard'
  | 'pawn'
  | 'trade'
  | 'inventory'
  | 'customers'
  | 'suppliers'
  | 'depreciation'
  | 'businessOverview'
  | 'reports'
  | 'settings'

type NavItem = {
  key: NavKey
  label: string
  icon: LucideIcon
  badge?: string
}

type AppFontSize = 'default' | 'comfortable' | 'large'

const viewPaths: Record<NavKey, string> = {
  dashboard: '/dashboard',
  pawn: '/pawn-management',
  trade: '/buy-sell',
  inventory: '/stock',
  customers: '/customers',
  suppliers: '/suppliers',
  depreciation: '/depreciation',
  businessOverview: '/business-overview',
  reports: '/reports',
  settings: '/settings',
}

function viewFromPath(pathname: string): NavKey {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const match = (Object.entries(viewPaths) as [NavKey, string][]).find(([, path]) => path === normalizedPath)

  // Both the site root and /admin open the main dashboard.
  if (normalizedPath === '/' || normalizedPath === '/admin') return 'dashboard'
  if (normalizedPath.startsWith('/reports/')) return 'reports'
  return match?.[0] || 'dashboard'
}

type Customer = {
  _id: string
  name: string
  phone: string
  nationalIdNumber?: string
  address?: string
  notes?: string
  createdAt?: string
}

type InventoryItem = {
  _id: string
  sku: string
  barcode?: string
  category: 'PHONE' | 'TABLET' | 'ACCESSORY' | 'SPARE_PART' | 'OTHER'
  name: string
  brand?: string
  model?: string
  imei1?: string
  imei2?: string
  serialNumber?: string
  condition?: string
  storage?: string
  ram?: string
  color?: string
  batteryHealth?: number
  carrierLock?: string
  accessoriesIncluded?: string[]
  compatibleModels?: string[]
  oemQuality?: string
  imageUrl?: string
  source?: string
  notes?: string
  createdAt?: string
  quantity: number
  reorderLevel: number
  buyPrice: number
  sellPrice: number
  minimumSellPrice?: number
  status: string
}

type PawnCurrency = 'USD' | 'KHR'

type Pawn = {
  _id: string
  pawnNo: string
  customer?: Customer
  itemSnapshot: { name: string; brand?: string; model?: string; imei?: string; condition?: string; color?: string; storage?: string }
  estimatedValue: number
  pawnPercentage: number
  principal: number
  originalPrincipal?: number
  remainingPrincipal?: number
  interestRate: number
  accruedInterest?: number
  feeModel?: 'LEGACY_MONTHLY' | 'DAILY_SIMPLE'
  dailyFeeRate?: number
  termDays?: number
  startDate?: string
  currentTermStartDate?: string
  accruedPawnFee?: number
  pawnFeePaid?: number
  feeSummary?: {
    feeModel: 'LEGACY_MONTHLY' | 'DAILY_SIMPLE'
    dailyFeeRate: number
    termDays: number
    accruedDays: number
    accruedFee: number
    feeAtDueDate: number
    totalAtDueDate: number
    redemptionTotal: number
    remainingPrincipal: number
  }
  fees?: number
  amountPaid?: number
  currency?: PawnCurrency
  exchangeRate?: number
  renewals?: Array<{
    previousDueDate: string
    newDueDate: string
    paymentAmount: number
    feePaid?: number
    principalRemaining?: number
    termDays?: number
    renewedAt: string
    note?: string
    renewedBy?: { name?: string }
  }>
  dueDate: string
  graceEndsAt?: string
  status: string
  identificationVerified: boolean
  ownershipConfirmed?: boolean
  notes?: string
  createdAt: string
}

type PawnAction = 'payment' | 'renew' | 'redeem' | 'forfeit'

type Trade = {
  _id: string
  tradeNo: string
  type: 'BUY' | 'SELL'
  customer?: Customer
  supplier?: { _id: string; name: string; phone?: string; nationalIdNumber?: string }
  sellerSnapshot?: { name?: string; phone?: string; nationalIdNumber?: string }
  sellerType?: string
  purchaseDate?: string
  currency?: 'USD' | 'KHR'
  paymentStatus?: 'PAID' | 'PARTIAL' | 'UNPAID'
  transactionSubtotal?: number
  transactionTotal?: number
  transactionAmountPaid?: number
  transactionBalance?: number
  items: { name: string; quantity: number; unitPrice: number; costPrice?: number; originalUnitPrice?: number; currency?: 'USD' | 'KHR' }[]
  subtotal: number
  discount: number
  total: number
  amountPaid: number
  balance: number
  paymentMethod: string
  status: string
  notes?: string
  createdAt: string
  createdBy?: { _id: string; name: string; email?: string; role?: string }
  reportTotal?: number
  reportCost?: number
  reportGrossProfit?: number
  reportItems?: number
  reportPaid?: number
  reportBalance?: number
}

type DashboardData = {
  metrics: {
    salesToday: number
    purchasesToday: number
    activePawnValue: number
    phonesInStock: number
    overdueContracts: number
    lowStock: number
    customerCount: number
    pawnCount: number
  }
  recentPawns: Pawn[]
  recentTrades: Trade[]
  inventoryMix: { _id: string; count: number; value: number }[]
  monthPerformance: { _id: 'BUY' | 'SELL'; total: number }[]
  monthlyPerformance: { _id: { month: number; type: 'BUY' | 'SELL' }; total: number }[]
  dailyPerformance: { _id: { day: number; type: 'BUY' | 'SELL' }; total: number }[]
}

type ExchangeRateData = {
  usdKhr: number
  source: 'ABA PayWay' | 'ABA configured fallback'
  rateType: 'bank' | 'fallback'
  configured: boolean
  environment?: 'sandbox' | 'production'
  buy?: number
  sell?: number
  side?: 'buy' | 'sell'
  updatedAt: string
  warning?: string
}

type ActivityLog = {
  _id: string
  action: string
  entity: string
  entityId?: string
  createdAt: string
  user?: { name: string; email: string; role: string }
  details?: Record<string, unknown>
}

type OverviewCurrencyTotals = { USD: number; KHR: number }

type BusinessOverviewPeriod = 'today' | 'yesterday' | 'last_7_days' | 'last_30_days' | 'this_month' | 'last_month' | 'this_year' | 'custom'

type BusinessOverviewData = {
  period: {
    key: BusinessOverviewPeriod
    label: string
    from: string
    to: string
    granularity: 'hour' | 'day' | 'month'
  }
  financial: {
    salesRevenue: number
    purchases: number
    cogs: number
    grossProfit: number
  }
  pawn: {
    active: number
    dueSoon: number
    overdue: number
    outstandingPrincipal: OverviewCurrencyTotals
  }
  loans: {
    active: number
    dueSoon: number
    overdue: number
    outstandingBalance: OverviewCurrencyTotals
  }
  inventory: {
    inStockCount: number
    productCount: number
    phoneCount: number
    tabletCount: number
    accessoryCount: number
    sparePartCount: number
    otherCount: number
    lowStockCount: number
    costValue: number
    retailValue: number
    lowStockItems: Array<{
      _id: string
      sku: string
      name: string
      category: InventoryItem['category']
      quantity: number
      reorderLevel: number
    }>
  }
  chart: Array<{
    key: string
    label: string
    sales: number
    purchases: number
    grossProfit: number
  }>
  recentTransactions: Trade[]
  recentActivity: ActivityLog[]
}

type SalesReportData = {
  period: {
    key: BusinessOverviewPeriod
    label: string
    from: string
    to: string
    granularity: 'hour' | 'day' | 'month'
  }
  filters: {
    paymentMethod: string
    status: string
    staff: string
  }
  summary: {
    salesRevenue: number
    cogs: number
    grossProfit: number
    itemsSold: number
    transactions: number
    averageSale: number
  }
  chart: Array<{
    key: string
    label: string
    sales: number
    cogs: number
    grossProfit: number
  }>
  transactions: Trade[]
  products: Array<{
    name: string
    quantity: number
    revenue: number
    cogs: number
    grossProfit: number
  }>
  payments: Array<{
    method: string
    amount: number
    transactions: number
  }>
  staff: Array<{ _id: string; name: string; email?: string; role?: string }>
  totalRecords: number
  limited: boolean
}

type PurchaseReportData = {
  period: SalesReportData['period']
  filters: {
    paymentMethod: string
    paymentStatus: string
    status: string
    source: string
    staff: string
  }
  summary: {
    totalPurchases: number
    amountPaid: number
    outstandingBalance: number
    itemsPurchased: number
    transactions: number
    averagePurchase: number
  }
  chart: Array<{
    key: string
    label: string
    total: number
    paid: number
    balance: number
  }>
  transactions: Trade[]
  products: Array<{
    name: string
    quantity: number
    totalCost: number
    averageUnitCost: number
    transactions: number
  }>
  payments: SalesReportData['payments']
  sources: Array<{
    source: string
    amount: number
    transactions: number
  }>
  staff: SalesReportData['staff']
  totalRecords: number
  limited: boolean
}

type OperationalReportKind = 'inventory' | 'pawns' | 'loans' | 'payments' | 'activity'

type OperationalReportData = {
  title: string
  description: string
  meta: {
    currency?: 'USD' | 'KHR'
    period?: { key: string; label: string; from: string; to: string }
    totalRecords: number
    limited: boolean
  }
  filters: Record<string, string>
  summary: Array<{
    label: string
    value: number
    format: 'currency' | 'number'
    detail: string
    tone: string
  }>
  breakdowns: Array<{
    title: string
    description: string
    format: 'currency' | 'number'
    rows: Array<{ label: string; value: number; count: number }>
  }>
  columns: Array<{
    key: string
    label: string
    format?: 'currency' | 'number' | 'date' | 'dateTime' | 'status'
  }>
  rows: Array<Record<string, string | number | null | undefined>>
  staff?: Array<{ _id: string; name: string; email?: string; role?: string }>
  filterOptions?: { actions?: string[]; entities?: string[] }
  notes?: string[]
}

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [{ key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Operations',
    items: [
      { key: 'pawn', label: 'Pawn Management', icon: HandCoins },
      { key: 'trade', label: 'Buy & Sell', icon: ShoppingCart },
      { key: 'inventory', label: 'Stock Information', icon: Boxes },
      { key: 'customers', label: 'Customers', icon: Users },
      { key: 'suppliers', label: 'Suppliers', icon: Building2 },
    ],
  },
  {
    label: 'Finance & Control',
    items: [
      { key: 'depreciation', label: 'Depreciation', icon: TrendingDown },
      { key: 'businessOverview', label: 'Business Overview', icon: BarChart3 },
      { key: 'reports', label: 'Reports', icon: FileText },
      { key: 'settings', label: 'Settings', icon: Settings },
    ],
  },
]

const demoMetrics = [
  {
    label: "Today's sales",
    value: '$8,420',
    change: '+12.5%',
    trend: 'up' as const,
    icon: CircleDollarSign,
    tone: 'violet',
  },
  {
    label: 'Active pawn value',
    value: '$32,680',
    change: '+4.8%',
    trend: 'up' as const,
    icon: HandCoins,
    tone: 'blue',
  },
  {
    label: 'Phones in stock',
    value: '184',
    change: '7 low stock',
    trend: 'down' as const,
    icon: Smartphone,
    tone: 'orange',
  },
  {
    label: 'Overdue contracts',
    value: '12',
    change: '3 due today',
    trend: 'down' as const,
    icon: AlertTriangle,
    tone: 'rose',
  },
]

const pawnRows = [
  {
    id: 'PW-2026-0188',
    customer: 'Sokha Chan',
    phone: 'iPhone 15 Pro Max',
    value: '$720',
    loan: '$350',
    due: '18 Jul 2026',
    status: 'Due soon',
    idVerified: true,
  },
  {
    id: 'PW-2026-0187',
    customer: 'Dara Vann',
    phone: 'Samsung S24 Ultra',
    value: '$640',
    loan: '$300',
    due: '21 Jul 2026',
    status: 'Active',
    idVerified: true,
  },
  {
    id: 'PW-2026-0185',
    customer: 'Maly Touch',
    phone: 'iPhone 13',
    value: '$320',
    loan: '$145',
    due: '12 Jul 2026',
    status: 'Overdue',
    idVerified: true,
  },
  {
    id: 'PW-2026-0182',
    customer: 'Vicheka Lim',
    phone: 'Google Pixel 8 Pro',
    value: '$410',
    loan: '$190',
    due: '28 Jul 2026',
    status: 'Active',
    idVerified: false,
  },
]

const inventoryRows = [
  {
    sku: 'PH-APL-15PM-256-BLK',
    item: 'iPhone 15 Pro Max 256GB',
    type: 'Second-hand phone',
    stock: 4,
    buy: '$650',
    sell: '$789',
    status: 'In stock',
  },
  {
    sku: 'PH-SAM-S24U-512-GRY',
    item: 'Samsung S24 Ultra 512GB',
    type: 'New phone',
    stock: 7,
    buy: '$820',
    sell: '$949',
    status: 'In stock',
  },
  {
    sku: 'AC-ANK-ADP-20W',
    item: 'Anker 20W USB-C Adapter',
    type: 'Accessory',
    stock: 3,
    buy: '$9',
    sell: '$16',
    status: 'Low stock',
  },
  {
    sku: 'SP-APL-IP13-OLED',
    item: 'iPhone 13 OLED LCD',
    type: 'Spare part',
    stock: 2,
    buy: '$78',
    sell: '$110',
    status: 'Low stock',
  },
]

const transactions = [
  { id: 'SL-00982', title: 'Sold iPhone 14 Pro', person: 'Nita Heng', amount: '+$620', type: 'Sale' },
  { id: 'BY-00514', title: 'Bought Samsung Z Flip 5', person: 'Sothea Keo', amount: '-$330', type: 'Purchase' },
  { id: 'SL-00981', title: 'Sold 2 accessories', person: 'Walk-in customer', amount: '+$41', type: 'Sale' },
  { id: 'BY-00513', title: 'Bought iPhone 12', person: 'Rithy Meas', amount: '-$185', type: 'Purchase' },
]

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})
const tradePartyName = (trade: Trade) => trade.type === 'BUY'
  ? trade.supplier?.name || trade.sellerSnapshot?.name || trade.customer?.name || 'Walk-in seller'
  : trade.customer?.name || 'Walk-in customer'
const tradePartyPhone = (trade: Trade) => trade.type === 'BUY'
  ? trade.supplier?.phone || trade.sellerSnapshot?.phone || trade.customer?.phone
  : trade.customer?.phone
const purchaseSourceLabel = (sellerType?: string) => {
  if (sellerType?.includes('SUPPLIER')) return 'Supplier'
  if (sellerType?.includes('CUSTOMER')) return 'Customer'
  if (sellerType === 'WALK_IN') return 'Walk-in'
  return 'Legacy'
}
const tradeTransactionMoney = (trade: Trade, original: number | undefined, fallback: number) => trade.type === 'BUY' && trade.currency === 'KHR' && original !== undefined
  ? `${Math.round(original).toLocaleString()} ៛`
  : money.format(original ?? fallback)
const riel = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function pawnMoney(amount: number, currencyCode: PawnCurrency = 'USD') {
  return currencyCode === 'KHR'
    ? `${riel.format(Math.round(Number(amount) || 0))} KHR`
    : money.format(Number(amount) || 0)
}

function pawnEquivalentText(amount: number, currencyCode: PawnCurrency, exchangeRate: ExchangeRateData | null, storedRate?: number) {
  if (!exchangeRate) return ''
  const usdKhrRate = currencyCode === 'KHR' && Number(storedRate) > 0
    ? Number(storedRate)
    : exchangeRate.usdKhr
  return currencyCode === 'KHR'
    ? `≈ ${money.format((Number(amount) || 0) / usdKhrRate)}`
    : khrText(amount, exchangeRate)
}

function pawnUsdValue(pawn: Pawn, amount: number) {
  if (pawn.currency !== 'KHR') return Number(amount) || 0
  const rate = Number(pawn.exchangeRate)
  return rate > 0 ? (Number(amount) || 0) / rate : 0
}

function useExchangeRate() {
  const [exchangeRate, setExchangeRate] = useState<ExchangeRateData | null>(null)

  useEffect(() => {
    api<ExchangeRateData>('/exchange-rates')
      .then(setExchangeRate)
      .catch(() => setExchangeRate(null))
  }, [])

  return exchangeRate
}

function convertedKhr(amount: number, exchangeRate: ExchangeRateData | null) {
  if (!exchangeRate) return 0
  return Math.round((amount * exchangeRate.usdKhr) / 100) * 100
}

function khrText(amount: number, exchangeRate: ExchangeRateData | null) {
  return exchangeRate ? `≈ ${riel.format(convertedKhr(amount, exchangeRate))} ៛` : ''
}
const dateText = (value: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(value))
const titleStatus = (status: string) => status.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
const comingNext = (label: string) => window.alert(`${label} form is next. The tables and dashboard are connected to MongoDB now.`)

function StatusBadge({ status }: { status: string }) {
  const label = titleStatus(status)
  const slug = label.toLowerCase().replaceAll(' ', '-')
  const Icon = status === 'IN_STOCK' || status === 'ACTIVE' || status === 'PAID'
    ? BadgeCheck
    : status === 'RESERVED' || status === 'DUE_SOON'
      ? Clock3
      : status === 'SOLD' || status === 'SALE'
        ? ShoppingCart
        : status === 'PAWNED'
          ? HandCoins
          : status === 'REPAIR'
            ? Wrench
            : status === 'ARCHIVED'
              ? Boxes
              : AlertTriangle

  return <span className={`status-badge status-${slug}`}><Icon size={14} strokeWidth={2} aria-hidden="true" />{label}</span>
}

function pawnOutstanding(pawn: Pawn) {
  if (pawn.feeModel === 'DAILY_SIMPLE' && pawn.feeSummary) return pawn.feeSummary.redemptionTotal
  return Math.max(0, (pawn.remainingPrincipal ?? pawn.principal) + (pawn.accruedInterest || 0) + (pawn.fees || 0))
}

function PawnDetailModal({ pawn, onClose, onOpenAll, onAction }: { pawn: Pawn; onClose: () => void; onOpenAll?: () => void; onAction?: (action: PawnAction, payload: Record<string, unknown>) => Promise<void> }) {
  const [action, setAction] = useState<PawnAction | null>(null)
  const [amount, setAmount] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [renewalTermDays, setRenewalTermDays] = useState('7')
  const [note, setNote] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const outstanding = pawnOutstanding(pawn)
  const pawnCurrency: PawnCurrency = pawn.currency === 'KHR' ? 'KHR' : 'USD'
  const currencyLabel = pawnCurrency === 'KHR' ? 'KHR' : '$'
  const isOpen = ['ACTIVE', 'DUE_SOON', 'OVERDUE', 'RENEWED'].includes(pawn.status)
  const remainingPrincipal = pawn.remainingPrincipal ?? pawn.principal
  const currentFee = pawn.feeModel === 'DAILY_SIMPLE' ? pawn.feeSummary?.accruedFee || 0 : pawn.accruedInterest || 0
  const dailyFeeRate = Number(pawn.dailyFeeRate || 2.5).toLocaleString(undefined, { maximumFractionDigits: 4 })
  const dailyFeeAmount = remainingPrincipal * Number(pawn.dailyFeeRate || 2.5) / 100
  const renewalPaymentDue = currentFee + (pawn.fees || 0)

  function openAction(nextAction: PawnAction) {
    setAction(nextAction)
    setActionError('')
    setNote('')
    setNewDueDate('')
    setRenewalTermDays(String(pawn.termDays || 7))
    const suggestedAmount = nextAction === 'redeem'
      ? outstanding
      : nextAction === 'renew'
        ? pawn.feeModel === 'DAILY_SIMPLE' ? (pawn.feeSummary?.accruedFee || 0) + (pawn.fees || 0) : (pawn.accruedInterest || 0) + (pawn.fees || 0)
        : null
    setAmount(suggestedAmount === null ? '' : pawnCurrency === 'KHR' ? String(Math.round(suggestedAmount)) : suggestedAmount.toFixed(2))
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!action || !onAction) return
    setActionBusy(true)
    setActionError('')
    try {
      const payload: Record<string, unknown> = { note }
      if (action !== 'forfeit') payload.amount = Number(amount)
      if (action === 'renew') {
        if (pawn.feeModel === 'DAILY_SIMPLE') payload.termDays = Number(renewalTermDays)
        else payload.newDueDate = newDueDate
      }
      if (action === 'forfeit' && amount) payload.sellPrice = Number(amount)
      await onAction(action, payload)
      setAction(null)
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Unable to update pawn contract')
    } finally {
      setActionBusy(false)
    }
  }
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="detail-modal pawn-detail-modal surface-card" role="dialog" aria-modal="true" aria-labelledby="pawn-detail-title">
        <header className="detail-modal-header">
          <div>
            <span className="eyebrow">Pawn contract</span>
            <h3 id="pawn-detail-title">{pawn.pawnNo}</h3>
            <p>{pawn.customer?.name || 'Unknown customer'} - {pawn.itemSnapshot.name}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close details"><X size={18} /></button>
        </header>
        <div className="pawn-detail-body">
        <section className="pawn-balance-summary" aria-label="Current pawn balance">
          <div className="pawn-balance-heading">
            <div><span className="eyebrow">Current balance</span><h4>Amount to redeem today</h4></div>
            <StatusBadge status={pawn.status} />
          </div>
          <strong className="pawn-balance-total">{pawnMoney(outstanding, pawnCurrency)}</strong>
          <p>Return this amount to collect the pawned item today.</p>
          <div className="pawn-balance-breakdown">
            <div><span>Principal still owed</span><strong>{pawnMoney(remainingPrincipal, pawnCurrency)}</strong></div>
            <div><span>Fee accumulated today</span><strong>{pawnMoney(currentFee, pawnCurrency)}</strong></div>
            <div><span>Payments received</span><strong>{pawnMoney(pawn.amountPaid || 0, pawnCurrency)}</strong></div>
            <div><span>Payment due</span><strong>{dateText(pawn.dueDate)}</strong></div>
          </div>
        </section>

        <div className="pawn-detail-groups">
          <section className="pawn-detail-group">
            <header><span className="eyebrow">Loan agreement</span><h4>Contract terms</h4></header>
            <dl>
              <div><dt>Cash originally given</dt><dd>{pawnMoney(pawn.principal, pawnCurrency)}</dd></div>
              <div><dt>Estimated resale value</dt><dd>{pawnMoney(pawn.estimatedValue, pawnCurrency)}</dd></div>
              <div><dt>Loan-to-value</dt><dd>{pawn.pawnPercentage}%</dd></div>
              <div><dt>Currency</dt><dd>{pawnCurrency}</dd></div>
              <div><dt>{pawn.feeModel === 'DAILY_SIMPLE' ? 'Daily fee rate' : 'Interest rate'}</dt><dd>{pawn.feeModel === 'DAILY_SIMPLE' ? `${dailyFeeRate}% per day` : `${pawn.interestRate}%`}</dd></div>
              {pawn.feeModel === 'DAILY_SIMPLE' && <div><dt>Contract length</dt><dd>{pawn.termDays} days</dd></div>}
            </dl>
          </section>

          <section className="pawn-detail-group">
            <header><span className="eyebrow">Payment schedule</span><h4>Dates and expected fee</h4></header>
            <dl>
              <div><dt>Pawned on</dt><dd>{dateText(pawn.startDate || pawn.createdAt)}</dd></div>
              <div><dt>Due date</dt><dd>{dateText(pawn.dueDate)}</dd></div>
              {pawn.feeModel === 'DAILY_SIMPLE' && <div><dt>Days accumulated</dt><dd>{pawn.feeSummary?.accruedDays || 0} days</dd></div>}
              {pawn.feeModel === 'DAILY_SIMPLE' && <div><dt>Fee if paid on due date</dt><dd>{pawnMoney(pawn.feeSummary?.feeAtDueDate || 0, pawnCurrency)}</dd></div>}
              {pawn.feeModel === 'DAILY_SIMPLE' && <div className="pawn-total-at-due"><dt>Total to pay on due date</dt><dd>{pawnMoney(pawn.feeSummary?.totalAtDueDate || 0, pawnCurrency)}</dd></div>}
              {pawn.feeModel !== 'DAILY_SIMPLE' && <div><dt>Record created</dt><dd>{dateText(pawn.createdAt)}</dd></div>}
            </dl>
          </section>
        </div>

        <section className="pawn-verification-summary" aria-label="Contract verification">
          <div><span>Item ownership</span><strong>{pawn.ownershipConfirmed || pawn.identificationVerified ? 'Confirmed by staff' : 'Legacy record'}</strong></div>
          <div><span>National ID</span><strong>{pawn.identificationVerified ? 'Recorded and verified' : 'Not recorded — optional'}</strong></div>
        </section>
        {pawn.renewals && pawn.renewals.length > 0 && <div className="detail-note pawn-renewal-history"><span className="eyebrow">Renewal history</span>{pawn.renewals.map((renewal, index) => <p key={`${renewal.renewedAt}-${index}`}><strong>{dateText(renewal.renewedAt)}</strong> · {renewal.termDays ? `${renewal.termDays} days` : 'Legacy renewal'} · Fee paid {pawnMoney(renewal.feePaid ?? renewal.paymentAmount, pawnCurrency)} · Principal {pawnMoney(renewal.principalRemaining ?? pawn.remainingPrincipal ?? pawn.principal, pawnCurrency)} · New due {dateText(renewal.newDueDate)}{renewal.renewedBy?.name ? ` · ${renewal.renewedBy.name}` : ''}</p>)}</div>}
        <div className="detail-sections">
          <article>
            <span className="eyebrow">Customer</span>
            <p><strong>{pawn.customer?.name || 'Unknown'}</strong></p>
            <p>{pawn.customer?.phone || 'No phone recorded'}</p>
            <p>{pawn.customer?.nationalIdNumber || 'No National ID recorded'}</p>
          </article>
          <article>
            <span className="eyebrow">Collateral</span>
            <p><strong>{pawn.itemSnapshot.name}</strong></p>
            <p>{[pawn.itemSnapshot.brand, pawn.itemSnapshot.model, pawn.itemSnapshot.storage, pawn.itemSnapshot.color].filter(Boolean).join(' ') || 'No extra device details'}</p>
            <p>{pawn.itemSnapshot.imei || 'No IMEI recorded'}</p>
          </article>
        </div>
        {pawn.notes && <div className="detail-note"><span className="eyebrow">Notes</span><p>{pawn.notes}</p></div>}
        {action && <form className={`pawn-action-form ${action === 'renew' ? 'renew-action-form' : ''}`} onSubmit={submitAction}>
          <div className="pawn-action-header">
            <div>
              <span className="eyebrow">{action === 'payment' ? 'Record payment' : action === 'renew' ? 'Renew contract' : action === 'redeem' ? 'Redeem collateral' : 'Forfeit collateral'}</span>
              <p>{action === 'payment' ? `Apply a payment to the ${pawnMoney(outstanding, pawnCurrency)} outstanding balance.` : action === 'renew' ? 'Record the required payment and extend the contract due date.' : action === 'redeem' ? 'Collect the full balance and return the collateral to the customer.' : 'Close the contract and move the collateral into shop inventory.'}</p>
            </div>
            <button type="button" className="icon-button" onClick={() => setAction(null)} aria-label="Cancel action"><X size={15} /></button>
          </div>
          {actionError && <p className="pawn-action-error">{actionError}</p>}
          {action !== 'forfeit' && <label className="pawn-action-amount"><span>{action === 'redeem' ? 'Full amount due' : action === 'renew' ? 'Renewal payment' : 'Payment amount'}{action === 'renew' && <small>Required now: {pawnMoney(renewalPaymentDue, pawnCurrency)}</small>}</span><div className="input-prefix"><span>{currencyLabel}</span><MoneyInput autoFocus currency={pawnCurrency} minimum={pawnCurrency === 'KHR' ? 1 : 0.01} required readOnly={action === 'redeem'} value={amount} onValueChange={setAmount} placeholder={pawnCurrency === 'KHR' ? '0' : '0.00'} /></div></label>}
          {action === 'forfeit' && <label><span>Selling price <small>Optional</small></span><div className="input-prefix"><span>{currencyLabel}</span><input autoFocus type="text" inputMode={pawnCurrency === 'KHR' ? 'numeric' : 'decimal'} value={amount} onChange={(event) => setAmount(event.target.value.replace(pawnCurrency === 'KHR' ? /\D/g : /[^0-9.]/g, ''))} placeholder={String(pawn.estimatedValue)} /></div></label>}
          {action === 'renew' && (pawn.feeModel === 'DAILY_SIMPLE'
            ? <label className="pawn-renewal-term">Renewal term<select required value={renewalTermDays} onChange={(event) => setRenewalTermDays(event.target.value)}><option value="3">3 Days</option><option value="7">1 Week (7 days)</option><option value="15">Half Month (15 days)</option><option value="30">1 Month (30 days)</option></select></label>
            : <label>New due date<input type="date" required value={newDueDate} onChange={(event) => setNewDueDate(event.target.value)} /></label>)}
          {action === 'renew' && pawn.feeModel === 'DAILY_SIMPLE' && <div className="pawn-renewal-summary" aria-label="Renewal summary"><div><span>Extension</span><strong>{renewalTermDays} days</strong></div><div><span>Daily pawn fee</span><strong>{dailyFeeRate}% · {pawnMoney(dailyFeeAmount, pawnCurrency)} / day</strong></div></div>}
          {action !== 'forfeit' && <label className="pawn-action-note"><span>Note <small>Optional</small></span><textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a reference or payment note" /></label>}
          <div className="pawn-action-buttons">
            <button type="button" className="ghost-button" onClick={() => setAction(null)}>Cancel</button>
            <button className={`primary-button ${action === 'forfeit' ? 'danger-button' : ''}`} disabled={actionBusy}>{actionBusy ? 'Saving...' : action === 'payment' ? 'Save payment' : action === 'renew' ? 'Confirm renewal' : action === 'redeem' ? 'Confirm full redemption' : 'Confirm forfeiture'}</button>
          </div>
        </form>}
        </div>
        {!action && <footer className="detail-modal-footer">
          {onAction && isOpen && !action && <><button className="secondary-button" onClick={() => openAction('payment')}>Record payment</button><button className="secondary-button" onClick={() => openAction('renew')}>Renew contract</button><button className="primary-button" onClick={() => openAction('redeem')}>Redeem item</button>{pawn.status === 'OVERDUE' && <button className="ghost-button danger-link" onClick={() => openAction('forfeit')}>Forfeit item</button>}</>}
          {onOpenAll && <button className="secondary-button" onClick={onOpenAll}>Open pawn management <ArrowUpRight size={15} /></button>}
          <button className="ghost-button" onClick={onClose}>Close</button>
        </footer>}
      </section>
    </div>
  )
}

function MetricCard({
  label,
  value,
  change,
  trend,
  icon: Icon,
  tone,
  secondaryValue,
}: (typeof demoMetrics)[number] & { secondaryValue?: string }) {
  return (
    <article className="metric-card surface-card">
      <div className={`metric-icon tone-${tone}`}>
        <Icon size={21} />
      </div>
      <div className="metric-copy">
        <p>{label}</p>
        <h3>{value}</h3>
        {secondaryValue && <small className="khr-value">{secondaryValue}</small>}
      </div>
      <span className={`metric-change ${trend}`}>
        {trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
        {change}
      </span>
    </article>
  )
}

function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  className = '',
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`section-header ${className}`.trim()}>
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  )
}

function DashboardView({ goTo, user }: { goTo: (key: NavKey) => void; user: SessionUser }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPawn, setSelectedPawn] = useState<Pawn | null>(null)
  const [performancePeriod, setPerformancePeriod] = useState<'month' | 'year'>('month')
  const [inventoryMenuOpen, setInventoryMenuOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const exchangeRate = useExchangeRate()

  const loadDashboard = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    try {
      setData(await api<DashboardData>('/dashboard'))
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load dashboard data')
    } finally {
      setLoading(false)
      if (showRefresh) setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadDashboard()
  }, [])

  const metrics = data ? [
    { label: "Today's sales", value: money.format(data.metrics.salesToday), secondaryValue: khrText(data.metrics.salesToday, exchangeRate), change: `${money.format(data.metrics.purchasesToday)} purchases${exchangeRate ? ` · ${khrText(data.metrics.purchasesToday, exchangeRate)}` : ''}`, trend: 'up' as const, icon: CircleDollarSign, tone: 'violet' },
    { label: 'Active pawn value', value: money.format(data.metrics.activePawnValue), secondaryValue: khrText(data.metrics.activePawnValue, exchangeRate), change: `${data.metrics.overdueContracts} overdue`, trend: data.metrics.overdueContracts > 0 ? 'down' as const : 'up' as const, icon: HandCoins, tone: 'blue' },
    { label: 'Phones in stock', value: String(data.metrics.phonesInStock), change: `${data.metrics.lowStock} low stock`, trend: data.metrics.lowStock > 0 ? 'down' as const : 'up' as const, icon: Smartphone, tone: 'orange' },
    { label: 'Customers', value: String(data.metrics.customerCount), change: 'live database', trend: 'up' as const, icon: Users, tone: 'rose' },
  ] : demoMetrics
  const monthLabels = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
  const monthlyNet = monthLabels.map((_, index) => {
    const month = index + 1
    const sales = data?.monthlyPerformance.find((item) => item._id.month === month && item._id.type === 'SELL')?.total || 0
    const purchases = data?.monthlyPerformance.find((item) => item._id.month === month && item._id.type === 'BUY')?.total || 0
    return sales - purchases
  })
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const dayLabels = Array.from({ length: daysInMonth }, (_, index) => String(index + 1))
  const dailyNet = dayLabels.map((_, index) => {
    const day = index + 1
    const sales = data?.dailyPerformance?.find((item) => item._id.day === day && item._id.type === 'SELL')?.total || 0
    const purchases = data?.dailyPerformance?.find((item) => item._id.day === day && item._id.type === 'BUY')?.total || 0
    return sales - purchases
  })
  const performanceValues = performancePeriod === 'month' ? dailyNet : monthlyNet
  const performanceLabels = performancePeriod === 'month' ? dayLabels : monthLabels
  const performanceSales = performancePeriod === 'month'
    ? data?.monthPerformance?.find((item) => item._id === 'SELL')?.total || 0
    : data?.monthlyPerformance.filter((item) => item._id.type === 'SELL').reduce((sum, item) => sum + item.total, 0) || 0
  const performancePurchases = performancePeriod === 'month'
    ? data?.monthPerformance?.find((item) => item._id === 'BUY')?.total || 0
    : data?.monthlyPerformance.filter((item) => item._id.type === 'BUY').reduce((sum, item) => sum + item.total, 0) || 0
  const performanceNet = performanceSales - performancePurchases
  const maxPerformanceValue = Math.max(...performanceValues.map((value) => Math.abs(value)), 1)
  const hasPerformanceData = performanceValues.some((value) => value !== 0)
  const inventoryMix = data?.inventoryMix.length ? data.inventoryMix : [{ _id: 'PHONE', count: 0, value: 0 }, { _id: 'ACCESSORY', count: 0, value: 0 }, { _id: 'SPARE_PART', count: 0, value: 0 }]
  const totalInventoryValue = inventoryMix.reduce((sum, item) => sum + item.value, 0)
  const phoneValue = inventoryMix.find((item) => item._id === 'PHONE')?.value || 0
  const accessoryValue = inventoryMix.find((item) => item._id === 'ACCESSORY')?.value || 0
  const phoneStop = totalInventoryValue ? (phoneValue / totalInventoryValue) * 100 : 0
  const accessoryStop = totalInventoryValue ? phoneStop + (accessoryValue / totalInventoryValue) * 100 : 0
  const inventoryValueText = money.format(totalInventoryValue)
  const inventoryValueSize = inventoryValueText.length > 10
    ? 'long'
    : inventoryValueText.length > 7
      ? 'medium'
      : 'short'
  const donutStyle = {
    background: totalInventoryValue
      ? `conic-gradient(var(--chart-primary) 0 ${phoneStop}%, var(--chart-blue) ${phoneStop}% ${accessoryStop}%, var(--chart-orange) ${accessoryStop}% 100%)`
      : 'conic-gradient(var(--primary-soft) 0 100%)',
  }

  if (loading && !data) {
    return (
      <>
        <SectionHeader
          className="dashboard-welcome-header"
          eyebrow="Live MongoDB dashboard"
          title={`Good afternoon, ${user.name.split(' ')[0]}`}
          description="Connecting to the shop and preparing today's overview."
          action={<button className="primary-button" onClick={() => goTo('trade')}><Plus size={17} /> New transaction</button>}
        />
        <section className="surface-card"><LoadingState label="Loading dashboard" detail="Syncing sales, pawn, customer, and inventory totals…" /></section>
      </>
    )
  }

  return (
    <>
      <SectionHeader
        className="dashboard-welcome-header"
        eyebrow="Live MongoDB dashboard"
        title={`Good afternoon, ${user.name.split(' ')[0]}`}
        description={error || 'Here is what is happening in the shop today.'}
        action={
          <button className="primary-button" onClick={() => goTo('trade')}>
            <Plus size={17} /> New transaction
          </button>
        }
      />

      <section className="metrics-grid dashboard-metrics-grid">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="surface-card performance-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Revenue overview</span>
              <h3>Shop performance</h3>
            </div>
            <select className="ghost-button performance-period-select" value={performancePeriod} onChange={(event) => setPerformancePeriod(event.target.value as 'month' | 'year')} aria-label="Performance period">
              <option value="month">This month</option>
              <option value="year">This year</option>
            </select>
          </div>

          <div className="revenue-total">
            <div className="revenue-amount"><strong>{money.format(performanceNet)}</strong>{exchangeRate && <small>{khrText(performanceNet, exchangeRate)}</small>}</div>
            <span className={performanceNet < 0 ? 'negative' : ''}>{performanceNet < 0 ? <ArrowDownRight size={15} /> : <ArrowUpRight size={15} />} net cash movement this {performancePeriod}</span>
          </div>

          <div className={`chart-shell ${performancePeriod === 'month' ? 'daily-chart' : ''}`} aria-label={`${performancePeriod === 'month' ? 'Daily' : 'Monthly'} net cash movement chart`}>
            {!hasPerformanceData && <div className="chart-empty"><BarChart3 size={22} /><strong>No completed transactions</strong><span>Sales and purchases will appear here when they are completed.</span></div>}
            {performanceValues.map((total, index) => (
              <div className="chart-column" key={index}>
                <span className={total < 0 ? 'negative' : ''} style={{ height: `${total === 0 ? 3 : Math.max((Math.abs(total) / maxPerformanceValue) * 100, 12)}%` }} title={`${money.format(total)}${exchangeRate ? ` / ${khrText(total, exchangeRate)}` : ''}`} />
                <small>{performancePeriod === 'month' && index % 5 !== 0 && index !== performanceValues.length - 1 ? '' : performanceLabels[index]}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="surface-card inventory-mix-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Stock value</span>
              <h3>Inventory mix</h3>
            </div>
            <div className="card-options" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setInventoryMenuOpen(false) }}>
              <button className={`icon-button ${inventoryMenuOpen ? 'open' : ''}`} onClick={() => setInventoryMenuOpen((current) => !current)} aria-label="Inventory options" aria-expanded={inventoryMenuOpen}><MoreHorizontal size={19} /></button>
              {inventoryMenuOpen && <div className="card-options-menu surface-card" role="menu">
                <button onClick={() => goTo('inventory')} role="menuitem"><Boxes size={16} />Open inventory</button>
                <button onClick={() => { setInventoryMenuOpen(false); comingNext('Adjust stock') }} role="menuitem"><Plus size={16} />Adjust stock</button>
                <button onClick={() => { setInventoryMenuOpen(false); void loadDashboard(true) }} role="menuitem" disabled={refreshing}><RefreshCcw size={16} />{refreshing ? 'Refreshing…' : 'Refresh values'}</button>
              </div>}
            </div>
          </div>
          <div className="donut-wrap">
            <div className="donut-chart" style={donutStyle} aria-label={`Total inventory value ${inventoryValueText}`}>
              <span className="donut-center">
                <strong className={`donut-value donut-value-${inventoryValueSize}`}>{inventoryValueText}</strong>
                {exchangeRate && <small className="donut-khr">{khrText(totalInventoryValue, exchangeRate)}</small>}
                <small>Total value</small>
              </span>
            </div>
          </div>
          <div className="legend-list">
            {inventoryMix.map((item, index) => (
              <div key={item._id}><span className={`legend-dot ${['dot-violet', 'dot-blue', 'dot-orange'][index] || 'dot-violet'}`} /><p>{titleStatus(item._id)}<small>{item.count} units</small></p><span className="legend-money"><strong>{money.format(item.value)}</strong>{exchangeRate && <small>{khrText(item.value, exchangeRate)}</small>}</span></div>
            ))}
          </div>
        </article>
      </section>

      <section className="dashboard-lower-grid">
        <article className="surface-card table-card">
          <div className="card-heading table-heading">
            <div>
              <span className="eyebrow">Pawn desk</span>
              <h3>Recent contracts</h3>
            </div>
            <button className="text-button" onClick={() => goTo('pawn')}>View all <ArrowUpRight size={15} /></button>
          </div>
          <div className="table-scroll recent-contract-table">
            <table>
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Customer & item</th>
                  <th>Loan</th>
                  <th>Due date</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(data?.recentPawns || []).map((row) => (
                  <tr key={row._id}>
                    <td><strong className="mono">{row.pawnNo}</strong></td>
                    <td>
                      <div className="customer-cell">
                        <span className="avatar">{(row.customer?.name || 'NA').slice(0, 2).toUpperCase()}</span>
                        <p>{row.customer?.name || 'Unknown'}<small>{row.itemSnapshot.name}</small></p>
                      </div>
                    </td>
                    <td><strong>{pawnMoney(row.principal, row.currency)}</strong>{exchangeRate && <small className="table-subtext khr-table-value">{pawnEquivalentText(row.principal, row.currency || 'USD', exchangeRate, row.exchangeRate)}</small>}<small className="table-subtext">of {pawnMoney(row.estimatedValue, row.currency)}</small></td>
                    <td>{dateText(row.dueDate)}</td>
                    <td><StatusBadge status={row.status} /></td>
                    <td><button className="icon-button" onClick={() => setSelectedPawn(row)} aria-label={`View contract ${row.pawnNo}`}><MoreHorizontal size={18} /></button></td>
                  </tr>
                ))}
                {data?.recentPawns.length === 0 && <tr><td colSpan={6}>No pawn contracts in the database yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mobile-contract-list">
            {(data?.recentPawns || []).map((row) => (
              <article className="mobile-contract-card" key={row._id}>
                <div className="mobile-contract-heading">
                  <span className="avatar">{(row.customer?.name || 'NA').slice(0, 2).toUpperCase()}</span>
                  <p><strong>{row.customer?.name || 'Unknown'}</strong><small>{row.itemSnapshot.name}</small></p>
                  <StatusBadge status={row.status} />
                </div>
                <div className="mobile-contract-details">
                  <div><span>Loan</span><strong>{pawnMoney(row.principal, row.currency)}</strong><small>{exchangeRate && pawnEquivalentText(row.principal, row.currency || 'USD', exchangeRate, row.exchangeRate)}</small></div>
                  <div><span>Due date</span><strong>{dateText(row.dueDate)}</strong><small className="mono">{row.pawnNo}</small></div>
                  <button className="icon-button" onClick={() => setSelectedPawn(row)} aria-label={`View contract ${row.pawnNo}`}><MoreHorizontal size={18} /></button>
                </div>
              </article>
            ))}
            {data?.recentPawns.length === 0 && <p className="mobile-contract-empty">No pawn contracts in the database yet.</p>}
          </div>
        </article>

        <article className="surface-card quick-actions-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Shortcuts</span>
              <h3>Quick actions</h3>
            </div>
          </div>
          <div className="quick-actions-list">
            <button onClick={() => window.dispatchEvent(new Event('phoneflow:open-scanner'))}><span className="quick-icon blue"><ScanLine size={19} /></span><p>Scan product<small>Find stock and start a sale</small></p><ArrowUpRight size={17} /></button>
            <button onClick={() => comingNext('New pawn')}><span className="quick-icon violet"><HandCoins size={19} /></span><p>New pawn contract<small>Register ID and collateral</small></p><ArrowUpRight size={17} /></button>
            <button onClick={() => comingNext('New sale')}><span className="quick-icon blue"><ShoppingCart size={19} /></span><p>New sale<small>Phone or accessories</small></p><ArrowUpRight size={17} /></button>
            <button onClick={() => comingNext('Adjust stock')}><span className="quick-icon orange"><Package size={19} /></span><p>Adjust stock<small>Correct count or status</small></p><ArrowUpRight size={17} /></button>
            <button onClick={() => goTo('depreciation')}><span className="quick-icon rose"><Calculator size={19} /></span><p>Value a phone<small>Calculate depreciation</small></p><ArrowUpRight size={17} /></button>
          </div>
        </article>
      </section>
      {selectedPawn && (
        <PawnDetailModal
          pawn={selectedPawn}
          onClose={() => setSelectedPawn(null)}
          onOpenAll={() => {
            setSelectedPawn(null)
            goTo('pawn')
          }}
        />
      )}
    </>
  )
}

function PawnView() {
  const [pawns, setPawns] = useState<Pawn[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPawn, setSelectedPawn] = useState<Pawn | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [dueSort, setDueSort] = useState<'soonest' | 'latest'>('soonest')
  const [error, setError] = useState('')
  const exchangeRate = useExchangeRate()

  useEffect(() => {
    api<{ pawns: Pawn[] }>('/pawns')
      .then((result) => setPawns(result.pawns))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [])

  const visiblePawns = pawns
    .filter((pawn) => {
      if (statusFilter !== 'ALL' && pawn.status !== statusFilter) return false
      const query = searchTerm.trim().toLowerCase()
      if (!query) return true
      return [pawn.pawnNo, pawn.customer?.name, pawn.itemSnapshot.name, pawn.itemSnapshot.imei]
        .some((value) => value?.toLowerCase().includes(query))
    })
    .sort((a, b) => dueSort === 'soonest'
      ? new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      : new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime())

  async function updatePawn(action: PawnAction, payload: Record<string, unknown>) {
    if (!selectedPawn) return
    const result = await api<{ pawn: Pawn }>(`/pawns/${selectedPawn._id}/${action}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    setPawns((current) => current.map((pawn) => pawn._id === result.pawn._id ? result.pawn : pawn))
    setSelectedPawn(result.pawn)
  }

  const openPawns = pawns.filter((pawn) => ['ACTIVE', 'DUE_SOON', 'OVERDUE', 'RENEWED'].includes(pawn.status))
  const openPawnUsdTotal = openPawns.reduce((sum, pawn) => sum + pawnUsdValue(pawn, pawn.remainingPrincipal ?? pawn.principal), 0)

  return (
    <>
      <div className="pawn-page-heading">
        <SectionHeader
          eyebrow="Operations"
          title="Pawn management"
          description={error || 'Track collateral, optional customer identification, repayments, renewals, and overdue contracts.'}
          action={<button className="primary-button" onClick={() => comingNext('New pawn')}><Plus size={17} /> New pawn</button>}
        />
      </div>
      <section className="mini-stats-grid pawn-stats-grid">
        <div className="surface-card mini-stat"><HandCoins /><p>Open contracts<strong>{openPawns.length}</strong><small>{money.format(openPawnUsdTotal)} USD equivalent remaining</small></p></div>
        <div className="surface-card mini-stat"><Clock3 /><p>Due soon<strong>{pawns.filter((pawn) => pawn.status === 'DUE_SOON').length}</strong><small>needs follow-up</small></p></div>
        <div className="surface-card mini-stat"><AlertTriangle /><p>Overdue<strong>{pawns.filter((pawn) => pawn.status === 'OVERDUE').length}</strong><small>past due contracts</small></p></div>
        <div className="surface-card mini-stat"><RefreshCcw /><p>Renewed contracts<strong>{pawns.filter((pawn) => (pawn.renewals?.length || 0) > 0).length}</strong><small>contracts with renewal history</small></p></div>
      </section>
      <article className="surface-card table-card page-table pawn-workspace-card">
        <div className="filter-row">
          <div className="search-field"><Search size={17} /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search contract, customer, phone or IMEI" /></div>
          <select className="ghost-button filter-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter pawn status">
            <option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="DUE_SOON">Due soon</option><option value="OVERDUE">Overdue</option><option value="REDEEMED">Redeemed</option><option value="FORFEITED">Forfeited</option>
          </select>
          <select className="ghost-button filter-select" value={dueSort} onChange={(event) => setDueSort(event.target.value as 'soonest' | 'latest')} aria-label="Sort by due date">
            <option value="soonest">Due soonest</option><option value="latest">Due latest</option>
          </select>
        </div>
        <div className="table-scroll pawn-management-table">
          <table>
            <thead><tr><th>Contract</th><th>Customer</th><th>Collateral</th><th>Estimated value</th><th>Loan</th><th>ID card</th><th>Due date</th><th>Status</th><th /></tr></thead>
            <tbody>
              {visiblePawns.map((row) => (
                <tr key={row._id}>
                  <td><strong className="mono">{row.pawnNo}</strong></td>
                  <td>{row.customer?.name || 'Unknown'}</td>
                  <td>{row.itemSnapshot.name}<small className="table-subtext">{row.itemSnapshot.imei || 'No IMEI'}</small></td>
                  <td>{pawnMoney(row.estimatedValue, row.currency)}</td>
                  <td><strong>{pawnMoney(row.remainingPrincipal ?? row.principal, row.currency)}</strong>{row.feeModel === 'DAILY_SIMPLE' && <small className="table-subtext">Fee today {pawnMoney(row.feeSummary?.accruedFee || 0, row.currency)}</small>}</td>
                  <td>{row.identificationVerified ? <span className="verified"><BadgeCheck size={15} /> Verified</span> : <span className="pawn-id-optional">Not provided</span>}</td>
                  <td>{dateText(row.dueDate)}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td><button className="icon-button" onClick={() => setSelectedPawn(row)} aria-label={`View ${row.pawnNo}`}><MoreHorizontal size={18} /></button></td>
                </tr>
              ))}
              {loading && <tr><td colSpan={9}><LoadingState compact label="Loading pawn contracts" detail="Checking balances, fees, and due dates…" /></td></tr>}
              {!loading && visiblePawns.length === 0 && <tr><td colSpan={9}>No pawn contracts match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mobile-contract-list pawn-management-mobile-list">
          {visiblePawns.map((row) => (
            <article className="mobile-contract-card" key={row._id}>
              <div className="mobile-contract-heading">
                <span className="avatar">{(row.customer?.name || 'NA').slice(0, 2).toUpperCase()}</span>
                <p><strong>{row.customer?.name || 'Unknown'}</strong><small>{row.itemSnapshot.name} · {row.pawnNo}</small></p>
                <StatusBadge status={row.status} />
              </div>
              <div className="mobile-contract-details">
                <div><span>Due now</span><strong>{pawnMoney(pawnOutstanding(row), row.currency)}</strong><small>{exchangeRate && pawnEquivalentText(pawnOutstanding(row), row.currency || 'USD', exchangeRate, row.exchangeRate)}</small></div>
                <div><span>Due date</span><strong>{dateText(row.dueDate)}</strong><small className={row.identificationVerified ? 'verified' : 'pawn-id-optional'}>{row.identificationVerified ? <><BadgeCheck size={11} /> ID verified</> : 'ID not provided'}</small></div>
                <button className="icon-button" onClick={() => setSelectedPawn(row)} aria-label={`View ${row.pawnNo}`}><MoreHorizontal size={18} /></button>
              </div>
            </article>
          ))}
          {loading && <LoadingState compact label="Loading pawn contracts" />}
          {!loading && visiblePawns.length === 0 && <p className="mobile-contract-empty">No pawn contracts match these filters.</p>}
        </div>
      </article>
      {selectedPawn && <PawnDetailModal pawn={selectedPawn} onClose={() => setSelectedPawn(null)} onAction={updatePawn} />}
    </>
  )
}

function TradeView() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null)
  const [error, setError] = useState('')
  const [transactionsCollapsed, setTransactionsCollapsed] = useState(() => window.matchMedia('(max-width: 640px)').matches)

  useEffect(() => {
    api<{ trades: Trade[] }>('/trades')
      .then((result) => setTrades(result.trades))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [])

  function exportTrades() {
    const headers = ['Reference', 'Type', 'Customer', 'Items', 'Subtotal', 'Discount', 'Total', 'Paid', 'Balance', 'Payment', 'Status', 'Date']
    const rows = trades.map((trade) => [
      trade.tradeNo,
      trade.type,
      tradePartyName(trade),
      trade.items.map((item) => `${item.name} x${item.quantity}`).join('; '),
      trade.subtotal,
      trade.discount,
      trade.total,
      trade.amountPaid,
      trade.balance,
      trade.paymentMethod,
      trade.status,
      new Date(trade.createdAt).toISOString(),
    ])
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `phoneflow-transactions-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="trade-page-heading">
        <SectionHeader
          eyebrow="Operations"
          title="Buy & sell"
          description={error || 'Purchase inventory from sellers and process shop sales with complete transaction history.'}
        />
      </div>
      <section className="trade-action-grid">
        <article className="surface-card trade-action buy-action">
          <span className="trade-icon"><Banknote size={28} /></span>
          <div><span className="eyebrow">Purchase inventory</span><h3>Buy products</h3><p>Record one transaction containing serialized phones or quantity-based shop stock.</p></div>
          <button className="primary-button" onClick={() => comingNext('New purchase')}><Plus size={17} /> New purchase</button>
        </article>
        <article className="surface-card trade-action sell-action">
          <span className="trade-icon"><WalletCards size={28} /></span>
          <div><span className="eyebrow">Point of sale</span><h3>Sell an item</h3><p>Select available stock, customer, discount, payment method, warranty, and print a receipt.</p></div>
          <button className="secondary-button" onClick={() => comingNext('New sale')}><ShoppingCart size={17} /> New sale</button>
        </article>
      </section>
      <article className={`surface-card table-card page-table trade-transactions-card ${transactionsCollapsed ? 'collapsed' : ''}`}>
        <div className="card-heading table-heading">
          <div><span className="eyebrow">Activity</span><h3>Recent transactions</h3></div>
          <div className="trade-table-actions">
            {!transactionsCollapsed && <button className="ghost-button trade-export-button" onClick={exportTrades} disabled={trades.length === 0} aria-label="Export transactions as CSV"><FileText size={15} /><span>Export</span></button>}
            <button className="ghost-button transaction-collapse-button" type="button" onClick={() => setTransactionsCollapsed((value) => !value)} aria-expanded={!transactionsCollapsed} aria-label={transactionsCollapsed ? 'Expand recent transactions' : 'Collapse recent transactions'}><ChevronDown size={17} /></button>
          </div>
        </div>
        {!transactionsCollapsed && <div className="transaction-list">
          {trades.map((transaction) => (
            <div className="transaction-row" key={transaction._id}>
              <span className={`transaction-icon ${transaction.type === 'SELL' ? 'sale' : 'purchase'}`}>{transaction.type === 'SELL' ? <ArrowUpRight /> : <ArrowDownRight />}</span>
              <p><strong>{transaction.items.map((item) => `${item.name} x${item.quantity}`).join(', ')}</strong><small>{transaction.tradeNo} - {tradePartyName(transaction)} - {dateText(transaction.purchaseDate || transaction.createdAt)}</small></p>
              <StatusBadge status={transaction.type === 'SELL' ? 'Sale' : 'Purchase'} />
              <strong className={transaction.type === 'SELL' ? 'money-in' : 'money-out'}>{transaction.type === 'SELL' ? '+' : '-'}{money.format(transaction.total)}</strong>
              <button className="icon-button" onClick={() => setSelectedTrade(transaction)} aria-label={`View ${transaction.tradeNo}`}><MoreHorizontal size={18} /></button>
            </div>
          ))}
          {loading && <LoadingState compact label="Loading transactions" detail="Reading recent purchases and sales…" />}
          {!loading && trades.length === 0 && <div className="transaction-row"><p><strong>No transactions yet</strong><small>Create a buy or sell transaction to see it here.</small></p></div>}
        </div>}
      </article>
      {selectedTrade && (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelectedTrade(null)}>
          <section className="detail-modal trade-detail-modal surface-card" role="dialog" aria-modal="true" aria-labelledby="trade-detail-title" onClick={(event) => event.stopPropagation()}>
            <header className="detail-modal-header">
              <div>
                <span className="eyebrow">{selectedTrade.type === 'SELL' ? 'Sale transaction' : 'Purchase transaction'}</span>
                <h3 id="trade-detail-title">{selectedTrade.tradeNo}</h3>
                <p>{tradePartyName(selectedTrade)} - {dateText(selectedTrade.purchaseDate || selectedTrade.createdAt)}</p>
              </div>
              <button className="icon-button" onClick={() => setSelectedTrade(null)} aria-label="Close details"><X size={18} /></button>
            </header>

            <div className="detail-grid">
              <div><span>Type</span><strong>{selectedTrade.type === 'SELL' ? 'Sale' : 'Purchase'}</strong></div>
              <div><span>{selectedTrade.type === 'BUY' ? 'Payment status' : 'Status'}</span><strong><StatusBadge status={selectedTrade.type === 'BUY' ? selectedTrade.paymentStatus || selectedTrade.status : selectedTrade.status} /></strong></div>
              <div><span>Payment</span><strong>{titleStatus(selectedTrade.paymentMethod)}</strong></div>
              <div><span>Date</span><strong>{dateText(selectedTrade.createdAt)}</strong></div>
              <div><span>Subtotal</span><strong>{tradeTransactionMoney(selectedTrade, selectedTrade.transactionSubtotal, selectedTrade.subtotal)}</strong></div>
              <div><span>Discount</span><strong>{money.format(selectedTrade.discount)}</strong></div>
              <div><span>Amount paid</span><strong>{tradeTransactionMoney(selectedTrade, selectedTrade.transactionAmountPaid, selectedTrade.amountPaid)}</strong></div>
              <div><span>Balance</span><strong>{tradeTransactionMoney(selectedTrade, selectedTrade.transactionBalance, selectedTrade.balance)}</strong></div>
            </div>

            <div className="detail-sections">
              <article>
                <span className="eyebrow">{selectedTrade.type === 'BUY' ? 'Seller' : 'Customer'}</span>
                <p><strong>{tradePartyName(selectedTrade)}</strong></p>
                <p>{tradePartyPhone(selectedTrade) || 'No phone recorded'}</p>
              </article>
              <article>
                <span className="eyebrow">Total</span>
                <p><strong>{selectedTrade.type === 'SELL' ? '+' : '-'}{tradeTransactionMoney(selectedTrade, selectedTrade.transactionTotal, selectedTrade.total)}</strong></p>
                <p>{selectedTrade.items.length} line item{selectedTrade.items.length === 1 ? '' : 's'}</p>
              </article>
            </div>

            <div className="detail-lines">
              <span className="eyebrow">Items</span>
              {selectedTrade.items.map((item, index) => (
                <div className="detail-line" key={`${item.name}-${index}`}>
                  <p><strong>{item.name}</strong><small>Quantity {item.quantity}</small></p>
                  <strong>{tradeTransactionMoney(selectedTrade, item.originalUnitPrice === undefined ? undefined : item.originalUnitPrice * item.quantity, item.unitPrice * item.quantity)}</strong>
                </div>
              ))}
            </div>

            {selectedTrade.notes && (
              <div className="detail-note">
                <span className="eyebrow">Notes</span>
                <p>{selectedTrade.notes}</p>
              </div>
            )}

            <footer className="detail-modal-footer">
              <button className="ghost-button" onClick={() => setSelectedTrade(null)}>Close</button>
            </footer>
          </section>
        </div>
      )}
    </>
  )
}

const categoryMeta: Record<InventoryItem['category'], { label: string; tone: 'violet' | 'blue' | 'orange'; Icon: LucideIcon; fallback: string }> = {
  PHONE: { label: 'Phones', tone: 'violet', Icon: Smartphone, fallback: 'Phone' },
  TABLET: { label: 'Tablets', tone: 'violet', Icon: Smartphone, fallback: 'Tab' },
  ACCESSORY: { label: 'Accessories', tone: 'blue', Icon: Package, fallback: 'Acc' },
  SPARE_PART: { label: 'Spare parts', tone: 'orange', Icon: Wrench, fallback: 'Part' },
  OTHER: { label: 'Other', tone: 'blue', Icon: Package, fallback: 'Item' },
}

function inventorySubtitle(item: InventoryItem) {
  return [item.brand, item.model, item.storage, item.ram && `${item.ram} RAM`, item.color].filter(Boolean).join(' · ') || item.sku
}

function inventoryDetails(item: InventoryItem) {
  const accessoryDetails = item.category === 'ACCESSORY' || item.category === 'SPARE_PART'
    ? [item.compatibleModels?.join(', '), item.oemQuality].filter(Boolean).join(' · ')
    : ''
  return accessoryDetails || [item.condition && titleStatus(item.condition), item.batteryHealth !== undefined && `Battery ${item.batteryHealth}%`, item.imei1 || item.serialNumber].filter(Boolean).join(' · ')
}

function InventoryPhoto({ item, size = 'normal' }: { item: InventoryItem; size?: 'small' | 'normal' | 'large' }) {
  const meta = categoryMeta[item.category] || categoryMeta.OTHER
  const Icon = meta.Icon
  return (
    <span className={`inventory-photo inventory-photo-${size} ${item.imageUrl ? 'has-image' : `fallback-${meta.tone}`}`}>
      {item.imageUrl
        ? <img src={item.imageUrl} alt={item.name} loading="lazy" />
        : <><Icon size={size === 'small' ? 16 : size === 'large' ? 28 : 20} /><small>{meta.fallback}</small></>}
    </span>
  )
}

function InventoryView() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [editingPrice, setEditingPrice] = useState(false)
  const [sellingPriceDraft, setSellingPriceDraft] = useState('')
  const [minimumPriceDraft, setMinimumPriceDraft] = useState('')
  const [savingPrice, setSavingPrice] = useState(false)
  const [savingPhoto, setSavingPhoto] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [inventoryView, setInventoryView] = useState<'large' | 'details'>(() => localStorage.getItem('phoneflow_inventory_view') === 'details' ? 'details' : 'large')
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ items: InventoryItem[] }>('/inventory')
      .then((result) => setItems(result.items))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    function openScannedStock(event: Event) {
      const detail = (event as CustomEvent<{ item?: InventoryItem }>).detail
      const item = detail?.item
      if (!item?._id) return
      setItems((current) => current.some((row) => row._id === item._id)
        ? current.map((row) => row._id === item._id ? item : row)
        : [item, ...current])
      setSearch('')
      setCategoryFilter('ALL')
      setStatusFilter('ALL')
      setEditingPrice(false)
      setSelectedItem(item)
    }

    window.addEventListener('phoneflow:open-stock-item', openScannedStock)
    return () => window.removeEventListener('phoneflow:open-stock-item', openScannedStock)
  }, [])

  const phoneCount = items.filter((item) => item.category === 'PHONE').reduce((sum, item) => sum + item.quantity, 0)
  const tabletCount = items.filter((item) => item.category === 'TABLET').reduce((sum, item) => sum + item.quantity, 0)
  const accessoryCount = items.filter((item) => item.category === 'ACCESSORY').reduce((sum, item) => sum + item.quantity, 0)
  const sparePartCount = items.filter((item) => item.category === 'SPARE_PART').reduce((sum, item) => sum + item.quantity, 0)
  const otherCount = items.filter((item) => item.category === 'OTHER').reduce((sum, item) => sum + item.quantity, 0)
  const categoryCounts: Record<InventoryItem['category'], number> = {
    PHONE: phoneCount,
    TABLET: tabletCount,
    ACCESSORY: accessoryCount,
    SPARE_PART: sparePartCount,
    OTHER: otherCount,
  }
  const filteredItems = items.filter((item) => {
    const term = search.trim().toLowerCase()
    const matchesSearch = !term || [item.sku, item.barcode, item.name, item.brand, item.model, item.imei1, item.serialNumber]
      .some((value) => String(value || '').toLowerCase().includes(term))
    return matchesSearch
      && (categoryFilter === 'ALL' || item.category === categoryFilter)
      && (statusFilter === 'ALL' || item.status === statusFilter)
  })

  function changeInventoryView(view: 'large' | 'details') {
    setInventoryView(view)
    localStorage.setItem('phoneflow_inventory_view', view)
  }

  function openPriceEditor() {
    if (!selectedItem) return
    setSellingPriceDraft(String(selectedItem.sellPrice || ''))
    setMinimumPriceDraft(String(selectedItem.minimumSellPrice || ''))
    setEditingPrice(true)
  }

  async function saveSellingPrice() {
    if (!selectedItem) return
    setSavingPrice(true)
    setError('')
    try {
      const result = await api<{ item: InventoryItem }>(`/inventory/${selectedItem._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ sellPrice: Number(sellingPriceDraft || 0), minimumSellPrice: Number(minimumPriceDraft || 0) }),
      })
      setSelectedItem(result.item)
      setItems((current) => current.map((item) => item._id === result.item._id ? result.item : item))
      setEditingPrice(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update selling price')
    } finally {
      setSavingPrice(false)
    }
  }

  function updateInventoryItem(item: InventoryItem) {
    setSelectedItem(item)
    setItems((current) => current.map((row) => row._id === item._id ? item : row))
  }

  async function uploadPhoto(file: File | undefined) {
    if (!selectedItem || !file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Upload a JPEG, PNG, or WebP image')
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      setError('Image must be 4MB or smaller')
      return
    }
    setSavingPhoto(true)
    setError('')
    try {
      const imageData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('Unable to read image file'))
        reader.readAsDataURL(file)
      })
      const result = await api<{ item: InventoryItem }>(`/inventory/${selectedItem._id}/photo`, {
        method: 'POST',
        body: JSON.stringify({ imageData }),
      })
      updateInventoryItem(result.item)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to upload product photo')
    } finally {
      setSavingPhoto(false)
    }
  }

  async function removePhoto() {
    if (!selectedItem) return
    setSavingPhoto(true)
    setError('')
    try {
      const result = await api<{ item: InventoryItem }>(`/inventory/${selectedItem._id}/photo`, { method: 'DELETE' })
      updateInventoryItem(result.item)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to remove product photo')
    } finally {
      setSavingPhoto(false)
    }
  }

  return (
    <>
      <div className="stock-page-heading">
        <SectionHeader
          eyebrow="Stock control"
          title="Stock information"
          description={error || 'Manage serialized phones and quantity-based tablets, accessories, spare parts, and other stock.'}
          action={<div className="section-header-actions">
            <button className="secondary-button" onClick={() => window.dispatchEvent(new Event('phoneflow:open-scanner'))}><ScanLine size={17} /> Scan product</button>
            <button className="primary-button" onClick={() => comingNext('Adjust stock')}><Plus size={17} /> Adjust stock</button>
          </div>}
        />
      </div>
      <section className="stock-category-grid">
        {(Object.keys(categoryMeta) as InventoryItem['category'][]).map((category) => {
          const meta = categoryMeta[category]
          const Icon = meta.Icon
          return (
            <button
              className={`surface-card stock-category ${categoryFilter === category ? 'active' : ''}`}
              key={category}
              onClick={() => setCategoryFilter((current) => current === category ? 'ALL' : category)}
            >
              <span className={`stock-icon ${meta.tone}`}><Icon /></span>
              <p>{meta.label}<strong>{categoryCounts[category]}</strong><small>live stock units</small></p>
              <ArrowUpRight />
            </button>
          )
        })}
      </section>
      <section className="surface-card inventory-catalog-card stock-workspace-card">
        <div className="card-heading table-heading inventory-catalog-heading">
          <div><span className="eyebrow">Item list</span><h3>{categoryFilter === 'ALL' ? 'All shop products' : categoryMeta[categoryFilter as InventoryItem['category']]?.label}</h3></div>
          <div className="inventory-heading-actions">
            <span className="catalog-count">{filteredItems.length} item{filteredItems.length === 1 ? '' : 's'}</span>
            <div className="inventory-view-switcher" role="group" aria-label="Inventory view">
              <button type="button" className={inventoryView === 'large' ? 'active' : ''} onClick={() => changeInventoryView('large')} aria-pressed={inventoryView === 'large'} title="Large icons view"><Grid2X2 size={15} /><span>Large</span></button>
              <button type="button" className={inventoryView === 'details' ? 'active' : ''} onClick={() => changeInventoryView('details')} aria-pressed={inventoryView === 'details'} title="Details view"><List size={16} /><span>Details</span></button>
            </div>
          </div>
        </div>

        <div className="filter-row inventory-filter-row">
          <div className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search SKU, product, IMEI or serial number" /></div>
          <select className="ghost-button filter-select" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Filter inventory category">
            <option value="ALL">All categories</option><option value="PHONE">Phones</option><option value="TABLET">Tablets</option><option value="ACCESSORY">Accessories</option><option value="SPARE_PART">Spare parts</option><option value="OTHER">Other</option>
          </select>
          <select className="ghost-button filter-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter stock status">
            <option value="ALL">All stock statuses</option><option value="IN_STOCK">In stock</option><option value="RESERVED">Reserved</option><option value="SOLD">Sold</option><option value="PAWNED">Pawned</option><option value="REPAIR">Repair</option><option value="ARCHIVED">Archived</option>
          </select>
        </div>

        {inventoryView === 'large' ? (
          <div className="inventory-card-grid">
            {filteredItems.map((item) => (
              <button className="inventory-product-card" key={item._id} onClick={() => setSelectedItem(item)}>
                <InventoryPhoto item={item} size="large" />
                <div>
                  <strong>{item.name}</strong>
                  <small>{inventorySubtitle(item)}</small>
                </div>
                <footer><strong>{money.format(item.sellPrice || item.buyPrice)}</strong><small>{item.quantity} in stock</small></footer>
              </button>
            ))}
            {loading && <LoadingState label="Loading inventory" detail="Reading stock counts and product records…" />}
            {!loading && filteredItems.length === 0 && <p className="mobile-record-empty">{items.length === 0 ? 'No inventory in the database yet.' : 'No matching inventory.'}</p>}
          </div>
        ) : (
          <>
            <div className="table-scroll stock-desktop-table">
              <table>
                <thead><tr><th>SKU</th><th>Item</th><th>Category</th><th>Stock</th><th>Buy price</th><th>Sell price</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {filteredItems.map((row) => (
                    <tr key={row._id}>
                      <td><strong className="mono">{row.sku}</strong></td>
                      <td><div className="inventory-table-item"><InventoryPhoto item={row} size="small" /><p><strong>{row.name}</strong><small>{inventorySubtitle(row)}</small></p></div></td>
                      <td>{titleStatus(row.category)}</td>
                      <td><strong>{row.quantity}</strong></td>
                      <td>{money.format(row.buyPrice)}</td>
                      <td>{money.format(row.sellPrice)}</td>
                      <td><StatusBadge status={row.status} /></td>
                      <td><button className="icon-button" onClick={() => setSelectedItem(row)} aria-label={`View ${row.sku}`}><MoreHorizontal size={18} /></button></td>
                    </tr>
                  ))}
                  {loading && <tr><td colSpan={8}><LoadingState compact label="Loading inventory" detail="Reading stock counts and product records…" /></td></tr>}
                  {!loading && filteredItems.length === 0 && <tr><td colSpan={8}>{items.length === 0 ? 'No inventory in the database yet.' : 'No matching inventory.'}</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="mobile-record-list stock-mobile-list">
              {filteredItems.map((row) => (
                <article className="mobile-record-card" key={row._id}>
                  <div className="mobile-record-heading"><InventoryPhoto item={row} size="small" /><p><strong>{row.name}</strong><small>{row.sku} · {inventorySubtitle(row)}</small></p><StatusBadge status={row.status} /></div>
                  <div className="mobile-record-details">
                    <div><span>Category</span><strong>{titleStatus(row.category)}</strong></div><div><span>In stock</span><strong>{row.quantity}</strong></div><div><span>Sell price</span><strong>{money.format(row.sellPrice)}</strong></div>
                    <button className="icon-button" onClick={() => setSelectedItem(row)} aria-label={`View ${row.sku}`}><MoreHorizontal size={18} /></button>
                  </div>
                </article>
              ))}
              {loading && <LoadingState compact label="Loading inventory" />}
              {!loading && filteredItems.length === 0 && <p className="mobile-record-empty">{items.length === 0 ? 'No inventory in the database yet.' : 'No matching inventory.'}</p>}
            </div>
          </>
        )}
      </section>
      {selectedItem && (
        <div className="modal-backdrop inventory-detail-backdrop" role="presentation">
          <section className="detail-modal inventory-detail-modal surface-card" role="dialog" aria-modal="true" aria-labelledby="stock-detail-title" aria-describedby="stock-detail-description">
            <header className="detail-modal-header">
              <InventoryPhoto item={selectedItem} size="large" />
              <div>
                <span className="eyebrow">Stock record</span>
                <h3 id="stock-detail-title">{selectedItem.name}</h3>
                <p id="stock-detail-description">{selectedItem.sku} · {titleStatus(selectedItem.category)}</p>
              </div>
              <button className="icon-button" onClick={() => { setSelectedItem(null); setEditingPrice(false) }} aria-label="Close details"><X size={18} /></button>
            </header>

            <div className="inventory-detail-body">
              <section className="inventory-detail-group inventory-summary-group" aria-labelledby="inventory-summary-title">
                <div className="inventory-detail-section-heading">
                  <div><span className="eyebrow">Overview</span><h4 id="inventory-summary-title">Stock and pricing</h4></div>
                </div>
                <div className="detail-grid">
                  <div><span>Status</span><strong><StatusBadge status={selectedItem.status} /></strong></div>
                  <div><span>Quantity</span><strong>{selectedItem.quantity}</strong></div>
                  <div><span>Low stock level</span><strong>{selectedItem.reorderLevel}</strong></div>
                  <div><span>Buy price</span><strong>{money.format(selectedItem.buyPrice)}</strong></div>
                  <div><span>Sell price</span><strong>{money.format(selectedItem.sellPrice)}</strong></div>
                  <div><span>Minimum sell</span><strong>{money.format(selectedItem.minimumSellPrice || 0)}</strong></div>
                  <div><span>Barcode</span><strong className="mono">{selectedItem.barcode || selectedItem.sku}</strong></div>
                  <div><span>Source</span><strong>{selectedItem.source ? titleStatus(selectedItem.source) : 'Not recorded'}</strong></div>
                  <div><span>Created</span><strong>{selectedItem.createdAt ? dateText(selectedItem.createdAt) : 'Not recorded'}</strong></div>
                </div>
              </section>

              <section className="inventory-detail-group inventory-information-group" aria-labelledby="inventory-information-title">
                <div className="inventory-detail-section-heading">
                  <div><span className="eyebrow">Information</span><h4 id="inventory-information-title">Product details</h4></div>
                </div>
                <div className="detail-sections">
                <article>
                  <span className="eyebrow">Product</span>
                  <p><strong>{[selectedItem.brand, selectedItem.model].filter(Boolean).join(' ') || selectedItem.name}</strong></p>
                  <p>{[selectedItem.storage, selectedItem.ram && `${selectedItem.ram} RAM`, selectedItem.color, selectedItem.condition && titleStatus(selectedItem.condition)].filter(Boolean).join(' ') || 'No extra product details'}</p>
                  <p>{selectedItem.batteryHealth !== undefined ? `Battery ${selectedItem.batteryHealth}%` : 'Battery not recorded'}</p>
                </article>
                <article>
                  <span className="eyebrow">Identifiers</span>
                  <p><strong>{selectedItem.imei1 || 'No IMEI 1'}</strong></p>
                  <p>{selectedItem.imei2 || 'No IMEI 2'}</p>
                  <p>{selectedItem.serialNumber || 'No serial number'}</p>
                </article>
                <article>
                  <span className="eyebrow">Accessory info</span>
                  <p><strong>{selectedItem.compatibleModels?.length ? selectedItem.compatibleModels.join(', ') : 'No compatible models recorded'}</strong></p>
                  <p>{selectedItem.oemQuality || 'Quality not recorded'}</p>
                  <p>{selectedItem.accessoriesIncluded?.length ? selectedItem.accessoriesIncluded.map(titleStatus).join(', ') : 'Included accessories not recorded'}</p>
                </article>
                <article>
                  <span className="eyebrow">Photo</span>
                  <p><strong>{selectedItem.imageUrl ? 'Product photo added' : 'No product photo'}</strong></p>
                  <p>{selectedItem.imageUrl ? 'Use Change photo below to replace it.' : 'Use Add photo below to upload one.'}</p>
                </article>
                </div>
              </section>

              {editingPrice && <div className="inventory-price-editor">
                <div className="inventory-price-heading"><span className="eyebrow">Inventory pricing</span><h4>Set selling price</h4><p>Changing these values does not modify the original purchase transaction.</p></div>
                <label>Regular selling price<div className="input-prefix"><span>$</span><input autoFocus type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={sellingPriceDraft} onChange={(event) => setSellingPriceDraft(event.target.value)} /></div></label>
                <label>Discount / minimum price<div className="input-prefix"><span>$</span><input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={minimumPriceDraft} onChange={(event) => setMinimumPriceDraft(event.target.value)} /></div></label>
                <div className="inventory-price-actions"><button className="ghost-button" onClick={() => setEditingPrice(false)}>Cancel</button><button className="primary-button" onClick={() => void saveSellingPrice()} disabled={savingPrice}>{savingPrice ? 'Saving...' : 'Save price'}</button></div>
              </div>}

              {selectedItem.notes && (
                <div className="detail-note">
                  <span className="eyebrow">Notes</span>
                  <p>{selectedItem.notes}</p>
                </div>
              )}
            </div>

            <footer className="detail-modal-footer">
              <label className={`secondary-button upload-photo-button ${savingPhoto ? 'disabled' : ''}`}>
                <Package size={16} /> {savingPhoto ? 'Saving photo...' : selectedItem.imageUrl ? 'Change photo' : 'Add photo'}
                <input type="file" accept="image/png,image/jpeg,image/webp" disabled={savingPhoto} onChange={(event) => void uploadPhoto(event.target.files?.[0])} />
              </label>
              {selectedItem.imageUrl && <button className="ghost-button" onClick={() => void removePhoto()} disabled={savingPhoto}>Remove photo</button>}
              {!editingPrice && <button className="primary-button" onClick={openPriceEditor}>{selectedItem.sellPrice > 0 ? 'Change price' : 'Set selling price'}</button>}
              <button className="secondary-button" onClick={() => printInventoryLabel(selectedItem)}><ScanLine size={16} /> Print label</button>
              <button className="ghost-button" onClick={() => { setSelectedItem(null); setEditingPrice(false) }}>Close</button>
            </footer>
          </section>
        </div>
      )}
    </>
  )
}

function DepreciationView({ goTo }: { goTo: (key: NavKey) => void }) {
  const [autoCalculate, setAutoCalculate] = useState(getPawnAutoCalculatePreference)
  const [valuationCurrency, setValuationCurrency] = useState<PawnCurrency>('USD')
  const [marketPrice, setMarketPrice] = useState(500)
  const [ageMonths, setAgeMonths] = useState(12)
  const [condition, setCondition] = useState('good')
  const [batteryHealth, setBatteryHealth] = useState(85)
  const [lockStatus, setLockStatus] = useState('unlocked')
  const [includedAccessories, setIncludedAccessories] = useState<string[]>(['BOX', 'CHARGER', 'CABLE'])
  const [repairCost, setRepairCost] = useState(0)
  const [pawnRate, setPawnRate] = useState(45)
  const exchangeRate = useExchangeRate()

  useEffect(() => {
    const syncPreference = (event: Event) => setAutoCalculate((event as CustomEvent<boolean>).detail)
    window.addEventListener(PAWN_AUTO_CALCULATE_EVENT, syncPreference)
    return () => window.removeEventListener(PAWN_AUTO_CALCULATE_EVENT, syncPreference)
  }, [])

  function changeValuationCurrency(nextCurrency: PawnCurrency) {
    if (nextCurrency === valuationCurrency || !exchangeRate) return
    const convert = (amount: number) => nextCurrency === 'KHR'
      ? Math.round((amount * exchangeRate.usdKhr) / 100) * 100
      : Math.round((amount / exchangeRate.usdKhr) * 100) / 100
    setMarketPrice(convert(marketPrice))
    setRepairCost(convert(repairCost))
    setValuationCurrency(nextCurrency)
  }

  const result = useMemo(() => {
    const conditionRates: Record<string, number> = {
      excellent: 0.05,
      good: 0.12,
      fair: 0.22,
      damaged: 0.4,
    }
    const ageRate = Math.min(Math.max(ageMonths, 0) * 0.0125, 0.5)
    const conditionRate = conditionRates[condition] ?? 0.12
    const batteryRate = batteryHealth >= 85 ? 0 : batteryHealth >= 80 ? 0.04 : batteryHealth >= 70 ? 0.08 : 0.12
    const essentialAccessories = includedAccessories.filter((accessory) => ['BOX', 'CHARGER', 'CABLE'].includes(accessory))
    const accessoryRate = essentialAccessories.length === 0
      ? 0.05
      : !includedAccessories.includes('CHARGER') || !includedAccessories.includes('CABLE')
        ? 0.03
        : !includedAccessories.includes('BOX') ? 0.01 : 0
    const carrierLockRate = lockStatus === 'carrier_locked' ? 0.1 : 0
    const eligible = lockStatus !== 'activation_locked'
    const roundAmount = (amount: number) => valuationCurrency === 'KHR'
      ? Math.round(amount)
      : Math.round((amount + Number.EPSILON) * 100) / 100
    const rawAgeDeduction = marketPrice * ageRate
    const rawConditionDeduction = marketPrice * conditionRate
    const rawBatteryDeduction = marketPrice * batteryRate
    const rawAccessoryDeduction = marketPrice * accessoryRate
    const rawCarrierLockDeduction = marketPrice * carrierLockRate
    const ageDeduction = roundAmount(rawAgeDeduction)
    const conditionDeduction = roundAmount(rawConditionDeduction)
    const batteryDeduction = roundAmount(rawBatteryDeduction)
    const accessoryDeduction = roundAmount(rawAccessoryDeduction)
    const carrierLockDeduction = roundAmount(rawCarrierLockDeduction)
    const calculatedEstimatedValue = roundAmount(eligible
      ? Math.max(marketPrice - rawAgeDeduction - rawConditionDeduction - rawBatteryDeduction - rawAccessoryDeduction - rawCarrierLockDeduction - Math.max(repairCost, 0), 0)
      : 0)
    const estimatedValue = autoCalculate
      ? calculatedEstimatedValue
      : roundAmount(eligible ? Math.max(marketPrice, 0) : 0)
    const maximumPawn = roundAmount(estimatedValue * (pawnRate / 100))
    return {
      eligible,
      ageRate,
      conditionRate,
      batteryRate,
      ageDeduction,
      conditionDeduction,
      batteryDeduction,
      accessoryDeduction,
      carrierLockDeduction,
      estimatedValue,
      maximumPawn,
      riskReserve: roundAmount(estimatedValue - maximumPawn),
    }
  }, [ageMonths, autoCalculate, batteryHealth, condition, includedAccessories, lockStatus, marketPrice, pawnRate, repairCost, valuationCurrency])

  function toggleAutoCalculate() {
    savePawnAutoCalculatePreference(!autoCalculate)
  }

  function saveValuation() {
    const record = {
      id: `VAL-${Date.now()}`,
      source: 'CALCULATOR',
      calculationMode: autoCalculate ? 'AUTO' : 'MANUAL',
      createdAt: new Date().toISOString(),
      currency: valuationCurrency,
      exchangeRate: valuationCurrency === 'KHR' ? exchangeRate?.usdKhr : 1,
      marketPrice,
      ageMonths,
      condition,
      batteryHealth,
      lockStatus,
      accessoriesIncluded: includedAccessories,
      repairCost,
      pawnRate,
      eligible: result.eligible,
      ageDeduction: result.ageDeduction,
      conditionDeduction: result.conditionDeduction,
      batteryDeduction: result.batteryDeduction,
      accessoryDeduction: result.accessoryDeduction,
      carrierLockDeduction: result.carrierLockDeduction,
      estimatedValue: result.estimatedValue,
      maximumPawn: result.maximumPawn,
      usdKhrRate: exchangeRate?.usdKhr,
    }
    const previous = JSON.parse(localStorage.getItem('phoneflow_valuations') || '[]') as unknown[]
    localStorage.setItem('phoneflow_valuations', JSON.stringify([record, ...previous].slice(0, 50)))
    window.alert('Valuation saved on this device.')
  }

  function useForPawn() {
    const valuation = {
      id: `VAL-${Date.now()}`,
      source: 'CALCULATOR',
      calculationMode: autoCalculate ? 'AUTO' : 'MANUAL',
      createdAt: new Date().toISOString(),
      currency: valuationCurrency,
      exchangeRate: valuationCurrency === 'KHR' ? exchangeRate?.usdKhr : 1,
      marketPrice,
      ageMonths,
      condition,
      batteryHealth,
      lockStatus,
      accessoriesIncluded: includedAccessories,
      repairCost,
      pawnRate,
      eligible: result.eligible,
      ageDeduction: result.ageDeduction,
      conditionDeduction: result.conditionDeduction,
      batteryDeduction: result.batteryDeduction,
      accessoryDeduction: result.accessoryDeduction,
      carrierLockDeduction: result.carrierLockDeduction,
      estimatedValue: result.estimatedValue,
      maximumPawn: result.maximumPawn,
      usdKhrRate: exchangeRate?.usdKhr,
    }
    sessionStorage.setItem('phoneflow_last_valuation', JSON.stringify(valuation))
    goTo('pawn')
    window.dispatchEvent(new CustomEvent('phoneflow:open-pawn', { detail: { valuationId: valuation.id } }))
  }

  return (
    <>
      <div className="depreciation-page-heading">
        <SectionHeader
          eyebrow="Pawn valuation"
          title="Phone pawn offer calculator"
          description="Start with a verified resale price, deduct device risks and costs, then apply the shop's safe lending percentage."
        />
      </div>
      <section className="calculator-layout">
        <article className="surface-card calculator-card">
          <div className="card-heading"><div><span className="eyebrow">Collateral assessment</span><h3>Assess the phone</h3></div><div className="calculation-heading-actions"><button type="button" className={`calculation-mode-toggle ${autoCalculate ? 'active' : ''}`} role="switch" aria-checked={autoCalculate} onClick={toggleAutoCalculate}><span aria-hidden="true" /><strong>Auto calculate</strong><small>{autoCalculate ? 'On' : 'Off'}</small></button><span className="calculator-mark"><Calculator size={20} /></span></div></div>

          <div className="calculator-section">
            <div className="calculator-section-heading"><strong>1. Resale value</strong><small>Use a recent second-hand selling price, not the original retail price.</small></div>
            <div className="form-grid">
              <label><span>Valuation currency</span><select value={valuationCurrency} onChange={(event) => changeValuationCurrency(event.target.value as PawnCurrency)}><option value="USD">USD — US Dollar</option><option value="KHR" disabled={!exchangeRate}>KHR — Cambodian Riel</option></select></label>
              <label><span>Resale value</span><div className="input-prefix"><span>{valuationCurrency}</span><MoneyInput currency={valuationCurrency} value={marketPrice} onValueChange={(value) => setMarketPrice(Number(value))} /></div></label>
              <label><span>Phone age</span><div className="input-suffix"><input type="number" min="0" max="120" value={ageMonths} onChange={(event) => setAgeMonths(Number(event.target.value))} /><span>months</span></div></label>
              <label><span>Physical condition</span><select value={condition} onChange={(event) => setCondition(event.target.value)}><option value="excellent">Excellent / Like new</option><option value="good">Good / Minor wear</option><option value="fair">Fair / Visible wear</option><option value="damaged">Damaged / Repair needed</option></select></label>
              <label><span>Battery health</span><div className="input-suffix"><input type="number" min="0" max="100" value={batteryHealth} onChange={(event) => setBatteryHealth(Math.min(100, Math.max(0, Number(event.target.value))))} /><span>%</span></div></label>
            </div>
          </div>

          <div className="calculator-section">
            <div className="calculator-section-heading"><strong>2. Risk and costs</strong><small>Locked devices and hidden repair costs can remove the shop's safety margin.</small></div>
            <div className="form-grid calculator-risk-grid">
              <label><span>Lock status</span><select value={lockStatus} onChange={(event) => setLockStatus(event.target.value)}><option value="unlocked">Unlocked / IMEI clear</option><option value="carrier_locked">Carrier locked (-10%)</option><option value="activation_locked">Activation or iCloud locked</option></select></label>
              <fieldset className="calculator-accessories"><legend>Included accessories</legend><div>{['BOX', 'CHARGER', 'CABLE', 'CASE', 'EARPHONES'].map((accessory) => <label key={accessory}><input type="checkbox" checked={includedAccessories.includes(accessory)} onChange={(event) => setIncludedAccessories((current) => event.target.checked ? [...current, accessory] : current.filter((item) => item !== accessory))} />{accessory.charAt(0) + accessory.slice(1).toLowerCase()}</label>)}</div><small>{result.accessoryDeduction > 0 ? `${pawnMoney(result.accessoryDeduction, valuationCurrency)} accessory deduction` : 'No accessory deduction'}</small></fieldset>
              <label><span>Estimated repair cost</span><div className="input-prefix"><span>{valuationCurrency}</span><MoneyInput currency={valuationCurrency} value={repairCost} onValueChange={(value) => setRepairCost(Number(value))} /></div></label>
            </div>
          </div>

          <div className="pawn-policy-control">
            <div><strong>3. Shop lending policy</strong><small>Keep enough resale value in reserve for price changes, storage time, and collection risk.</small></div>
            <label><div className="range-label"><div className="pawn-rate-value"><strong>{pawnRate}%</strong><span>Loan-to-value</span></div><small>Recommended: 40-50%</small></div><input className="range-input" type="range" min="40" max="50" value={pawnRate} onChange={(event) => setPawnRate(Number(event.target.value))} /></label>
          </div>
          <div className={`notice-box ${result.eligible ? '' : 'danger'}`}><AlertTriangle size={18} /><p><strong>{result.eligible ? 'Physical inspection is still required' : 'Do not accept this phone as collateral'}</strong><span>{result.eligible ? 'Confirm IMEI ownership, display, cameras, speakers, charging, Face ID or fingerprint, and repair estimate before approval.' : 'Activation-locked or iCloud-locked phones should have no pawn value until the owner removes the lock in front of staff.'}</span></p></div>
        </article>

        <article className={`surface-card valuation-result-card ${result.eligible ? '' : 'valuation-ineligible'}`}>
          <div className="valuation-result-heading"><span className="eyebrow">{autoCalculate ? 'Recommended offer' : 'Manual offer'}</span><span className={`valuation-status ${result.eligible ? 'eligible' : 'blocked'}`}>{result.eligible ? 'Eligible' : 'Blocked'}</span></div>
          <div className="valuation-hero">
            <small>{result.eligible ? autoCalculate ? 'Maximum pawn principal' : 'Manual maximum principal' : 'Offer unavailable'}</small>
            <strong>{result.eligible ? pawnMoney(result.maximumPawn, valuationCurrency) : pawnMoney(0, valuationCurrency)}</strong>
            <div className="khr-equivalent">
              {result.eligible ? exchangeRate ? pawnEquivalentText(result.maximumPawn, valuationCurrency, exchangeRate) : 'Loading exchange rate...' : 'Remove activation lock before valuation'}
            </div>
            <span>{result.eligible ? `${pawnRate}% of ${autoCalculate ? 'adjusted' : 'manually entered'} resale value` : 'Activation lock failed the eligibility check'}</span>
            {exchangeRate && (
              <span className="exchange-rate-source">
                1 USD = {riel.format(exchangeRate.usdKhr)} KHR - {exchangeRate.source === 'ABA PayWay' ? `ABA PayWay ${exchangeRate.side || 'bank'} rate` : 'ABA configured fallback'}
              </span>
            )}
          </div>
          {autoCalculate && <div className="calculation-breakdown">
            <div><span>Resale value</span><strong>{pawnMoney(marketPrice, valuationCurrency)}</strong></div>
            <div><span>Age ({Math.round(result.ageRate * 100)}%)</span><strong>-{pawnMoney(result.ageDeduction, valuationCurrency)}</strong></div>
            <div><span>Condition ({Math.round(result.conditionRate * 100)}%)</span><strong>-{pawnMoney(result.conditionDeduction, valuationCurrency)}</strong></div>
            <div><span>Battery ({Math.round(result.batteryRate * 100)}%)</span><strong>-{pawnMoney(result.batteryDeduction, valuationCurrency)}</strong></div>
            <div><span>Lock and accessories</span><strong>-{pawnMoney(result.carrierLockDeduction + result.accessoryDeduction, valuationCurrency)}</strong></div>
            <div><span>Repair cost</span><strong>-{pawnMoney(Math.max(repairCost, 0), valuationCurrency)}</strong></div>
            <div className="estimated-row"><span>{autoCalculate ? 'Estimated resale value' : 'Resale value'}</span><strong>{pawnMoney(result.estimatedValue, valuationCurrency)}</strong></div>
            <div className="reserve-row"><span>Shop risk reserve after loan</span><strong>{pawnMoney(result.riskReserve, valuationCurrency)}</strong></div>
          </div>}
          <button className="primary-button full-width" onClick={useForPawn} disabled={!result.eligible || result.maximumPawn <= 0}><HandCoins size={17} /> Start pawn with this offer</button>
          <button className="ghost-button full-width" onClick={saveValuation}><FileText size={16} /> Save valuation only</button>
        </article>
      </section>
      <section className="surface-card workflow-note valuation-checklist">
        <span className="workflow-note-icon"><ScanLine /></span>
        <div><span className="eyebrow">Before releasing money</span><h3>Complete the acceptance checklist</h3><p>The calculator recommends an amount; staff verification decides whether the phone can be accepted.</p></div>
        <div className="verification-chips"><span>IMEI clear</span><span>Ownership confirmed</span><span>ID optional</span><span>Activation lock off</span><span>Hardware tested</span></div>
      </section>
    </>
  )
}

function CustomersView() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ customers: Customer[] }>('/customers')
      .then((result) => setCustomers(result.customers))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [])

  const filteredCustomers = customers.filter((customer) => {
    const term = search.trim().toLowerCase()
    if (!term) return true
    return [customer.name, customer.phone, customer.nationalIdNumber, customer.address]
      .some((value) => String(value || '').toLowerCase().includes(term))
  })

  return (
    <>
      <div className="customer-page-heading">
        <SectionHeader
          eyebrow="Customer records"
          title="Customer management"
          description={error || 'Customer profiles, National ID records, addresses, notes, and contact details from MongoDB.'}
          action={<button className="primary-button" onClick={() => comingNext('Add customer')}><Plus size={17} /> Add customer</button>}
        />
      </div>
      <article className="surface-card table-card page-table customer-workspace-card">
        <div className="filter-row">
          <div className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer, phone or National ID" /></div>
        </div>
        <div className="table-scroll customer-desktop-table">
          <table>
            <thead><tr><th>Customer</th><th>Phone</th><th>National ID</th><th>Address</th><th>Created</th><th /></tr></thead>
            <tbody>
              {filteredCustomers.map((customer) => (
                <tr key={customer._id}>
                  <td><strong>{customer.name}</strong></td>
                  <td>{customer.phone}</td>
                  <td>{customer.nationalIdNumber || 'Not recorded'}</td>
                  <td>{customer.address || 'Not recorded'}</td>
                  <td>{customer.createdAt ? dateText(customer.createdAt) : 'Not recorded'}</td>
                  <td><button className="icon-button" onClick={() => setSelectedCustomer(customer)} aria-label={`View ${customer.name}`}><MoreHorizontal size={18} /></button></td>
                </tr>
              ))}
              {loading && <tr><td colSpan={6}><LoadingState compact label="Loading customers" detail="Reading customer profiles…" /></td></tr>}
              {!loading && filteredCustomers.length === 0 && <tr><td colSpan={6}>{customers.length === 0 ? 'No customers in the database yet.' : 'No customers match this search.'}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mobile-record-list customer-mobile-list">
          {filteredCustomers.map((customer) => (
            <article className="mobile-record-card customer-mobile-card" key={customer._id}>
              <div className="mobile-record-heading">
                <span className="avatar">{customer.name.slice(0, 2).toUpperCase()}</span>
                <p><strong>{customer.name}</strong><small>{customer.phone || 'No phone recorded'}</small></p>
                <button className="icon-button" onClick={() => setSelectedCustomer(customer)} aria-label={`View ${customer.name}`}><MoreHorizontal size={18} /></button>
              </div>
              <div className="customer-mobile-details">
                <div><span>National ID</span><strong>{customer.nationalIdNumber || 'Not recorded'}</strong></div>
                <div><span>Address</span><strong>{customer.address || 'Not recorded'}</strong></div>
                <span className={customer.nationalIdNumber ? 'verified' : 'unverified'}>{customer.nationalIdNumber ? <><BadgeCheck size={12} /> ID recorded</> : <><AlertTriangle size={12} /> Missing ID</>}</span>
              </div>
            </article>
          ))}
          {loading && <LoadingState compact label="Loading customers" />}
          {!loading && filteredCustomers.length === 0 && <p className="mobile-record-empty">{customers.length === 0 ? 'No customers in the database yet.' : 'No customers match this search.'}</p>}
        </div>
      </article>

      {selectedCustomer && (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelectedCustomer(null)}>
          <section className="detail-modal surface-card" role="dialog" aria-modal="true" aria-labelledby="customer-detail-title" onClick={(event) => event.stopPropagation()}>
            <header className="detail-modal-header">
              <div>
                <span className="eyebrow">Customer record</span>
                <h3 id="customer-detail-title">{selectedCustomer.name}</h3>
                <p>{selectedCustomer.phone}</p>
              </div>
              <button className="icon-button" onClick={() => setSelectedCustomer(null)} aria-label="Close details"><X size={18} /></button>
            </header>
            <div className="detail-grid">
              <div><span>Phone</span><strong>{selectedCustomer.phone}</strong></div>
              <div><span>National ID</span><strong>{selectedCustomer.nationalIdNumber || 'Not recorded'}</strong></div>
              <div><span>Created</span><strong>{selectedCustomer.createdAt ? dateText(selectedCustomer.createdAt) : 'Not recorded'}</strong></div>
              <div><span>Customer ID</span><strong className="mono">{selectedCustomer._id.slice(-8)}</strong></div>
            </div>
            <div className="detail-sections">
              <article>
                <span className="eyebrow">Address</span>
                <p>{selectedCustomer.address || 'No address recorded'}</p>
              </article>
              <article>
                <span className="eyebrow">Notes</span>
                <p>{selectedCustomer.notes || 'No notes recorded'}</p>
              </article>
            </div>
            <footer className="detail-modal-footer">
              <button className="ghost-button" onClick={() => setSelectedCustomer(null)}>Close</button>
            </footer>
          </section>
        </div>
      )}
    </>
  )
}

function overviewKhr(amount: number) {
  return `${riel.format(Math.round(Number(amount) || 0))} KHR`
}

function overviewValueSize(value: string) {
  const length = value.replace(/\s/g, '').length
  if (length >= 15) return 'extra-long'
  if (length >= 11) return 'long'
  return 'standard'
}

function OverviewCurrencyValue({ totals }: { totals: OverviewCurrencyTotals }) {
  const usdValue = money.format(totals.USD)
  const khrValue = overviewKhr(totals.KHR)

  return (
    <span className="overview-currency-value">
      <strong className="overview-responsive-value" data-value-size={overviewValueSize(usdValue)} title={usdValue}>{usdValue}</strong>
      {totals.KHR > 0 && <small className="overview-responsive-value" data-value-size={overviewValueSize(khrValue)} title={khrValue}>{khrValue}</small>}
    </span>
  )
}

function overviewActivityLabel(log: ActivityLog) {
  if (log.entity === 'TRADE' && log.action === 'CREATE') {
    return String(log.details?.type || '').toUpperCase() === 'BUY' ? 'Purchase created' : 'Sale created'
  }
  if (log.entity === 'PAWN' && log.action === 'CREATE') return 'Pawn created'
  if (log.entity === 'PAWN' && log.action === 'REDEEM') return 'Pawn redeemed'
  if (log.entity === 'LOAN' && log.action === 'CREATE') return 'Loan created'
  if (log.action.includes('PAYMENT')) return 'Payment received'
  if (log.entity === 'INVENTORY' && log.action === 'UPDATE') return 'Inventory updated'
  return `${titleStatus(log.entity)} ${titleStatus(log.action).toLowerCase()}`
}

function BusinessPerformanceChart({
  points,
  firstLabel = 'Sales',
  secondLabel = 'Purchases',
  thirdLabel = 'Gross profit',
  ariaLabel = 'Sales, purchases, and gross profit over the selected period',
  emptyTitle = 'No completed transactions',
  emptyDescription = 'Sales and purchases will appear for this period once recorded.',
}: {
  points: BusinessOverviewData['chart']
  firstLabel?: string
  secondLabel?: string
  thirdLabel?: string
  ariaLabel?: string
  emptyTitle?: string
  emptyDescription?: string
}) {
  const width = 960
  const height = 260
  const padding = { top: 22, right: 18, bottom: 42, left: 64 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const values = points.flatMap((point) => [point.sales, point.purchases, point.grossProfit])
  const minimum = Math.min(0, ...values)
  const maximum = Math.max(1, ...values)
  const range = maximum - minimum || 1
  const xAt = (index: number) => padding.left + (points.length <= 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth)
  const yAt = (value: number) => padding.top + ((maximum - value) / range) * plotHeight
  const polyline = (field: 'sales' | 'purchases' | 'grossProfit') => points.map((point, index) => `${xAt(index)},${yAt(point[field])}`).join(' ')
  const labelEvery = Math.max(1, Math.ceil(points.length / 7))
  const hasData = values.some((value) => value !== 0)

  return (
    <div className="overview-chart-wrap">
      <div className="overview-chart-legend" aria-hidden="true">
        <span className="sales">{firstLabel}</span>
        <span className="purchases">{secondLabel}</span>
        <span className="profit">{thirdLabel}</span>
      </div>
      <svg className="overview-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const value = maximum - ratio * range
          const y = padding.top + ratio * plotHeight
          return <g key={ratio}><line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="overview-chart-grid" /><text x={padding.left - 10} y={y + 4} textAnchor="end" className="overview-chart-axis">{money.format(value)}</text></g>
        })}
        {minimum < 0 && <line x1={padding.left} x2={width - padding.right} y1={yAt(0)} y2={yAt(0)} className="overview-chart-zero" />}
        {points.map((point, index) => (index % labelEvery === 0 || index === points.length - 1) && <text key={point.key} x={xAt(index)} y={height - 14} textAnchor="middle" className="overview-chart-axis">{point.label}</text>)}
        {hasData && <>
          <polyline points={polyline('sales')} className="overview-chart-line sales" />
          <polyline points={polyline('purchases')} className="overview-chart-line purchases" />
          <polyline points={polyline('grossProfit')} className="overview-chart-line profit" />
          {points.length <= 12 && points.map((point, index) => (
            <g key={`markers-${point.key}`}>
              <circle cx={xAt(index)} cy={yAt(point.sales)} r="3.5" className="overview-chart-marker sales"><title>{`${point.label}: ${firstLabel.toLowerCase()} ${money.format(point.sales)}`}</title></circle>
              <circle cx={xAt(index)} cy={yAt(point.purchases)} r="3.5" className="overview-chart-marker purchases"><title>{`${point.label}: ${secondLabel.toLowerCase()} ${money.format(point.purchases)}`}</title></circle>
              <circle cx={xAt(index)} cy={yAt(point.grossProfit)} r="3.5" className="overview-chart-marker profit"><title>{`${point.label}: ${thirdLabel.toLowerCase()} ${money.format(point.grossProfit)}`}</title></circle>
            </g>
          ))}
        </>}
      </svg>
      {!hasData && <div className="overview-chart-empty"><BarChart3 size={23} /><strong>{emptyTitle}</strong><span>{emptyDescription}</span></div>}
    </div>
  )
}

function BusinessOverviewView() {
  const now = new Date()
  const todayInput = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const monthStartInput = `${todayInput.slice(0, 8)}01`
  const [period, setPeriod] = useState<BusinessOverviewPeriod>('this_month')
  const [customFrom, setCustomFrom] = useState(monthStartInput)
  const [customTo, setCustomTo] = useState(todayInput)
  const [data, setData] = useState<BusinessOverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (period === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return
    const query = new URLSearchParams({ period })
    if (period === 'custom') {
      query.set('from', customFrom)
      query.set('to', customTo)
    }
    setLoading(true)
    setError('')
    api<BusinessOverviewData>(`/business-overview?${query.toString()}`)
      .then(setData)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [period, customFrom, customTo])

  const periodLabel = data?.period.label || 'This Month'
  const salesRevenueValue = money.format(data?.financial.salesRevenue || 0)
  const purchasesValue = money.format(data?.financial.purchases || 0)
  const grossProfitValue = money.format(data?.financial.grossProfit || 0)
  const stockValue = money.format(data?.inventory.costValue || 0)
  const periodOptions: Array<{ value: BusinessOverviewPeriod; label: string }> = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'last_7_days', label: 'Last 7 Days' },
    { value: 'last_30_days', label: 'Last 30 Days' },
    { value: 'this_month', label: 'This Month' },
    { value: 'last_month', label: 'Last Month' },
    { value: 'this_year', label: 'This Year' },
    { value: 'custom', label: 'Custom Range' },
  ]

  if (loading && !data) {
    return (
      <>
        <SectionHeader eyebrow="Owner overview" title="Business Overview" description="Quick snapshot of sales, purchases, profit, pawn, loans, and inventory." />
        <section className="surface-card"><LoadingState label="Loading business overview" detail="Calculating business totals and current snapshots…" /></section>
      </>
    )
  }

  return (
    <div className="business-overview-page">
      <SectionHeader
        eyebrow="Owner overview"
        title="Business Overview"
        description="Quick snapshot of sales, purchases, profit, pawn, loans, and inventory."
        action={(
          <div className="overview-period-controls">
            <label><span>Period</span><select value={period} onChange={(event) => setPeriod(event.target.value as BusinessOverviewPeriod)}>{periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            {period === 'custom' && <><label><span>From</span><input type="date" value={customFrom} max={customTo || undefined} onChange={(event) => setCustomFrom(event.target.value)} /></label><label><span>To</span><input type="date" value={customTo} min={customFrom || undefined} onChange={(event) => setCustomTo(event.target.value)} /></label></>}
          </div>
        )}
      />
      {error && <p className="overview-error"><AlertTriangle size={16} />{error}</p>}

      <section className="overview-kpi-grid" aria-label="Business summary">
        <article className="surface-card overview-kpi-card"><span className="metric-icon tone-violet"><CircleDollarSign size={21} /></span><div><p>Sales Revenue</p><h3 className="overview-responsive-value" data-value-size={overviewValueSize(salesRevenueValue)} title={salesRevenueValue}>{salesRevenueValue}</h3><small>{periodLabel}</small></div></article>
        <article className="surface-card overview-kpi-card"><span className="metric-icon tone-orange"><Banknote size={21} /></span><div><p>Purchases</p><h3 className="overview-responsive-value" data-value-size={overviewValueSize(purchasesValue)} title={purchasesValue}>{purchasesValue}</h3><small>{periodLabel}</small></div></article>
        <article className="surface-card overview-kpi-card"><span className="metric-icon tone-blue"><TrendingDown size={21} /></span><div><p>Gross Profit</p><h3 className={`overview-responsive-value ${(data?.financial.grossProfit || 0) < 0 ? 'negative' : ''}`} data-value-size={overviewValueSize(grossProfitValue)} title={grossProfitValue}>{grossProfitValue}</h3><small>{periodLabel} · after COGS</small></div></article>
        <article className="surface-card overview-kpi-card"><span className="metric-icon tone-blue"><HandCoins size={21} /></span><div><p>Pawn Outstanding</p><OverviewCurrencyValue totals={data?.pawn.outstandingPrincipal || { USD: 0, KHR: 0 }} /><small>Current snapshot</small></div></article>
        <article className="surface-card overview-kpi-card"><span className="metric-icon tone-rose"><Boxes size={21} /></span><div><p>Stock Value</p><h3 className="overview-responsive-value" data-value-size={overviewValueSize(stockValue)} title={stockValue}>{stockValue}</h3><small>Current cost value</small></div></article>
      </section>

      <section className="surface-card overview-performance-card">
        <div className="card-heading"><div><span className="eyebrow">{periodLabel}</span><h3>Business Performance</h3><p>Completed sales, purchases, and gross profit over time.</p></div>{loading && <RefreshCcw className="overview-refreshing" size={18} />}</div>
        <BusinessPerformanceChart points={data?.chart || []} />
      </section>

      <section className="overview-snapshot-grid">
        <article className="surface-card overview-snapshot-card">
          <div className="card-heading"><div><span className="eyebrow">Current</span><h3>Pawn & Loan Snapshot</h3><p>Open contracts and remaining balances right now.</p></div><WalletCards size={20} /></div>
          <div className="overview-finance-snapshots">
            <div className="overview-snapshot-group"><div className="overview-snapshot-title"><span className="transaction-icon sale"><HandCoins size={17} /></span><strong>Pawn contracts</strong></div><dl><div><dt>Active</dt><dd>{data?.pawn.active || 0}</dd></div><div><dt>Due soon</dt><dd>{data?.pawn.dueSoon || 0}</dd></div><div><dt>Overdue</dt><dd className={(data?.pawn.overdue || 0) > 0 ? 'danger' : ''}>{data?.pawn.overdue || 0}</dd></div><div className="total"><dt>Outstanding principal</dt><dd><OverviewCurrencyValue totals={data?.pawn.outstandingPrincipal || { USD: 0, KHR: 0 }} /></dd></div></dl></div>
            <div className="overview-snapshot-group"><div className="overview-snapshot-title"><span className="transaction-icon purchase"><Banknote size={17} /></span><strong>Money loans</strong></div><dl><div><dt>Active</dt><dd>{data?.loans.active || 0}</dd></div><div><dt>Due soon</dt><dd>{data?.loans.dueSoon || 0}</dd></div><div><dt>Overdue</dt><dd className={(data?.loans.overdue || 0) > 0 ? 'danger' : ''}>{data?.loans.overdue || 0}</dd></div><div className="total"><dt>Outstanding balance</dt><dd><OverviewCurrencyValue totals={data?.loans.outstandingBalance || { USD: 0, KHR: 0 }} /></dd></div></dl></div>
          </div>
        </article>

        <article className="surface-card overview-snapshot-card inventory-overview-card">
          <div className="card-heading"><div><span className="eyebrow">Current</span><h3>Inventory Snapshot</h3><p>Shop-owned products that are available now.</p></div><Package size={20} /></div>
          <div className="overview-inventory-stats">
            <div><span>In-stock units</span><strong>{data?.inventory.inStockCount || 0}</strong><small>{data?.inventory.productCount || 0} product records</small></div>
            <div><span>Phones / tablets</span><strong>{(data?.inventory.phoneCount || 0) + (data?.inventory.tabletCount || 0)}</strong><small>{data?.inventory.phoneCount || 0} phones</small></div>
            <div><span>Accessories / parts</span><strong>{(data?.inventory.accessoryCount || 0) + (data?.inventory.sparePartCount || 0)}</strong><small>{data?.inventory.sparePartCount || 0} spare parts</small></div>
            <div><span>Low stock</span><strong className={(data?.inventory.lowStockCount || 0) > 0 ? 'danger' : ''}>{data?.inventory.lowStockCount || 0}</strong><small>at or below reorder level</small></div>
            <div><span>Cost value</span><strong>{money.format(data?.inventory.costValue || 0)}</strong><small>current stock cost</small></div>
            <div><span>Potential retail</span><strong>{money.format(data?.inventory.retailValue || 0)}</strong><small>before discounts</small></div>
          </div>
          {(data?.inventory.lowStockItems.length || 0) > 0 && <div className="overview-low-stock"><span className="eyebrow">Needs attention</span>{data?.inventory.lowStockItems.map((item) => <div key={item._id}><p><strong>{item.name}</strong><small>{item.sku} · {titleStatus(item.category)}</small></p><span>{item.quantity} / {item.reorderLevel}</span></div>)}</div>}
        </article>
      </section>

      <section className="overview-recent-grid">
        <article className="surface-card table-card overview-transactions-card">
          <div className="card-heading table-heading"><div><span className="eyebrow">{periodLabel}</span><h3>Recent Transactions</h3><p>Latest purchases and sales in the selected period.</p></div></div>
          <div className="table-scroll report-desktop-table"><table><thead><tr><th>Reference</th><th>Type</th><th>Customer / Supplier</th><th>Amount</th><th>Payment</th><th>Status</th><th>Date</th></tr></thead><tbody>{(data?.recentTransactions || []).map((trade) => <tr key={trade._id}><td><strong className="mono">{trade.tradeNo}</strong></td><td><StatusBadge status={trade.type === 'SELL' ? 'Sale' : 'Purchase'} /></td><td>{tradePartyName(trade)}</td><td>{tradeTransactionMoney(trade, trade.transactionTotal, trade.total)}</td><td>{titleStatus(trade.paymentMethod)}</td><td><StatusBadge status={trade.status} /></td><td>{dateText(trade.purchaseDate || trade.createdAt)}</td></tr>)}{data?.recentTransactions.length === 0 && <tr><td colSpan={7}>No transactions in this period.</td></tr>}</tbody></table></div>
          <div className="mobile-record-list report-mobile-list">{(data?.recentTransactions || []).map((trade) => <article className="mobile-record-card" key={trade._id}><div className="mobile-record-heading"><span className={`transaction-icon ${trade.type === 'SELL' ? 'sale' : 'purchase'}`}><Banknote size={17} /></span><p><strong>{tradePartyName(trade)}</strong><small>{trade.tradeNo}</small></p><StatusBadge status={trade.type === 'SELL' ? 'Sale' : 'Purchase'} /></div><div className="mobile-record-details overview-transaction-details"><div><span>Amount</span><strong>{tradeTransactionMoney(trade, trade.transactionTotal, trade.total)}</strong></div><div><span>Payment</span><strong>{titleStatus(trade.paymentMethod)}</strong></div><div><span>Date</span><strong>{dateText(trade.purchaseDate || trade.createdAt)}</strong></div><StatusBadge status={trade.status} /></div></article>)}{data?.recentTransactions.length === 0 && <p className="mobile-record-empty">No transactions in this period.</p>}</div>
        </article>

        <article className="surface-card table-card overview-activity-card">
          <div className="card-heading table-heading"><div><span className="eyebrow">Latest changes</span><h3>Recent Activity</h3><p>Important shop actions recorded by staff.</p></div></div>
          <div className="transaction-list">{(data?.recentActivity || []).map((log) => <div className="transaction-row" key={log._id}><span className="transaction-icon sale"><FileText /></span><p><strong>{overviewActivityLabel(log)}</strong><small>{log.user?.name || 'System'} · {dateText(log.createdAt)}</small></p></div>)}{data?.recentActivity.length === 0 && <div className="transaction-row"><p><strong>No recent activity</strong><small>Important actions will appear here.</small></p></div>}</div>
        </article>
      </section>
    </div>
  )
}

const reportSections = [
  { slug: 'sales', title: 'Sales', description: 'Revenue, COGS, gross profit, items sold', icon: CircleDollarSign, tone: 'violet' },
  { slug: 'purchases', title: 'Purchases', description: 'Purchases from suppliers and customers, and total cost', icon: ShoppingCart, tone: 'orange' },
  { slug: 'inventory', title: 'Inventory', description: 'Stock quantity, cost value, retail value, and low stock', icon: Boxes, tone: 'blue' },
  { slug: 'pawns', title: 'Pawn', description: 'Outstanding principal, overdue, redeemed, and forfeited', icon: HandCoins, tone: 'violet' },
  { slug: 'loans', title: 'Loans', description: 'Outstanding loans, repayments, and overdue balances', icon: WalletCards, tone: 'blue' },
  { slug: 'payments', title: 'Payments', description: 'Cash, KHQR, bank, card, and daily closing', icon: Banknote, tone: 'rose' },
  { slug: 'activity', title: 'Activity', description: 'Staff actions and audit history', icon: FileText, tone: 'orange' },
] as const

function ReportLanding({ navigate }: { navigate: (path: string) => void }) {
  return (
    <div className="reports-hub-page">
      <SectionHeader eyebrow="Finance & control" title="Reports & Analytics" description="Choose a focused report to review business performance and operational history." />
      <section className="report-hub-grid" aria-label="Available reports">
        {reportSections.map(({ slug, title, description, icon: Icon, tone }) => (
          <button type="button" className="surface-card report-hub-card" key={slug} onClick={() => navigate(`/reports/${slug}`)}>
            <span className={`metric-icon tone-${tone}`}><Icon size={21} /></span>
            <span className="report-hub-copy"><strong>{title}</strong><small>{description}</small></span>
            <ArrowUpRight size={18} />
          </button>
        ))}
      </section>
      <p className="report-hub-note"><AlertTriangle size={15} />Exports will be added only after all report calculations and workflows are verified.</p>
    </div>
  )
}

function UpcomingReportView({ slug, navigate }: { slug: string; navigate: (path: string) => void }) {
  const report = reportSections.find((item) => item.slug === slug)
  const Icon = report?.icon || FileText
  return (
    <div className="reports-placeholder-page">
      <SectionHeader eyebrow="Reports & analytics" title={`${report?.title || 'Report'} Report`} description={report?.description || 'This report is planned for a later step.'} action={<button className="ghost-button" onClick={() => navigate('/reports')}>Back to reports</button>} />
      <section className="surface-card report-placeholder-card"><span className="metric-icon tone-violet"><Icon size={24} /></span><h3>Report not found</h3><p>Return to Reports & Analytics and choose one of the available report cards.</p></section>
    </div>
  )
}

function SalesReportView({ navigate }: { navigate: (path: string) => void }) {
  const now = new Date()
  const todayInput = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const [period, setPeriod] = useState<BusinessOverviewPeriod>('this_month')
  const [customFrom, setCustomFrom] = useState(`${todayInput.slice(0, 8)}01`)
  const [customTo, setCustomTo] = useState(todayInput)
  const [paymentMethod, setPaymentMethod] = useState('ALL')
  const [status, setStatus] = useState('COMPLETED')
  const [staff, setStaff] = useState('ALL')
  const [data, setData] = useState<SalesReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (period === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return
    const query = new URLSearchParams({ period, paymentMethod, status, staff })
    if (period === 'custom') {
      query.set('from', customFrom)
      query.set('to', customTo)
    }
    setLoading(true)
    setError('')
    api<SalesReportData>(`/reports/sales?${query.toString()}`)
      .then(setData)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [period, customFrom, customTo, paymentMethod, status, staff])

  const periodOptions: Array<{ value: BusinessOverviewPeriod; label: string }> = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'last_7_days', label: '7 Days' },
    { value: 'last_30_days', label: '30 Days' },
    { value: 'this_month', label: 'This Month' },
    { value: 'last_month', label: 'Last Month' },
    { value: 'this_year', label: 'This Year' },
    { value: 'custom', label: 'Custom' },
  ]
  const chartPoints: BusinessOverviewData['chart'] = (data?.chart || []).map((point) => ({
    key: point.key,
    label: point.label,
    sales: point.sales,
    purchases: point.cogs,
    grossProfit: point.grossProfit,
  }))
  const maxPayment = Math.max(1, ...(data?.payments || []).map((payment) => Math.abs(payment.amount)))
  const salesKpis: Array<{ label: string; value: string; icon: LucideIcon; tone: string }> = [
    { label: 'Sales Revenue', value: money.format(data?.summary.salesRevenue || 0), icon: CircleDollarSign, tone: 'violet' },
    { label: 'Cost of Goods Sold', value: money.format(data?.summary.cogs || 0), icon: Boxes, tone: 'orange' },
    { label: 'Gross Profit', value: money.format(data?.summary.grossProfit || 0), icon: BarChart3, tone: 'blue' },
    { label: 'Items Sold', value: String(data?.summary.itemsSold || 0), icon: Package, tone: 'rose' },
    { label: 'Transactions', value: String(data?.summary.transactions || 0), icon: FileText, tone: 'violet' },
    { label: 'Average Sale', value: money.format(data?.summary.averageSale || 0), icon: Banknote, tone: 'blue' },
  ]

  if (loading && !data) {
    return <><SectionHeader eyebrow="Reports & analytics" title="Sales Report" description="Calculating revenue, cost, profit, products, and payment performance." /><section className="surface-card"><LoadingState label="Loading sales report" detail="Reading completed sales and stored item costs…" /></section></>
  }

  return (
    <div className="sales-report-page">
      <SectionHeader eyebrow="Reports & analytics" title="Sales Report" description="Revenue, cost of goods sold, gross profit, products, and payment performance." action={<button className="ghost-button" onClick={() => navigate('/reports')}>Back to reports</button>} />

      <section className="surface-card sales-report-filters" aria-label="Sales report filters">
        <label><span>Period</span><select value={period} onChange={(event) => setPeriod(event.target.value as BusinessOverviewPeriod)}>{periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        {period === 'custom' && <><label><span>From</span><input type="date" value={customFrom} max={customTo || undefined} onChange={(event) => setCustomFrom(event.target.value)} /></label><label><span>To</span><input type="date" value={customTo} min={customFrom || undefined} onChange={(event) => setCustomTo(event.target.value)} /></label></>}
        <label><span>Payment method</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="ALL">All methods</option><option value="CASH">Cash</option><option value="KHQR">KHQR</option><option value="BANK">Bank</option><option value="CARD">Card</option></select></label>
        <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="COMPLETED">Completed</option><option value="RETURNED">Returned</option><option value="CANCELLED">Cancelled</option></select></label>
        <label><span>Staff</span><select value={staff} onChange={(event) => setStaff(event.target.value)}><option value="ALL">All staff</option>{(data?.staff || []).map((person) => <option key={person._id} value={person._id}>{person.name}</option>)}</select></label>
        {loading && <RefreshCcw className="overview-refreshing" size={17} aria-label="Refreshing report" />}
      </section>
      {error && <p className="overview-error"><AlertTriangle size={16} />{error}</p>}

      <section className="sales-report-kpis" aria-label="Sales report summary">
        {salesKpis.map(({ label, value, icon: Icon, tone }) => <article className="surface-card sales-report-kpi" key={label}><span className={`metric-icon tone-${tone}`}><Icon size={20} /></span><div><p>{label}</p><h3>{value}</h3><small>{data?.period.label || 'This Month'} · {titleStatus(status)}</small></div></article>)}
      </section>

      <section className="surface-card overview-performance-card sales-performance-card">
        <div className="card-heading"><div><span className="eyebrow">{data?.period.label || 'This Month'}</span><h3>Sales & Profit</h3><p>Revenue, cost of goods sold, and gross profit over time.</p></div></div>
        <BusinessPerformanceChart points={chartPoints} secondLabel="COGS" ariaLabel="Sales revenue, cost of goods sold, and gross profit over the selected period" />
      </section>

      <section className="surface-card table-card sales-report-table-card">
        <div className="card-heading table-heading"><div><span className="eyebrow">Transaction detail</span><h3>Sales Transactions</h3><p>{data?.limited ? `Showing the latest 500 of ${data.totalRecords} matching sales.` : `${data?.totalRecords || 0} matching sales.`}</p></div></div>
        <div className="table-scroll sales-report-desktop-table"><table><thead><tr><th>Date</th><th>Sale #</th><th>Customer</th><th>Items</th><th>Subtotal</th><th>Discount</th><th>Total</th><th>Cost</th><th>Gross Profit</th><th>Payment</th><th>Staff</th><th>Status</th></tr></thead><tbody>
          {(data?.transactions || []).map((trade) => <tr key={trade._id}><td>{dateText(trade.createdAt)}</td><td><strong className="mono">{trade.tradeNo}</strong></td><td>{trade.customer?.name || 'Walk-in customer'}</td><td><span className="sales-items-cell">{trade.reportItems ?? trade.items.reduce((sum, item) => sum + item.quantity, 0)}<small>{trade.items.map((item) => `${item.name} ×${item.quantity}`).join(', ')}</small></span></td><td>{money.format(trade.subtotal)}</td><td>{money.format(trade.discount)}</td><td><strong>{money.format(trade.reportTotal ?? trade.total)}</strong></td><td>{money.format(trade.reportCost || 0)}</td><td className={(trade.reportGrossProfit || 0) < 0 ? 'report-negative' : 'report-positive'}>{money.format(trade.reportGrossProfit || 0)}</td><td>{titleStatus(trade.paymentMethod)}</td><td>{trade.createdBy?.name || 'Unknown'}</td><td><StatusBadge status={trade.status} /></td></tr>)}
          {data?.transactions.length === 0 && <tr><td colSpan={12}>No sales match these filters.</td></tr>}
        </tbody></table></div>
        <div className="sales-report-mobile-list">{(data?.transactions || []).map((trade) => <article key={trade._id}><header><div><strong>{trade.tradeNo}</strong><small>{dateText(trade.createdAt)} · {trade.customer?.name || 'Walk-in customer'}</small></div><StatusBadge status={trade.status} /></header><div><span>Total<strong>{money.format(trade.reportTotal ?? trade.total)}</strong></span><span>Cost<strong>{money.format(trade.reportCost || 0)}</strong></span><span>Gross profit<strong className={(trade.reportGrossProfit || 0) < 0 ? 'report-negative' : 'report-positive'}>{money.format(trade.reportGrossProfit || 0)}</strong></span><span>Payment<strong>{titleStatus(trade.paymentMethod)}</strong></span></div><p>{trade.items.map((item) => `${item.name} ×${item.quantity}`).join(', ')}</p></article>)}{data?.transactions.length === 0 && <p className="mobile-record-empty">No sales match these filters.</p>}</div>
      </section>

      <section className="sales-report-lower-grid">
        <article className="surface-card table-card product-performance-card"><div className="card-heading table-heading"><div><span className="eyebrow">Product performance</span><h3>Top Products</h3><p>Revenue is allocated after transaction discounts.</p></div></div><div className="table-scroll"><table><thead><tr><th>Product</th><th>Items</th><th>Revenue</th><th>Cost</th><th>Gross Profit</th></tr></thead><tbody>{(data?.products || []).map((product) => <tr key={product.name}><td><strong>{product.name}</strong></td><td>{product.quantity}</td><td>{money.format(product.revenue)}</td><td>{money.format(product.cogs)}</td><td className={product.grossProfit < 0 ? 'report-negative' : 'report-positive'}>{money.format(product.grossProfit)}</td></tr>)}{data?.products.length === 0 && <tr><td colSpan={5}>No product performance for these filters.</td></tr>}</tbody></table></div></article>
        <article className="surface-card payment-breakdown-card"><div className="card-heading"><div><span className="eyebrow">Payment breakdown</span><h3>Payment Methods</h3><p>Transaction totals by recorded payment method.</p></div></div><div className="payment-breakdown-list">{(data?.payments || []).map((payment) => <div key={payment.method}><header><span>{titleStatus(payment.method)}<small>{payment.transactions} transactions</small></span><strong>{money.format(payment.amount)}</strong></header><i><span style={{ width: `${Math.max(3, (Math.abs(payment.amount) / maxPayment) * 100)}%` }} /></i></div>)}{data?.payments.length === 0 && <p>No payment data for these filters.</p>}</div></article>
      </section>
    </div>
  )
}

function PurchasesReportView({ navigate }: { navigate: (path: string) => void }) {
  const now = new Date()
  const todayInput = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const [period, setPeriod] = useState<BusinessOverviewPeriod>('this_month')
  const [customFrom, setCustomFrom] = useState(`${todayInput.slice(0, 8)}01`)
  const [customTo, setCustomTo] = useState(todayInput)
  const [source, setSource] = useState('ALL')
  const [paymentMethod, setPaymentMethod] = useState('ALL')
  const [paymentStatus, setPaymentStatus] = useState('ALL')
  const [status, setStatus] = useState('COMPLETED')
  const [staff, setStaff] = useState('ALL')
  const [data, setData] = useState<PurchaseReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (period === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return
    const query = new URLSearchParams({ period, source, paymentMethod, paymentStatus, status, staff })
    if (period === 'custom') {
      query.set('from', customFrom)
      query.set('to', customTo)
    }
    setLoading(true)
    setError('')
    api<PurchaseReportData>(`/reports/purchases?${query.toString()}`)
      .then(setData)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [period, customFrom, customTo, source, paymentMethod, paymentStatus, status, staff])

  const periodOptions: Array<{ value: BusinessOverviewPeriod; label: string }> = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'last_7_days', label: '7 Days' },
    { value: 'last_30_days', label: '30 Days' },
    { value: 'this_month', label: 'This Month' },
    { value: 'last_month', label: 'Last Month' },
    { value: 'this_year', label: 'This Year' },
    { value: 'custom', label: 'Custom' },
  ]
  const chartPoints: BusinessOverviewData['chart'] = (data?.chart || []).map((point) => ({
    key: point.key,
    label: point.label,
    sales: point.total,
    purchases: point.paid,
    grossProfit: point.balance,
  }))
  const maxPayment = Math.max(1, ...(data?.payments || []).map((payment) => Math.abs(payment.amount)))
  const maxSource = Math.max(1, ...(data?.sources || []).map((item) => Math.abs(item.amount)))
  const purchaseKpis: Array<{ label: string; value: string; icon: LucideIcon; tone: string; detail: string }> = [
    { label: 'Total Purchases', value: money.format(data?.summary.totalPurchases || 0), icon: ShoppingCart, tone: 'orange', detail: 'Normalized purchase cost' },
    { label: 'Amount Paid', value: money.format(data?.summary.amountPaid || 0), icon: Banknote, tone: 'blue', detail: 'Paid to sellers' },
    { label: 'Outstanding', value: money.format(data?.summary.outstandingBalance || 0), icon: WalletCards, tone: 'rose', detail: 'Still payable' },
    { label: 'Items Purchased', value: String(data?.summary.itemsPurchased || 0), icon: Package, tone: 'violet', detail: 'Stock units acquired' },
    { label: 'Transactions', value: String(data?.summary.transactions || 0), icon: FileText, tone: 'blue', detail: 'Matching purchases' },
    { label: 'Average Purchase', value: money.format(data?.summary.averagePurchase || 0), icon: Calculator, tone: 'violet', detail: 'Per transaction' },
  ]

  if (loading && !data) {
    return <><SectionHeader eyebrow="Reports & analytics" title="Purchases Report" description="Calculating purchase costs, payments, sellers, and product volume." /><section className="surface-card"><LoadingState label="Loading purchases report" detail="Reading purchase transactions and normalized currency totals…" /></section></>
  }

  return (
    <div className="sales-report-page purchases-report-page">
      <SectionHeader eyebrow="Reports & analytics" title="Purchases Report" description="Purchase cost, stock acquired, seller sources, balances, and payment performance." action={<button className="ghost-button" onClick={() => navigate('/reports')}>Back to reports</button>} />

      <section className="surface-card sales-report-filters purchases-report-filters" aria-label="Purchases report filters">
        <label><span>Period</span><select value={period} onChange={(event) => setPeriod(event.target.value as BusinessOverviewPeriod)}>{periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        {period === 'custom' && <><label><span>From</span><input type="date" value={customFrom} max={customTo || undefined} onChange={(event) => setCustomFrom(event.target.value)} /></label><label><span>To</span><input type="date" value={customTo} min={customFrom || undefined} onChange={(event) => setCustomTo(event.target.value)} /></label></>}
        <label><span>Seller source</span><select value={source} onChange={(event) => setSource(event.target.value)}><option value="ALL">All sources</option><option value="SUPPLIER">Suppliers</option><option value="CUSTOMER">Customers</option><option value="WALK_IN">Walk-in sellers</option><option value="LEGACY">Legacy records</option></select></label>
        <label><span>Payment method</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="ALL">All methods</option><option value="CASH">Cash</option><option value="KHQR">KHQR</option><option value="BANK">Bank</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label>
        <label><span>Payment status</span><select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)}><option value="ALL">All payment statuses</option><option value="PAID">Paid</option><option value="PARTIAL">Partially paid</option><option value="UNPAID">Unpaid</option></select></label>
        <label><span>Purchase status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option><option value="COMPLETED">Completed</option><option value="RETURNED">Returned</option><option value="CANCELLED">Cancelled</option></select></label>
        <label><span>Staff</span><select value={staff} onChange={(event) => setStaff(event.target.value)}><option value="ALL">All staff</option>{(data?.staff || []).map((person) => <option key={person._id} value={person._id}>{person.name}</option>)}</select></label>
        {loading && <RefreshCcw className="overview-refreshing" size={17} aria-label="Refreshing report" />}
      </section>
      {error && <p className="overview-error"><AlertTriangle size={16} />{error}</p>}

      <section className="sales-report-kpis" aria-label="Purchases report summary">
        {purchaseKpis.map(({ label, value, icon: Icon, tone, detail }) => <article className="surface-card sales-report-kpi" key={label}><span className={`metric-icon tone-${tone}`}><Icon size={20} /></span><div><p>{label}</p><h3>{value}</h3><small>{detail} · {data?.period.label || 'This Month'}</small></div></article>)}
      </section>

      <section className="surface-card overview-performance-card sales-performance-card">
        <div className="card-heading"><div><span className="eyebrow">{data?.period.label || 'This Month'}</span><h3>Purchase Cost & Settlement</h3><p>Normalized USD cost, amount paid, and remaining seller balance over time.</p></div></div>
        <BusinessPerformanceChart points={chartPoints} firstLabel="Purchase cost" secondLabel="Amount paid" thirdLabel="Balance" ariaLabel="Purchase cost, amount paid, and outstanding balance over the selected period" emptyTitle="No matching purchases" emptyDescription="Purchase activity will appear here once transactions match the selected filters." />
      </section>

      <section className="surface-card table-card sales-transactions-card">
        <div className="card-heading table-heading"><div><span className="eyebrow">Transaction detail</span><h3>Purchase Transactions</h3><p>{data?.limited ? `Showing the latest 500 of ${data.totalRecords} matching purchases.` : `${data?.totalRecords || 0} matching purchases.`} USD columns use each transaction's stored exchange rate.</p></div></div>
        <div className="table-scroll sales-report-desktop-table purchases-report-desktop-table"><table><thead><tr><th>Date</th><th>Purchase #</th><th>Seller</th><th>Source</th><th>Items</th><th>Original total</th><th>Total USD</th><th>Paid USD</th><th>Balance USD</th><th>Payment</th><th>Payment status</th><th>Staff</th><th>Status</th></tr></thead><tbody>
          {(data?.transactions || []).map((trade) => <tr key={trade._id}><td>{dateText(trade.purchaseDate || trade.createdAt)}</td><td><strong className="mono">{trade.tradeNo}</strong></td><td>{tradePartyName(trade)}</td><td>{purchaseSourceLabel(trade.sellerType)}</td><td><span className="sales-items-cell">{trade.reportItems ?? trade.items.reduce((sum, item) => sum + item.quantity, 0)}<small>{trade.items.map((item) => `${item.name} ×${item.quantity}`).join(', ')}</small></span></td><td>{tradeTransactionMoney(trade, trade.transactionTotal, trade.total)}</td><td><strong>{money.format(trade.reportTotal ?? trade.total)}</strong></td><td>{money.format(trade.reportPaid ?? trade.amountPaid)}</td><td className={(trade.reportBalance || 0) > 0 ? 'report-negative' : ''}>{money.format(trade.reportBalance ?? trade.balance)}</td><td>{titleStatus(trade.paymentMethod)}</td><td><StatusBadge status={trade.paymentStatus || 'Unknown'} /></td><td>{trade.createdBy?.name || 'Unknown'}</td><td><StatusBadge status={trade.status} /></td></tr>)}
          {data?.transactions.length === 0 && <tr><td colSpan={13}>No purchases match these filters.</td></tr>}
        </tbody></table></div>
        <div className="sales-report-mobile-list">{(data?.transactions || []).map((trade) => <article key={trade._id}><header><div><strong>{trade.tradeNo}</strong><small>{dateText(trade.purchaseDate || trade.createdAt)} · {tradePartyName(trade)}</small></div><StatusBadge status={trade.paymentStatus || trade.status} /></header><div><span>Total USD<strong>{money.format(trade.reportTotal ?? trade.total)}</strong></span><span>Paid<strong>{money.format(trade.reportPaid ?? trade.amountPaid)}</strong></span><span>Balance<strong className={(trade.reportBalance || 0) > 0 ? 'report-negative' : ''}>{money.format(trade.reportBalance ?? trade.balance)}</strong></span><span>Source<strong>{purchaseSourceLabel(trade.sellerType)}</strong></span></div><p>{trade.items.map((item) => `${item.name} ×${item.quantity}`).join(', ')}</p></article>)}{data?.transactions.length === 0 && <p className="mobile-record-empty">No purchases match these filters.</p>}</div>
      </section>

      <section className="sales-report-lower-grid purchases-report-lower-grid">
        <article className="surface-card table-card product-performance-card"><div className="card-heading table-heading"><div><span className="eyebrow">Product performance</span><h3>Top Purchased Products</h3><p>Product costs are normalized to USD using the rate saved with each purchase.</p></div></div><div className="table-scroll"><table><thead><tr><th>Product</th><th>Items</th><th>Total Cost</th><th>Average Unit Cost</th><th>Purchase Lines</th></tr></thead><tbody>{(data?.products || []).map((product) => <tr key={product.name}><td><strong>{product.name}</strong></td><td>{product.quantity}</td><td>{money.format(product.totalCost)}</td><td>{money.format(product.averageUnitCost)}</td><td>{product.transactions}</td></tr>)}{data?.products.length === 0 && <tr><td colSpan={5}>No product performance for these filters.</td></tr>}</tbody></table></div></article>
        <div className="purchase-breakdown-stack">
          <article className="surface-card payment-breakdown-card"><div className="card-heading"><div><span className="eyebrow">Seller breakdown</span><h3>Purchase Sources</h3><p>Normalized purchase cost by seller relationship.</p></div></div><div className="payment-breakdown-list">{(data?.sources || []).map((item) => <div key={item.source}><header><span>{titleStatus(item.source)}<small>{item.transactions} transactions</small></span><strong>{money.format(item.amount)}</strong></header><i><span style={{ width: `${Math.max(3, (Math.abs(item.amount) / maxSource) * 100)}%` }} /></i></div>)}{data?.sources.length === 0 && <p>No seller-source data for these filters.</p>}</div></article>
          <article className="surface-card payment-breakdown-card"><div className="card-heading"><div><span className="eyebrow">Payment breakdown</span><h3>Payment Methods</h3><p>Normalized purchase cost by recorded payment method.</p></div></div><div className="payment-breakdown-list">{(data?.payments || []).map((payment) => <div key={payment.method}><header><span>{titleStatus(payment.method)}<small>{payment.transactions} transactions</small></span><strong>{money.format(payment.amount)}</strong></header><i><span style={{ width: `${Math.max(3, (Math.abs(payment.amount) / maxPayment) * 100)}%` }} /></i></div>)}{data?.payments.length === 0 && <p>No payment data for these filters.</p>}</div></article>
        </div>
      </section>
    </div>
  )
}

const operationalReportIcons: LucideIcon[] = [Boxes, Banknote, WalletCards, Package, FileText, BarChart3]

function OperationalReportView({ kind, navigate }: { kind: OperationalReportKind; navigate: (path: string) => void }) {
  const now = new Date()
  const todayInput = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const [period, setPeriod] = useState<BusinessOverviewPeriod | 'all_time'>(['pawns', 'loans'].includes(kind) ? 'all_time' : 'this_month')
  const [customFrom, setCustomFrom] = useState(`${todayInput.slice(0, 8)}01`)
  const [customTo, setCustomTo] = useState(todayInput)
  const [currencyCode, setCurrencyCode] = useState<'USD' | 'KHR'>('USD')
  const [status, setStatus] = useState('ALL')
  const [staff, setStaff] = useState('ALL')
  const [category, setCategory] = useState('ALL')
  const [source, setSource] = useState('ALL')
  const [stock, setStock] = useState('ALL')
  const [method, setMethod] = useState('ALL')
  const [direction, setDirection] = useState('ALL')
  const [action, setAction] = useState('ALL')
  const [entity, setEntity] = useState('ALL')
  const [data, setData] = useState<OperationalReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (period === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return
    const query = new URLSearchParams()
    if (kind === 'inventory') {
      query.set('category', category)
      query.set('status', status)
      query.set('source', source)
      query.set('stock', stock)
    } else {
      query.set('period', period)
      if (period === 'custom') {
        query.set('from', customFrom)
        query.set('to', customTo)
      }
      if (['pawns', 'loans'].includes(kind)) {
        query.set('currency', currencyCode)
        query.set('status', status)
        query.set('staff', staff)
      }
      if (kind === 'payments') {
        query.set('currency', currencyCode)
        query.set('method', method)
        query.set('direction', direction)
      }
      if (kind === 'activity') {
        query.set('action', action)
        query.set('entity', entity)
        query.set('staff', staff)
      }
    }
    setLoading(true)
    setError('')
    api<OperationalReportData>(`/reports/${kind}?${query.toString()}`)
      .then(setData)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [kind, period, customFrom, customTo, currencyCode, status, staff, category, source, stock, method, direction, action, entity])

  const periodOptions: Array<{ value: BusinessOverviewPeriod | 'all_time'; label: string }> = [
    { value: 'all_time', label: 'All Time' }, { value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' },
    { value: 'last_7_days', label: '7 Days' }, { value: 'last_30_days', label: '30 Days' },
    { value: 'this_month', label: 'This Month' }, { value: 'last_month', label: 'Last Month' },
    { value: 'this_year', label: 'This Year' }, { value: 'custom', label: 'Custom' },
  ]
  const statusOptions: Record<'inventory' | 'pawns' | 'loans', string[]> = {
    inventory: ['ALL', 'IN_STOCK', 'RESERVED', 'SOLD', 'PAWNED', 'REPAIR', 'ARCHIVED'],
    pawns: ['ALL', 'ACTIVE', 'DUE_SOON', 'OVERDUE', 'RENEWED', 'REDEEMED', 'FORFEITED', 'CANCELLED'],
    loans: ['ALL', 'ACTIVE', 'DUE_SOON', 'OVERDUE', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'],
  }
  const valueText = (value: number, format: 'currency' | 'number') => format === 'currency'
    ? pawnMoney(value, data?.meta.currency || 'USD')
    : Number(value || 0).toLocaleString()
  const cellContent = (row: Record<string, string | number | null | undefined>, column: OperationalReportData['columns'][number]) => {
    const value = row[column.key]
    if (column.format === 'status') return <StatusBadge status={String(value || 'Unknown')} />
    if (column.format === 'currency') return <strong>{pawnMoney(Number(value || 0), data?.meta.currency || 'USD')}</strong>
    if (column.format === 'number') return Number(value || 0).toLocaleString()
    if (column.format === 'dateTime') return value ? new Date(String(value)).toLocaleString() : '—'
    if (column.format === 'date') return value ? dateText(String(value)) : '—'
    return String(value ?? '—')
  }

  if (loading && !data) {
    return <><SectionHeader eyebrow="Reports & analytics" title={`${titleStatus(kind)} Report`} description="Calculating verified report totals and operational details." /><section className="surface-card"><LoadingState label={`Loading ${kind} report`} detail="Reading current records and audit history…" /></section></>
  }

  return (
    <div className="sales-report-page operational-report-page">
      <SectionHeader eyebrow="Reports & analytics" title={data?.title || `${titleStatus(kind)} Report`} description={data?.description || 'Operational reporting.'} action={<button className="ghost-button" onClick={() => navigate('/reports')}>Back to reports</button>} />

      <section className="surface-card sales-report-filters operational-report-filters" aria-label={`${kind} report filters`}>
        {kind !== 'inventory' && <label><span>Period</span><select value={period} onChange={(event) => setPeriod(event.target.value as BusinessOverviewPeriod | 'all_time')}>{periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
        {period === 'custom' && kind !== 'inventory' && <><label><span>From</span><input type="date" value={customFrom} max={customTo || undefined} onChange={(event) => setCustomFrom(event.target.value)} /></label><label><span>To</span><input type="date" value={customTo} min={customFrom || undefined} onChange={(event) => setCustomTo(event.target.value)} /></label></>}
        {kind === 'inventory' && <>
          <label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{['ALL', 'PHONE', 'TABLET', 'ACCESSORY', 'SPARE_PART', 'OTHER'].map((value) => <option key={value} value={value}>{value === 'ALL' ? 'All categories' : titleStatus(value)}</option>)}</select></label>
          <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}>{statusOptions.inventory.map((value) => <option key={value} value={value}>{value === 'ALL' ? 'All statuses' : titleStatus(value)}</option>)}</select></label>
          <label><span>Source</span><select value={source} onChange={(event) => setSource(event.target.value)}>{['ALL', 'SUPPLIER', 'CUSTOMER', 'PAWN_FORFEIT', 'OTHER'].map((value) => <option key={value} value={value}>{value === 'ALL' ? 'All sources' : titleStatus(value)}</option>)}</select></label>
          <label><span>Stock level</span><select value={stock} onChange={(event) => setStock(event.target.value)}><option value="ALL">All stock levels</option><option value="AVAILABLE">Available</option><option value="LOW">Low stock</option><option value="OUT">Out of stock</option></select></label>
        </>}
        {['pawns', 'loans', 'payments'].includes(kind) && <label><span>Currency</span><select value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value as 'USD' | 'KHR')}><option value="USD">USD — US Dollar</option><option value="KHR">KHR — Cambodian Riel</option></select></label>}
        {['pawns', 'loans'].includes(kind) && <>
          <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}>{statusOptions[kind as 'pawns' | 'loans'].map((value) => <option key={value} value={value}>{value === 'ALL' ? 'All statuses' : titleStatus(value)}</option>)}</select></label>
          <label><span>Staff</span><select value={staff} onChange={(event) => setStaff(event.target.value)}><option value="ALL">All staff</option>{(data?.staff || []).map((person) => <option key={person._id} value={person._id}>{person.name}</option>)}</select></label>
        </>}
        {kind === 'payments' && <>
          <label><span>Payment method</span><select value={method} onChange={(event) => setMethod(event.target.value)}>{['ALL', 'CASH', 'KHQR', 'BANK', 'CARD', 'OTHER'].map((value) => <option key={value} value={value}>{value === 'ALL' ? 'All methods' : titleStatus(value)}</option>)}</select></label>
          <label><span>Direction</span><select value={direction} onChange={(event) => setDirection(event.target.value)}><option value="ALL">Money in & out</option><option value="IN">Money in</option><option value="OUT">Money out</option></select></label>
        </>}
        {kind === 'activity' && <>
          <label><span>Action</span><select value={action} onChange={(event) => setAction(event.target.value)}><option value="ALL">All actions</option>{(data?.filterOptions?.actions || []).map((value) => <option key={value} value={value}>{titleStatus(value)}</option>)}</select></label>
          <label><span>Entity</span><select value={entity} onChange={(event) => setEntity(event.target.value)}><option value="ALL">All entities</option>{(data?.filterOptions?.entities || []).map((value) => <option key={value} value={value}>{titleStatus(value)}</option>)}</select></label>
          <label><span>Staff</span><select value={staff} onChange={(event) => setStaff(event.target.value)}><option value="ALL">All staff</option>{(data?.staff || []).map((person) => <option key={person._id} value={person._id}>{person.name}</option>)}</select></label>
        </>}
        {loading && <RefreshCcw className="overview-refreshing" size={17} aria-label="Refreshing report" />}
      </section>
      {error && <p className="overview-error"><AlertTriangle size={16} />{error}</p>}

      <section className="sales-report-kpis" aria-label={`${kind} report summary`}>
        {(data?.summary || []).map((item, index) => {
          const Icon = operationalReportIcons[index % operationalReportIcons.length]
          return <article className="surface-card sales-report-kpi" key={item.label}><span className={`metric-icon tone-${item.tone}`}><Icon size={20} /></span><div><p>{item.label}</p><h3>{valueText(item.value, item.format)}</h3><small>{item.detail}</small></div></article>
        })}
      </section>

      <section className="operational-breakdown-grid">
        {(data?.breakdowns || []).map((section) => {
          const maximum = Math.max(1, ...section.rows.map((row) => Math.abs(row.value)))
          return <article className="surface-card payment-breakdown-card" key={section.title}><div className="card-heading"><div><span className="eyebrow">Breakdown</span><h3>{section.title}</h3><p>{section.description}</p></div></div><div className="payment-breakdown-list">{section.rows.map((row) => <div key={row.label}><header><span>{titleStatus(row.label)}<small>{row.count} records</small></span><strong>{valueText(row.value, section.format)}</strong></header><i><span style={{ width: `${Math.max(3, (Math.abs(row.value) / maximum) * 100)}%` }} /></i></div>)}{section.rows.length === 0 && <p>No breakdown data matches these filters.</p>}</div></article>
        })}
      </section>

      <section className="surface-card table-card operational-report-table-card">
        <div className="card-heading table-heading"><div><span className="eyebrow">Report detail</span><h3>{data?.title || 'Report'} Records</h3><p>{data?.meta.limited ? `Showing the latest 500 of ${data.meta.totalRecords} records.` : `${data?.meta.totalRecords || 0} matching records.`}</p></div></div>
        <div className="table-scroll operational-report-desktop-table"><table><thead><tr>{(data?.columns || []).map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{(data?.rows || []).map((row, rowIndex) => <tr key={String(row.id || rowIndex)}>{data?.columns.map((column) => <td key={column.key}>{cellContent(row, column)}</td>)}</tr>)}{data?.rows.length === 0 && <tr><td colSpan={data?.columns.length || 1}>No records match these filters.</td></tr>}</tbody></table></div>
        <div className="operational-report-mobile-list">{(data?.rows || []).map((row, rowIndex) => <article key={String(row.id || rowIndex)}><header><strong>{String(row.reference || row.name || row.sku || `Record ${rowIndex + 1}`)}</strong>{row.status && <StatusBadge status={String(row.status)} />}</header><div>{data?.columns.slice(0, 6).map((column) => <span key={column.key}>{column.label}<strong>{cellContent(row, column)}</strong></span>)}</div></article>)}{data?.rows.length === 0 && <p className="mobile-record-empty">No records match these filters.</p>}</div>
      </section>
      {(data?.notes || []).map((note) => <p className="report-hub-note" key={note}><AlertTriangle size={15} />{note}</p>)}
    </div>
  )
}

function ReportsView() {
  const [path, setPath] = useState(window.location.pathname.replace(/\/+$/, '') || '/reports')

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname.replace(/\/+$/, '') || '/reports')
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    const slug = path.split('/')[2]
    const report = reportSections.find((item) => item.slug === slug)
    document.title = `${report ? `${report.title} Report` : 'Reports & Analytics'} · PhoneFlow`
  }, [path])

  const navigate = (nextPath: string) => {
    if (window.location.pathname !== nextPath) window.history.pushState({ view: 'reports' }, '', nextPath)
    setPath(nextPath)
  }

  if (path === '/reports/sales') return <SalesReportView navigate={navigate} />
  if (path === '/reports/purchases') return <PurchasesReportView navigate={navigate} />
  if (path === '/reports/inventory') return <OperationalReportView key={path} kind="inventory" navigate={navigate} />
  if (path === '/reports/pawns') return <OperationalReportView key={path} kind="pawns" navigate={navigate} />
  if (path === '/reports/loans') return <OperationalReportView key={path} kind="loans" navigate={navigate} />
  if (path === '/reports/payments') return <OperationalReportView key={path} kind="payments" navigate={navigate} />
  if (path === '/reports/activity') return <OperationalReportView key={path} kind="activity" navigate={navigate} />
  const slug = path.startsWith('/reports/') ? path.slice('/reports/'.length) : ''
  if (slug && reportSections.some((item) => item.slug === slug)) return <UpcomingReportView slug={slug} navigate={navigate} />
  return <ReportLanding navigate={navigate} />
}

function SettingsView({
  user,
  onLogout,
  fontSize,
  onFontSizeChange,
}: {
  user: SessionUser
  onLogout: () => void
  fontSize: AppFontSize
  onFontSizeChange: (fontSize: AppFontSize) => void
}) {
  const savedValuations = JSON.parse(localStorage.getItem('phoneflow_valuations') || '[]') as unknown[]
  const fontSizeOptions: Array<{
    value: AppFontSize
    label: string
    percentage: string
    description: string
  }> = [
    { value: 'default', label: 'Default', percentage: '100%', description: 'Standard dashboard size' },
    { value: 'comfortable', label: 'Comfortable', percentage: '110%', description: 'Larger text and controls' },
    { value: 'large', label: 'Large', percentage: '120%', description: 'Maximum readable size' },
  ]

  return (
    <>
      <SectionHeader eyebrow="System" title="System settings" description="Current account, environment, security, and local app preferences." />
      <section className="settings-grid">
        <article className="surface-card settings-card account-settings-card">
          <div className="settings-card-heading">
            <span className="settings-icon violet"><UserRound size={20} /></span>
            <div>
              <h3>Account profile</h3>
              <p>Your signed-in account and access details.</p>
            </div>
            <span className={`account-status ${user.active ? 'active' : 'disabled'}`}>
              <i />{user.active ? 'Active' : 'Disabled'}
            </span>
          </div>

          <div className="account-settings-body">
            <div className="account-profile">
              <div className="settings-avatar">{user.name.slice(0, 2).toUpperCase()}</div>
              <div className="account-identity">
                <h4>{user.name}</h4>
                <span>{user.email}</span>
              </div>
            </div>

            <div className="account-details">
              <div><span>Role</span><strong>{titleStatus(user.role)}</strong></div>
              <div><span>Access level</span><strong>{user.role === 'OWNER' ? 'Full access' : 'Role based'}</strong></div>
              <div><span>Authentication</span><strong>Password protected</strong></div>
            </div>
          </div>

          <div className="settings-card-footer">
            <p>Signing out will end your current session on this device.</p>
            <button className="ghost-button danger-button" onClick={onLogout}><LogOut size={15} />Log out</button>
          </div>
        </article>

        <article className="surface-card settings-card environment-settings-card">
          <div className="settings-card-heading">
            <span className="settings-icon blue"><Settings size={20} /></span>
            <div>
              <h3>App environment</h3>
              <p>Services currently powering PhoneFlow.</p>
            </div>
          </div>
          <div className="environment-list">
            <div>
              <span className="environment-icon"><Smartphone size={17} /></span>
              <p><strong>Frontend</strong><small>Vite local application</small></p>
              <span className="service-state"><i />Online</span>
            </div>
            <div>
              <span className="environment-icon"><Server size={17} /></span>
              <p><strong>API service</strong><small>Proxied securely through /api</small></p>
              <span className="service-state"><i />Connected</span>
            </div>
            <div>
              <span className="environment-icon"><Database size={17} /></span>
              <p><strong>Database</strong><small>MongoDB Atlas</small></p>
              <span className="service-state"><i />Connected</span>
            </div>
          </div>
        </article>

        <article className="surface-card settings-card valuation-settings-card">
          <div className="settings-card-heading">
            <span className="settings-icon orange"><Calculator size={20} /></span>
            <div>
              <h3>Saved valuations</h3>
              <p>Calculator records stored on this device.</p>
            </div>
          </div>
          <div className="saved-valuation-summary">
            <strong>{savedValuations.length}</strong>
            <p>Saved record{savedValuations.length === 1 ? '' : 's'}<small>Local browser storage</small></p>
          </div>
          <div className="settings-card-footer">
            <p>Clearing local records cannot be undone.</p>
            <button
              className="ghost-button danger-button"
              disabled={savedValuations.length === 0}
              onClick={() => { localStorage.removeItem('phoneflow_valuations'); window.location.reload() }}
            >
              <Trash2 size={15} />Clear records
            </button>
          </div>
        </article>

        <article className="surface-card settings-card font-size-settings-card">
          <div className="settings-card-heading">
            <span className="settings-icon violet"><Type size={20} /></span>
            <div>
              <h3>Display size</h3>
              <p>Make text and controls easier to read.</p>
            </div>
          </div>
          <div className="font-size-options" role="radiogroup" aria-label="Display size">
            {fontSizeOptions.map((option) => {
              const selected = option.value === fontSize
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`font-size-option ${selected ? 'active' : ''}`}
                  key={option.value}
                  onClick={() => onFontSizeChange(option.value)}
                >
                  <span className="font-size-preview" data-size={option.value} aria-hidden="true">Aa</span>
                  <span className="font-size-option-copy">
                    <span><strong>{option.label}</strong><b>{option.percentage}</b></span>
                    <small>{option.description}</small>
                  </span>
                  {selected && <BadgeCheck size={18} aria-hidden="true" />}
                </button>
              )
            })}
          </div>
          <p className="font-size-setting-note">Saved on this browser and applied immediately.</p>
        </article>
      </section>
    </>
  )
}

function App({
  user,
  onLogout,
  theme,
  onToggleTheme,
  fontSize,
  onFontSizeChange,
}: {
  user: SessionUser
  onLogout: () => void
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  fontSize: AppFontSize
  onFontSizeChange: (fontSize: AppFontSize) => void
}) {
  const [active, setActive] = useState<NavKey>(() => viewFromPath(window.location.pathname))
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [sidebarCounts, setSidebarCounts] = useState({ pawns: 0, lowStock: 0 })
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)

  const changePage = (key: NavKey) => {
    setActive(key)
    setMobileOpen(false)
    setProfileOpen(false)
    const nextPath = viewPaths[key]
    if (window.location.pathname !== nextPath) {
      const navigationState = { view: key }
      window.history.pushState(navigationState, '', nextPath)
      window.dispatchEvent(new PopStateEvent('popstate', { state: navigationState }))
    }
  }

  useEffect(() => {
    api<DashboardData>('/dashboard')
      .then((result) => setSidebarCounts({ pawns: result.metrics.pawnCount, lowStock: result.metrics.lowStock }))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    const currentView = viewFromPath(window.location.pathname)
    const canonicalPath = currentView === 'reports' && window.location.pathname.startsWith('/reports/')
      ? window.location.pathname.replace(/\/+$/, '')
      : viewPaths[currentView]

    if (window.location.pathname !== canonicalPath) {
      window.history.replaceState({ view: currentView }, '', canonicalPath)
    }

    const handlePopState = () => {
      setActive(viewFromPath(window.location.pathname))
      setMobileOpen(false)
      setProfileOpen(false)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    document.title = `${navGroups.flatMap((group) => group.items).find((item) => item.key === active)?.label || 'Dashboard'} · PhoneFlow`
  }, [active])

  useEffect(() => {
    if (!profileOpen) return

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) setProfileOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileOpen(false)
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [profileOpen])

  useEffect(() => {
    if (!mobileOpen || !window.matchMedia('(max-width: 900px)').matches) return

    const sidebar = sidebarRef.current
    if (!sidebar) return
    const focusableSelector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',')
    const focusableElements = () => Array.from(sidebar.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => element.getClientRects().length > 0)
    const focusFrame = window.requestAnimationFrame(() => {
      sidebar.querySelector<HTMLElement>('.mobile-close')?.focus()
    })

    const keepFocusInSidebar = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMobileOpen(false)
        return
      }
      if (event.key !== 'Tab') return

      const elements = focusableElements()
      if (elements.length === 0) {
        event.preventDefault()
        return
      }
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      } else if (!sidebar.contains(document.activeElement)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', keepFocusInSidebar)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', keepFocusInSidebar)
      window.requestAnimationFrame(() => mobileMenuButtonRef.current?.focus())
    }
  }, [mobileOpen])

  const renderView = () => {
    switch (active) {
      case 'dashboard': return <DashboardView goTo={changePage} user={user} />
      case 'pawn': return <PawnView />
      case 'trade': return <TradeView />
      case 'inventory': return <InventoryView />
      case 'customers': return <CustomersView />
      case 'suppliers': return <SupplierWorkspace />
      case 'depreciation': return <DepreciationView goTo={changePage} />
      case 'businessOverview': return <BusinessOverviewView />
      case 'reports': return <ReportsView />
      case 'settings': return <SettingsView user={user} onLogout={onLogout} fontSize={fontSize} onFontSizeChange={onFontSizeChange} />
      default: return <DashboardView goTo={changePage} user={user} />
    }
  }

  return (
    <div
      className="app"
      data-theme={theme}
      data-font-size={fontSize}
    >
      <div className={`mobile-overlay ${mobileOpen ? 'show' : ''}`} onClick={() => setMobileOpen(false)} aria-hidden="true" />
      <aside ref={sidebarRef} id="primary-sidebar" className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`} aria-label="Primary navigation">
        <div className="brand">
          <span className="brand-mark"><Smartphone size={22} /></span>
          <div><strong>PhoneFlow</strong><small>Shop Management</small></div>
          <button type="button" className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation menu" aria-controls="primary-sidebar"><X size={20} aria-hidden="true" /></button>
        </div>

        <nav className="sidebar-nav" aria-label="Main menu">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-group-label">{group.label}</span>
              {group.items.map((item) => {
                const Icon = item.icon
                const badge = item.key === 'pawn'
                  ? String(sidebarCounts.pawns)
                  : item.key === 'inventory'
                    ? `Low ${sidebarCounts.lowStock}`
                    : item.badge
                return (
                  <button className={active === item.key ? 'active' : ''} key={item.key} onClick={() => changePage(item.key)}>
                    <Icon size={19} />
                    <span>{item.label}</span>
                    {badge && <small>{badge}</small>}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="support-card">
            <span><BadgeCheck size={19} /></span>
            <p><strong>Daily backup</strong><small>Checking status</small></p>
          </div>
          <div className="user-card">
            <span className="avatar large">WN</span>
            <p><strong>{user.name}</strong><small>{titleStatus(user.role)}</small></p>
            <button className="icon-button" onClick={onLogout} aria-label="Log out"><X size={16} /></button>
          </div>
        </div>
      </aside>

      <div className="app-shell">
        <header className="topbar">
          <button ref={mobileMenuButtonRef} type="button" className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation menu" aria-controls="primary-sidebar" aria-expanded={mobileOpen}><Menu size={21} aria-hidden="true" /></button>
          <div className="global-search"><Search size={18} /><input placeholder="Search pawn, customer, IMEI, product..." /><kbd>⌘ K</kbd></div>
          <div className="topbar-actions">
            <button
              className="icon-button theme-toggle"
              onClick={onToggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              aria-pressed={theme === 'light'}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /><span /></button>
            <div className="profile-menu" ref={profileMenuRef}>
              <button
                className={`topbar-user ${profileOpen ? 'open' : ''}`}
                onClick={() => setProfileOpen((current) => !current)}
                aria-expanded={profileOpen}
                aria-haspopup="menu"
              >
                <span className="avatar">{user.name.slice(0, 2).toUpperCase()}</span>
                <p><strong>{user.name.split(' ')[0]}</strong><small>{titleStatus(user.role)}</small></p>
                <ChevronDown className="profile-chevron" size={15} />
              </button>

              {profileOpen && (
                <div className="profile-dropdown surface-card" role="menu">
                  <div className="profile-dropdown-header">
                    <span className="avatar large">{user.name.slice(0, 2).toUpperCase()}</span>
                    <p><strong>{user.name}</strong><small>{user.email}</small></p>
                  </div>
                  <div className="profile-dropdown-role">
                    <span>Signed in as</span>
                    <strong>{titleStatus(user.role)}</strong>
                  </div>
                  <div className="profile-dropdown-actions">
                    <button role="menuitem" onClick={() => changePage('settings')}><Settings size={16} /><span>Account settings</span></button>
                    <button className="logout-action" role="menuitem" onClick={onLogout}><LogOut size={16} /><span>Log out</span></button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="main-content">{renderView()}</main>
      </div>
      <BackupStatusBridge />
    </div>
  )
}

export default App
