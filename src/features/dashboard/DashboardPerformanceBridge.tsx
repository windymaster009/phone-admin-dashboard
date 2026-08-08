import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDownRight, ArrowUpRight, BarChart3, RefreshCcw, TrendingDown, TrendingUp } from 'lucide-react'
import { api } from '../../lib/api'

type PerformancePeriod = 'month' | 'year'

type DashboardPerformanceData = {
  monthPerformance: Array<{ _id: 'BUY' | 'SELL'; total: number }>
  monthlyPerformance: Array<{ _id: { month: number; type: 'BUY' | 'SELL' }; total: number }>
  dailyPerformance: Array<{ _id: { day: number; type: 'BUY' | 'SELL' }; total: number }>
}

type PerformancePoint = {
  key: number
  label: string
  shortLabel: string
  sales: number
  purchases: number
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

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function valueForType(rows: Array<{ _id: 'BUY' | 'SELL'; total: number }>, type: 'BUY' | 'SELL') {
  return Number(rows.find((row) => row._id === type)?.total) || 0
}

function buildMonthPoints(rows: DashboardPerformanceData['dailyPerformance']) {
  const now = new Date()
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return Array.from({ length: days }, (_, index): PerformancePoint => {
    const day = index + 1
    const sales = Number(rows.find((row) => row._id.day === day && row._id.type === 'SELL')?.total) || 0
    const purchases = Number(rows.find((row) => row._id.day === day && row._id.type === 'BUY')?.total) || 0
    return {
      key: day,
      label: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(now.getFullYear(), now.getMonth(), day)),
      shortLabel: String(day),
      sales,
      purchases,
      net: sales - purchases,
    }
  })
}

function buildYearPoints(rows: DashboardPerformanceData['monthlyPerformance']) {
  return Array.from({ length: 12 }, (_, index): PerformancePoint => {
    const month = index + 1
    const sales = Number(rows.find((row) => row._id.month === month && row._id.type === 'SELL')?.total) || 0
    const purchases = Number(rows.find((row) => row._id.month === month && row._id.type === 'BUY')?.total) || 0
    return {
      key: month,
      label: monthNames[index],
      shortLabel: monthNames[index],
      sales,
      purchases,
      net: sales - purchases,
    }
  })
}

function metricTone(value: number) {
  if (value > 0) return 'positive'
  if (value < 0) return 'negative'
  return 'neutral'
}

function CashFlowCard() {
  const [period, setPeriod] = useState<PerformancePeriod>('month')
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
    return period === 'month' ? buildMonthPoints(data.dailyPerformance) : buildYearPoints(data.monthlyPerformance)
  }, [data, period])

  const totals = useMemo(() => {
    if (!data) return { sales: 0, purchases: 0, net: 0 }
    if (period === 'month') {
      const sales = valueForType(data.monthPerformance, 'SELL')
      const purchases = valueForType(data.monthPerformance, 'BUY')
      return { sales, purchases, net: sales - purchases }
    }
    const sales = points.reduce((sum, point) => sum + point.sales, 0)
    const purchases = points.reduce((sum, point) => sum + point.purchases, 0)
    return { sales, purchases, net: sales - purchases }
  }, [data, period, points])

  const maximum = Math.max(1, ...points.flatMap((point) => [point.sales, point.purchases]))
  const activePoint = activeKey === null ? null : points.find((point) => point.key === activeKey) || null
  const hasMovement = points.some((point) => point.sales > 0 || point.purchases > 0)
  const netTone = metricTone(totals.net)

  return (
    <section className="cashflow-performance" aria-label="Shop cash flow performance">
      <header className="cashflow-heading">
        <div>
          <span className="eyebrow">Cash flow</span>
          <h3>Shop performance</h3>
          <p>Money coming in from sales versus money going out for purchases.</p>
        </div>
        <div className="cashflow-heading-actions">
          <button type="button" className="cashflow-refresh" onClick={() => void load()} disabled={loading} aria-label="Refresh shop performance"><RefreshCcw size={15} /></button>
          <select value={period} onChange={(event) => { setPeriod(event.target.value as PerformancePeriod); setActiveKey(null) }} aria-label="Performance period">
            <option value="month">This month</option>
            <option value="year">This year</option>
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
          <div><small>Money out</small><strong>{money.format(totals.purchases)}</strong><span>Completed purchases</span></div>
        </article>
      </div>

      {error ? (
        <div className="cashflow-state error"><span>{error}</span><button type="button" onClick={() => void load()}>Try again</button></div>
      ) : loading && !data ? (
        <div className="cashflow-state">Loading cash flow…</div>
      ) : !hasMovement ? (
        <div className="cashflow-state"><BarChart3 size={24} /><strong>No cash movement yet</strong><span>Completed sales and purchases will appear here.</span></div>
      ) : (
        <>
          <div className="cashflow-legend" aria-hidden="true">
            <span><i className="income" />Sales · money in</span>
            <span><i className="expense" />Purchases · money out</span>
            <small>{period === 'month' ? 'Daily movement' : 'Monthly movement'}</small>
          </div>

          <div className={`cashflow-chart-scroll ${period}`}>
            <div className="cashflow-chart" role="img" aria-label={`Sales above the zero line and purchases below the zero line for ${period === 'month' ? 'this month' : 'this year'}`}>
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
                  const incomeHeight = point.sales > 0 ? Math.max(3, (point.sales / maximum) * 100) : 0
                  const expenseHeight = point.purchases > 0 ? Math.max(3, (point.purchases / maximum) * 100) : 0
                  const showLabel = period === 'year' || point.key === 1 || point.key === points.length || point.key % 5 === 0
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
                      aria-label={`${point.label}: sales ${money.format(point.sales)}, purchases ${money.format(point.purchases)}, net ${money.format(point.net)}`}
                    >
                      <span className="cashflow-half income-half"><i style={{ height: `${incomeHeight}%` }} /></span>
                      <span className="cashflow-half expense-half"><i style={{ height: `${expenseHeight}%` }} /></span>
                      <small className={showLabel ? '' : 'muted-label'}>{showLabel ? point.shortLabel : ''}</small>
                    </button>
                  )
                })}
              </div>

              {activePoint && (
                <div className={`cashflow-tooltip ${activePoint.key > points.length * 0.7 ? 'align-right' : ''}`} style={{ left: `${((activePoint.key - 0.5) / points.length) * 100}%` }}>
                  <strong>{activePoint.label}</strong>
                  <span><i className="income" />Sales <b>{money.format(activePoint.sales)}</b></span>
                  <span><i className="expense" />Purchases <b>{money.format(activePoint.purchases)}</b></span>
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

export default function DashboardPerformanceBridge() {
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    let currentCard: HTMLElement | null = null
    let currentHost: HTMLElement | null = null

    const cleanup = () => {
      currentCard?.classList.remove('dashboard-performance-bridge-active')
      currentHost?.remove()
      currentCard = null
      currentHost = null
    }

    const locate = () => {
      const normalized = window.location.pathname.length > 1 ? window.location.pathname.replace(/\/+$/, '') : window.location.pathname
      const onDashboard = normalized === '/' || normalized === '/admin' || normalized === '/dashboard'
      if (!onDashboard) {
        if (currentCard || currentHost) cleanup()
        setTarget(null)
        return
      }

      const card = document.querySelector<HTMLElement>('.performance-card')
      if (!card) {
        if (currentCard || currentHost) cleanup()
        setTarget(null)
        return
      }
      if (card === currentCard && currentHost?.isConnected) return

      cleanup()
      const host = document.createElement('div')
      host.className = 'dashboard-performance-host'
      card.append(host)
      card.classList.add('dashboard-performance-bridge-active')
      currentCard = card
      currentHost = host
      setTarget(host)
    }

    locate()
    const observer = new MutationObserver(locate)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('popstate', locate)
    const timer = window.setInterval(locate, 1_000)

    return () => {
      observer.disconnect()
      window.removeEventListener('popstate', locate)
      window.clearInterval(timer)
      cleanup()
    }
  }, [])

  return target ? createPortal(<CashFlowCard />, target) : null
}
