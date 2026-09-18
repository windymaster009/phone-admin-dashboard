/**
 * Central English / Khmer Bilingual Dictionary & Formatting Helpers for PhoneFlow Receipts.
 * Style requirement: "English / Khmer" in the same label (e.g. "Total / សរុប").
 * Dynamic data (amounts, dates, barcodes, SKUs, IMEIs, customer names, shop names) are never modified.
 */

// Khmer numeral converter for Part numbers
export function toKhmerNumerals(num: number | string): string {
  const khmerDigits = ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩']
  return String(num).replace(/\d/g, (digit) => khmerDigits[Number(digit)] || digit)
}

/**
 * Exact English -> Khmer dictionary for static display strings.
 */
export const BILINGUAL_DICTIONARY: Record<string, string> = {
  // --- PAWN TICKET LABELS ---
  'Pawn Shop': 'ហាងបញ្ចាំ',
  'Tel': 'ទូរស័ព្ទ',
  'Pawn ticket': 'បង្កាន់ដៃបញ្ចាំ',
  'Part': 'ផ្នែកទី',
  'Receipt': 'បង្កាន់ដៃ',
  'Customer': 'អតិថិជន',
  'Number of items': 'ចំនួនទំនិញ',
  'Loan amount': 'ចំនួនប្រាក់កម្ចី',
  'Pawn fee at due date': 'កម្រៃបញ្ចាំនៅថ្ងៃកំណត់បង់',
  'Daily pawn fee rate': 'អត្រាកម្រៃបញ្ចាំប្រចាំថ្ងៃ',
  'Daily pawn fee': 'កម្រៃបញ្ចាំប្រចាំថ្ងៃ',
  'Interest': 'ការប្រាក់',
  'Contract length': 'រយៈពេលកិច្ចសន្យា',
  'Extension period': 'រយៈពេលបន្តកិច្ចសន្យា',
  'Pawned / deposited on': 'កាលបរិច្ឆេទដាក់បញ្ចាំ',
  'Previous due date': 'ថ្ងៃកំណត់បង់មុន',
  'New fee due date': 'ថ្ងៃកំណត់បង់កម្រៃថ្មី',
  'New due date': 'ថ្ងៃកំណត់បង់ថ្មី',
  'Date to pay pawn fee': 'ថ្ងៃកំណត់បង់កម្រៃបញ្ចាំ',
  'Date to pay interest': 'ថ្ងៃកំណត់បង់ការប្រាក់',
  'Grace period ends': 'ថ្ងៃផុតរយៈពេលអនុគ្រោះ',
  'Pawned item': 'វត្ថុបញ្ចាំ',
  'Important': 'សំខាន់',
  'Customer signature / thumbprint': 'ហត្ថលេខា ឬ ស្នាមមេដៃអតិថិជន',
  'Shop representative': 'តំណាងហាង',
  'day': 'ថ្ងៃ',
  'days': 'ថ្ងៃ',
  'per day': 'ក្នុងមួយថ្ងៃ',
  '/ day': 'ក្នុងមួយថ្ងៃ',
  'per month': 'ក្នុងមួយខែ',
  'days added': 'ថ្ងៃបន្ថែម',

  // --- SHARED RECEIPT LABELS ---
  'Reference': 'លេខយោង',
  'Issued': 'កាលបរិច្ឆេទចេញ',
  'Currency': 'រូបិយប័ណ្ណ',
  'Payment reference': 'លេខយោងការទូទាត់',
  'External reference': 'លេខយោងខាងក្រៅ',
  'Processed by': 'រៀបចំដោយ',
  'Seller': 'អ្នកលក់',
  'Borrower': 'អ្នកខ្ចី',
  'Phone': 'លេខទូរស័ព្ទ',
  'National ID': 'លេខអត្តសញ្ញាណប័ណ្ណ',
  'Address': 'អាសយដ្ឋាន',
  'Tax ID': 'លេខអត្តសញ្ញាណកម្មសារពើពន្ធ',
  'Items / purpose': 'ទំនិញ / គោលបំណង',
  'Collateral': 'វត្ថុបញ្ចាំ',
  'Returned items': 'ទំនិញបានប្រគល់ត្រឡប់',
  'Description': 'បរិយាយ',
  'Quantity or Qty': 'បរិមាណ',
  'Qty': 'បរិមាណ',
  'Quantity': 'បរិមាណ',
  'Unit price': 'តម្លៃឯកតា',
  'Unit': 'តម្លៃឯកតា',
  'Included': 'រួមមាន',
  'Serial': 'លេខស៊េរី',
  'Agreement details': 'ព័ត៌មានលម្អិតកិច្ចសន្យា',
  'Payment details': 'ព័ត៌មានលម្អិតការទូទាត់',
  'Payment & status': 'ការទូទាត់ និងស្ថានភាព',
  'Payment method': 'វិធីទូទាត់',
  'Payment status': 'ស្ថានភាពការទូទាត់',
  'Transaction status': 'ស្ថានភាពប្រតិបត្តិការ',
  'Subtotal': 'សរុបរង',
  'Discount': 'បញ្ចុះតម្លៃ',
  'Total': 'សរុប',
  'Refund total': 'ប្រាក់សងសរុប',
  'Refunded': 'ប្រាក់បានសង',
  'Amount paid': 'ចំនួនប្រាក់បានបង់',
  'Amount received': 'ចំនួនប្រាក់បានទទួល',
  'Change': 'ប្រាក់អាប់',
  'Balance': 'ប្រាក់នៅសល់',
  'Remaining balance': 'ប្រាក់នៅសល់',
  'Remaining due': 'ប្រាក់នៅសល់ត្រូវបង់',
  'Notes': 'កំណត់ចំណាំ',
  'Note': 'កំណត់ចំណាំ',

  // --- OWNERSHIP & ID VERIFICATION ---
  'Ownership': 'កម្មសិទ្ធិ',
  'Confirmed': 'បានបញ្ជាក់',
  'Legacy record': 'កំណត់ត្រាចាស់',
  'Verified': 'បានផ្ទៀងផ្ទាត់',
  'Not provided (optional)': 'មិនបានផ្ដល់ជូន (ជម្រើស)',

  // --- ESTIMATED VALUE & CONTRACT AMOUNTS ---
  'Estimated value': 'តម្លៃប៉ាន់ស្មាន',
  'Pawn percentage': 'ភាគរយកម្ចីបញ្ចាំ',
  'Fee at due date': 'កម្រៃនៅថ្ងៃកំណត់បង់',
  'Total at due date': 'សរុបនៅថ្ងៃកំណត់បង់',
  'Total expected': 'ប្រាក់រំពឹងសរុប',
  'Agreement total': 'ប្រាក់សរុបតាមកិច្ចសន្យា',
  'Balance remaining': 'ប្រាក់នៅសល់',

  // --- LOAN AND PAYMENT LABELS ---
  'Loan agreement': 'កិច្ចសន្យាប្រាក់កម្ចី',
  'Loan repayment receipt': 'បង្កាន់ដៃសងប្រាក់កម្ចី',
  'Loan date': 'កាលបរិច្ឆេទកម្ចី',
  'Paid on': 'កាលបរិច្ឆេទបានបង់',
  'Due date': 'ថ្ងៃកំណត់បង់',
  'Principal': 'ប្រាក់ដើម',
  'Interest type': 'ប្រភេទការប្រាក់',
  'Total agreement': 'ប្រាក់សរុបតាមកិច្ចសន្យា',
  'Payment amount': 'ចំនួនប្រាក់ទូទាត់',
  'Payment type': 'ប្រភេទការទូទាត់',
  'Principal applied': 'ប្រាក់ដើមបានទូទាត់',
  'Interest applied': 'ការប្រាក់បានទូទាត់',
  'Daily pawn fee applied': 'កម្រៃបញ្ចាំប្រចាំថ្ងៃបានទូទាត់',
  'Fees applied': 'កម្រៃបានទូទាត់',
  'Additional amount collected': 'ចំនួនប្រាក់បន្ថែមបានប្រមូល',
  'Contract due date': 'ថ្ងៃកំណត់តាមកិច្ចសន្យា',
  'Status': 'ស្ថានភាព',
  'Borrower signature / thumbprint': 'ហត្ថលេខា ឬ ស្នាមមេដៃអ្នកខ្ចី',
  'Borrower signature': 'ហត្ថលេខាអ្នកខ្ចី',
  'Lender signature': 'ហត្ថលេខាអ្នកឱ្យខ្ចី',
  'Authorized lender': 'អ្នកឱ្យខ្ចីមានសិទ្ធិ',
  'Cashier signature': 'ហត្ថលេខាអ្នកទទួលប្រាក់',
  'Customer acknowledgement': 'ការទទួលស្គាល់របស់អតិថិជន',
  'Customer signature': 'ហត្ថលេខាអតិថិជន',
  'Customer confirms collateral received': 'អតិថិជនបញ្ជាក់ថាបានទទួលវត្ថុបញ្ចាំត្រឡប់',
  'Seller signature': 'ហត្ថលេខាអ្នកលក់',
  'Notice': 'សេចក្តីជូនដំណឹង',

  // --- WALK-IN & FALLBACK PARTIES ---
  'Walk-in customer': 'អតិថិជនទូទៅ',
  'Walk-in seller': 'អ្នកលក់ទូទៅ',
  'Unknown customer': 'មិនស្គាល់អតិថិជន',
  'Unknown borrower': 'មិនស្គាល់អ្នកខ្ចី',

  // --- STATUSES ---
  'Active': 'សកម្ម',
  'Paid': 'បានបង់',
  'Partial': 'បង់មួយផ្នែក',
  'Unpaid': 'មិនទាន់បង់',
  'Overdue': 'ហួសកាលកំណត់',
  'Due Soon': 'ជិតដល់ថ្ងៃកំណត់',
  'Completed': 'បានបញ្ចប់',
  'Cancelled': 'បានបោះបង់',
  'Returned': 'បានប្រគល់ត្រឡប់',
  'Redeemed': 'បានលោះ',
  'Forfeited': 'រឹបអូស',
  'Default': 'អសកម្ម',
  'Extended': 'បានបន្តកិច្ចសន្យា',
  'Void': 'ទុកជាមោឃៈ',

  // --- PAYMENT METHODS ---
  'Cash': 'សាច់ប្រាក់',
  'KHQR': 'KHQR',
  'Bank': 'ផ្ទេរតាមធនាគារ',
  'Bank Transfer': 'ផ្ទេរតាមធនាគារ',
  'Card': 'កាត',
  'Other': 'ផ្សេងៗ',
  'Not Recorded': 'មិនបានកត់ត្រា',
  'Test Mode': 'របៀបសាកល្បង',

  // --- PAYMENT TYPES ---
  'Renewal': 'បន្តកិច្ចសន្យា',
  'Redemption': 'លោះវត្ថុបញ្ចាំ',
  'Loan Repayment': 'សងប្រាក់កម្ចី',
  'Interest Fee': 'កម្រៃការប្រាក់',
  'Daily Fee': 'កម្រៃប្រចាំថ្ងៃ',
  'Partial Principal': 'ប្រាក់ដើមមួយផ្នែក',

  // --- INTEREST TYPES ---
  'Percent': 'ភាគរយ',
  'Fixed': 'ចំនួនថេរ',
  'None': 'គ្មាន',

  // --- DOCUMENT TITLES ---
  'Sales Receipt / Invoice': 'បង្កាន់ដៃលក់ / វិក្កយបត្រ',
  'Purchase Receipt': 'បង្កាន់ដៃទិញ',
  'Refund Receipt': 'បង្កាន់ដៃសងប្រាក់',
  'Pawn Contract': 'កិច្ចសន្យាបញ្ចាំ',
  'Pawn Payment Receipt': 'បង្កាន់ដៃបង់ប្រាក់បញ្ចាំ',
  'Pawn Redemption Receipt': 'បង្កាន់ដៃលោះវត្ថុបញ្ចាំ',
  'Loan Agreement': 'កិច្ចសន្យាប្រាក់កម្ចី',
  'Loan Repayment Receipt': 'បង្កាន់ដៃសងប្រាក់កម្ចី',
  'Service Receipt': 'បង្កាន់ដៃសេវាកម្ម',
  'Pawn ticket · Part 1': 'បង្កាន់ដៃបញ្ចាំ · ផ្នែកទី ១',

  // --- DEFAULT FOOTER & SYSTEM MESSAGES ---
  'Thank you for your business.': 'សូមអរគុណចំពោះការគាំទ្ររបស់លោកអ្នក។',
  'Thank you.': 'សូមអរគុណ។',
  'Receipt snapshot is unavailable.': 'មិនមានទិន្នន័យបង្កាន់ដៃទេ។',

  // --- GENERATED REFUND NOTES ---
  'Returned items were restored to available stock.': 'ទំនិញបានប្រគល់ត្រឡប់ត្រូវបានដាក់ចូលស្តុកវិញ។',
  'Returned items were not restored to saleable stock.': 'ទំនិញបានប្រគល់ត្រឡប់មិនត្រូវបានដាក់ចូលស្តុកវិញទេ។',

  // --- TEST RECEIPT MARKINGS ---
  'TEST RECEIPT — NOT A TRANSACTION': 'បង្កាន់ដៃសាកល្បង — មិនមែនជាប្រតិបត្តិការ',
}

/**
 * Returns "English / Khmer" label string.
 * If no translation exists, returns the original English label.
 */
export function bilingual(englishText: string): string {
  if (!englishText) return ''
  const trimmed = englishText.trim()
  const khmer = BILINGUAL_DICTIONARY[trimmed]
  if (khmer) {
    return `${trimmed} / ${khmer}`
  }
  return trimmed
}

/**
 * Formats a document title into bilingual format, handling Part numbers cleanly.
 */
export function bilingualDocumentTitle(
  documentType: string,
  options: {
    ticketPart?: number
    isRepayment?: boolean
    rawTitle?: string
  } = {},
): string {
  if (options.rawTitle && options.rawTitle.includes('TEST RECEIPT')) {
    return `${options.rawTitle} / បង្កាន់ដៃសាកល្បង — មិនមែនជាប្រតិបត្តិការ`
  }

  switch (documentType) {
    case 'SALE_RECEIPT':
      return 'Sales Receipt / Invoice / បង្កាន់ដៃលក់ / វិក្កយបត្រ'
    case 'PURCHASE_RECEIPT':
      return 'Purchase Receipt / បង្កាន់ដៃទិញ'
    case 'REFUND_RECEIPT':
      return 'Refund Receipt / បង្កាន់ដៃសងប្រាក់'
    case 'PAWN_CONTRACT': {
      const part = Number(options.ticketPart || 1)
      const khPart = toKhmerNumerals(part)
      return `Pawn Contract - Part ${part} / កិច្ចសន្យាបញ្ចាំ - ផ្នែកទី ${khPart}`
    }
    case 'PAWN_PAYMENT':
      return 'Pawn Payment Receipt / បង្កាន់ដៃបង់ប្រាក់បញ្ចាំ'
    case 'PAWN_REDEMPTION':
      return 'Pawn Redemption Receipt / បង្កាន់ដៃលោះវត្ថុបញ្ចាំ'
    case 'LOAN_AGREEMENT':
      return 'Loan Agreement / កិច្ចសន្យាប្រាក់កម្ចី'
    case 'LOAN_PAYMENT':
      return 'Loan Repayment Receipt / បង្កាន់ដៃសងប្រាក់កម្ចី'
    case 'SERVICE_RECEIPT':
      return 'Service Receipt / បង្កាន់ដៃសេវាកម្ម'
    default: {
      if (options.rawTitle) {
        return bilingual(options.rawTitle)
      }
      return documentType
    }
  }
}

/**
 * Maps business transaction status codes to bilingual labels.
 */
export function bilingualStatus(status?: string): string {
  if (!status) return '—'
  const upper = String(status).toUpperCase()
  const map: Record<string, { en: string; kh: string }> = {
    ACTIVE: { en: 'Active', kh: 'សកម្ម' },
    PAID: { en: 'Paid', kh: 'បានបង់' },
    PARTIAL: { en: 'Partial', kh: 'បង់មួយផ្នែក' },
    UNPAID: { en: 'Unpaid', kh: 'មិនទាន់បង់' },
    OVERDUE: { en: 'Overdue', kh: 'ហួសកាលកំណត់' },
    DUE_SOON: { en: 'Due Soon', kh: 'ជិតដល់ថ្ងៃកំណត់' },
    COMPLETED: { en: 'Completed', kh: 'បានបញ្ចប់' },
    CANCELLED: { en: 'Cancelled', kh: 'បានបោះបង់' },
    RETURNED: { en: 'Returned', kh: 'បានប្រគល់ត្រឡប់' },
    REFUNDED: { en: 'Refunded', kh: 'បានសងប្រាក់' },
    REDEEMED: { en: 'Redeemed', kh: 'បានលោះ' },
    FORFEITED: { en: 'Forfeited', kh: 'រឹបអូស' },
    DEFAULT: { en: 'Default', kh: 'អសកម្ម' },
    EXTENDED: { en: 'Extended', kh: 'បានបន្តកិច្ចសន្យា' },
    VOID: { en: 'Void', kh: 'ទុកជាមោឃៈ' },
  }
  const match = map[upper]
  if (match) return `${match.en} / ${match.kh}`
  // Fallback title formatting
  const enFallback = String(status).replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase())
  return bilingual(enFallback)
}

/**
 * Maps payment method codes to bilingual labels.
 */
export function bilingualPaymentMethod(method?: string): string {
  if (!method) return '—'
  const upper = String(method).toUpperCase()
  const map: Record<string, { en: string; kh: string }> = {
    CASH: { en: 'Cash', kh: 'សាច់ប្រាក់' },
    KHQR: { en: 'KHQR', kh: 'KHQR' },
    BANK: { en: 'Bank Transfer', kh: 'ផ្ទេរតាមធនាគារ' },
    BANK_TRANSFER: { en: 'Bank Transfer', kh: 'ផ្ទេរតាមធនាគារ' },
    CARD: { en: 'Card', kh: 'កាត' },
    OTHER: { en: 'Other', kh: 'ផ្សេងៗ' },
    NOT_RECORDED: { en: 'Not recorded', kh: 'មិនបានកត់ត្រា' },
    TEST_MODE: { en: 'Test Mode', kh: 'របៀបសាកល្បង' },
  }
  const match = map[upper]
  if (match) return `${match.en} / ${match.kh}`
  const enFallback = String(method).replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase())
  return bilingual(enFallback)
}

/**
 * Maps payment type codes to bilingual labels.
 */
export function bilingualPaymentType(type?: string): string {
  if (!type) return '—'
  const upper = String(type).toUpperCase()
  const map: Record<string, { en: string; kh: string }> = {
    PRINCIPAL: { en: 'Principal', kh: 'ប្រាក់ដើម' },
    INTEREST: { en: 'Interest', kh: 'ការប្រាក់' },
    INTEREST_FEE: { en: 'Interest Fee', kh: 'កម្រៃការប្រាក់' },
    DAILY_FEE: { en: 'Daily Fee', kh: 'កម្រៃប្រចាំថ្ងៃ' },
    RENEWAL: { en: 'Renewal', kh: 'បន្តកិច្ចសន្យា' },
    REDEMPTION: { en: 'Redemption', kh: 'លោះវត្ថុបញ្ចាំ' },
    LOAN_REPAYMENT: { en: 'Loan Repayment', kh: 'សងប្រាក់កម្ចី' },
    PARTIAL_PRINCIPAL: { en: 'Partial Principal', kh: 'ប្រាក់ដើមមួយផ្នែក' },
  }
  const match = map[upper]
  if (match) return `${match.en} / ${match.kh}`
  const enFallback = String(type).replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase())
  return bilingual(enFallback)
}

/**
 * Maps interest types to bilingual labels.
 */
export function bilingualInterestType(interestType?: string): string {
  if (!interestType) return '—'
  const upper = String(interestType).toUpperCase()
  const map: Record<string, { en: string; kh: string }> = {
    PERCENT: { en: 'Percent', kh: 'ភាគរយ' },
    FIXED: { en: 'Fixed', kh: 'ចំនួនថេរ' },
    NONE: { en: 'None', kh: 'គ្មាន' },
  }
  const match = map[upper]
  if (match) return `${match.en} / ${match.kh}`
  return bilingual(interestType)
}

/**
 * Maps party roles (Customer, Seller, Borrower) to bilingual labels.
 */
export function bilingualPartyRole(role?: string, fallbackDocType?: string): string {
  const resolvedRole = role || (fallbackDocType === 'PURCHASE_RECEIPT' ? 'Seller' : fallbackDocType === 'LOAN_AGREEMENT' || fallbackDocType === 'LOAN_PAYMENT' ? 'Borrower' : 'Customer')
  return bilingual(resolvedRole)
}

/**
 * Maps party name fallbacks (Walk-in customer, Walk-in seller, etc.) to bilingual labels.
 */
export function bilingualPartyFallback(role?: string, docType?: string): string {
  if (role === 'Seller' || docType === 'PURCHASE_RECEIPT') {
    return 'Walk-in seller / អ្នកលក់ទូទៅ'
  }
  if (role === 'Borrower' || docType === 'LOAN_AGREEMENT' || docType === 'LOAN_PAYMENT') {
    return 'Unknown borrower / មិនស្គាល់អ្នកខ្ចី'
  }
  return 'Walk-in customer / អតិថិជនទូទៅ'
}

/**
 * Formats signature label to bilingual display.
 */
export function bilingualSignatureLabel(label: string): string {
  return bilingual(label)
}

/**
 * Translates generated system notes (such as refund reasons and inventory disposition notes)
 * while preserving user-entered notes and descriptions verbatim.
 */
export function bilingualNotes(notes?: string, documentType?: string): string {
  if (!notes) return ''
  return notes
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (documentType === 'REFUND_RECEIPT' && trimmed.startsWith('Refund reason:')) {
        const reason = trimmed.replace('Refund reason:', '').trim()
        return `Refund reason / មូលហេតុសងប្រាក់: ${reason}`
      }
      if (documentType === 'REFUND_RECEIPT' && trimmed === 'Returned items were restored to available stock.') {
        return 'Returned items were restored to available stock. / ទំនិញបានប្រគល់ត្រឡប់ត្រូវបានដាក់ចូលស្តុកវិញ។'
      }
      if (documentType === 'REFUND_RECEIPT' && trimmed === 'Returned items were not restored to saleable stock.') {
        return 'Returned items were not restored to saleable stock. / ទំនិញបានប្រគល់ត្រឡប់មិនត្រូវបានដាក់ចូលស្តុកវិញទេ។'
      }
      if (documentType === 'SALE_RECEIPT' && trimmed === 'TEST RECEIPT — NOT A TRANSACTION. Browser printer verification only.') {
        return 'TEST RECEIPT — NOT A TRANSACTION. Browser printer verification only. / បង្កាន់ដៃសាកល្បង — មិនមែនជាប្រតិបត្តិការទេ។ សម្រាប់ផ្ទៀងផ្ទាត់ម៉ាស៊ីនបោះពុម្ពប៉ុណ្ណោះ។'
      }
      return line
    })
    .join('\n')
}

/**
 * Translates default system footers while leaving custom shop footers intact.
 */
export function bilingualFooter(footer?: string): string {
  if (!footer) {
    return 'Thank you for your business. / សូមអរគុណចំពោះការគាំទ្ររបស់លោកអ្នក។'
  }
  const trimmed = footer.trim()
  if (trimmed === 'Thank you for your business.') {
    return 'Thank you for your business. / សូមអរគុណចំពោះការគាំទ្ររបស់លោកអ្នក។'
  }
  if (trimmed === 'Thank you.') {
    return 'Thank you. / សូមអរគុណ។'
  }
  // User customized shop footer is preserved as stored
  return footer
}
