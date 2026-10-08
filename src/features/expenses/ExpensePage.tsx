import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { AlertTriangle, Banknote, CircleDollarSign, Plus, ReceiptText, RefreshCcw, Tags, XCircle } from 'lucide-react'
import { api } from '../../lib/api'
import type { Expense } from '../../types/domain'
import { dateText, pawnMoney, titleStatus } from '../../lib/presentation'
import SectionHeader from '../../components/SectionHeader'
import SummaryStats from '../../components/SummaryStats'
import FilterToolbar from '../../components/FilterToolbar'
import LoadingState from '../../components/LoadingState'
import MoneyInput from '../../components/MoneyInput'
import OperationModalShell from '../../components/OperationModalShell'
import StatusBadge from '../../components/StatusBadge'
import './expense-page.css'

const categories = ['ALL', 'RENT', 'UTILITIES', 'SALARY', 'TRANSPORT', 'REPAIR', 'SUPPLIES', 'MARKETING', 'TAX', 'OTHER'] as const
const methods = ['ALL', 'CASH', 'KHQR', 'BANK', 'CARD', 'OTHER'] as const
const todayCambodia = () => {
  const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Phnom_Penh' }).formatToParts(new Date())
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}
const newRequestKey = () => globalThis.crypto?.randomUUID?.() || `expense-${Date.now()}-${Math.random().toString(36).slice(2)}`

type ExpenseResponse = {
  expenses: Expense[]
  summary: { totalUsd: number; totals: { USD: number; KHR: number }; topCategory?: string | null; recorded: number; voided: number }
  exchangeRate: number
}

const emptySummary: ExpenseResponse['summary'] = { totalUsd: 0, totals: { USD: 0, KHR: 0 }, recorded: 0, voided: 0 }

export default function ExpensePage() {
  const [data, setData] = useState<ExpenseResponse>({ expenses: [], summary: emptySummary, exchangeRate: 4100 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('ALL')
  const [method, setMethod] = useState('ALL')
  const [currency, setCurrency] = useState('ALL')
  const [status, setStatus] = useState('RECORDED')
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<Expense | null>(null)
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const query = new URLSearchParams({ search, category, method, currency, status })
    try {
      setData(await api<ExpenseResponse>(`/expenses?${query.toString()}`, {}, { deduplicate: true }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Expense records could not be loaded. Try again.')
    } finally {
      setLoading(false)
    }
  }, [category, currency, method, search, status])

  useEffect(() => {
    const timer = window.setTimeout(load, 180)
    return () => window.clearTimeout(timer)
  }, [load])

  return (
    <div className="expense-page">
      <SectionHeader
        eyebrow="Operations"
        title="Expenses"
        description="Record shop operating costs separately from inventory purchases. Voided entries stay in the audit history."
        action={<button type="button" className="primary-button" onClick={() => { setSuccess(''); setCreateOpen(true) }}><Plus size={17} />Record expense</button>}
      />
      {success && <p className="expense-success" role="status">{success}</p>}
      {error && <p className="overview-error" role="alert"><AlertTriangle size={16} />{error}</p>}

      <SummaryStats label="Expense summary" variant="standard" columns={4} items={[
        { label: 'USD Equivalent', value: pawnMoney(data.summary.totalUsd, 'USD'), icon: CircleDollarSign, tone: 'rose', detail: 'Recorded expenses in this view' },
        { label: 'USD Recorded', value: pawnMoney(data.summary.totals.USD, 'USD'), icon: Banknote, tone: 'violet', detail: 'Native USD entries' },
        { label: 'KHR Recorded', value: pawnMoney(data.summary.totals.KHR, 'KHR'), icon: ReceiptText, tone: 'orange', detail: 'Native KHR entries' },
        { label: 'Top Category', value: titleStatus(data.summary.topCategory || 'None yet'), icon: Tags, tone: 'blue', detail: `${data.summary.recorded} recorded · ${data.summary.voided} voided` },
      ]} />

      <section className="surface-card expense-ledger">
        <div className="card-heading"><div><span className="eyebrow">Expense ledger</span><h3>Operating costs</h3><p>Open a record to review who entered it or void a mistake without deleting history.</p></div>{loading && <RefreshCcw className="overview-refreshing" size={18} />}</div>
        <FilterToolbar className="expense-filter-row" search={search} onSearchChange={setSearch} searchLabel="Search expenses" placeholder="Search description, payee, reference…">
          <select className="ghost-button filter-select" aria-label="Expense category" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((value) => <option key={value} value={value}>{value === 'ALL' ? 'All categories' : titleStatus(value)}</option>)}</select>
          <select className="ghost-button filter-select" aria-label="Payment method" value={method} onChange={(event) => setMethod(event.target.value)}>{methods.map((value) => <option key={value} value={value}>{value === 'ALL' ? 'All methods' : titleStatus(value)}</option>)}</select>
          <select className="ghost-button filter-select" aria-label="Expense currency" value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="ALL">All currencies</option><option value="USD">USD</option><option value="KHR">KHR</option></select>
          <select className="ghost-button filter-select" aria-label="Expense status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="RECORDED">Recorded</option><option value="ALL">All statuses</option><option value="VOIDED">Voided</option></select>
        </FilterToolbar>

        {loading && data.expenses.length === 0 ? <LoadingState label="Loading expenses" detail="Reading the expense ledger…" /> : <>
          <div className="table-scroll expense-desktop-table"><table><thead><tr><th>Date</th><th>Expense</th><th>Category</th><th>Paid to</th><th>Payment</th><th>Amount</th><th>Status</th></tr></thead><tbody>
            {data.expenses.map((expense) => <tr key={expense._id} tabIndex={0} onClick={() => setSelected(expense)} onKeyDown={(event) => { if (event.key === 'Enter') setSelected(expense) }}><td>{dateText(expense.expenseDate)}</td><td><strong>{expense.title}</strong><small>{expense.expenseNo}</small></td><td>{titleStatus(expense.category)}</td><td>{expense.payee || '—'}</td><td>{titleStatus(expense.paymentMethod)}</td><td><strong>{pawnMoney(expense.amount, expense.currency)}</strong></td><td><StatusBadge status={expense.status} /></td></tr>)}
            {data.expenses.length === 0 && <tr><td colSpan={7}>No expense records match these filters.</td></tr>}
          </tbody></table></div>
          <div className="expense-mobile-list">{data.expenses.map((expense) => <button type="button" key={expense._id} onClick={() => setSelected(expense)}><header><span><strong>{expense.title}</strong><small>{dateText(expense.expenseDate)} · {expense.expenseNo}</small></span><StatusBadge status={expense.status} /></header><div><span>{titleStatus(expense.category)}</span><strong>{pawnMoney(expense.amount, expense.currency)}</strong></div><small>{expense.payee || titleStatus(expense.paymentMethod)}</small></button>)}{data.expenses.length === 0 && <p>No expense records match these filters.</p>}</div>
        </>}
      </section>

      {createOpen && <ExpenseCreateModal exchangeRate={data.exchangeRate} onClose={() => setCreateOpen(false)} onCreated={(expense) => { setCreateOpen(false); setSuccess(`${expense.expenseNo} was recorded.`); load() }} />}
      {selected && <ExpenseDetailModal expense={selected} onClose={() => setSelected(null)} onVoided={(expense) => { setSelected(null); setSuccess(`${expense.expenseNo} was voided and remains in the audit history.`); load() }} />}
    </div>
  )
}

function ExpenseCreateModal({ exchangeRate, onClose, onCreated }: { exchangeRate: number; onClose: () => void; onCreated: (expense: Expense) => void }) {
  const [form, setForm] = useState({ title: '', category: 'UTILITIES', amount: '', currency: 'USD', exchangeRate: String(exchangeRate), paymentMethod: 'CASH', expenseDate: todayCambodia(), payee: '', reference: '', notes: '' })
  const [requestKey] = useState(newRequestKey)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submitting = useRef(false)
  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }))

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setError('')
    try {
      const result = await api<{ expense: Expense }>('/expenses', { method: 'POST', body: JSON.stringify({ ...form, idempotencyKey: requestKey }) })
      onCreated(result.expense)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The expense was not recorded. Review the fields and try again.')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return <OperationModalShell title="Record expense" eyebrow="Finance operation" description="Add a shop operating cost. Inventory purchases belong in Buy & Sell." icon={<ReceiptText size={21} />} busy={busy} error={error} onDismissError={() => setError('')} onClose={onClose} className="expense-modal">
    <form onSubmit={submit} className="expense-form">
      <div className="operation-modal-body expense-form-grid">
        <label className="expense-field-wide"><span>Description</span><input data-modal-initial-focus required maxLength={120} value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="Electricity bill" /></label>
        <label><span>Category</span><select value={form.category} onChange={(event) => update('category', event.target.value)}>{categories.filter((value) => value !== 'ALL').map((value) => <option key={value} value={value}>{titleStatus(value)}</option>)}</select></label>
        <label><span>Expense date</span><input type="date" required max={todayCambodia()} value={form.expenseDate} onChange={(event) => update('expenseDate', event.target.value)} /></label>
        <label><span>Currency</span><select value={form.currency} onChange={(event) => update('currency', event.target.value)}><option value="USD">USD — US Dollar</option><option value="KHR">KHR — Cambodian Riel</option></select></label>
        <label><span>Amount</span><div className="expense-money-input"><span>{form.currency === 'KHR' ? '៛' : '$'}</span><MoneyInput required currency={form.currency as 'USD' | 'KHR'} minimum={form.currency === 'KHR' ? 100 : 0.01} value={form.amount} onValueChange={(value) => update('amount', value)} placeholder="0" /></div></label>
        {form.currency === 'KHR' && <label><span>KHR per USD</span><input type="number" required min="1000" max="10000" step="1" value={form.exchangeRate} onChange={(event) => update('exchangeRate', event.target.value)} /></label>}
        <label><span>Payment method</span><select value={form.paymentMethod} onChange={(event) => update('paymentMethod', event.target.value)}>{methods.filter((value) => value !== 'ALL').map((value) => <option key={value} value={value}>{titleStatus(value)}</option>)}</select></label>
        <label><span>Paid to <small>Optional</small></span><input maxLength={120} value={form.payee} onChange={(event) => update('payee', event.target.value)} placeholder="Landlord or supplier" /></label>
        <label><span>Reference <small>Optional</small></span><input maxLength={100} value={form.reference} onChange={(event) => update('reference', event.target.value)} placeholder="Invoice or receipt number" /></label>
        <label className="expense-field-wide"><span>Notes <small>Optional</small></span><textarea maxLength={1000} value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Add information needed for later review." /></label>
      </div>
      <footer className="operation-modal-footer"><span>Saving creates an audited financial record.</span><div><button type="button" className="ghost-button" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Recording…' : 'Record expense'}</button></div></footer>
    </form>
  </OperationModalShell>
}

function ExpenseDetailModal({ expense, onClose, onVoided }: { expense: Expense; onClose: () => void; onVoided: (expense: Expense) => void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function voidExpense() {
    setBusy(true); setError('')
    try {
      const result = await api<{ expense: Expense }>(`/expenses/${expense._id}/void`, { method: 'POST', body: JSON.stringify({ reason }) })
      onVoided(result.expense)
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : 'The expense could not be voided. Try again.')
      setBusy(false)
    }
  }
  return <OperationModalShell title={expense.expenseNo} eyebrow="Expense record" description={`${dateText(expense.expenseDate)} · ${titleStatus(expense.category)}`} icon={<ReceiptText size={21} />} busy={busy} error={error} onDismissError={() => setError('')} onClose={onClose} className="expense-modal" compact>
    <div className="operation-modal-body expense-detail">
      <div className="expense-detail-total"><span>Amount</span><strong>{pawnMoney(expense.amount, expense.currency)}</strong><StatusBadge status={expense.status} /></div>
      <dl><div><dt>Description</dt><dd>{expense.title}</dd></div><div><dt>Paid to</dt><dd>{expense.payee || 'Not recorded'}</dd></div><div><dt>Payment</dt><dd>{titleStatus(expense.paymentMethod)}</dd></div><div><dt>Reference</dt><dd>{expense.reference || 'Not recorded'}</dd></div><div><dt>Recorded by</dt><dd>{expense.createdBy?.name || 'System'}</dd></div><div><dt>Notes</dt><dd>{expense.notes || 'No notes'}</dd></div></dl>
      {expense.status === 'VOIDED' ? <div className="expense-voided-note"><XCircle size={18} /><span><strong>Voided {expense.voidedAt ? dateText(expense.voidedAt) : ''}</strong>{expense.voidReason || 'No reason recorded'}</span></div> : <label className="expense-void-field"><span>Void reason</span><textarea minLength={5} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this record should be excluded from totals." /><small>This does not delete the record. It remains visible for audit review.</small></label>}
    </div>
    <footer className="operation-modal-footer"><span>{expense.status === 'VOIDED' ? 'Voided expenses are excluded from totals.' : 'Use void only to correct a mistaken entry.'}</span><div><button type="button" className="ghost-button" onClick={onClose}>Close</button>{expense.status === 'RECORDED' && <button type="button" className="danger-button" disabled={busy || reason.trim().length < 5} onClick={voidExpense}>{busy ? 'Voiding…' : 'Void expense'}</button>}</div></footer>
  </OperationModalShell>
}
