import { useCallback, useEffect, useMemo, useState } from 'react'
import './dashboard-performance.css'
import { ArrowDownRight, ArrowUpRight, BarChart3, RefreshCcw, TrendingDown, TrendingUp } from 'lucide-react'
import { api } from '../../lib/api'

type PerformancePeriod = 'this_week' | 'last_week'

type DashboardPerformanceData = {
  weekPerformance: Array<{ _id: { date: string; type: 'BUY' | 'SELL' | 'REFUND' | 'EXPENSE' }; total: number }>
}

type PerformancePoint = {
  key: number
  label: string
  shortLabel: string
  sales: number
  purchases: number
  refunds: number
  expenses: number
  outflow: number
  net: number
}

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const compactMoney = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const weekNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const CAMBODIA_OFFSET_MS = 7 * 60 * 60 * 1000

function buildWeekPoints(rows: DashboardPerformanceData['weekPerformance'], weekOffset: 0 | -1) {
  const cambodiaNow = new Date(Date.now() + CAMBODIA_OFFSET_MS)
  const daysSinceMonday = (cambodiaNow.getUTCDay() + 6) % 7
  const monday = new Date(Date.UTC(
    cambodiaNow.getUTCFullYear(),
    cambodiaNow.getUTCMonth(),
    cambodiaNow.getUTCDate() - daysSinceMonday + (weekOffset * 7),
  ))

  return weekNames.map((shortLabel, index): PerformancePoint => {
    const date = new Date(monday)
    date.setUTCDate(monday.getUTCDate() + index)
    const dateKey = date.toISOString().slice(0, 10)
    const sales = Number(rows.find((row) => row._id.date === dateKey && row._id.type === 'SELL')?.total) || 0
    const purchases = Number(rows.find((row) => row._id.date === dateKey && row._id.type === 'BUY')?.total) || 0
    const refunds = Number(rows.find((row) => row._id.date === dateKey && row._id.type === 'REFUND')?.total) || 0
    const expenses = Number(rows.find((row) => row._id.date === dateKey && row._id.type === 'EXPENSE')?.total) || 0
    const outflow = purchases + refunds + expenses
    return {
      key: index + 1,
      label: new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date),
      shortLabel,
      sales,
      purchases,
      refunds,
      expenses,
      outflow,
      net: sales - outflow,
    }
  })
}

function metricTone(value: number) {
  if (value > 0) return 'positive'
  if (value < 0) return 'negative'
  return 'neutral'
}

export default function CashFlowCard() {
  const [period, setPeriod] = useState<PerformancePeriod>('this_week')
  const [data, setData] = useState<DashboardPerformanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeKey, setActiveKey] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await api<DashboardPerformanceData>('/dashboard', {}, { deduplicate: true })
      setData(result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load shop performance')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const points = useMemo(() => {
    if (!data) return []
    return buildWeekPoints(data.weekPerformance || [], period === 'last_week' ? -1 : 0)
  }, [data, period])

  const totals = useMemo(() => {
    if (!data) return { sales: 0, purchases: 0, refunds: 0, expenses: 0, outflow: 0, net: 0 }
    const sales = points.reduce((sum, point) => sum + point.sales, 0)
    const purchases = points.reduce((sum, point) => sum + point.purchases, 0)
    const refunds = points.reduce((sum, point) => sum + point.refunds, 0)
    const expenses = points.reduce((sum, point) => sum + point.expenses, 0)
    const outflow = purchases + refunds + expenses
    return { sales, purchases, refunds, expenses, outflow, net: sales - outflow }
  }, [data, points])

  const context = useMemo(() => {
    const activePeriods = points.filter((point) => point.sales > 0 || point.outflow > 0)
    const salesPeriods = points.filter((point) => point.sales > 0)
    const averageSales = salesPeriods.length > 0 ? totals.sales / salesPeriods.length : 0
    const biggestMovement = activePeriods.reduce<PerformancePoint | null>((biggest, point) => {
      if (!biggest || Math.abs(point.net) > Math.abs(biggest.net)) return point
      return biggest
    }, null)
    return { activePeriods: activePeriods.length, averageSales, biggestMovement }
  }, [points, totals.sales])

  const maximum = Math.max(1, ...points.flatMap((point) => [point.sales, point.outflow]))
  const activePoint = activeKey === null ? null : points.find((point) => point.key === activeKey) || null
  const hasMovement = points.some((point) => point.sales > 0 || point.outflow > 0)
  const netTone = metricTone(totals.net)

  return (
    <section className="cashflow-performance" aria-label="Shop cash flow performance">
      <header className="cashflow-heading">
        <div>
          <span className="eyebrow">Cash flow</span>
          <h3>Shop performance</h3>
          <p>Money coming in from sales versus purchases, refunds, and operating expenses.</p>
        </div>
        <div className="cashflow-heading-actions">
          <button type="button" className="cashflow-refresh" onClick={() => void load()} disabled={loading} aria-label="Refresh shop performance"><RefreshCcw size={15} /></button>
          <select value={period} onChange={(event) => { setPeriod(event.target.value as PerformancePeriod); setActiveKey(null) }} aria-label="Performance period">
            <option value="this_week">This week</option>
            <option value="last_week">Last week</option>
          </select>
        </div>
      </header>

      <div className="cashflow-kpis">
        <article className={`cashflow-net ${netTone}`}>
          <span>Net cash flow</span>
          <strong>{money.format(totals.net)}</strong>
          <small>{netTone === 'positive' ? <TrendingUp size={14} /> : netTone === 'negative' ? <TrendingDown size={14} /> : <BarChart3 size={14} />}{netTone === 'positive' ? 'More cash in than out' : netTone === 'negative' ? 'More cash out than in' : 'Cash flow is balanced'}</small>
        </article>
        <article>
          <span className="cashflow-kpi-icon income"><ArrowUpRight size={17} /></span>
          <div><small>Money in</small><strong>{money.format(totals.sales)}</strong><span>Completed sales</span></div>
        </article>
        <article>
          <span className="cashflow-kpi-icon expense"><ArrowDownRight size={17} /></span>
          <div><small>Money out</small><strong>{money.format(totals.outflow)}</strong><span>{money.format(totals.expenses)} operating expenses</span></div>
        </article>
      </div>

      {error ? (
        <div className="cashflow-state error"><span>{error}</span><button type="button" onClick={() => void load()}>Try again</button></div>
      ) : loading && !data ? (
        <div className="cashflow-state">Loading cash flow…</div>
      ) : !hasMovement ? (
        <div className="cashflow-state"><BarChart3 size={24} /><strong>No cash movement yet</strong><span>Completed sales, purchases, refunds, and expenses will appear here.</span></div>
      ) : (
        <>
          <div className="cashflow-legend" aria-hidden="true">
            <span><i className="income" />Sales · money in</span>
            <span><i className="expense" />Purchases + refunds + expenses · money out</span>
            <small>Mon–Sun</small>
          </div>

          <div className="cashflow-context">
            <span><small>Active days</small><strong>{context.activePeriods} / {points.length}</strong></span>
            <span><small>Avg sales / active day</small><strong>{money.format(context.averageSales)}</strong></span>
            <span><small>Biggest net movement</small><strong className={context.biggestMovement ? metricTone(context.biggestMovement.net) : ''}>{context.biggestMovement ? `${context.biggestMovement.label} · ${money.format(context.biggestMovement.net)}` : '—'}</strong></span>
          </div>

          <div className="cashflow-chart-scroll week">
            <div className="cashflow-chart" role="img" aria-label={`Sales above the zero line and purchases, refunds, plus expenses below the zero line for ${period === 'this_week' ? 'this week' : 'last week'}`}>
              <div className="cashflow-axis-label top">{compactMoney.format(maximum)}</div>
              <div className="cashflow-axis-label zero">$0</div>
              <div className="cashflow-axis-label bottom">-{compactMoney.format(maximum)}</div>
              <div className="cashflow-grid-line top-quarter" />
              <div className="cashflow-grid-line top-half" />
              <div className="cashflow-zero-line" />
              <div className="cashflow-grid-line bottom-half" />
              <div className="cashflow-grid-line bottom-quarter" />

              <div className="cashflow-columns">
                {points.map((point) => {
                  const incomeHeight = point.sales > 0 ? Math.min(100, Math.max(3, (point.sales / maximum) * 100)) : 0
                  const expenseHeight = point.outflow > 0 ? Math.min(100, Math.max(3, (point.outflow / maximum) * 100)) : 0
                  const selected = activePoint?.key === point.key
                  return (
                    <button
                      key={point.key}
                      type="button"
                      className={`cashflow-column ${selected ? 'active' : ''}`}
                      onMouseEnter={() => setActiveKey(point.key)}
                      onMouseLeave={() => setActiveKey(null)}
                      onFocus={() => setActiveKey(point.key)}
                      onBlur={() => setActiveKey(null)}
                      aria-label={`${point.label}: sales ${money.format(point.sales)}, purchases ${money.format(point.purchases)}, refunds ${money.format(point.refunds)}, operating expenses ${money.format(point.expenses)}, net ${money.format(point.net)}`}
                    >
                      <span className="cashflow-half income-half"><i style={{ height: `${incomeHeight}%` }} /></span>
                      <span className="cashflow-half expense-half"><i style={{ height: `${expenseHeight}%` }} /></span>
                      <small>{point.shortLabel}</small>
                    </button>
                  )
                })}
              </div>

              {activePoint && (
                <div className={`cashflow-tooltip ${activePoint.key > points.length * 0.7 ? 'align-right' : ''}`} style={{ left: `${((activePoint.key - 0.5) / points.length) * 100}%` }}>
                  <strong>{activePoint.label}</strong>
                  <span><i className="income" />Sales <b>{money.format(activePoint.sales)}</b></span>
                  <span><i className="expense" />Purchases <b>{money.format(activePoint.purchases)}</b></span>
                  <span><i className="expense" />Refunds <b>{money.format(activePoint.refunds)}</b></span>
                  <span><i className="expense" />Expenses <b>{money.format(activePoint.expenses)}</b></span>
                  <span className={`net ${metricTone(activePoint.net)}`}>Net <b>{money.format(activePoint.net)}</b></span>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
