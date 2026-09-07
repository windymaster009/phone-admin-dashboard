import { useCallback, useEffect, useState, type FormEvent } from 'react'
import './loan-workspace.css'
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  FileText,
  MoreHorizontal,
  Phone,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { api, type SessionUser } from '../../lib/api'
import LoadingState from '../../components/LoadingState'
import MoneyInput from '../../components/MoneyInput'
import SummaryStats from '../../components/SummaryStats'
import ScannerWorkflow from '../../components/scanner/ScannerWorkflow'
import ScannerTriggerButton from '../../components/scanner/ScannerTriggerButton'
import OperationModalShell from '../../components/OperationModalShell'
import OperationWorkflowStepper, { type WorkflowStep } from '../../components/OperationWorkflowStepper'
import OperationWorkflowFooter from '../../components/OperationWorkflowFooter'
import OperationSectionCard from '../../components/OperationSectionCard'
import SegmentedControl from '../../components/SegmentedControl'
import KeyValueSummary from '../../components/KeyValueSummary'

type Currency = 'USD' | 'KHR'
type LoanStatus = 'ACTIVE' | 'DUE_SOON' | 'OVERDUE' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED'

type Loan = {
  _id: string
  loanNo: string
  borrower: { name: string; phone?: string; nationalIdNumber?: string; address?: string }
  principal: number
  interestType: 'NONE' | 'FIXED' | 'PERCENT'
  interestValue: number
  interestAmount: number
  totalDue: number
  amountPaid: number
  remainingBalance: number
  currency: Currency
  loanDate: string
  dueDate: string
  reminderDays: number
  status: LoanStatus
  reason?: string
  notes?: string
  createdAt: string
}

type LoanPayment = {
  _id: string
  paymentNo: string
  amount: number
  paymentMethod: string
  paidAt: string
  reference?: string
  note?: string
  receivedBy?: { name: string; role: string }
}

type CurrencySummary = {
  lent: number
  expected: number
  paid: number
  outstanding: number
  dueSoon: number
  overdue: number
}

export type LoanSummary = {
  byCurrency: Record<Currency, CurrencySummary>
  counts: { total: number; open: number; dueSoon: number; overdue: number; paid: number }
}

type LoanDetail = { loan: Loan; payments: LoanPayment[] }

type LoanPaymentConfirmation = {
  amount: number
  paymentMethod: string
  currency: Currency
  remainingBalance: number
  status: LoanStatus
}

export const emptyCurrencySummary = (): CurrencySummary => ({ lent: 0, expected: 0, paid: 0, outstanding: 0, dueSoon: 0, overdue: 0 })
export const emptySummary = (): LoanSummary => ({
  byCurrency: { USD: emptyCurrencySummary(), KHR: emptyCurrencySummary() },
  counts: { total: 0, open: 0, dueSoon: 0, overdue: 0, paid: 0 },
})

function money(value: number, currency: Currency) {
  if (currency === 'KHR') return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)} ៛`
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
}

function dateText(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(date)
}

function dateInput(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function dueDescription(loan: Loan) {
  if (loan.status === 'PAID') return 'Paid in full'
  if (loan.status === 'CANCELLED') return 'Cancelled'
  const due = new Date(loan.dueDate)
  const today = new Date()
  due.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`
  if (days === 0) return 'Due today'
  return `Due in ${days} day${days === 1 ? '' : 's'}`
}

function statusLabel(status: LoanStatus) {
  return status.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
}

function LoanStatusBadge({ status }: { status: LoanStatus }) {
  const Icon = status === 'ACTIVE'
    ? BadgeCheck
    : status === 'DUE_SOON'
      ? Clock
      : status === 'OVERDUE'
        ? AlertTriangle
        : status === 'PARTIALLY_PAID'
          ? CircleDollarSign
          : status === 'PAID'
            ? CheckCircle2
            : X

  return <span className={`loan-status loan-status-${status.toLowerCase().replaceAll('_', '-')}`}><Icon size={15} strokeWidth={2} aria-hidden="true" />{statusLabel(status)}</span>
}

function ScanLoanModal({ busy, error, onClose, onScan }: { busy: boolean; error: string; onClose: () => void; onScan: (value: string) => void }) {
  const [code, setCode] = useState('')
  const [cameraError, setCameraError] = useState('')

  return (
    <OperationModalShell
      title="Scan loan"
      eyebrow="Loan lookup"
      description="Scan the loan barcode or enter the loan number to open its record."
      icon={<Banknote size={21} />}
      compact
      scanner
      className="loan-modal"
      error={error || cameraError}
      busy={busy}
      onClose={onClose}
    >
      <ScannerWorkflow
        code={code}
        onCodeChange={(value) => { setCode(value); if (cameraError) setCameraError('') }}
        onSubmit={onScan}
        onCameraError={setCameraError}
        busy={busy}
        introDescription="Use the receipt barcode for the fastest loan lookup, or open this device camera."
        methodTitle="Loan barcode"
        methodDescription="Keep this field selected, then scan the receipt."
        inputLabel="Loan barcode or number"
        placeholder="Scan or enter loan number"
        submitLabel="Find loan"
        helpText="Works with the loan receipt barcode. Most handheld scanners press Enter automatically."
        cameraHelpText="Allow camera access on localhost or HTTPS. A handheld scanner can type into the field above."
        readerId="phoneflow-loan-barcode-reader"
        className="loan-scan-workflow"
      />
    </OperationModalShell>
  )
}

function CreateLoanModal({ busy, error, createdLoan, onClose, onSubmit }: {
  busy: boolean
  error: string
  createdLoan: Loan | null
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const [step, setStep] = useState<1 | 2>(1)
  const [borrowerName, setBorrowerName] = useState('')
  const [borrowerPhone, setBorrowerPhone] = useState('')
  const [nationalIdNumber, setNationalIdNumber] = useState('')
  const [address, setAddress] = useState('')
  const [step1Error, setStep1Error] = useState('')

  const [principal, setPrincipal] = useState(0)
  const [currency, setCurrency] = useState<Currency>('USD')
  const [interestType, setInterestType] = useState<'NONE' | 'FIXED' | 'PERCENT'>('NONE')
  const [interestValue, setInterestValue] = useState(0)
  const [loanDate, setLoanDate] = useState(() => dateInput(new Date()))
  const due = new Date()
  due.setDate(due.getDate() + 30)
  const [dueDate, setDueDate] = useState(() => dateInput(due))
  const [reminderDays, setReminderDays] = useState(3)
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')

  const interestAmount = interestType === 'FIXED' ? interestValue : interestType === 'PERCENT' ? principal * interestValue / 100 : 0

  const steps: WorkflowStep[] = [
    {
      id: 'borrower',
      title: 'Borrower',
      description: 'Contact & identity',
      status: step === 1 ? 'active' : 'complete',
    },
    {
      id: 'terms',
      title: 'Terms & schedule',
      description: 'Amount & interest',
      status: step === 2 ? 'active' : 'pending',
    },
  ]

  const handleContinue = () => {
    if (!borrowerName.trim()) {
      setStep1Error('Borrower name is required')
      return
    }
    setStep1Error('')
    setStep(2)
  }

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (step === 1) {
      handleContinue()
      return
    }
    onSubmit(event)
  }

  if (createdLoan) {
    return (
      <OperationModalShell
        title="Loan saved"
        eyebrow="Money lending"
        description="The borrower and repayment schedule are ready to review."
        icon={<CheckCircle2 size={21} />}
        compact
        confirmation
        className="loan-modal"
        onClose={onClose}
      >
        <section className="record-created-workflow" role="status" aria-live="polite">
          <div className="record-created-card">
            <span className="record-created-check"><CheckCircle2 size={38} /></span>
            <div><span className="eyebrow">Record saved</span><h3>Loan record created</h3></div>
            <KeyValueSummary
              columns={3}
              items={[
                { id: 'loanNo', label: 'Loan number', value: createdLoan.loanNo },
                { id: 'principal', label: 'Principal', value: money(createdLoan.principal, createdLoan.currency) },
                { id: 'status', label: 'Status', value: <LoanStatusBadge status={createdLoan.status} /> },
              ]}
            />
          </div>
          <OperationWorkflowFooter
            primaryAction={
              <button type="button" className="primary-button record-created-done" onClick={onClose}>
                <CheckCircle2 size={16} /> Done
              </button>
            }
          />
        </section>
      </OperationModalShell>
    )
  }

  return (
    <OperationModalShell
      title="Create loan"
      eyebrow="Money lending"
      description="Record who borrowed money and when it must be repaid."
      icon={<Banknote size={21} />}
      className="loan-modal"
      error={error || step1Error}
      busy={busy}
      onClose={onClose}
    >
      <OperationWorkflowStepper
        steps={steps}
        ariaLabel="Loan creation steps"
        onStepClick={(_stepObj, index) => {
          if (index === 0) setStep(1)
          else if (index === 1 && borrowerName.trim()) setStep(2)
        }}
      />

      <form className="operation-form loan-create-form" onSubmit={handleFormSubmit}>
        {step === 1 && (
          <div className="operation-form-grid">
            <label>
              Borrower name
              <input
                name="borrowerName"
                autoFocus
                required
                placeholder="Full name"
                value={borrowerName}
                onChange={(e) => {
                  setBorrowerName(e.target.value)
                  if (step1Error) setStep1Error('')
                }}
              />
            </label>
            <label>
              Phone number <small className="optional-marker">Optional</small>
              <input
                name="borrowerPhone"
                placeholder="012 345 678"
                value={borrowerPhone}
                onChange={(e) => setBorrowerPhone(e.target.value)}
              />
            </label>
            <label>
              National ID <small className="optional-marker">Optional</small>
              <input
                name="nationalIdNumber"
                placeholder="ID number"
                value={nationalIdNumber}
                onChange={(e) => setNationalIdNumber(e.target.value)}
              />
            </label>
            <label className="operation-wide">
              Address <small className="optional-marker">Optional</small>
              <input
                name="address"
                placeholder="Village, district, province"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </label>
          </div>
        )}

        {step === 2 && (
          <>
            <input type="hidden" name="borrowerName" value={borrowerName} />
            <input type="hidden" name="borrowerPhone" value={borrowerPhone} />
            <input type="hidden" name="nationalIdNumber" value={nationalIdNumber} />
            <input type="hidden" name="address" value={address} />

            <input type="hidden" name="currency" value={currency} />
            <input type="hidden" name="interestType" value={interestType} />
            {interestType === 'NONE' && <input type="hidden" name="interestValue" value="0" />}

            <div className="operation-form-grid">
              <label>
                Loan amount
                <MoneyInput
                  name="principal"
                  currency={currency}
                  value={principal || ''}
                  minimum={currency === 'KHR' ? 100 : 0.01}
                  required
                  autoFocus
                  onValueChange={(value) => setPrincipal(Number(value) || 0)}
                />
              </label>

              <div className="loan-control-field">
                <span className="field-label">Currency</span>
                <SegmentedControl<Currency>
                  label="Currency"
                  value={currency}
                  onChange={(nextCurrency) => {
                    setCurrency(nextCurrency)
                    if (nextCurrency === 'KHR') {
                      setPrincipal((val) => Math.max(100, Math.round(val / 100) * 100))
                      if (interestType === 'FIXED') setInterestValue((val) => Math.round(val / 100) * 100)
                    }
                  }}
                  options={[
                    { value: 'USD', label: 'USD ($)' },
                    { value: 'KHR', label: 'KHR (៛)' },
                  ]}
                />
              </div>

              <div className="loan-control-field operation-wide">
                <span className="field-label">Interest calculation</span>
                <SegmentedControl<'NONE' | 'FIXED' | 'PERCENT'>
                  label="Interest calculation"
                  value={interestType}
                  onChange={(nextInterestType) => {
                    setInterestType(nextInterestType)
                    if (nextInterestType === 'NONE') setInterestValue(0)
                  }}
                  options={[
                    { value: 'NONE', label: 'No interest' },
                    { value: 'PERCENT', label: 'Rate (%)' },
                    { value: 'FIXED', label: 'Fixed money amount' },
                  ]}
                />
              </div>

              {interestType === 'NONE' ? (
                <div className="loan-interest-field operation-wide">
                  <span className="loan-interest-label">Interest details</span>
                  <div className="loan-interest-note" role="status">
                    <strong>No interest</strong>
                    <span>The borrower repays only the loan amount.</span>
                  </div>
                </div>
              ) : interestType === 'PERCENT' ? (
                <label>
                  Interest rate (%)
                  <span className="device-unit-input">
                    <input
                      name="interestValue"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={interestValue || ''}
                      onChange={(event) => setInterestValue(Number(event.target.value) || 0)}
                    />
                    <span>%</span>
                  </span>
                  <small>Applied once to the loan amount.</small>
                </label>
              ) : (
                <label>
                  Interest amount ({currency})
                  <MoneyInput
                    name="interestValue"
                    currency={currency}
                    value={interestValue || ''}
                    minimum={0}
                    onValueChange={(value) => setInterestValue(Number(value) || 0)}
                  />
                  <small>Added as a fixed money amount.</small>
                </label>
              )}

              <label>
                Loan date
                <input
                  name="loanDate"
                  type="date"
                  required
                  value={loanDate}
                  onChange={(e) => setLoanDate(e.target.value)}
                />
              </label>

              <label>
                Due date
                <input
                  name="dueDate"
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </label>

              <label>
                Remind before due
                <select
                  name="reminderDays"
                  value={reminderDays}
                  onChange={(e) => setReminderDays(Number(e.target.value))}
                >
                  <option value="0">On due date</option>
                  <option value="1">1 day before</option>
                  <option value="3">3 days before</option>
                  <option value="7">7 days before</option>
                  <option value="14">14 days before</option>
                </select>
              </label>

              <label>
                Reason <small className="optional-marker">Optional</small>
                <input
                  name="reason"
                  placeholder="Emergency, business, personal..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>

              <label className="operation-wide">
                Notes <small className="optional-marker">Optional</small>
                <textarea
                  name="notes"
                  rows={3}
                  placeholder="Agreement details or anything the owner should remember"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>

            <KeyValueSummary
              columns={3}
              className="loan-preview"
              items={[
                { id: 'principal', label: 'Principal', value: money(principal, currency) },
                { id: 'interest', label: 'Interest', value: money(interestAmount, currency) },
                { id: 'total', label: 'Total expected', value: money(principal + interestAmount, currency), tone: 'success' },
              ]}
            />
          </>
        )}

        <OperationWorkflowFooter
          secondaryAction={
            step === 1 ? (
              <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>
                Cancel
              </button>
            ) : (
              <button type="button" className="ghost-button" onClick={() => setStep(1)} disabled={busy}>
                Back
              </button>
            )
          }
          primaryAction={
            step === 1 ? (
              <button
                type="button"
                className="primary-button"
                onClick={handleContinue}
                disabled={busy || !borrowerName.trim()}
              >
                Continue
              </button>
            ) : (
              <button
                type="submit"
                className="primary-button"
                disabled={busy || principal <= 0}
              >
                {busy ? 'Creating...' : 'Create loan'}
              </button>
            )
          }
        />
      </form>
    </OperationModalShell>
  )
}

function LoanDetailModal({ detail, user, busy, error, paymentConfirmation, cancelConfirmation, deleteConfirmation, onClose, onPayment, onDueDate, onCancel, onConfirmCancel, onDelete, onConfirmDelete, onCancelConfirmationClose, onDeleteConfirmationClose }: {
  detail: LoanDetail
  user: SessionUser | null
  busy: boolean
  error: string
  paymentConfirmation: LoanPaymentConfirmation | null
  cancelConfirmation: boolean
  deleteConfirmation: boolean
  onClose: () => void
  onPayment: (event: FormEvent<HTMLFormElement>) => void
  onDueDate: (event: FormEvent<HTMLFormElement>) => void
  onCancel: () => void
  onConfirmCancel: () => void
  onDelete: () => void
  onConfirmDelete: () => void
  onCancelConfirmationClose: () => void
  onDeleteConfirmationClose: () => void
}) {
  const { loan, payments } = detail
  const canManage = user?.role === 'OWNER' || user?.role === 'MANAGER'
  const canPay = canManage || user?.role === 'CASHIER'
  const open = !['PAID', 'CANCELLED'].includes(loan.status)
  const canDelete = user?.role === 'OWNER' && !open

  if (paymentConfirmation) {
    return (
      <OperationModalShell
        title="Payment recorded"
        eyebrow="Repayment"
        description="The loan balance and payment history have been updated."
        icon={<CheckCircle2 size={21} />}
        compact
        confirmation
        className="loan-modal"
        onClose={onClose}
      >
        <section className="record-created-workflow" role="status" aria-live="polite">
          <div className="record-created-card">
            <span className="record-created-check"><CheckCircle2 size={38} /></span>
            <div><span className="eyebrow">Repayment saved</span><h3>{paymentConfirmation.status === 'PAID' ? 'Loan paid in full' : 'Loan payment recorded'}</h3></div>
            <KeyValueSummary
              columns={3}
              items={[
                { id: 'amount', label: 'Payment received', value: money(paymentConfirmation.amount, paymentConfirmation.currency) },
                { id: 'remaining', label: 'Remaining balance', value: money(paymentConfirmation.remainingBalance, paymentConfirmation.currency) },
                { id: 'method', label: 'Payment method', value: paymentConfirmation.paymentMethod },
              ]}
            />
          </div>
          <OperationWorkflowFooter
            secondaryAction={
              paymentConfirmation.status === 'PAID' && user?.role === 'OWNER' ? (
                <button type="button" className="ghost-button danger-button" onClick={onDelete}>
                  <Trash2 size={15} /> Delete loan
                </button>
              ) : undefined
            }
            primaryAction={
              <button type="button" className="primary-button record-created-done" onClick={onClose}>
                <CheckCircle2 size={16} /> Done
              </button>
            }
          />
        </section>
      </OperationModalShell>
    )
  }

  if (cancelConfirmation) {
    return (
      <OperationModalShell
        title="Cancel this loan?"
        eyebrow="Loan cancellation"
        description="Confirm that this agreement should be closed without a repayment."
        icon={<AlertTriangle size={21} />}
        compact
        confirmation
        className="loan-modal"
        error={error}
        busy={busy}
        onClose={onCancelConfirmationClose}
      >
        <section className="loan-cancel-confirmation" aria-describedby="loan-cancel-description">
          <span className="loan-cancel-confirmation-icon"><AlertTriangle size={22} /></span>
          <div>
            <strong>{loan.loanNo}</strong>
            <span>{loan.borrower.name} · {money(loan.remainingBalance, loan.currency)} remaining</span>
            <p id="loan-cancel-description">No payments have been recorded, so this loan can be cancelled. It will remain in the audit history with a cancelled status.</p>
          </div>
        </section>
        <OperationWorkflowFooter
          className="loan-cancel-actions"
          secondaryAction={
            <button type="button" className="ghost-button" disabled={busy} onClick={onCancelConfirmationClose}>
              Keep loan
            </button>
          }
          primaryAction={
            <button type="button" className="danger-button loan-cancel-confirm-button" disabled={busy} onClick={onConfirmCancel}>
              {busy ? 'Cancelling...' : 'Cancel loan'}
            </button>
          }
        />
      </OperationModalShell>
    )
  }

  if (deleteConfirmation) {
    return (
      <OperationModalShell
        title="Delete this loan?"
        eyebrow="Permanent deletion"
        description="This removes the completed loan and its payment records."
        icon={<Trash2 size={21} />}
        compact
        confirmation
        className="loan-modal"
        error={error}
        busy={busy}
        onClose={onDeleteConfirmationClose}
      >
        <section className="loan-cancel-confirmation loan-delete-confirmation" aria-describedby="loan-delete-description">
          <span className="loan-cancel-confirmation-icon"><Trash2 size={21} /></span>
          <div>
            <strong>{loan.loanNo}</strong>
            <span>{loan.borrower.name} · {statusLabel(loan.status)}</span>
            <p id="loan-delete-description">This permanently removes the loan, its repayments, and related receipts. This cannot be undone.</p>
          </div>
        </section>
        <OperationWorkflowFooter
          className="loan-cancel-actions"
          secondaryAction={
            <button type="button" className="ghost-button" disabled={busy} onClick={onDeleteConfirmationClose}>
              Keep record
            </button>
          }
          primaryAction={
            <button type="button" className="danger-button loan-cancel-confirm-button" disabled={busy} onClick={onConfirmDelete}>
              {busy ? 'Deleting...' : 'Delete permanently'}
            </button>
          }
        />
      </OperationModalShell>
    )
  }

  return (
    <OperationModalShell
      title={`${loan.loanNo} · ${loan.borrower.name}`}
      eyebrow="Loan record"
      description={`${dueDescription(loan)} · ${money(loan.remainingBalance, loan.currency)} remaining`}
      icon={<Banknote size={21} />}
      className="loan-modal"
      error={error}
      busy={busy}
      onClose={onClose}
    >
      <div className="loan-detail-scroll">
        <KeyValueSummary
          columns={4}
          className="loan-detail-summary"
          items={[
            { id: 'borrower', label: 'Borrower', value: loan.borrower.name, supportingText: <><Phone size={13} /> {loan.borrower.phone || 'No phone recorded'}</> },
            { id: 'principal', label: 'Principal', value: money(loan.principal, loan.currency), supportingText: loan.interestType === 'NONE' ? 'No interest' : `${money(loan.interestAmount, loan.currency)} interest` },
            { id: 'totalDue', label: 'Total expected', value: money(loan.totalDue, loan.currency), supportingText: `${money(loan.amountPaid, loan.currency)} received` },
            { id: 'remaining', label: 'Remaining', value: money(loan.remainingBalance, loan.currency), supportingText: dateText(loan.dueDate), tone: 'warning' },
          ]}
        />

        <section className="loan-detail-grid">
          <OperationSectionCard
            title="Loan details"
            eyebrow="Agreement"
            badge={<LoanStatusBadge status={loan.status} />}
            className="loan-detail-card"
          >
            <dl className="loan-definition-list">
              <div><dt>Loan date</dt><dd>{dateText(loan.loanDate)}</dd></div>
              <div><dt>Due date</dt><dd>{dateText(loan.dueDate)}</dd></div>
              <div><dt>National ID</dt><dd>{loan.borrower.nationalIdNumber || 'Not recorded'}</dd></div>
              <div><dt>Address</dt><dd>{loan.borrower.address || 'Not recorded'}</dd></div>
              <div><dt>Reason</dt><dd>{loan.reason || 'No reason recorded'}</dd></div>
              <div><dt>Notes</dt><dd>{loan.notes || 'No notes'}</dd></div>
            </dl>
            {canManage && open && (
              <form className="loan-due-form" onSubmit={onDueDate}>
                <label>Change due date<input name="dueDate" type="date" required defaultValue={dateInput(new Date(loan.dueDate))} /></label>
                <button className="ghost-button" disabled={busy}>Save due date</button>
              </form>
            )}
          </OperationSectionCard>

          <OperationSectionCard
            title="Record payment"
            eyebrow="Repayment"
            badge={<CircleDollarSign size={21} />}
            className="loan-detail-card"
          >
            {canPay && open ? (
              <form className="loan-payment-form" onSubmit={onPayment}>
                <label>Amount<input name="amount" type="number" min={loan.currency === 'KHR' ? '1' : '0.01'} max={loan.remainingBalance} step={loan.currency === 'KHR' ? '1' : '0.01'} inputMode={loan.currency === 'KHR' ? 'numeric' : 'decimal'} required placeholder={String(loan.remainingBalance)} /></label>
                <label>Payment method<select name="paymentMethod" defaultValue="CASH"><option value="CASH">Cash</option><option value="KHQR">KHQR</option><option value="BANK">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label>
                <label>Payment date<input name="paidAt" type="date" required defaultValue={dateInput(new Date())} /></label>
                <label>Reference <small className="optional-marker">Optional</small><input name="reference" placeholder="Receipt or transfer reference" /></label>
                <label className="loan-payment-note">Note <small className="optional-marker">Optional</small><textarea name="note" rows={2} placeholder="Payment note" /></label>
                <button className="primary-button" disabled={busy}>{busy ? 'Recording...' : 'Record payment'}</button>
              </form>
            ) : (
              <div className="loan-payment-complete">
                <BadgeCheck size={28} />
                <strong>{loan.status === 'PAID' ? 'Loan paid in full' : loan.status === 'CANCELLED' ? 'Loan cancelled' : 'You cannot record payments'}</strong>
              </div>
            )}
          </OperationSectionCard>
        </section>

        <section className="loan-payment-history">
          <div className="loan-card-heading"><div><span className="eyebrow">Audit trail</span><h3>Payment history</h3></div><span>{payments.length} payment{payments.length === 1 ? '' : 's'}</span></div>
          {payments.length > 0 ? <div className="loan-payment-list">{payments.map((payment) => <article key={payment._id}><span className="loan-payment-icon"><Banknote size={17} /></span><div><strong>{money(payment.amount, loan.currency)}</strong><small>{payment.paymentNo} · {payment.paymentMethod}</small></div><div><strong>{dateText(payment.paidAt)}</strong><small>{payment.receivedBy?.name || 'Staff'}{payment.reference ? ` · ${payment.reference}` : ''}</small></div></article>)}</div> : <div className="loan-empty-history"><FileText size={27} /><span>No repayments recorded yet.</span></div>}
        </section>

        {canManage && open && loan.amountPaid === 0 && <div className="loan-danger-zone"><div><strong>Cancel this loan</strong><span>Only loans without repayment history can be cancelled.</span></div><button type="button" className="ghost-button danger-button" disabled={busy} onClick={onCancel}>Cancel loan</button></div>}
        {canDelete && <div className="loan-danger-zone loan-delete-zone"><div><strong>Delete completed loan</strong><span>Permanently remove this {loan.status === 'PAID' ? 'paid' : 'cancelled'} loan and its linked payment records.</span></div><button type="button" className="ghost-button danger-button" disabled={busy} onClick={onDelete}><Trash2 size={15} /> Delete loan</button></div>}
      </div>
    </OperationModalShell>
  )
}

export interface LoanPageProps {
  summary?: LoanSummary
  onSummary?: (summary: LoanSummary) => void
}

export default function LoanPage({ summary: externalSummary, onSummary }: LoanPageProps = {}) {
  const [internalSummary, setInternalSummary] = useState<LoanSummary>(emptySummary)
  const summary = externalSummary || internalSummary
  const [loans, setLoans] = useState<Loan[]>([])
  const [user, setUser] = useState<SessionUser | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const [createdLoan, setCreatedLoan] = useState<Loan | null>(null)
  const [detail, setDetail] = useState<LoanDetail | null>(null)
  const [paymentConfirmation, setPaymentConfirmation] = useState<LoanPaymentConfirmation | null>(null)
  const [cancelConfirmation, setCancelConfirmation] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState(false)

  const loadLoans = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams()
      if (search.trim()) query.set('search', search.trim())
      if (status !== 'ALL') query.set('status', status)
      const result = await api<{ loans: Loan[]; summary: LoanSummary }>(`/loans?${query.toString()}`)
      setLoans(result.loans)
      setInternalSummary(result.summary)
      onSummary?.(result.summary)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load loans')
    } finally {
      setLoading(false)
    }
  }, [onSummary, search, status])

  useEffect(() => { void api<{ user: SessionUser }>('/auth/me').then((result) => setUser(result.user)).catch(() => undefined) }, [])
  useEffect(() => { const timer = window.setTimeout(() => void loadLoans(), 180); return () => window.clearTimeout(timer) }, [loadLoans])

  async function createLoan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setModalError('')
    try {
      const result = await api<{ loan: Loan }>('/loans', { method: 'POST', body: JSON.stringify({
        borrower: {
          name: String(form.get('borrowerName') || '').trim(),
          phone: String(form.get('borrowerPhone') || '').trim(),
          nationalIdNumber: String(form.get('nationalIdNumber') || '').trim(),
          address: String(form.get('address') || '').trim(),
        },
        principal: Number(form.get('principal') || 0),
        currency: form.get('currency'),
        interestType: form.get('interestType'),
        interestValue: Number(form.get('interestValue') || 0),
        loanDate: form.get('loanDate'),
        dueDate: form.get('dueDate'),
        reminderDays: Number(form.get('reminderDays') || 3),
        reason: String(form.get('reason') || '').trim(),
        notes: String(form.get('notes') || '').trim(),
      }) })
      await loadLoans()
      setCreatedLoan(result.loan)
    } catch (reason) {
      setModalError(reason instanceof Error ? reason.message : 'Unable to create loan')
    } finally {
      setBusy(false)
    }
  }

  async function openDetail(loan: Loan) {
    setModalError('')
    setPaymentConfirmation(null)
    setCancelConfirmation(false)
    setDeleteConfirmation(false)
    try { setDetail(await api<LoanDetail>(`/loans/${loan._id}`)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to open loan') }
  }

  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!detail) return
    const form = new FormData(event.currentTarget)
    const amount = Number(form.get('amount') || 0)
    const paymentMethod = String(form.get('paymentMethod') || 'CASH')
    setBusy(true)
    setModalError('')
    try {
      const nextDetail = await api<LoanDetail>(`/loans/${detail.loan._id}/payments`, { method: 'POST', body: JSON.stringify({
        amount,
        paymentMethod,
        paidAt: form.get('paidAt'),
        reference: String(form.get('reference') || '').trim(),
        note: String(form.get('note') || '').trim(),
      }) })
      setDetail(nextDetail)
      setPaymentConfirmation({
        amount,
        paymentMethod,
        currency: nextDetail.loan.currency,
        remainingBalance: nextDetail.loan.remainingBalance,
        status: nextDetail.loan.status,
      })
      await loadLoans()
    } catch (reason) {
      setModalError(reason instanceof Error ? reason.message : 'Unable to record payment')
    } finally {
      setBusy(false)
    }
  }

  async function changeDueDate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!detail) return
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setModalError('')
    try {
      await api(`/loans/${detail.loan._id}`, { method: 'PATCH', body: JSON.stringify({ dueDate: form.get('dueDate') }) })
      setDetail(await api<LoanDetail>(`/loans/${detail.loan._id}`))
      await loadLoans()
    } catch (reason) {
      setModalError(reason instanceof Error ? reason.message : 'Unable to update due date')
    } finally {
      setBusy(false)
    }
  }

  async function cancelLoan() {
    if (!detail) return
    setBusy(true)
    setModalError('')
    try {
      await api(`/loans/${detail.loan._id}/cancel`, { method: 'POST', body: JSON.stringify({ note: 'Cancelled from loan manager' }) })
      setDetail(await api<LoanDetail>(`/loans/${detail.loan._id}`))
      setCancelConfirmation(false)
      await loadLoans()
    } catch (reason) {
      setModalError(reason instanceof Error ? reason.message : 'Unable to cancel loan')
    } finally {
      setBusy(false)
    }
  }

  async function findLoanByBarcode(rawCode: string) {
    const code = rawCode.trim()
    if (!code) return
    setBusy(true)
    setScannerError('')
    try {
      const result = await api<{ loans: Loan[] }>(`/loans?${new URLSearchParams({ search: code }).toString()}`)
      const normalised = code.toUpperCase()
      const loan = result.loans.find((item) => item.loanNo.toUpperCase() === normalised) || result.loans[0]
      if (!loan) throw new Error('No loan matches that barcode. Check that you scanned the loan receipt.')
      setShowScanner(false)
      await openDetail(loan)
    } catch (reason) {
      setScannerError(reason instanceof Error ? reason.message : 'Unable to find this loan')
    } finally {
      setBusy(false)
    }
  }

  async function deleteLoan() {
    if (!detail) return
    setBusy(true)
    setModalError('')
    try {
      await api(`/loans/${detail.loan._id}`, { method: 'DELETE' })
      setDetail(null)
      setDeleteConfirmation(false)
      await loadLoans()
    } catch (reason) {
      setModalError(reason instanceof Error ? reason.message : 'Unable to delete loan')
    } finally {
      setBusy(false)
    }
  }

  const canCreate = user?.role === 'OWNER' || user?.role === 'MANAGER'
  return <div className="loan-workspace-bridge">
    <div className="section-header">
      <div><span className="eyebrow">Finance & control</span><h2>Loans</h2><p>Track money lent to people, upcoming due dates, overdue balances, and every repayment.</p></div>
      <div className="loan-section-actions">
        <ScannerTriggerButton label="Scan loan" onClick={() => { setScannerError(''); setShowScanner(true) }} />
        {canCreate && <button className="primary-button" onClick={() => { setModalError(''); setCreatedLoan(null); setShowCreate(true) }}><Plus size={17} /> New loan</button>}
      </div>
    </div>
    {error && <div className="loan-error"><AlertTriangle size={17} /> {error}</div>}

    <SummaryStats
      label="Loan summary"
      items={[
        { label: 'Total lent', value: money(summary.byCurrency.USD.lent, 'USD'), secondaryValue: money(summary.byCurrency.KHR.lent, 'KHR'), detail: `${summary.counts.total} loan${summary.counts.total === 1 ? '' : 's'}`, icon: Banknote, tone: 'violet' },
        { label: 'Outstanding', value: money(summary.byCurrency.USD.outstanding, 'USD'), secondaryValue: money(summary.byCurrency.KHR.outstanding, 'KHR'), detail: `${summary.counts.open} still open`, icon: CircleDollarSign, tone: 'blue' },
        { label: 'Due soon', value: money(summary.byCurrency.USD.dueSoon, 'USD'), secondaryValue: money(summary.byCurrency.KHR.dueSoon, 'KHR'), detail: `${summary.counts.dueSoon} reminder${summary.counts.dueSoon === 1 ? '' : 's'}`, icon: Clock, tone: 'orange' },
        { label: 'Overdue', value: money(summary.byCurrency.USD.overdue, 'USD'), secondaryValue: money(summary.byCurrency.KHR.overdue, 'KHR'), detail: `${summary.counts.overdue} need attention`, icon: AlertTriangle, tone: 'rose' },
      ]}
    />

    <article className="surface-card table-card page-table loan-table-card">
      <div className="filter-row loan-filter-row">
        <div className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search loan number, borrower, phone, ID, or reason" /></div>
        <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="DUE_SOON">Due soon</option><option value="OVERDUE">Overdue</option><option value="PARTIALLY_PAID">Partially paid</option><option value="PAID">Paid</option><option value="CANCELLED">Cancelled</option></select>
        <button className="ghost-button" onClick={() => void loadLoans()} aria-label="Refresh loans"><RefreshCcw size={15} /><span>Refresh</span></button>
      </div>
      <div className="table-scroll"><table><thead><tr><th>Loan</th><th>Borrower</th><th>Lent</th><th>Remaining</th><th>Due date</th><th>Status</th><th /></tr></thead><tbody>
        {loans.map((loan) => <tr key={loan._id} className={loan.status === 'OVERDUE' ? 'loan-overdue-row' : ''}>
          <td><strong>{loan.loanNo}</strong><small className="cell-note">{dateText(loan.loanDate)}</small></td>
          <td><div className="loan-borrower-cell"><span className="avatar">{loan.borrower.name.slice(0, 2).toUpperCase()}</span><p><strong>{loan.borrower.name}</strong><small>{loan.borrower.phone || 'No phone recorded'}</small></p></div></td>
          <td>{money(loan.principal, loan.currency)}<small className="cell-note">Expected {money(loan.totalDue, loan.currency)}</small></td>
          <td><strong>{money(loan.remainingBalance, loan.currency)}</strong><small className="cell-note">Paid {money(loan.amountPaid, loan.currency)}</small></td>
          <td>{dateText(loan.dueDate)}<small className={`cell-note loan-due-note ${loan.status === 'OVERDUE' ? 'danger' : ''}`}>{dueDescription(loan)}</small></td>
          <td><LoanStatusBadge status={loan.status} /></td>
          <td><button className="icon-button loan-view-button" onClick={() => void openDetail(loan)} aria-label={`View ${loan.loanNo}`} title="View loan"><MoreHorizontal size={18} /></button></td>
        </tr>)}
        {!loading && loans.length === 0 && <tr><td colSpan={7}><div className="loan-empty"><Banknote size={31} /><strong>No loans found</strong><span>{search || status !== 'ALL' ? 'Try another search or status filter.' : 'Create the first loan record so due dates are never forgotten.'}</span></div></td></tr>}
        {loading && <tr><td colSpan={7}><LoadingState compact label="Loading loans" detail="Checking balances and due dates…" /></td></tr>}
      </tbody></table></div>
      <div className="loan-mobile-list">
        {loans.map((loan) => <article className={`mobile-contract-card loan-mobile-card ${loan.status === 'OVERDUE' ? 'overdue' : ''}`} key={loan._id}>
          <div className="mobile-contract-heading loan-mobile-heading"><span className="avatar">{loan.borrower.name.slice(0, 2).toUpperCase()}</span><p><strong>{loan.borrower.name}</strong><small>{loan.loanNo}{loan.borrower.phone ? ` · ${loan.borrower.phone}` : ''}</small></p><LoanStatusBadge status={loan.status} /></div>
          <div className="mobile-contract-details loan-mobile-details"><div><span>Remaining</span><strong>{money(loan.remainingBalance, loan.currency)}</strong><small>{dueDescription(loan)}</small></div><div><span>Due date</span><strong>{dateText(loan.dueDate)}</strong><small>{loan.loanNo}</small></div><button className="icon-button loan-mobile-open" onClick={() => void openDetail(loan)} aria-label={`View loan ${loan.loanNo}`} title="View loan"><MoreHorizontal size={18} /></button></div>
        </article>)}
        {!loading && loans.length === 0 && <div className="loan-empty"><Banknote size={31} /><strong>No loans found</strong><span>{search || status !== 'ALL' ? 'Try another search or status filter.' : 'Create the first loan record so due dates are never forgotten.'}</span></div>}
        {loading && <LoadingState compact label="Loading loans" />}
      </div>
    </article>

    {showCreate && <CreateLoanModal busy={busy} error={modalError} createdLoan={createdLoan} onClose={() => { if (!busy) { setShowCreate(false); setCreatedLoan(null) } }} onSubmit={createLoan} />}
    {showScanner && <ScanLoanModal busy={busy} error={scannerError} onClose={() => { if (!busy) { setShowScanner(false); setScannerError('') } }} onScan={(value) => void findLoanByBarcode(value)} />}
    {detail && <LoanDetailModal detail={detail} user={user} busy={busy} error={modalError} paymentConfirmation={paymentConfirmation} cancelConfirmation={cancelConfirmation} deleteConfirmation={deleteConfirmation} onClose={() => { if (!busy) { setDetail(null); setPaymentConfirmation(null); setCancelConfirmation(false); setDeleteConfirmation(false) } }} onPayment={recordPayment} onDueDate={changeDueDate} onCancel={() => { setModalError(''); setCancelConfirmation(true) }} onConfirmCancel={cancelLoan} onDelete={() => { setModalError(''); setPaymentConfirmation(null); setCancelConfirmation(false); setDeleteConfirmation(true) }} onConfirmDelete={deleteLoan} onCancelConfirmationClose={() => { if (!busy) { setCancelConfirmation(false); setModalError('') } }} onDeleteConfirmationClose={() => { if (!busy) { setDeleteConfirmation(false); setModalError('') } }} />}
  </div>
}
