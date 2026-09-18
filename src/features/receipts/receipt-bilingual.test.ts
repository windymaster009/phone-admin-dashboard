import { describe, expect, it } from 'vitest'
import {
  bilingual,
  bilingualDocumentTitle,
  bilingualFooter,
  bilingualInterestType,
  bilingualNotes,
  bilingualPartyFallback,
  bilingualPartyRole,
  bilingualPaymentMethod,
  bilingualPaymentType,
  bilingualSignatureLabel,
  bilingualStatus,
  toKhmerNumerals,
} from './receipt-bilingual'

describe('receipt-bilingual module', () => {
  it('converts numbers to Khmer numerals correctly', () => {
    expect(toKhmerNumerals(1)).toBe('១')
    expect(toKhmerNumerals(2)).toBe('២')
    expect(toKhmerNumerals(10)).toBe('១០')
    expect(toKhmerNumerals(25)).toBe('២៥')
  })

  it('translates document titles for all 9 document types', () => {
    expect(bilingualDocumentTitle('SALE_RECEIPT')).toBe('Sales Receipt / Invoice / បង្កាន់ដៃលក់ / វិក្កយបត្រ')
    expect(bilingualDocumentTitle('PURCHASE_RECEIPT')).toBe('Purchase Receipt / បង្កាន់ដៃទិញ')
    expect(bilingualDocumentTitle('REFUND_RECEIPT')).toBe('Refund Receipt / បង្កាន់ដៃសងប្រាក់')
    expect(bilingualDocumentTitle('PAWN_CONTRACT', { ticketPart: 1 })).toBe('Pawn Contract - Part 1 / កិច្ចសន្យាបញ្ចាំ - ផ្នែកទី ១')
    expect(bilingualDocumentTitle('PAWN_CONTRACT', { ticketPart: 2 })).toBe('Pawn Contract - Part 2 / កិច្ចសន្យាបញ្ចាំ - ផ្នែកទី ២')
    expect(bilingualDocumentTitle('PAWN_CONTRACT', { ticketPart: 3 })).toBe('Pawn Contract - Part 3 / កិច្ចសន្យាបញ្ចាំ - ផ្នែកទី ៣')
    expect(bilingualDocumentTitle('PAWN_PAYMENT')).toBe('Pawn Payment Receipt / បង្កាន់ដៃបង់ប្រាក់បញ្ចាំ')
    expect(bilingualDocumentTitle('PAWN_REDEMPTION')).toBe('Pawn Redemption Receipt / បង្កាន់ដៃលោះវត្ថុបញ្ចាំ')
    expect(bilingualDocumentTitle('LOAN_AGREEMENT')).toBe('Loan Agreement / កិច្ចសន្យាប្រាក់កម្ចី')
    expect(bilingualDocumentTitle('LOAN_PAYMENT')).toBe('Loan Repayment Receipt / បង្កាន់ដៃសងប្រាក់កម្ចី')
    expect(bilingualDocumentTitle('SERVICE_RECEIPT')).toBe('Service Receipt / បង្កាន់ដៃសេវាកម្ម')
  })

  it('translates transaction and payment statuses by business meaning', () => {
    expect(bilingualStatus('ACTIVE')).toBe('Active / សកម្ម')
    expect(bilingualStatus('PAID')).toBe('Paid / បានបង់')
    expect(bilingualStatus('PARTIAL')).toBe('Partial / បង់មួយផ្នែក')
    expect(bilingualStatus('UNPAID')).toBe('Unpaid / មិនទាន់បង់')
    expect(bilingualStatus('OVERDUE')).toBe('Overdue / ហួសកាលកំណត់')
    expect(bilingualStatus('DUE_SOON')).toBe('Due Soon / ជិតដល់ថ្ងៃកំណត់')
    expect(bilingualStatus('COMPLETED')).toBe('Completed / បានបញ្ចប់')
    expect(bilingualStatus('CANCELLED')).toBe('Cancelled / បានបោះបង់')
    expect(bilingualStatus('RETURNED')).toBe('Returned / បានប្រគល់ត្រឡប់')
    expect(bilingualStatus('REFUNDED')).toBe('Refunded / បានសងប្រាក់')
    expect(bilingualStatus('REDEEMED')).toBe('Redeemed / បានលោះ')
    expect(bilingualStatus('FORFEITED')).toBe('Forfeited / រឹបអូស')
    expect(bilingualStatus('DEFAULT')).toBe('Default / អសកម្ម')
    expect(bilingualStatus('EXTENDED')).toBe('Extended / បានបន្តកិច្ចសន្យា')
    expect(bilingualStatus('VOID')).toBe('Void / ទុកជាមោឃៈ')
  })

  it('translates payment methods by business meaning', () => {
    expect(bilingualPaymentMethod('CASH')).toBe('Cash / សាច់ប្រាក់')
    expect(bilingualPaymentMethod('KHQR')).toBe('KHQR / KHQR')
    expect(bilingualPaymentMethod('BANK')).toBe('Bank Transfer / ផ្ទេរតាមធនាគារ')
    expect(bilingualPaymentMethod('BANK_TRANSFER')).toBe('Bank Transfer / ផ្ទេរតាមធនាគារ')
    expect(bilingualPaymentMethod('CARD')).toBe('Card / កាត')
    expect(bilingualPaymentMethod('OTHER')).toBe('Other / ផ្សេងៗ')
    expect(bilingualPaymentMethod('NOT_RECORDED')).toBe('Not recorded / មិនបានកត់ត្រា')
    expect(bilingualPaymentMethod('TEST_MODE')).toBe('Test Mode / របៀបសាកល្បង')
  })

  it('translates payment types by business meaning', () => {
    expect(bilingualPaymentType('PRINCIPAL')).toBe('Principal / ប្រាក់ដើម')
    expect(bilingualPaymentType('INTEREST')).toBe('Interest / ការប្រាក់')
    expect(bilingualPaymentType('INTEREST_FEE')).toBe('Interest Fee / កម្រៃការប្រាក់')
    expect(bilingualPaymentType('DAILY_FEE')).toBe('Daily Fee / កម្រៃប្រចាំថ្ងៃ')
    expect(bilingualPaymentType('RENEWAL')).toBe('Renewal / បន្តកិច្ចសន្យា')
    expect(bilingualPaymentType('REDEMPTION')).toBe('Redemption / លោះវត្ថុបញ្ចាំ')
    expect(bilingualPaymentType('LOAN_REPAYMENT')).toBe('Loan Repayment / សងប្រាក់កម្ចី')
    expect(bilingualPaymentType('PARTIAL_PRINCIPAL')).toBe('Partial Principal / ប្រាក់ដើមមួយផ្នែក')
  })

  it('translates interest types', () => {
    expect(bilingualInterestType('PERCENT')).toBe('Percent / ភាគរយ')
    expect(bilingualInterestType('FIXED')).toBe('Fixed / ចំនួនថេរ')
    expect(bilingualInterestType('NONE')).toBe('None / គ្មាន')
  })

  it('translates party roles and fallbacks', () => {
    expect(bilingualPartyRole('Customer')).toBe('Customer / អតិថិជន')
    expect(bilingualPartyRole('Seller')).toBe('Seller / អ្នកលក់')
    expect(bilingualPartyRole('Borrower')).toBe('Borrower / អ្នកខ្ចី')

    expect(bilingualPartyFallback('Customer', 'SALE_RECEIPT')).toBe('Walk-in customer / អតិថិជនទូទៅ')
    expect(bilingualPartyFallback('Seller', 'PURCHASE_RECEIPT')).toBe('Walk-in seller / អ្នកលក់ទូទៅ')
    expect(bilingualPartyFallback('Borrower', 'LOAN_AGREEMENT')).toBe('Unknown borrower / មិនស្គាល់អ្នកខ្ចី')
  })

  it('translates all standard signature labels', () => {
    expect(bilingualSignatureLabel('Customer signature / thumbprint')).toBe('Customer signature / thumbprint / ហត្ថលេខា ឬ ស្នាមមេដៃអតិថិជន')
    expect(bilingualSignatureLabel('Shop representative')).toBe('Shop representative / តំណាងហាង')
    expect(bilingualSignatureLabel('Borrower signature / thumbprint')).toBe('Borrower signature / thumbprint / ហត្ថលេខា ឬ ស្នាមមេដៃអ្នកខ្ចី')
    expect(bilingualSignatureLabel('Borrower signature')).toBe('Borrower signature / ហត្ថលេខាអ្នកខ្ចី')
    expect(bilingualSignatureLabel('Lender signature')).toBe('Lender signature / ហត្ថលេខាអ្នកឱ្យខ្ចី')
    expect(bilingualSignatureLabel('Authorized lender')).toBe('Authorized lender / អ្នកឱ្យខ្ចីមានសិទ្ធិ')
    expect(bilingualSignatureLabel('Cashier signature')).toBe('Cashier signature / ហត្ថលេខាអ្នកទទួលប្រាក់')
    expect(bilingualSignatureLabel('Customer signature')).toBe('Customer signature / ហត្ថលេខាអតិថិជន')
    expect(bilingualSignatureLabel('Seller signature')).toBe('Seller signature / ហត្ថលេខាអ្នកលក់')
    expect(bilingualSignatureLabel('Customer acknowledgement')).toBe('Customer acknowledgement / ការទទួលស្គាល់របស់អតិថិជន')
    expect(bilingualSignatureLabel('Customer confirms collateral received')).toBe('Customer confirms collateral received / អតិថិជនបញ្ជាក់ថាបានទទួលវត្ថុបញ្ចាំត្រឡប់')
  })

  it('translates generated system notes while leaving user-entered notes intact', () => {
    const generated = 'Refund reason: Defective screen\nReturned items were restored to available stock.'
    const result = bilingualNotes(generated, 'REFUND_RECEIPT')
    expect(result).toContain('Refund reason / មូលហេតុសងប្រាក់: Defective screen')
    expect(result).toContain('Returned items were restored to available stock. / ទំនិញបានប្រគល់ត្រឡប់ត្រូវបានដាក់ចូលស្តុកវិញ។')

    const userEntered = 'Customer requested expedited delivery.'
    expect(bilingualNotes(userEntered)).toBe(userEntered)
    expect(bilingualNotes('Refund reason: This is my own note.', 'SALE_RECEIPT')).toBe('Refund reason: This is my own note.')
  })

  it('translates default footers while preserving custom shop footers', () => {
    expect(bilingualFooter('Thank you for your business.')).toBe('Thank you for your business. / សូមអរគុណចំពោះការគាំទ្ររបស់លោកអ្នក។')
    expect(bilingualFooter('Thank you.')).toBe('Thank you. / សូមអរគុណ។')
    expect(bilingualFooter('Custom shop policy: no refunds after 7 days.')).toBe('Custom shop policy: no refunds after 7 days.')
  })

  it('translates all core glossary phrases consistently', () => {
    expect(bilingual('Loan amount')).toBe('Loan amount / ចំនួនប្រាក់កម្ចី')
    expect(bilingual('Pawn fee at due date')).toBe('Pawn fee at due date / កម្រៃបញ្ចាំនៅថ្ងៃកំណត់បង់')
    expect(bilingual('Daily pawn fee rate')).toBe('Daily pawn fee rate / អត្រាកម្រៃបញ្ចាំប្រចាំថ្ងៃ')
    expect(bilingual('Contract length')).toBe('Contract length / រយៈពេលកិច្ចសន្យា')
    expect(bilingual('Extension period')).toBe('Extension period / រយៈពេលបន្តកិច្ចសន្យា')
    expect(bilingual('Previous due date')).toBe('Previous due date / ថ្ងៃកំណត់បង់មុន')
    expect(bilingual('New fee due date')).toBe('New fee due date / ថ្ងៃកំណត់បង់កម្រៃថ្មី')
    expect(bilingual('Date to pay pawn fee')).toBe('Date to pay pawn fee / ថ្ងៃកំណត់បង់កម្រៃបញ្ចាំ')
    expect(bilingual('Date to pay interest')).toBe('Date to pay interest / ថ្ងៃកំណត់បង់ការប្រាក់')
    expect(bilingual('Grace period ends')).toBe('Grace period ends / ថ្ងៃផុតរយៈពេលអនុគ្រោះ')
    expect(bilingual('Pawned item')).toBe('Pawned item / វត្ថុបញ្ចាំ')
    expect(bilingual('Subtotal')).toBe('Subtotal / សរុបរង')
    expect(bilingual('Discount')).toBe('Discount / បញ្ចុះតម្លៃ')
    expect(bilingual('Total')).toBe('Total / សរុប')
    expect(bilingual('Amount paid')).toBe('Amount paid / ចំនួនប្រាក់បានបង់')
    expect(bilingual('Amount received')).toBe('Amount received / ចំនួនប្រាក់បានទទួល')
    expect(bilingual('Change')).toBe('Change / ប្រាក់អាប់')
    expect(bilingual('Remaining balance')).toBe('Remaining balance / ប្រាក់នៅសល់')
  })
})
