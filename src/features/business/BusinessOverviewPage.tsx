import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Banknote, BarChart3, Boxes, CircleDollarSign, FileText, HandCoins, Package, RefreshCcw, TrendingDown, Type, WalletCards } from 'lucide-react'
import { api } from '../../lib/api'
import type { Customer, Supplier, Pawn, ActivityLog, OverviewCurrencyTotals, BusinessOverviewPeriod, BusinessOverviewData } from '../../types/domain'
import { currency, money, tradePartyName, tradeTransactionMoney, riel, dateText, titleStatus } from '../../lib/presentation'
import LoadingState from '../../components/LoadingState'
import SectionHeader from '../../components/SectionHeader'
import StatusBadge from '../../components/StatusBadge'
import SummaryStats from '../../components/SummaryStats'
import './business-overview.css'

function overviewKhr(amount: number) {
  return `${riel.format(Math.round((Number(amount) || 0) / 100) * 100)} KHR`
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

export function BusinessPerformanceChart({
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
  const chartRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(960)
  const height = 260
  const padding = { top: 22, right: 18, bottom: 42, left: 64 }

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    const resizeChart = () => {
      const bounds = chart.getBoundingClientRect()
      if (bounds.width <= 0 || bounds.height <= 0) return
      const responsiveWidth = Math.max(520, Math.round((bounds.width / bounds.height) * height))
      setWidth((current) => current === responsiveWidth ? current : responsiveWidth)
    }

    resizeChart()
    const observer = new ResizeObserver(resizeChart)
    observer.observe(chart)
    return () => observer.disconnect()
  }, [])

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
      <svg ref={chartRef} className="overview-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
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

export default function BusinessOverviewView({ onReady }: { onReady: () => void }) {
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
    let active = true
    if (period === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return
    const query = new URLSearchParams({ period })
    if (period === 'custom') {
      query.set('from', customFrom)
      query.set('to', customTo)
    }
    setLoading(true)
    setError('')
    api<BusinessOverviewData>(`/business-overview?${query.toString()}`)
      .then((result) => {
        if (active) setData(result)
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message)
      })
      .finally(() => {
        if (active) {
          setLoading(false)
          onReady()
        }
      })
    return () => {
      active = false
    }
  }, [period, customFrom, customTo, onReady])

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
      {error && <p className="overview-error" role="alert"><AlertTriangle size={16} />{error}</p>}
      <SummaryStats
        label="Business summary"
        variant="compact"
        columns={5}
        items={[
          {
            label: 'Sales Revenue',
            value: salesRevenueValue,
            icon: CircleDollarSign,
            tone: 'violet',
            detail: periodLabel,
          },
          {
            label: 'Purchases',
            value: purchasesValue,
            icon: Banknote,
            tone: 'orange',
            detail: periodLabel,
          },
          {
            label: 'Gross Profit',
            value: grossProfitValue,
            valueTone: (data?.financial.grossProfit || 0) < 0 ? 'negative' : 'default',
            icon: TrendingDown,
            tone: 'blue',
            detail: `${periodLabel} · after COGS`,
          },
          {
            label: 'Pawn Outstanding',
            value: <OverviewCurrencyValue totals={data?.pawn.outstandingPrincipal || { USD: 0, KHR: 0 }} />,
            valueText: `${money.format(data?.pawn.outstandingPrincipal?.USD || 0)} ${overviewKhr(data?.pawn.outstandingPrincipal?.KHR || 0)}`,
            icon: HandCoins,
            tone: 'blue',
            detail: 'Current snapshot',
          },
          {
            label: 'Stock Value',
            value: stockValue,
            icon: Boxes,
            tone: 'rose',
            detail: 'Current cost value',
          },
        ]}
      />

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

