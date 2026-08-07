export type ReceiptDocumentType =
  | 'SALE_RECEIPT'
  | 'PURCHASE_RECEIPT'
  | 'PAWN_CONTRACT'
  | 'PAWN_PAYMENT'
  | 'PAWN_REDEMPTION'
  | 'LOAN_AGREEMENT'
  | 'LOAN_PAYMENT'

export type ReceiptLayout = 'A4' | 'THERMAL'
export type ReceiptSourceType = 'TRADE' | 'PAWN' | 'LOAN'
export type ReceiptCurrency = 'USD' | 'KHR'

export type ReceiptOption = {
  documentType: ReceiptDocumentType
  sourceSubId: string
  label: string
  issuedAt: string
  amount: number
  currency: ReceiptCurrency
}

export type ReceiptOptionResponse = {
  sourceType: ReceiptSourceType
  referenceNo: string
  options: ReceiptOption[]
}

export type ReceiptParty = {
  name: string
  phone?: string
  nationalIdNumber?: string
  address?: string
  role?: string
}

export type ReceiptLine = {
  name: string
  quantity: number
  unitPrice: number
  total: number
  sku?: string
  barcode?: string
  imei?: string
  imei2?: string
  serialNumber?: string
  description?: string
  accessories?: string[]
}

export type ReceiptSnapshot = {
  schemaVersion: number
  documentType: ReceiptDocumentType
  title: string
  shop: {
    name: string
    subtitle?: string
    phone?: string
    email?: string
    address?: string
    taxId?: string
    logoUrl?: string
    footer?: string
  }
  referenceNo: string
  paymentReference?: string
  paymentExternalReference?: string
  issuedAt: string
  originalTransactionAt?: string
  party: ReceiptParty
  currency: ReceiptCurrency
  exchangeRate?: number
  items: ReceiptLine[]
  subtotal?: number
  discount?: number
  total: number
  amountPaid?: number
  balance?: number
  paymentMethod?: string
  paymentStatus?: string
  transactionStatus?: string
  paymentType?: string
  estimatedValue?: number
  pawnPercentage?: number
  principal?: number
  contractPrincipal?: number
  contractTotal?: number
  interestType?: string
  interestValue?: number
  interestAmount?: number
  interestRate?: number
  interestPeriod?: string
  feeModel?: 'LEGACY_MONTHLY' | 'DAILY_SIMPLE'
  dailyFeeRate?: number
  termDays?: number
  startDate?: string
  pawnFeeAtDue?: number
  dueDate?: string
  graceEndsAt?: string
  identificationVerified?: boolean
  ownershipConfirmed?: boolean
  status?: string
  allocation?: {
    principal?: number
    interest?: number
    fees?: number
    pawnFee?: number
  }
  notes?: string
  staff?: { name: string; role?: string } | null
  signatureLabels?: string[]
}

export type ReceiptRecord = {
  _id: string
  receiptNo: string
  documentType: ReceiptDocumentType
  sourceType: ReceiptSourceType
  sourceId: string
  sourceSubId: string
  referenceNo: string
  partyName?: string
  partyPhone?: string
  currency: ReceiptCurrency
  total: number
  issuedAt: string
  snapshot?: ReceiptSnapshot
  printCount: number
  firstPrintedAt?: string
  lastPrintedAt?: string
  createdAt: string
  createdBy?: { name: string; role?: string }
  lastPrintedBy?: { name: string; role?: string }
}
