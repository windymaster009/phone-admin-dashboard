import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarClock,
  CircleDollarSign,
  RefreshCcw,
  TrendingUp,
} from 'lucide-react'
import { api } from '../../lib/api'

type Currency = 'USD' | 'KHR'
type LoanStatus = 'DUE_SOON' | 'OVERDUE'

type CurrencySummary = {
  lent: number
  expected: number
  paid: number
  outstanding: number
  dueSoon: number
  overdue: number
}

type LoanDashboardData = {
  summary: {
    byCurrency: Record<Currency, CurrencySummary>
    counts: {
      total: number
      open: number
      dueSoon: number
      overdue: number
      paid: number
    }
  }
  urgentLoans: Array<{
    _id: string
    loanNo: string
    borrower: {
      name: string
      phone?: string
    }
    remainingBalance: number
    totalDue: number
    amountPaid: number
    currency: Currency
    dueDate: string
    status: LoanStatus
  }>
  generatedAt: string
}

function money(value: number, currency: Currency) {
  if (currency === 'KHR') {
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value || 0)} ៛`
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value || 0)
}

function dualMoney(usd: number, khr: number) {
  return <>
    <strong>{money(usd, 'USD')}</strong>
    <small>{money(khr, 'KHR')}</small>
  </>
}

function dateText(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function dueText(value: string) {
  const due = new Date(value)
  const today = new Date()
  due.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  const difference = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  if (difference < 0) return `${Math.abs(difference)} day${Math.abs(difference) === 1 ? '' : 's'} overdue`
  if (difference === 0) return 'Due today'
  return `Due in ${difference} day${difference === 1 ? '' : 's'}`
}

function openLoansWorkspace() {
  const navButton = document.querySelector<HTMLButtonElement>('.loan-nav-portal-host button')
  if (navButton) {
    navButton.click()
    return
  }

  window.history.pushState({ view: 'loans' }, '', '/loans')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function LoanDashboardPanel({ data, loading, error, onRefresh }: {
  data: LoanDashboardData | null
  loading: boolean
  error: string
  onRefresh: () => void
}) {
  const summary = data?.summary
  const usd = summary?.byCurrency.USD
  const khr = summary?.byCurrency.KHR

  return (
    <section className="loan-dashboard-section" aria-label="Loan overview">
      <div className="loan-dashboard-heading">
        <div>
          <span className="eyebrow">Money lending</span>
          <h3>Loan overview</h3>
          <p>Outstanding balances and borrowers who need attention.</p>
        </div>
        <div className="loan-dashboard-heading-actions">
          <button className="icon-button" onClick={onRefresh} disabled={loading} aria-label="Refresh loan dashboard">
            <RefreshCcw className={loading ? 'loan-dashboard-spin' : ''} size={16} />
          </button>
          <button className="ghost-button" onClick={openLoansWorkspace}>View all loans <ArrowRight size={15} /></button>
        </div>
      </div>

      {error && <div className="loan-dashboard-error"><AlertTriangle size={16} /> {error}</div>}

      <div className="loan-dashboard-layout">
        <div className="loan-dashboard-metrics">
          <article className="surface-card loan-dashboard-metric">
            <span className="loan-dashboard-metric-icon violet"><Banknote size={19} /></span>
            <p><span>Outstanding</span>{dualMoney(usd?.outstanding || 0, khr?.outstanding || 0)}<em>{summary?.counts.open || 0} open loans</em></p>
          </article>
          <article className="surface-card loan-dashboard-metric overdue">
            <span className="loan-dashboard-metric-icon rose"><AlertTriangle size={19} /></span>
            <p><span>Overdue</span>{dualMoney(usd?.overdue || 0, khr?.overdue || 0)}<em>{summary?.counts.overdue || 0} need follow-up</em></p>
          </article>
          <article className="surface-card loan-dashboard-metric">
            <span className="loan-dashboard-metric-icon orange"><CalendarClock size={19} /></span>
            <p><span>Due soon</span>{dualMoney(usd?.dueSoon || 0, khr?.dueSoon || 0)}<em>{summary?.counts.dueSoon || 0} approaching due date</em></p>
          </article>
          <article className="surface-card loan-dashboard-metric">
            <span className="loan-dashboard-metric-icon green"><TrendingUp size={19} /></span>
            <p><span>Repaid</span>{dualMoney(usd?.paid || 0, khr?.paid || 0)}<em>{summary?.counts.paid || 0} fully paid loans</em></p>
          </article>
        </div>

        <article className="surface-card loan-dashboard-urgent-card">
          <div className="loan-dashboard-urgent-heading">
            <div><span className="eyebrow">Follow-up list</span><h4>Urgent borrowers</h4></div>
            <span>{data?.urgentLoans.length || 0}</span>
          </div>

          {loading && !data ? (
            <div className="loan-dashboard-empty"><RefreshCcw className="loan-dashboard-spin" size={22} /><span>Loading loan data...</span></div>
          ) : data?.urgentLoans.length ? (
            <div className="loan-dashboard-urgent-list">
              {data.urgentLoans.map((loan) => (
                <button key={loan._id} onClick={openLoansWorkspace}>
                  <span className={`loan-dashboard-borrower-icon ${loan.status === 'OVERDUE' ? 'overdue' : 'due-soon'}`}>
                    <CircleDollarSign size={17} />
                  </span>
                  <p>
                    <strong>{loan.borrower.name}</strong>
                    <small>{loan.loanNo}{loan.borrower.phone ? ` · ${loan.borrower.phone}` : ''}</small>
                  </p>
                  <div>
                    <strong>{money(loan.remainingBalance, loan.currency)}</strong>
                    <small>{dueText(loan.dueDate)} · {dateText(loan.dueDate)}</small>
                  </div>
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
          ) : (
            <div className="loan-dashboard-empty"><CircleDollarSign size={24} /><strong>No urgent loans</strong><span>Nothing is overdue or due soon.</span></div>
          )}
        </article>
      </div>
    </section>
  )
}

export default function LoanDashboardBridge() {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [data, setData] = useState<LoanDashboardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await api<LoanDashboardData>('/loan-dashboard'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load loan overview')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const locate = () => {
      const normalizedPath = window.location.pathname.length > 1
        ? window.location.pathname.replace(/\/+$/, '')
        : window.location.pathname
      const onDashboardPath = ['/', '/admin', '/dashboard'].includes(normalizedPath)
      const main = document.querySelector<HTMLElement>('.main-content')
      const metrics = main?.querySelector<HTMLElement>('.metrics-grid')
      const onDashboard = Boolean(
        onDashboardPath
        && main
        && metrics
        && !main.classList.contains('loan-route-active'),
      )

      if (!onDashboard || !main || !metrics) {
        setTarget(null)
        return
      }

      let host = main.querySelector<HTMLElement>('.loan-dashboard-portal-host')
      if (!host) {
        host = document.createElement('div')
        host.className = 'loan-dashboard-portal-host'
        metrics.after(host)
      }
      setTarget(host)
    }

    locate()
    const observer = new MutationObserver(locate)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    window.addEventListener('popstate', locate)

    return () => {
      observer.disconnect()
      window.removeEventListener('popstate', locate)
      document.querySelector('.loan-dashboard-portal-host')?.remove()
    }
  }, [])

  useEffect(() => {
    if (!target) return
    void load()
    const timer = window.setInterval(() => void load(), 60_000)
    return () => window.clearInterval(timer)
  }, [load, target])

  if (!target) return null
  return createPortal(<LoanDashboardPanel data={data} loading={loading} error={error} onRefresh={() => void load()} />, target)
}
