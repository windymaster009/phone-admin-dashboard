import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowUpRight, BadgeCheck, Banknote, BarChart3, Building2, Boxes, Calculator, CalendarRange, ChevronDown, CircleDollarSign, FileText, HandCoins, Package, RefreshCcw, Search, ShoppingCart, Users, WalletCards, Wrench, X, type LucideIcon } from 'lucide-react'
import { api } from '../../lib/api'
import type { Customer, Supplier, DirectoryReportPeriodKey, CustomerActivityReport, SupplierActivityReport, Pawn, BusinessOverviewPeriod, BusinessOverviewData, SalesReportData, PurchaseReportData, OperationalReportKind, OperationalReportData } from '../../types/domain'
import { currency, money, tradePartyName, purchaseSourceLabel, tradeTransactionMoney, pawnMoney, dateText, titleStatus } from '../../lib/presentation'
import LoadingState from '../../components/LoadingState'
import SectionHeader from '../../components/SectionHeader'
import StatusBadge from '../../components/StatusBadge'
import { BusinessPerformanceChart } from '../business/BusinessOverviewPage'
import './reports-page.css'

const reportSections = [
  { slug: 'sales', title: 'Sales', description: 'Revenue, COGS, gross profit, items sold', icon: CircleDollarSign, tone: 'violet' },
  { slug: 'purchases', title: 'Purchases', description: 'Purchases from suppliers and customers, and total cost', icon: ShoppingCart, tone: 'orange' },
  { slug: 'inventory', title: 'Inventory', description: 'Stock quantity, cost value, retail value, and low stock', icon: Boxes, tone: 'blue' },
  { slug: 'pawns', title: 'Pawn', description: 'Outstanding principal, overdue, redeemed, and claimed collateral', icon: HandCoins, tone: 'violet' },
  { slug: 'loans', title: 'Loans', description: 'Outstanding loans, repayments, and overdue balances', icon: WalletCards, tone: 'blue' },
  { slug: 'payments', title: 'Payments', description: 'Cash, KHQR, bank, card, and daily closing', icon: Banknote, tone: 'rose' },
  { slug: 'services', title: 'Service charges', description: 'Paid setup, assistance, transfer, and software work', icon: Wrench, tone: 'violet' },
  { slug: 'customers', title: 'Customer report', description: 'Customer profiles, contact records, and transaction history', icon: Users, tone: 'blue' },
  { slug: 'suppliers', title: 'Supplier report', description: 'Supplier profiles, contacts, and purchase history', icon: Building2, tone: 'orange' },
  { slug: 'activity', title: 'Activity', description: 'Staff actions and audit history', icon: FileText, tone: 'orange' },
] as const

function ReportLanding({ navigate }: { navigate: (path: string) => void }) {
  const [customerReportOpen, setCustomerReportOpen] = useState(false)
  const [supplierReportOpen, setSupplierReportOpen] = useState(false)
  const financialReports = reportSections.filter((report) => ['sales', 'purchases', 'payments'].includes(report.slug))
  const operationalReports = reportSections.filter((report) => !['sales', 'purchases', 'payments'].includes(report.slug))
  const reportCard = (report: typeof reportSections[number]) => {
    const { slug, title, description, icon: Icon, tone } = report

    return (
      <button
        type="button"
        className="surface-card report-hub-card"
        key={slug}
        onClick={() => slug === 'customers' ? setCustomerReportOpen(true) : slug === 'suppliers' ? setSupplierReportOpen(true) : navigate(`/reports/${slug}`)}
        aria-haspopup={slug === 'customers' || slug === 'suppliers' ? 'dialog' : undefined}
      >
        <span className={`metric-icon tone-${tone}`}><Icon size={21} /></span>
        <span className="report-hub-copy"><strong>{title}</strong><small>{description}</small></span>
        <ArrowUpRight size={18} />
      </button>
    )
  }

  return (
    <div className="reports-hub-page">
      <SectionHeader eyebrow="Finance & control" title="Reports & Analytics" description="Choose a focused report to review business performance and operational history." />
      <section className="report-category" aria-labelledby="financial-reports-title">
        <header className="report-category-header"><div><h3 id="financial-reports-title">Financial reports</h3><p>Review revenue, spending, and money received.</p></div></header>
        <div className="report-hub-grid report-primary-grid">
          {financialReports.map(reportCard)}
        </div>
      </section>
      <section className="report-category report-category-operations" aria-labelledby="operational-reports-title">
        <header className="report-category-header"><div><h3 id="operational-reports-title">Operations &amp; records</h3><p>Check stock, contracts, customer records, and staff activity.</p></div></header>
        <div className="report-hub-grid report-operations-grid">
          {operationalReports.map(reportCard)}
        </div>
      </section>
      <p className="report-hub-note"><AlertTriangle size={15} />Exports will be added only after all report calculations and workflows are verified.</p>
      {customerReportOpen && <CustomerReportModal onClose={() => setCustomerReportOpen(false)} />}
      {supplierReportOpen && <SupplierReportModal onClose={() => setSupplierReportOpen(false)} />}
    </div>
  )
}

const directoryReportPeriodOptions: Array<{ value: DirectoryReportPeriodKey; label: string }> = [
  { value: 'all_time', label: 'All history' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'last_6_months', label: 'Last 6 months' },
  { value: 'this_year', label: 'This year' },
  { value: 'custom', label: 'Custom months' },
]

function currentCambodiaMonth() {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    timeZone: 'Asia/Phnom_Penh',
  }).formatToParts(new Date())
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  return `${year}-${month}`
}

function ReportMonthRangeControls({
  period,
  fromMonth,
  toMonth,
  resultLabel,
  loading,
  onPeriodChange,
  onFromMonthChange,
  onToMonthChange,
  onApply,
}: {
  period: DirectoryReportPeriodKey
  fromMonth: string
  toMonth: string
  resultLabel: string
  loading: boolean
  onPeriodChange: (period: DirectoryReportPeriodKey) => void
  onFromMonthChange: (month: string) => void
  onToMonthChange: (month: string) => void
  onApply: () => void
}) {
  const customRangeInvalid = !fromMonth || !toMonth || fromMonth > toMonth

  return (
    <form className={`customer-report-period ${period === 'custom' ? 'is-custom' : ''}`} onSubmit={(event) => { event.preventDefault(); if (!customRangeInvalid) onApply() }} aria-label="Report month range">
      <div className="customer-report-period-heading"><CalendarRange size={17} /><span><strong>Month range</strong><small>Showing {resultLabel}</small></span></div>
      <label><span>Period</span><select value={period} onChange={(event) => onPeriodChange(event.target.value as DirectoryReportPeriodKey)} disabled={loading}>{directoryReportPeriodOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
      {period === 'custom' && <div className="customer-report-custom-months">
        <label><span>From</span><input type="month" value={fromMonth} max={toMonth || undefined} aria-invalid={customRangeInvalid} onChange={(event) => onFromMonthChange(event.target.value)} disabled={loading} /></label>
        <label><span>To</span><input type="month" value={toMonth} min={fromMonth || undefined} aria-invalid={customRangeInvalid} onChange={(event) => onToMonthChange(event.target.value)} disabled={loading} /></label>
        <button type="submit" className="secondary-button" disabled={loading || customRangeInvalid}>{loading ? 'Loading…' : 'Apply'}</button>
      </div>}
    </form>
  )
}

function CustomerReportModal({ onClose }: { onClose: () => void }) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [idFilter, setIdFilter] = useState<'all' | 'recorded' | 'missing'>('all')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [activityReport, setActivityReport] = useState<CustomerActivityReport | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState('')
  const [reportPeriod, setReportPeriod] = useState<DirectoryReportPeriodKey>('all_time')
  const [reportFromMonth, setReportFromMonth] = useState(currentCambodiaMonth)
  const [reportToMonth, setReportToMonth] = useState(currentCambodiaMonth)

  useEffect(() => {
    api<{ customers: Customer[] }>('/customers')
      .then((result) => setCustomers(result.customers))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const filteredCustomers = useMemo(() => customers.filter((customer) => {
    const term = search.trim().toLowerCase()
    const matchesSearch = !term || [customer.name, customer.phone, customer.nationalIdNumber, customer.address]
      .some((value) => String(value || '').toLowerCase().includes(term))
    const hasId = Boolean(customer.nationalIdNumber)
    const matchesIdFilter = idFilter === 'all' || (idFilter === 'recorded' ? hasId : !hasId)
    return matchesSearch && matchesIdFilter
  }), [customers, idFilter, search])

  const openActivityReport = async (nextPeriod = reportPeriod, nextFromMonth = reportFromMonth, nextToMonth = reportToMonth) => {
    if (!selectedCustomer) return
    setActivityLoading(true)
    setActivityError('')
    try {
      const query = new URLSearchParams({ period: nextPeriod })
      if (nextPeriod === 'custom') { query.set('from', nextFromMonth); query.set('to', nextToMonth) }
      const report = await api<CustomerActivityReport>(`/customers/${selectedCustomer._id}/activity-report?${query}`)
      setActivityReport(report)
    } catch (reason) {
      setActivityError(reason instanceof Error ? reason.message : 'Unable to load this customer activity report')
    } finally {
      setActivityLoading(false)
    }
  }

  const changeReportPeriod = (nextPeriod: DirectoryReportPeriodKey) => {
    setReportPeriod(nextPeriod)
    if (nextPeriod !== 'custom') void openActivityReport(nextPeriod)
  }

  return (
    <>
    <div className={`modal-backdrop customer-report-backdrop ${activityReport ? 'is-full-report-open' : ''}`} role="presentation">
      <section className={`detail-modal surface-card customer-report-modal ${activityReport ? 'is-full-report' : ''}`} role="dialog" aria-modal="true" aria-labelledby="customer-report-title" onClick={(event) => event.stopPropagation()}>
        <header className="detail-modal-header">
          <div>
            <span className="eyebrow">Customer report</span>
            <h3 id="customer-report-title">Find a customer</h3>
            <p>Search the directory, then select a customer to review their profile.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close customer report"><X size={18} /></button>
        </header>
        <div className="customer-report-workspace">
          <aside className="customer-report-browser" aria-label="Customer list">
            <label className="customer-report-search">
              <span>Search customers</span>
              <div className="search-field"><Search size={17} /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, phone, ID, or address" disabled={loading} /></div>
            </label>
            <label className="customer-report-filter">
              <span>Show</span>
              <select value={idFilter} onChange={(event) => setIdFilter(event.target.value as typeof idFilter)} disabled={loading}>
                <option value="all">All customers</option>
                <option value="recorded">ID recorded</option>
                <option value="missing">Needs ID</option>
              </select>
            </label>
            <p className="customer-report-count" aria-live="polite">{loading ? 'Loading customers…' : `${filteredCustomers.length} customer${filteredCustomers.length === 1 ? '' : 's'} found`}</p>
            <div className="customer-report-list">
              {loading && Array.from({ length: 6 }, (_, index) => <div className="customer-report-skeleton" key={index} aria-hidden="true" />)}
              {error && <p className="customer-report-error">Unable to load customers. {error}</p>}
              {!loading && !error && filteredCustomers.map((customer) => {
                const isSelected = selectedCustomer?._id === customer._id
                const hasId = Boolean(customer.nationalIdNumber)
                return (
                  <button type="button" className={`customer-report-picker ${isSelected ? 'is-selected' : ''}`} key={customer._id} onClick={() => { setSelectedCustomer(customer); setActivityReport(null); setActivityError('') }} aria-pressed={isSelected}>
                    <span className="avatar">{customer.name.slice(0, 2).toUpperCase()}</span>
                    <span><strong>{customer.name}</strong><small>{customer.phone || 'No phone recorded'}</small></span>
                    {hasId ? <BadgeCheck size={16} aria-label="National ID recorded" /> : <AlertTriangle size={16} aria-label="National ID not recorded" />}
                  </button>
                )
              })}
              {!loading && !error && filteredCustomers.length === 0 && <p className="customer-report-empty">No records match this search. Try a different name, phone, or filter.</p>}
            </div>
          </aside>
          <section className={`customer-report-profile ${selectedCustomer ? 'has-selection' : ''} ${activityReport ? 'is-activity-report' : ''}`} aria-live="polite" aria-busy={activityLoading}>
            {selectedCustomer && activityReport ? <>
              <div className="customer-report-sheet-actions"><button type="button" className="customer-report-dismiss" onClick={() => setActivityReport(null)}><ArrowLeft size={16} /> Back to profile</button><button type="button" className="customer-report-sheet-close" onClick={onClose} aria-label="Close customer report"><X size={17} /></button></div>
              <div className="customer-report-profile-heading customer-report-activity-heading">
                <span className="avatar">{selectedCustomer.name.slice(0, 2).toUpperCase()}</span>
                <div><h4>{selectedCustomer.name}</h4><p>Sales, purchases, and pawn contracts linked to this customer.</p></div>
                <ReportMonthRangeControls period={reportPeriod} fromMonth={reportFromMonth} toMonth={reportToMonth} resultLabel={activityReport.period.label} loading={activityLoading} onPeriodChange={changeReportPeriod} onFromMonthChange={setReportFromMonth} onToMonthChange={setReportToMonth} onApply={() => void openActivityReport('custom')} />
              </div>
              {activityError && <p className="customer-report-activity-error" role="alert">{activityError}</p>}
              <div className="customer-report-activity-summary" aria-label="Customer activity totals">
                <div><span>Sales</span><div className="customer-report-currency-values"><p><span>USD (converted)</span><strong>{pawnMoney(activityReport.summary.sales.usdEquivalent)}</strong></p><p><span>KHR recorded</span><strong>{pawnMoney(activityReport.summary.sales.KHR, 'KHR')}</strong></p></div></div>
                <div><span>Purchases</span><div className="customer-report-currency-values"><p><span>USD (converted)</span><strong>{pawnMoney(activityReport.summary.purchases.usdEquivalent)}</strong></p><p><span>KHR recorded</span><strong>{pawnMoney(activityReport.summary.purchases.KHR, 'KHR')}</strong></p></div></div>
                <div><span>Pawned</span><div className="customer-report-currency-values"><p><span>USD (converted)</span><strong>{pawnMoney(activityReport.summary.pawned.usdEquivalent)}</strong></p><p><span>KHR recorded</span><strong>{pawnMoney(activityReport.summary.pawned.KHR, 'KHR')}</strong></p></div></div>
              </div>
              <div className="customer-report-activity-list">
                <div className="customer-report-activity-list-heading"><strong>History</strong><small>{activityReport.activities.length} record{activityReport.activities.length === 1 ? '' : 's'}{activityReport.limited ? ' · latest 200' : ''}</small></div>
                {activityReport.activities.map((activity) => {
                  const Icon = activity.kind === 'SALE' ? CircleDollarSign : activity.kind === 'PURCHASE' ? ShoppingCart : HandCoins
                  return <article className={`customer-report-activity-row ${activity.kind.toLowerCase()}`} key={activity.id}><span className="transaction-icon"><Icon size={16} /></span><div><strong>{activity.kind === 'SALE' ? 'Sold to customer' : activity.kind === 'PURCHASE' ? 'Bought from customer' : 'Pawn contract'}</strong><small>{activity.reference} · {dateText(activity.occurredAt)} · {activity.currency}</small><p>{activity.title}</p></div><aside><strong>{pawnMoney(activity.amount, activity.currency)}</strong><small>{titleStatus(activity.status)}</small></aside></article>
                })}
                {activityReport.activities.length === 0 && <p className="customer-report-empty">No sales, purchases, or pawn contracts are linked to this customer yet.</p>}
              </div>
            </> : selectedCustomer ? <>
              <button type="button" className="customer-report-dismiss" onClick={() => setSelectedCustomer(null)}><ChevronDown size={16} /> Back to list</button>
              <div className="customer-report-profile-heading">
                <span className="avatar">{selectedCustomer.name.slice(0, 2).toUpperCase()}</span>
                <div><span className="eyebrow">Customer profile</span><h4>{selectedCustomer.name}</h4><p>{selectedCustomer.phone || 'No phone recorded'}</p></div>
              </div>
              <div className="customer-report-details">
                <div><span>National ID</span><strong>{selectedCustomer.nationalIdNumber || 'Not recorded'}</strong></div>
                <div><span>Added</span><strong>{selectedCustomer.createdAt ? dateText(selectedCustomer.createdAt) : 'Not recorded'}</strong></div>
                <div className="customer-report-address"><span>Address</span><strong>{selectedCustomer.address || 'Not recorded'}</strong></div>
                <div className="customer-report-address"><span>Notes</span><strong>{selectedCustomer.notes || 'No notes recorded'}</strong></div>
              </div>
              <button className="primary-button customer-report-open" onClick={() => void openActivityReport()} disabled={activityLoading}>{activityLoading ? 'Loading report…' : 'Open activity report'} <ArrowUpRight size={16} /></button>
              {activityError && <p className="customer-report-activity-error" role="alert">{activityError}</p>}
            </> : <div className="customer-report-empty-profile"><Users size={24} /><h4>Select a customer</h4><p>Choose someone from the list to see their saved contact and identity details.</p></div>}
          </section>
        </div>
      </section>
    </div>
    </>
  )
}

function SupplierReportModal({ onClose }: { onClose: () => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [idFilter, setIdFilter] = useState<'all' | 'recorded' | 'missing'>('all')
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [activityReport, setActivityReport] = useState<SupplierActivityReport | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState('')
  const [reportPeriod, setReportPeriod] = useState<DirectoryReportPeriodKey>('all_time')
  const [reportFromMonth, setReportFromMonth] = useState(currentCambodiaMonth)
  const [reportToMonth, setReportToMonth] = useState(currentCambodiaMonth)

  useEffect(() => {
    api<{ suppliers: Supplier[] }>('/suppliers')
      .then((result) => setSuppliers(result.suppliers))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const filteredSuppliers = useMemo(() => suppliers.filter((supplier) => {
    const term = search.trim().toLowerCase()
    const matchesSearch = !term || [supplier.name, supplier.phone, supplier.nationalIdNumber, supplier.notes]
      .some((value) => String(value || '').toLowerCase().includes(term))
    const hasId = Boolean(supplier.nationalIdNumber)
    return matchesSearch && (idFilter === 'all' || (idFilter === 'recorded' ? hasId : !hasId))
  }), [suppliers, idFilter, search])

  const openActivityReport = async (nextPeriod = reportPeriod, nextFromMonth = reportFromMonth, nextToMonth = reportToMonth) => {
    if (!selectedSupplier) return
    setActivityLoading(true)
    setActivityError('')
    try {
      const query = new URLSearchParams({ period: nextPeriod })
      if (nextPeriod === 'custom') { query.set('from', nextFromMonth); query.set('to', nextToMonth) }
      const report = await api<SupplierActivityReport>(`/suppliers/${selectedSupplier._id}/activity-report?${query}`)
      setActivityReport(report)
    } catch (reason) {
      setActivityError(reason instanceof Error ? reason.message : 'Unable to load this supplier purchase report')
    } finally {
      setActivityLoading(false)
    }
  }

  const changeReportPeriod = (nextPeriod: DirectoryReportPeriodKey) => {
    setReportPeriod(nextPeriod)
    if (nextPeriod !== 'custom') void openActivityReport(nextPeriod)
  }

  return (
    <div className={`modal-backdrop customer-report-backdrop ${activityReport ? 'is-full-report-open' : ''}`} role="presentation">
      <section className={`detail-modal surface-card customer-report-modal supplier-report-modal ${activityReport ? 'is-full-report' : ''}`} role="dialog" aria-modal="true" aria-labelledby="supplier-report-title" onClick={(event) => event.stopPropagation()}>
        <header className="detail-modal-header">
          <div><span className="eyebrow">Supplier report</span><h3 id="supplier-report-title">Find a supplier</h3><p>Search the directory, then review the supplier’s linked purchases.</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Close supplier report"><X size={18} /></button>
        </header>
        <div className="customer-report-workspace">
          <aside className="customer-report-browser" aria-label="Supplier list">
            <label className="customer-report-search"><span>Search suppliers</span><div className="search-field"><Search size={17} /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, phone, or National ID" disabled={loading} /></div></label>
            <label className="customer-report-filter"><span>Show</span><select value={idFilter} onChange={(event) => setIdFilter(event.target.value as typeof idFilter)} disabled={loading}><option value="all">All suppliers</option><option value="recorded">ID recorded</option><option value="missing">Needs ID</option></select></label>
            <p className="customer-report-count" aria-live="polite">{loading ? 'Loading suppliers…' : `${filteredSuppliers.length} supplier${filteredSuppliers.length === 1 ? '' : 's'} found`}</p>
            <div className="customer-report-list">
              {loading && Array.from({ length: 6 }, (_, index) => <div className="customer-report-skeleton" key={index} aria-hidden="true" />)}
              {error && <p className="customer-report-error">Unable to load suppliers. {error}</p>}
              {!loading && !error && filteredSuppliers.map((supplier) => {
                const isSelected = selectedSupplier?._id === supplier._id
                const hasId = Boolean(supplier.nationalIdNumber)
                return <button type="button" className={`customer-report-picker ${isSelected ? 'is-selected' : ''}`} key={supplier._id} onClick={() => { setSelectedSupplier(supplier); setActivityReport(null); setActivityError('') }} aria-pressed={isSelected}><span className="avatar">{supplier.name.slice(0, 2).toUpperCase()}</span><span><strong>{supplier.name}</strong><small>{supplier.phone || 'No phone recorded'}</small></span>{hasId ? <BadgeCheck size={16} aria-label="National ID recorded" /> : <AlertTriangle size={16} aria-label="National ID not recorded" />}</button>
              })}
              {!loading && !error && filteredSuppliers.length === 0 && <p className="customer-report-empty">No records match this search. Try a different name, phone, or filter.</p>}
            </div>
          </aside>
          <section className={`customer-report-profile ${selectedSupplier ? 'has-selection' : ''} ${activityReport ? 'is-activity-report' : ''}`} aria-live="polite" aria-busy={activityLoading}>
            {selectedSupplier && activityReport ? <>
              <div className="customer-report-sheet-actions"><button type="button" className="customer-report-dismiss" onClick={() => setActivityReport(null)}><ArrowLeft size={16} /> Back to profile</button><button type="button" className="customer-report-sheet-close" onClick={onClose} aria-label="Close supplier report"><X size={17} /></button></div>
              <div className="customer-report-profile-heading customer-report-activity-heading"><span className="avatar">{selectedSupplier.name.slice(0, 2).toUpperCase()}</span><div><h4>{selectedSupplier.name}</h4><p>Purchases linked to this supplier.</p></div><ReportMonthRangeControls period={reportPeriod} fromMonth={reportFromMonth} toMonth={reportToMonth} resultLabel={activityReport.period.label} loading={activityLoading} onPeriodChange={changeReportPeriod} onFromMonthChange={setReportFromMonth} onToMonthChange={setReportToMonth} onApply={() => void openActivityReport('custom')} /></div>
              {activityError && <p className="customer-report-activity-error" role="alert">{activityError}</p>}
              <div className="customer-report-activity-summary supplier-report-summary" aria-label="Supplier purchase total"><div><span>Total purchases</span><div className="customer-report-currency-values"><p><span>USD (converted)</span><strong>{pawnMoney(activityReport.summary.purchases.usdEquivalent)}</strong></p><p><span>KHR recorded</span><strong>{pawnMoney(activityReport.summary.purchases.KHR, 'KHR')}</strong></p></div></div></div>
              <div className="customer-report-activity-list"><div className="customer-report-activity-list-heading"><strong>Purchase history</strong><small>{activityReport.activities.length} record{activityReport.activities.length === 1 ? '' : 's'}{activityReport.limited ? ' · latest 100' : ''}</small></div>{activityReport.activities.map((activity) => <article className="customer-report-activity-row purchase" key={activity.id}><span className="transaction-icon"><ShoppingCart size={16} /></span><div><strong>Purchased from supplier</strong><small>{activity.reference} · {dateText(activity.occurredAt)} · {activity.currency}</small><p>{activity.title}</p></div><aside><strong>{pawnMoney(activity.amount, activity.currency)}</strong><small>{titleStatus(activity.status)}</small></aside></article>)}{activityReport.activities.length === 0 && <p className="customer-report-empty">No purchases are linked to this supplier yet.</p>}</div>
            </> : selectedSupplier ? <>
              <button type="button" className="customer-report-dismiss" onClick={() => setSelectedSupplier(null)}><ChevronDown size={16} /> Back to list</button>
              <div className="customer-report-profile-heading"><span className="avatar">{selectedSupplier.name.slice(0, 2).toUpperCase()}</span><div><span className="eyebrow">Supplier profile</span><h4>{selectedSupplier.name}</h4><p>{selectedSupplier.phone || 'No phone recorded'}</p></div></div>
              <div className="customer-report-details"><div><span>National ID</span><strong>{selectedSupplier.nationalIdNumber || 'Not recorded'}</strong></div><div><span>Added</span><strong>{selectedSupplier.createdAt ? dateText(selectedSupplier.createdAt) : 'Not recorded'}</strong></div><div className="customer-report-address"><span>Notes</span><strong>{selectedSupplier.notes || 'No notes recorded'}</strong></div></div>
              <button className="primary-button customer-report-open" onClick={() => void openActivityReport()} disabled={activityLoading}>{activityLoading ? 'Loading report…' : 'Open purchase report'} <ArrowUpRight size={16} /></button>
              {activityError && <p className="customer-report-activity-error" role="alert">{activityError}</p>}
            </> : <div className="customer-report-empty-profile"><Building2 size={24} /><h4>Select a supplier</h4><p>Choose a supplier from the list to view their saved contact details and purchase history.</p></div>}
          </section>
        </div>
      </section>
    </div>
  )
}

function UpcomingReportView({ slug, navigate }: { slug: string; navigate: (path: string) => void }) {
  const report = reportSections.find((item) => item.slug === slug)
  const Icon = report?.icon || FileText
  return (
    <div className="reports-placeholder-page">
      <SectionHeader eyebrow="Reports & analytics" title={`${report?.title || 'Report'} Report`} description={report?.description || 'This report is planned for a later step.'} action={<ReportBackButton navigate={navigate} />} />
      <section className="surface-card report-placeholder-card"><span className="metric-icon tone-violet"><Icon size={24} /></span><h3>Report not found</h3><p>Return to Reports & Analytics and choose one of the available report cards.</p></section>
    </div>
  )
}

function ReportBackButton({ navigate }: { navigate: (path: string) => void }) {
  return <button className="ghost-button report-back-button" onClick={() => navigate('/reports')}><ArrowLeft size={16} /> Back to reports</button>
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
    return <><SectionHeader eyebrow="Reports & analytics" title="Sales Report" description="Calculating revenue, cost, profit, products, and payment performance." action={<ReportBackButton navigate={navigate} />} /><section className="surface-card"><LoadingState label="Loading sales report" detail="Reading completed sales and stored item costs…" /></section></>
  }

  return (
    <div className="sales-report-page">
      <SectionHeader eyebrow="Reports & analytics" title="Sales Report" description="Revenue, cost of goods sold, gross profit, products, and payment performance." action={<ReportBackButton navigate={navigate} />} />

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
    return <><SectionHeader eyebrow="Reports & analytics" title="Purchases Report" description="Calculating purchase costs, payments, sellers, and product volume." action={<ReportBackButton navigate={navigate} />} /><section className="surface-card"><LoadingState label="Loading purchases report" detail="Reading purchase transactions and normalized currency totals…" /></section></>
  }

  return (
    <div className="sales-report-page purchases-report-page">
      <SectionHeader eyebrow="Reports & analytics" title="Purchases Report" description="Purchase cost, stock acquired, seller sources, balances, and payment performance." action={<ReportBackButton navigate={navigate} />} />

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
      if (kind === 'services') {
        query.set('currency', currencyCode)
        query.set('status', status)
        query.set('staff', staff)
        query.set('category', category)
        query.set('method', method)
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
  const statusOptions: Record<'inventory' | 'pawns' | 'loans' | 'services', string[]> = {
    inventory: ['ALL', 'IN_STOCK', 'RESERVED', 'SOLD', 'PAWNED', 'REPAIR', 'ARCHIVED'],
    pawns: ['ALL', 'ACTIVE', 'DUE_SOON', 'OVERDUE', 'RENEWED', 'REDEEMED', 'FORFEITED', 'CANCELLED'],
    loans: ['ALL', 'ACTIVE', 'DUE_SOON', 'OVERDUE', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'],
    services: ['ALL', 'COMPLETED', 'CANCELLED'],
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
    return <><SectionHeader eyebrow="Reports & analytics" title={`${titleStatus(kind)} Report`} description="Calculating verified report totals and operational details." action={<ReportBackButton navigate={navigate} />} /><section className="surface-card"><LoadingState label={`Loading ${kind} report`} detail="Reading current records and audit history…" /></section></>
  }

  return (
    <div className="sales-report-page operational-report-page">
      <SectionHeader eyebrow="Reports & analytics" title={data?.title || `${titleStatus(kind)} Report`} description={data?.description || 'Operational reporting.'} action={<ReportBackButton navigate={navigate} />} />

      <section className="surface-card sales-report-filters operational-report-filters" aria-label={`${kind} report filters`}>
        {kind !== 'inventory' && <label><span>Period</span><select value={period} onChange={(event) => setPeriod(event.target.value as BusinessOverviewPeriod | 'all_time')}>{periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
        {period === 'custom' && kind !== 'inventory' && <><label><span>From</span><input type="date" value={customFrom} max={customTo || undefined} onChange={(event) => setCustomFrom(event.target.value)} /></label><label><span>To</span><input type="date" value={customTo} min={customFrom || undefined} onChange={(event) => setCustomTo(event.target.value)} /></label></>}
        {kind === 'inventory' && <>
          <label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{['ALL', 'PHONE', 'TABLET', 'ACCESSORY', 'SPARE_PART', 'OTHER'].map((value) => <option key={value} value={value}>{value === 'ALL' ? 'All categories' : titleStatus(value)}</option>)}</select></label>
          <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}>{statusOptions.inventory.map((value) => <option key={value} value={value}>{value === 'ALL' ? 'All statuses' : titleStatus(value)}</option>)}</select></label>
          <label><span>Source</span><select value={source} onChange={(event) => setSource(event.target.value)}>{['ALL', 'SUPPLIER', 'CUSTOMER', 'PAWN_FORFEIT', 'OTHER'].map((value) => <option key={value} value={value}>{value === 'ALL' ? 'All sources' : titleStatus(value)}</option>)}</select></label>
          <label><span>Stock level</span><select value={stock} onChange={(event) => setStock(event.target.value)}><option value="ALL">All stock levels</option><option value="AVAILABLE">Available</option><option value="LOW">Low stock</option><option value="OUT">Out of stock</option></select></label>
        </>}
        {['pawns', 'loans', 'payments', 'services'].includes(kind) && <label><span>Currency</span><select value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value as 'USD' | 'KHR')}><option value="USD">USD — US Dollar</option><option value="KHR">KHR — Cambodian Riel</option></select></label>}
        {['pawns', 'loans'].includes(kind) && <>
          <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}>{statusOptions[kind as 'pawns' | 'loans'].map((value) => <option key={value} value={value}>{value === 'ALL' ? 'All statuses' : titleStatus(value)}</option>)}</select></label>
          <label><span>Staff</span><select value={staff} onChange={(event) => setStaff(event.target.value)}><option value="ALL">All staff</option>{(data?.staff || []).map((person) => <option key={person._id} value={person._id}>{person.name}</option>)}</select></label>
        </>}
        {kind === 'payments' && <>
          <label><span>Payment method</span><select value={method} onChange={(event) => setMethod(event.target.value)}>{['ALL', 'CASH', 'KHQR', 'BANK', 'CARD', 'OTHER'].map((value) => <option key={value} value={value}>{value === 'ALL' ? 'All methods' : titleStatus(value)}</option>)}</select></label>
          <label><span>Direction</span><select value={direction} onChange={(event) => setDirection(event.target.value)}><option value="ALL">Money in & out</option><option value="IN">Money in</option><option value="OUT">Money out</option></select></label>
        </>}
        {kind === 'services' && <>
          <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}>{statusOptions.services.map((value) => <option key={value} value={value}>{value === 'ALL' ? 'All statuses' : titleStatus(value)}</option>)}</select></label>
          <label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{['ALL', 'ACCOUNT_SETUP', 'DEVICE_SETUP', 'DATA_TRANSFER', 'SOFTWARE', 'OTHER'].map((value) => <option key={value} value={value}>{value === 'ALL' ? 'All categories' : titleStatus(value)}</option>)}</select></label>
          <label><span>Payment method</span><select value={method} onChange={(event) => setMethod(event.target.value)}>{['ALL', 'CASH', 'KHQR', 'BANK', 'CARD', 'OTHER'].map((value) => <option key={value} value={value}>{value === 'ALL' ? 'All methods' : titleStatus(value)}</option>)}</select></label>
          <label><span>Staff</span><select value={staff} onChange={(event) => setStaff(event.target.value)}><option value="ALL">All staff</option>{(data?.staff || []).map((person) => <option key={person._id} value={person._id}>{person.name}</option>)}</select></label>
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

export default function ReportsView() {
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
  if (path === '/reports/services') return <OperationalReportView key={path} kind="services" navigate={navigate} />
  if (path === '/reports/activity') return <OperationalReportView key={path} kind="activity" navigate={navigate} />
  const slug = path.startsWith('/reports/') ? path.slice('/reports/'.length) : ''
  if (slug && reportSections.some((item) => item.slug === slug)) return <UpcomingReportView slug={slug} navigate={navigate} />
  return <ReportLanding navigate={navigate} />
}

