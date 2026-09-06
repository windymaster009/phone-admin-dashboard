import { lazy, Suspense, useEffect, useState } from 'react'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Calculator, CircleDollarSign, HandCoins, MoreHorizontal, Package, Plus, ScanLine, ShoppingCart, Smartphone, Users } from 'lucide-react'
import { api, type SessionUser } from '../../lib/api'
import type { Customer, Pawn, DashboardData } from '../../types/domain'
import { currency, money, pawnMoney, pawnEquivalentText, useExchangeRate, khrText, dateText, comingNext } from '../../lib/presentation'
import LoadingState from '../../components/LoadingState'
import SectionHeader from '../../components/SectionHeader'
import StatusBadge from '../../components/StatusBadge'
import type { RouteKey } from '../../app/routing'

type NavKey = RouteKey
const PawnDetailModal = lazy(() => import('../pawns/PawnDetailModal'))
import CashFlowCard from './CashFlowCard'
import InventoryInsightsCard from './InventoryInsightsCard'
import LoanDashboardPanel from '../loans/LoanDashboardPanel'
import ErrorBoundary from '../../components/ErrorBoundary'
import './dashboard-density.css'
import './dashboard-chart-interactions.css'


const demoMetrics = [
  {
    label: "Today's sales",
    value: '$8,420',
    change: '+12.5%',
    trend: 'up' as const,
    icon: CircleDollarSign,
    tone: 'violet',
  },
  {
    label: 'Active pawn value',
    value: '$32,680',
    change: '+4.8%',
    trend: 'up' as const,
    icon: HandCoins,
    tone: 'blue',
  },
  {
    label: 'Phones in stock',
    value: '184',
    change: '7 low stock',
    trend: 'down' as const,
    icon: Smartphone,
    tone: 'orange',
  },
  {
    label: 'Overdue contracts',
    value: '12',
    change: '3 due today',
    trend: 'down' as const,
    icon: AlertTriangle,
    tone: 'rose',
  },
]



function MetricCard({
  label,
  value,
  change,
  trend,
  icon: Icon,
  tone,
  secondaryValue,
}: (typeof demoMetrics)[number] & { secondaryValue?: string }) {
  return (
    <article className="metric-card surface-card">
      <div className={`metric-icon tone-${tone}`}>
        <Icon size={21} />
      </div>
      <div className="metric-copy">
        <p>{label}</p>
        <h3>{value}</h3>
        {secondaryValue && <small className="khr-value">{secondaryValue}</small>}
      </div>
      <span className={`metric-change ${trend}`}>
        {trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
        {change}
      </span>
    </article>
  )
}

export default function DashboardView({ goTo, user, onReady }: { goTo: (key: NavKey) => void; user: SessionUser; onReady: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPawn, setSelectedPawn] = useState<Pawn | null>(null)
  const [performancePeriod, setPerformancePeriod] = useState<'month' | 'year'>('month')
  const [inventoryMenuOpen, setInventoryMenuOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const exchangeRate = useExchangeRate()

  useEffect(() => {
    let active = true
    const loadDashboard = async (showRefresh = false) => {
      if (showRefresh) setRefreshing(true)
      try {
        const result = await api<DashboardData>('/dashboard')
        if (!active) return
        setData(result)
        setError('')
      } catch (reason) {
        if (!active) return
        setError(reason instanceof Error ? reason.message : 'Could not load dashboard data')
      } finally {
        if (active) {
          setLoading(false)
          onReady()
          if (showRefresh) setRefreshing(false)
        }
      }
    }
    void loadDashboard()
    return () => {
      active = false
    }
  }, [onReady])

  const metrics = data?.metrics ? [
    { label: "Today's sales", value: money.format(data.metrics.salesToday), secondaryValue: khrText(data.metrics.salesToday, exchangeRate), change: `${money.format(data.metrics.purchasesToday)} purchases${exchangeRate ? ` · ${khrText(data.metrics.purchasesToday, exchangeRate)}` : ''}`, trend: 'up' as const, icon: CircleDollarSign, tone: 'violet' },
    { label: 'Active pawn value', value: money.format(data.metrics.activePawnValue), secondaryValue: khrText(data.metrics.activePawnValue, exchangeRate), change: `${data.metrics.overdueContracts} overdue`, trend: data.metrics.overdueContracts > 0 ? 'down' as const : 'up' as const, icon: HandCoins, tone: 'blue' },
    { label: 'Phones in stock', value: String(data.metrics.phonesInStock), change: `${data.metrics.lowStock} low stock`, trend: data.metrics.lowStock > 0 ? 'down' as const : 'up' as const, icon: Smartphone, tone: 'orange' },
    { label: 'Customers', value: String(data.metrics.customerCount), change: 'live database', trend: 'up' as const, icon: Users, tone: 'rose' },
  ] : demoMetrics
  const monthLabels = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
  const monthlyNet = monthLabels.map((_, index) => {
    const month = index + 1
    const sales = data?.monthlyPerformance?.find((item) => item._id.month === month && item._id.type === 'SELL')?.total || 0
    const purchases = data?.monthlyPerformance?.find((item) => item._id.month === month && item._id.type === 'BUY')?.total || 0
    return sales - purchases
  })
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const dayLabels = Array.from({ length: daysInMonth }, (_, index) => String(index + 1))
  const dailyNet = dayLabels.map((_, index) => {
    const day = index + 1
    const sales = data?.dailyPerformance?.find((item) => item._id.day === day && item._id.type === 'SELL')?.total || 0
    const purchases = data?.dailyPerformance?.find((item) => item._id.day === day && item._id.type === 'BUY')?.total || 0
    return sales - purchases
  })
  const performanceValues = performancePeriod === 'month' ? dailyNet : monthlyNet
  const performanceLabels = performancePeriod === 'month' ? dayLabels : monthLabels
  const performanceSales = performancePeriod === 'month'
    ? data?.monthPerformance?.find((item) => item._id === 'SELL')?.total || 0
    : (data?.monthlyPerformance || []).filter((item) => item._id.type === 'SELL').reduce((sum, item) => sum + item.total, 0) || 0
  const performancePurchases = performancePeriod === 'month'
    ? data?.monthPerformance?.find((item) => item._id === 'BUY')?.total || 0
    : (data?.monthlyPerformance || []).filter((item) => item._id.type === 'BUY').reduce((sum, item) => sum + item.total, 0) || 0
  const performanceNet = performanceSales - performancePurchases
  const maxPerformanceValue = Math.max(...performanceValues.map((value) => Math.abs(value)), 1)
  const hasPerformanceData = performanceValues.some((value) => value !== 0)
  const inventoryMix = data?.inventoryMix?.length ? data.inventoryMix : [{ _id: 'PHONE', count: 0, value: 0 }, { _id: 'ACCESSORY', count: 0, value: 0 }, { _id: 'SPARE_PART', count: 0, value: 0 }]
  const totalInventoryValue = inventoryMix.reduce((sum, item) => sum + item.value, 0)
  const phoneValue = inventoryMix.find((item) => item._id === 'PHONE')?.value || 0
  const accessoryValue = inventoryMix.find((item) => item._id === 'ACCESSORY')?.value || 0
  const phoneStop = totalInventoryValue ? (phoneValue / totalInventoryValue) * 100 : 0
  const accessoryStop = totalInventoryValue ? phoneStop + (accessoryValue / totalInventoryValue) * 100 : 0
  const inventoryValueText = money.format(totalInventoryValue)
  const inventoryValueSize = inventoryValueText.length > 10
    ? 'long'
    : inventoryValueText.length > 7
      ? 'medium'
      : 'short'
  const donutStyle = {
    background: totalInventoryValue
      ? `conic-gradient(var(--chart-primary) 0 ${phoneStop}%, var(--chart-blue) ${phoneStop}% ${accessoryStop}%, var(--chart-orange) ${accessoryStop}% 100%)`
      : 'conic-gradient(var(--primary-soft) 0 100%)',
  }

  if (loading && !data) {
    return (
      <>
        <SectionHeader
          className="dashboard-welcome-header"
          eyebrow="Live MongoDB dashboard"
          title={`Good afternoon, ${user.name.split(' ')[0]}`}
          description="Connecting to the shop and preparing today's overview."
          action={<button className="primary-button" onClick={() => goTo('trade')}><Plus size={17} /> New transaction</button>}
        />
        <section className="surface-card"><LoadingState label="Loading dashboard" detail="Syncing sales, pawn, customer, and inventory totals…" /></section>
      </>
    )
  }

  return (
    <>
      <SectionHeader
        className="dashboard-welcome-header"
        eyebrow="Live MongoDB dashboard"
        title={`Good afternoon, ${user.name.split(' ')[0]}`}
        description={error || 'Here is what is happening in the shop today.'}
        action={
          <button className="primary-button" onClick={() => goTo('trade')}>
            <Plus size={17} /> New transaction
          </button>
        }
      />

      <section className="metrics-grid dashboard-metrics-grid">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="dashboard-grid">
        <div className="dashboard-column dashboard-primary-column">
        <ErrorBoundary boundaryName="CashFlowCard" compact>
          <article className="surface-card performance-card dashboard-performance-bridge-active">
            <div className="dashboard-performance-host">
              <CashFlowCard />
            </div>
          </article>
        </ErrorBoundary>

        <ErrorBoundary boundaryName="LoanDashboardPanel" compact>
          <LoanDashboardPanel />
        </ErrorBoundary>

        <article className="surface-card table-card dashboard-recent-contracts-card">
          <div className="card-heading table-heading">
            <div>
              <span className="eyebrow">Pawn desk</span>
              <h3>Recent contracts</h3>
            </div>
            <button className="text-button" onClick={() => goTo('pawn')}>View all <ArrowUpRight size={15} /></button>
          </div>
          <div className="table-scroll recent-contract-table">
            <table>
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Customer & item</th>
                  <th>Loan</th>
                  <th>Due date</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(data?.recentPawns || []).map((row) => (
                  <tr key={row._id}>
                    <td><strong className="mono">{row.pawnNo}</strong></td>
                    <td>
                      <div className="customer-cell">
                        <span className="avatar">{(row.customer?.name || 'NA').slice(0, 2).toUpperCase()}</span>
                        <p>{row.customer?.name || 'Unknown'}<small>{row.itemSnapshot.name}</small></p>
                      </div>
                    </td>
                    <td><strong>{pawnMoney(row.principal, row.currency)}</strong>{exchangeRate && <small className="table-subtext khr-table-value">{pawnEquivalentText(row.principal, row.currency || 'USD', exchangeRate, row.exchangeRate)}</small>}<small className="table-subtext">of {pawnMoney(row.estimatedValue, row.currency)}</small></td>
                    <td>{dateText(row.dueDate)}</td>
                    <td><StatusBadge status={row.status} /></td>
                    <td><button className="icon-button" onClick={() => setSelectedPawn(row)} aria-label={`View contract ${row.pawnNo}`}><MoreHorizontal size={18} /></button></td>
                  </tr>
                ))}
                {data?.recentPawns?.length === 0 && <tr><td colSpan={6}>No pawn contracts in the database yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mobile-contract-list">
            {(data?.recentPawns || []).map((row) => (
              <article className="mobile-contract-card" key={row._id}>
                <div className="mobile-contract-heading">
                  <span className="avatar">{(row.customer?.name || 'NA').slice(0, 2).toUpperCase()}</span>
                  <p><strong>{row.customer?.name || 'Unknown'}</strong><small>{row.itemSnapshot.name}</small></p>
                  <StatusBadge status={row.status} />
                </div>
                <div className="mobile-contract-details">
                  <div><span>Loan</span><strong>{pawnMoney(row.principal, row.currency)}</strong><small>{exchangeRate && pawnEquivalentText(row.principal, row.currency || 'USD', exchangeRate, row.exchangeRate)}</small></div>
                  <div><span>Due date</span><strong>{dateText(row.dueDate)}</strong><small className="mono">{row.pawnNo}</small></div>
                  <button className="icon-button mobile-contract-open" onClick={() => setSelectedPawn(row)} aria-label={`View contract ${row.pawnNo}`}><MoreHorizontal size={18} /></button>
                </div>
              </article>
            ))}
            {data?.recentPawns?.length === 0 && <p className="mobile-contract-empty">No pawn contracts in the database yet.</p>}
          </div>
        </article>
        </div>

        <div className="dashboard-column dashboard-secondary-column">

        <ErrorBoundary boundaryName="InventoryInsightsCard" compact>
          <article className="surface-card inventory-mix-card inventory-insights-bridge-active">
            <div className="inventory-insights-host">
              <InventoryInsightsCard />
            </div>
          </article>
        </ErrorBoundary>

        <article className="surface-card quick-actions-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Shortcuts</span>
              <h3>Quick actions</h3>
            </div>
          </div>
          <div className="quick-actions-list">
            <button onClick={() => window.dispatchEvent(new Event('phoneflow:open-scanner'))}><span className="quick-icon blue"><ScanLine size={19} /></span><p>Scan product<small>Find stock and start a sale</small></p><ArrowUpRight size={17} /></button>
            <button onClick={() => comingNext('New pawn')}><span className="quick-icon violet"><HandCoins size={19} /></span><p>New pawn contract<small>Register ID and collateral</small></p><ArrowUpRight size={17} /></button>
            <button onClick={() => comingNext('New sale')}><span className="quick-icon blue"><ShoppingCart size={19} /></span><p>New sale<small>Phone or accessories</small></p><ArrowUpRight size={17} /></button>
            <button onClick={() => comingNext('Adjust stock')}><span className="quick-icon orange"><Package size={19} /></span><p>Adjust stock<small>Correct count or status</small></p><ArrowUpRight size={17} /></button>
            <button onClick={() => goTo('depreciation')}><span className="quick-icon rose"><Calculator size={19} /></span><p>Value a phone<small>Calculate depreciation</small></p><ArrowUpRight size={17} /></button>
          </div>
        </article>
        </div>
      </section>
      {selectedPawn && (
        <Suspense fallback={null}>
          <PawnDetailModal
            pawn={selectedPawn}
            onClose={() => setSelectedPawn(null)}
            onOpenAll={() => {
              setSelectedPawn(null)
              goTo('pawn')
            }}
          />
        </Suspense>
      )}
    </>
  )
}
