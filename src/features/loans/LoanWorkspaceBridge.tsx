import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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
  X,
} from 'lucide-react'
import { api, type SessionUser } from '../../lib/api'

type Currency = 'USD' | 'KHR'
type LoanStatus = 'ACTIVE' | 'DUE_SOON' | 'OVERDUE' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED'

type Loan = {
  _id: string
  loanNo: string
  borrower: { name: string; phone: string; nationalIdNumber?: string; address?: string }
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

type LoanSummary = {
  byCurrency: Record<Currency, CurrencySummary>
  counts: { total: number; open: number; dueSoon: number; overdue: number; paid: number }
}

type LoanDetail = { loan: Loan; payments: LoanPayment[] }

const emptyCurrencySummary = (): CurrencySummary => ({ lent: 0, expected: 0, paid: 0, outstanding: 0, dueSoon: 0, overdue: 0 })
const emptySummary = (): LoanSummary => ({
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
  return <span className={`loan-status loan-status-${status.toLowerCase().replaceAll('_', '-')}`}>{statusLabel(status)}</span>
}

function DualAmount({ usd, khr }: { usd: number; khr: number }) {
  return <><strong>{money(usd, 'USD')}</strong><small>{money(khr, 'KHR')}</small></>
}

function Modal({ title, eyebrow, description, onClose, compact = false, children }: {
  title: string
  eyebrow: string
  description: string
  onClose: () => void
  compact?: boolean
  children: ReactNode
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    document.body.classList.add('operation-modal-open')
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.body.classList.remove('operation-modal-open')
    }
  }, [onClose])

  return createPortal(
    <div className="operation-modal-backdrop loan-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className={`operation-modal loan-modal${compact ? ' operation-modal-compact' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="operation-modal-header">
          <span className="operation-modal-icon"><Banknote size={21} /></span>
          <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>
          <button type="button" className="operation-modal-close" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </header>
        {children}
      </section>
    </div>,
    document.body,
  )
}

function CreateLoanModal({ busy, error, createdLoan, onClose, onSubmit }: {
  busy: boolean
  error: string
  createdLoan: Loan | null
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const [principal, setPrincipal] = useState(0)
  const [currency, setCurrency] = useState<Currency>('USD')
  const [interestType, setInterestType] = useState<'NONE' | 'FIXED' | 'PERCENT'>('NONE')
  const [interestValue, setInterestValue] = useState(0)
  const due = new Date()
  due.setDate(due.getDate() + 30)
  const interestAmount = interestType === 'FIXED' ? interestValue : interestType === 'PERCENT' ? principal * interestValue / 100 : 0

  return <Modal title="Create loan" eyebrow="Money lending" description="Record who borrowed money and when it must be repaid." compact={Boolean(createdLoan)} onClose={onClose}>
    {createdLoan && <section className="record-created-workflow" role="status" aria-live="polite">
      <div className="record-created-card">
        <span className="record-created-check"><CheckCircle2 size={38} /></span>
        <div><span className="eyebrow">Record saved</span><h3>Loan record created</h3></div>
        <dl>
          <div><dt>Loan number</dt><dd>{createdLoan.loanNo}</dd></div>
          <div><dt>Principal</dt><dd>{money(createdLoan.principal, createdLoan.currency)}</dd></div>
          <div><dt>Status</dt><dd><span>{statusLabel(createdLoan.status)}</span></dd></div>
        </dl>
      </div>
      <footer className="operation-modal-actions"><button type="button" className="primary-button record-created-done" onClick={onClose}><CheckCircle2 size={16} /> Done</button></footer>
    </section>}
    {!createdLoan && <>
    {error && <div className="operation-modal-error"><AlertTriangle size={17} /> {error}</div>}
    <form className="operation-form loan-create-form" onSubmit={onSubmit}>
      <div className="operation-form-grid">
        <label>Borrower name<input name="borrowerName" autoFocus required placeholder="Full name" /></label>
        <label>Phone number<input name="borrowerPhone" required placeholder="012 345 678" /></label>
        <label>National ID<input name="nationalIdNumber" placeholder="Optional" /></label>
        <label>Address<input name="address" placeholder="Village, district, province" /></label>
        <label>Loan amount<input name="principal" type="number" min={currency === 'KHR' ? '1' : '0.01'} step={currency === 'KHR' ? '1' : '0.01'} inputMode={currency === 'KHR' ? 'numeric' : 'decimal'} value={principal || ''} required onChange={(event) => setPrincipal(Number(event.target.value) || 0)} /></label>
        <label>Currency<select name="currency" value={currency} onChange={(event) => {
          const nextCurrency = event.target.value as Currency
          setCurrency(nextCurrency)
          if (nextCurrency === 'KHR') {
            setPrincipal((value) => Math.round(value))
            if (interestType === 'FIXED') setInterestValue((value) => Math.round(value))
          }
        }}><option value="USD">USD</option><option value="KHR">KHR</option></select></label>
        <label>Interest type<select name="interestType" value={interestType} onChange={(event) => setInterestType(event.target.value as 'NONE' | 'FIXED' | 'PERCENT')}><option value="NONE">No interest</option><option value="FIXED">Fixed amount</option><option value="PERCENT">Percentage</option></select></label>
        <label>{interestType === 'PERCENT' ? 'Interest percent' : 'Interest amount'}<input name="interestValue" type="number" min="0" step={interestType === 'PERCENT' ? '0.01' : currency === 'KHR' ? '1' : '0.01'} inputMode={interestType === 'PERCENT' || currency === 'USD' ? 'decimal' : 'numeric'} value={interestValue} disabled={interestType === 'NONE'} onChange={(event) => setInterestValue(Number(event.target.value) || 0)} /></label>
        <label>Loan date<input name="loanDate" type="date" required defaultValue={dateInput(new Date())} /></label>
        <label>Due date<input name="dueDate" type="date" required defaultValue={dateInput(due)} /></label>
        <label>Remind before due<select name="reminderDays" defaultValue="3"><option value="0">On due date</option><option value="1">1 day before</option><option value="3">3 days before</option><option value="7">7 days before</option><option value="14">14 days before</option></select></label>
        <label>Reason<input name="reason" placeholder="Emergency, business, personal..." /></label>
        <label className="operation-wide">Notes<textarea name="notes" rows={3} placeholder="Agreement details or anything the owner should remember" /></label>
      </div>
      <div className="loan-preview">
        <div><span>Principal</span><strong>{money(principal, currency)}</strong></div>
        <div><span>Interest</span><strong>{money(interestAmount, currency)}</strong></div>
        <div><span>Total expected</span><strong>{money(principal + interestAmount, currency)}</strong></div>
      </div>
      <footer className="operation-modal-actions"><button type="button" className="ghost-button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" disabled={busy || principal <= 0}>{busy ? 'Creating...' : 'Create loan'}</button></footer>
    </form>
    </>}
  </Modal>
}

function LoanDetailModal({ detail, user, busy, error, onClose, onPayment, onDueDate, onCancel }: {
  detail: LoanDetail
  user: SessionUser | null
  busy: boolean
  error: string
  onClose: () => void
  onPayment: (event: FormEvent<HTMLFormElement>) => void
  onDueDate: (event: FormEvent<HTMLFormElement>) => void
  onCancel: () => void
}) {
  const { loan, payments } = detail
  const canManage = user?.role === 'OWNER' || user?.role === 'MANAGER'
  const canPay = canManage || user?.role === 'CASHIER'
  const open = !['PAID', 'CANCELLED'].includes(loan.status)

  return <Modal title={`${loan.loanNo} · ${loan.borrower.name}`} eyebrow="Loan record" description={`${dueDescription(loan)} · ${money(loan.remainingBalance, loan.currency)} remaining`} onClose={onClose}>
    {error && <div className="operation-modal-error"><AlertTriangle size={17} /> {error}</div>}
    <div className="loan-detail-scroll">
      <section className="loan-detail-summary">
        <div><span>Borrower</span><strong>{loan.borrower.name}</strong><small><Phone size={13} /> {loan.borrower.phone}</small></div>
        <div><span>Principal</span><strong>{money(loan.principal, loan.currency)}</strong><small>{loan.interestType === 'NONE' ? 'No interest' : `${money(loan.interestAmount, loan.currency)} interest`}</small></div>
        <div><span>Total expected</span><strong>{money(loan.totalDue, loan.currency)}</strong><small>{money(loan.amountPaid, loan.currency)} received</small></div>
        <div><span>Remaining</span><strong>{money(loan.remainingBalance, loan.currency)}</strong><small>{dateText(loan.dueDate)}</small></div>
      </section>

      <section className="loan-detail-grid">
        <article className="loan-detail-card">
          <div className="loan-card-heading"><div><span className="eyebrow">Agreement</span><h3>Loan details</h3></div><LoanStatusBadge status={loan.status} /></div>
          <dl className="loan-definition-list">
            <div><dt>Loan date</dt><dd>{dateText(loan.loanDate)}</dd></div>
            <div><dt>Due date</dt><dd>{dateText(loan.dueDate)}</dd></div>
            <div><dt>National ID</dt><dd>{loan.borrower.nationalIdNumber || 'Not recorded'}</dd></div>
            <div><dt>Address</dt><dd>{loan.borrower.address || 'Not recorded'}</dd></div>
            <div><dt>Reason</dt><dd>{loan.reason || 'No reason recorded'}</dd></div>
            <div><dt>Notes</dt><dd>{loan.notes || 'No notes'}</dd></div>
          </dl>
          {canManage && open && <form className="loan-due-form" onSubmit={onDueDate}><label>Change due date<input name="dueDate" type="date" required defaultValue={dateInput(new Date(loan.dueDate))} /></label><button className="ghost-button" disabled={busy}>Save due date</button></form>}
        </article>

        <article className="loan-detail-card">
          <div className="loan-card-heading"><div><span className="eyebrow">Repayment</span><h3>Record payment</h3></div><CircleDollarSign size={21} /></div>
          {canPay && open ? <form className="loan-payment-form" onSubmit={onPayment}>
            <label>Amount<input name="amount" type="number" min={loan.currency === 'KHR' ? '1' : '0.01'} max={loan.remainingBalance} step={loan.currency === 'KHR' ? '1' : '0.01'} inputMode={loan.currency === 'KHR' ? 'numeric' : 'decimal'} required placeholder={String(loan.remainingBalance)} /></label>
            <label>Payment method<select name="paymentMethod" defaultValue="CASH"><option value="CASH">Cash</option><option value="KHQR">KHQR</option><option value="BANK">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label>
            <label>Payment date<input name="paidAt" type="date" required defaultValue={dateInput(new Date())} /></label>
            <label>Reference<input name="reference" placeholder="Optional receipt or transfer reference" /></label>
            <label className="loan-payment-note">Note<textarea name="note" rows={2} placeholder="Optional payment note" /></label>
            <button className="primary-button" disabled={busy}>{busy ? 'Recording...' : 'Record payment'}</button>
          </form> : <div className="loan-payment-complete"><BadgeCheck size={28} /><strong>{loan.status === 'PAID' ? 'Loan paid in full' : loan.status === 'CANCELLED' ? 'Loan cancelled' : 'You cannot record payments'}</strong></div>}
        </article>
      </section>

      <section className="loan-payment-history">
        <div className="loan-card-heading"><div><span className="eyebrow">Audit trail</span><h3>Payment history</h3></div><span>{payments.length} payment{payments.length === 1 ? '' : 's'}</span></div>
        {payments.length > 0 ? <div className="loan-payment-list">{payments.map((payment) => <article key={payment._id}><span className="loan-payment-icon"><Banknote size={17} /></span><div><strong>{money(payment.amount, loan.currency)}</strong><small>{payment.paymentNo} · {payment.paymentMethod}</small></div><div><strong>{dateText(payment.paidAt)}</strong><small>{payment.receivedBy?.name || 'Staff'}{payment.reference ? ` · ${payment.reference}` : ''}</small></div></article>)}</div> : <div className="loan-empty-history"><FileText size={27} /><span>No repayments recorded yet.</span></div>}
      </section>

      {canManage && open && loan.amountPaid === 0 && <div className="loan-danger-zone"><div><strong>Cancel this loan</strong><span>Only loans without repayment history can be cancelled.</span></div><button type="button" className="ghost-button danger-button" disabled={busy} onClick={onCancel}>Cancel loan</button></div>}
    </div>
  </Modal>
}

function LoanPage({ summary, onSummary }: { summary: LoanSummary; onSummary: (summary: LoanSummary) => void }) {
  const [loans, setLoans] = useState<Loan[]>([])
  const [user, setUser] = useState<SessionUser | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createdLoan, setCreatedLoan] = useState<Loan | null>(null)
  const [detail, setDetail] = useState<LoanDetail | null>(null)

  const loadLoans = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams()
      if (search.trim()) query.set('search', search.trim())
      if (status !== 'ALL') query.set('status', status)
      const result = await api<{ loans: Loan[]; summary: LoanSummary }>(`/loans?${query.toString()}`)
      setLoans(result.loans)
      onSummary(result.summary)
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
    try { setDetail(await api<LoanDetail>(`/loans/${loan._id}`)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to open loan') }
  }

  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!detail) return
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setModalError('')
    try {
      setDetail(await api<LoanDetail>(`/loans/${detail.loan._id}/payments`, { method: 'POST', body: JSON.stringify({
        amount: Number(form.get('amount') || 0),
        paymentMethod: form.get('paymentMethod'),
        paidAt: form.get('paidAt'),
        reference: String(form.get('reference') || '').trim(),
        note: String(form.get('note') || '').trim(),
      }) }))
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
    if (!detail || !window.confirm(`Cancel ${detail.loan.loanNo}?`)) return
    setBusy(true)
    setModalError('')
    try {
      await api(`/loans/${detail.loan._id}/cancel`, { method: 'POST', body: JSON.stringify({ note: 'Cancelled from loan manager' }) })
      setDetail(await api<LoanDetail>(`/loans/${detail.loan._id}`))
      await loadLoans()
    } catch (reason) {
      setModalError(reason instanceof Error ? reason.message : 'Unable to cancel loan')
    } finally {
      setBusy(false)
    }
  }

  const canCreate = user?.role === 'OWNER' || user?.role === 'MANAGER'
  return <div className="loan-workspace-bridge">
    <div className="section-header">
      <div><span className="eyebrow">Finance & control</span><h2>Loans</h2><p>Track money lent to people, upcoming due dates, overdue balances, and every repayment.</p></div>
      {canCreate && <button className="primary-button" onClick={() => { setModalError(''); setCreatedLoan(null); setShowCreate(true) }}><Plus size={17} /> New loan</button>}
    </div>
    {error && <div className="loan-error"><AlertTriangle size={17} /> {error}</div>}

    <section className="loan-stats-grid">
      <article className="surface-card loan-stat"><span className="loan-stat-icon violet"><Banknote /></span><p>Total lent<DualAmount usd={summary.byCurrency.USD.lent} khr={summary.byCurrency.KHR.lent} /><em>{summary.counts.total} loan{summary.counts.total === 1 ? '' : 's'}</em></p></article>
      <article className="surface-card loan-stat"><span className="loan-stat-icon blue"><CircleDollarSign /></span><p>Outstanding<DualAmount usd={summary.byCurrency.USD.outstanding} khr={summary.byCurrency.KHR.outstanding} /><em>{summary.counts.open} still open</em></p></article>
      <article className="surface-card loan-stat"><span className="loan-stat-icon orange"><Clock /></span><p>Due soon<DualAmount usd={summary.byCurrency.USD.dueSoon} khr={summary.byCurrency.KHR.dueSoon} /><em>{summary.counts.dueSoon} reminder{summary.counts.dueSoon === 1 ? '' : 's'}</em></p></article>
      <article className="surface-card loan-stat"><span className="loan-stat-icon rose"><AlertTriangle /></span><p>Overdue<DualAmount usd={summary.byCurrency.USD.overdue} khr={summary.byCurrency.KHR.overdue} /><em>{summary.counts.overdue} need attention</em></p></article>
    </section>

    <article className="surface-card table-card page-table loan-table-card">
      <div className="filter-row loan-filter-row">
        <div className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search loan number, borrower, phone, ID, or reason" /></div>
        <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="DUE_SOON">Due soon</option><option value="OVERDUE">Overdue</option><option value="PARTIALLY_PAID">Partially paid</option><option value="PAID">Paid</option><option value="CANCELLED">Cancelled</option></select>
        <button className="ghost-button" onClick={() => void loadLoans()}><RefreshCcw size={15} /> Refresh</button>
      </div>
      <div className="table-scroll"><table><thead><tr><th>Loan</th><th>Borrower</th><th>Lent</th><th>Remaining</th><th>Due date</th><th>Status</th><th /></tr></thead><tbody>
        {loans.map((loan) => <tr key={loan._id} className={loan.status === 'OVERDUE' ? 'loan-overdue-row' : ''}>
          <td><strong>{loan.loanNo}</strong><small className="cell-note">{dateText(loan.loanDate)}</small></td>
          <td><div className="loan-borrower-cell"><span className="avatar">{loan.borrower.name.slice(0, 2).toUpperCase()}</span><p><strong>{loan.borrower.name}</strong><small>{loan.borrower.phone}</small></p></div></td>
          <td>{money(loan.principal, loan.currency)}<small className="cell-note">Expected {money(loan.totalDue, loan.currency)}</small></td>
          <td><strong>{money(loan.remainingBalance, loan.currency)}</strong><small className="cell-note">Paid {money(loan.amountPaid, loan.currency)}</small></td>
          <td>{dateText(loan.dueDate)}<small className={`cell-note loan-due-note ${loan.status === 'OVERDUE' ? 'danger' : ''}`}>{dueDescription(loan)}</small></td>
          <td><LoanStatusBadge status={loan.status} /></td>
          <td><button className="icon-button loan-view-button" onClick={() => void openDetail(loan)} aria-label={`View ${loan.loanNo}`} title="View loan"><MoreHorizontal size={18} /></button></td>
        </tr>)}
        {!loading && loans.length === 0 && <tr><td colSpan={7}><div className="loan-empty"><Banknote size={31} /><strong>No loans found</strong><span>{search || status !== 'ALL' ? 'Try another search or status filter.' : 'Create the first loan record so due dates are never forgotten.'}</span></div></td></tr>}
        {loading && <tr><td colSpan={7}>Loading loans...</td></tr>}
      </tbody></table></div>
      <div className="loan-mobile-list">{loans.map((loan) => <button className={`loan-mobile-card ${loan.status === 'OVERDUE' ? 'overdue' : ''}`} key={loan._id} onClick={() => void openDetail(loan)}><div><span className="avatar">{loan.borrower.name.slice(0, 2).toUpperCase()}</span><p><strong>{loan.borrower.name}</strong><small>{loan.loanNo} · {loan.borrower.phone}</small></p><LoanStatusBadge status={loan.status} /></div><section><span>Remaining<strong>{money(loan.remainingBalance, loan.currency)}</strong></span><span>Due<strong>{dateText(loan.dueDate)}</strong></span></section><footer>{dueDescription(loan)}</footer></button>)}</div>
    </article>

    {showCreate && <CreateLoanModal busy={busy} error={modalError} createdLoan={createdLoan} onClose={() => { if (!busy) { setShowCreate(false); setCreatedLoan(null) } }} onSubmit={createLoan} />}
    {detail && <LoanDetailModal detail={detail} user={user} busy={busy} error={modalError} onClose={() => { if (!busy) setDetail(null) }} onPayment={recordPayment} onDueDate={changeDueDate} onCancel={cancelLoan} />}
  </div>
}

export default function LoanWorkspaceBridge() {
  const [navTarget, setNavTarget] = useState<HTMLElement | null>(null)
  const [mainTarget, setMainTarget] = useState<HTMLElement | null>(null)
  const [active, setActive] = useState(() => window.location.pathname === '/loans')
  const [summary, setSummary] = useState<LoanSummary>(emptySummary)

  const loadSummary = useCallback(async () => {
    try { setSummary((await api<{ summary: LoanSummary }>('/loans/summary')).summary) }
    catch { /* The bridge also exists before authentication. */ }
  }, [])

  useEffect(() => {
    const locate = () => {
      const main = document.querySelector<HTMLElement>('.main-content')
      if (main) setMainTarget(main)
      let host = document.querySelector<HTMLElement>('.loan-nav-portal-host')
      if (!host) {
        const operations = Array.from(document.querySelectorAll<HTMLElement>('.nav-group')).find((group) => group.querySelector('.nav-group-label')?.textContent?.trim() === 'Operations')
        if (operations) {
          host = document.createElement('span')
          host.className = 'loan-nav-portal-host'
          const pawn = Array.from(operations.querySelectorAll<HTMLElement>(':scope > button')).find((button) => button.textContent?.includes('Pawn Management'))
          if (pawn) pawn.after(host)
          else operations.append(host)
        }
      }
      if (host) setNavTarget(host)
    }
    locate()
    const observer = new MutationObserver(locate)
    observer.observe(document.body, { childList: true, subtree: true })
    const sidebarClick = (event: MouseEvent) => {
      const button = event.target instanceof Element ? event.target.closest('.sidebar-nav button') : null
      if (button && !button.closest('.loan-nav-portal-host')) setActive(false)
    }
    const popState = () => setActive(window.location.pathname === '/loans')
    document.addEventListener('click', sidebarClick, true)
    window.addEventListener('popstate', popState)
    return () => {
      observer.disconnect()
      document.removeEventListener('click', sidebarClick, true)
      window.removeEventListener('popstate', popState)
      document.querySelector('.loan-nav-portal-host')?.remove()
      document.querySelector('.main-content')?.classList.remove('loan-route-active')
    }
  }, [])

  useEffect(() => {
    if (!mainTarget) return
    mainTarget.classList.toggle('loan-route-active', active)
    if (active) {
      document.querySelectorAll('.sidebar-nav button.active').forEach((button) => button.classList.remove('active'))
      document.title = 'Loans · PhoneFlow'
      void loadSummary()
    }
  }, [active, loadSummary, mainTarget])

  useEffect(() => {
    if (!navTarget) return
    void loadSummary()
    const timer = window.setInterval(() => void loadSummary(), 60_000)
    return () => window.clearInterval(timer)
  }, [loadSummary, navTarget])

  const openLoans = () => {
    if (window.location.pathname !== '/loans') window.history.pushState({ view: 'loans' }, '', '/loans')
    setActive(true)
  }

  return <>
    {navTarget && createPortal(<button className={active ? 'active' : ''} onClick={openLoans}><Banknote size={19} /><span>Loans</span>{summary.counts.overdue > 0 && <small>{summary.counts.overdue} overdue</small>}</button>, navTarget)}
    {active && mainTarget && createPortal(<LoanPage summary={summary} onSummary={setSummary} />, mainTarget)}
  </>
}
