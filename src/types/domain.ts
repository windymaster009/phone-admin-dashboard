export type Customer = {
  _id: string
  name: string
  phone: string
  nationalIdNumber?: string
  address?: string
  notes?: string
  createdAt?: string
}

export type Supplier = {
  _id: string
  name: string
  phone?: string
  nationalIdNumber?: string
  notes?: string
  createdAt?: string
}

export type CustomerActivity = {
  id: string
  kind: 'SALE' | 'PURCHASE' | 'PAWN'
  reference: string
  title: string
  amount: number
  currency: PawnCurrency
  status: string
  occurredAt: string
}

export type ReportCurrencyTotals = Record<PawnCurrency, number> & { usdEquivalent: number }

export type DirectoryReportPeriodKey = 'all_time' | 'this_month' | 'last_month' | 'last_3_months' | 'last_6_months' | 'this_year' | 'custom'

export type DirectoryReportPeriod = {
  key: DirectoryReportPeriodKey
  label: string
  from: string
  to: string
}

export type CustomerActivityReport = {
  period: DirectoryReportPeriod
  summary: {
    sales: ReportCurrencyTotals
    purchases: ReportCurrencyTotals
    pawned: ReportCurrencyTotals
  }
  activities: CustomerActivity[]
  limited: boolean
}

export type SupplierActivityReport = {
  period: DirectoryReportPeriod
  summary: { purchases: ReportCurrencyTotals }
  activities: Array<{
    id: string
    reference: string
    title: string
    amount: number
    currency: PawnCurrency
    status: string
    occurredAt: string
  }>
  limited: boolean
}

export type InventoryItem = {
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
  pricingCurrency?: 'USD' | 'KHR'
  pricingExchangeRate?: number
  listedSellPrice?: number
  listedMinimumSellPrice?: number
  khrSellPrice?: number
  khrMinimumSellPrice?: number
  status: string
  relatedPawn?: { _id: string; pawnNo: string; status: string } | null
}

export type PawnCurrency = 'USD' | 'KHR'

export type Pawn = {
  _id: string
  pawnNo: string
  customer?: Customer
  inventoryItem?: Pick<InventoryItem, '_id' | 'sku' | 'barcode' | 'name' | 'brand' | 'model' | 'storage' | 'color' | 'imei1' | 'sellPrice' | 'status'> | string
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
    dailyFeeAmount?: number
    termDays: number
    contractLengthDays?: number
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
    _id?: string
    previousDueDate: string
    newDueDate: string
    paymentAmount: number
    feePaid?: number
    principalRemaining?: number
    termDays?: number
    contractLengthDays?: number
    dailyFeeRate?: number
    dailyFeeAmount?: number
    ticketPart?: number
    renewedAt: string
    note?: string
    renewedBy?: { name?: string }
  }>
  dueDate: string
  gracePeriodDays?: number
  graceEndsAt?: string
  workflowVersion?: number
  status: string
  identificationVerified: boolean
  ownershipConfirmed?: boolean
  notes?: string
  createdAt: string
}

export type PawnAction = 'payment' | 'renew' | 'redeem' | 'forfeit'

export type Trade = {
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
  warrantyDays?: number
  warrantyExpiresAt?: string
  status: string
  refund?: {
    amount: number
    reason: string
    inventoryDisposition: 'RESTOCK' | 'NO_RESTOCK'
    refundedAt: string
    refundedBy?: { _id: string; name: string; email?: string; role?: string }
  }
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

export type DashboardData = {
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

export type ExchangeRateData = {
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

export type ActivityLog = {
  _id: string
  action: string
  entity: string
  entityId?: string
  createdAt: string
  user?: { name: string; email: string; role: string }
  details?: Record<string, unknown>
}

export type OverviewCurrencyTotals = { USD: number; KHR: number }

export type BusinessOverviewPeriod = 'today' | 'yesterday' | 'last_7_days' | 'last_30_days' | 'this_month' | 'last_month' | 'this_year' | 'custom'

export type BusinessOverviewData = {
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

export type SalesReportData = {
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

export type PurchaseReportData = {
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

export type OperationalReportKind = 'inventory' | 'pawns' | 'loans' | 'payments' | 'services' | 'activity'

export type OperationalReportData = {
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


