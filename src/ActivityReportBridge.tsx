import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Activity,
  AlertTriangle,
  BadgeDollarSign,
  Bell,
  Boxes,
  Check,
  HandCoins,
  RefreshCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { api } from './api'

type ActivityUser = {
  _id: string
  name: string
  email: string
  role: string
}

type ActivityLog = {
  _id: string
  user?: ActivityUser
  action: string
  entity: string
  entityId?: string
  details?: Record<string, unknown>
  ipAddress?: string
  createdAt: string
}

type Position = {
  top: number
  right: number
}

const LAST_SEEN_KEY = 'phoneflow_activity_last_seen'
const POLL_INTERVAL_MS = 15_000

const entityIcons: Record<string, LucideIcon> = {
  CUSTOMER: Users,
  INVENTORY: Boxes,
  PAWN: HandCoins,
  TRADE: ShoppingCart,
  USER: ShieldCheck,
}

const actionLabels: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  PAYMENT: 'Recorded payment for',
  REDEEM: 'Redeemed',
  FORFEIT: 'Forfeited',
  CANCEL: 'Cancelled',
  DELETE: 'Deleted',
  LOGIN: 'Signed in to',
}

function titleCase(value: string) {
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
}

function formatMoney(value: unknown) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return ''
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(amount)
}

function relativeTime(value: string) {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return 'Unknown time'

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 10) return 'Just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function activityTitle(log: ActivityLog) {
  const details = log.details || {}
  const action = actionLabels[log.action] || titleCase(log.action)

  if (log.entity === 'TRADE') {
    const type = String(details.type || '').toUpperCase()
    const reference = String(details.tradeNo || '').trim()
    return `${action} ${type === 'SELL' ? 'sale' : type === 'BUY' ? 'purchase' : 'transaction'}${reference ? ` ${reference}` : ''}`
  }

  if (log.entity === 'PAWN') {
    const reference = String(details.pawnNo || '').trim()
    return `${action} pawn contract${reference ? ` ${reference}` : ''}`
  }

  if (log.entity === 'INVENTORY') {
    const reference = String(details.sku || '').trim()
    return `${action} stock item${reference ? ` ${reference}` : ''}`
  }

  if (log.entity === 'CUSTOMER') {
    const name = String(details.name || '').trim()
    return `${action} customer${name ? ` ${name}` : ''}`
  }

  if (log.entity === 'USER') {
    return `${action} staff account`
  }

  return `${action} ${titleCase(log.entity)}`
}

function activitySummary(log: ActivityLog) {
  const details = log.details || {}
  const parts: string[] = []

  if (details.total !== undefined) parts.push(`Total ${formatMoney(details.total)}`)
  if (details.principal !== undefined) parts.push(`Principal ${formatMoney(details.principal)}`)
  if (details.amount !== undefined) parts.push(`Amount ${formatMoney(details.amount)}`)
  if (details.role) parts.push(`Role ${titleCase(String(details.role))}`)
  if (details.phone) parts.push(String(details.phone))

  return parts.join(' · ') || `${titleCase(log.entity)} record ${log.entityId ? log.entityId.slice(-6).toUpperCase() : ''}`.trim()
}

function ActivityRow({ log, unread }: { log: ActivityLog; unread: boolean }) {
  const Icon = entityIcons[log.entity] || Activity
  const actor = log.user?.name || 'System'

  return (
    <article className={`activity-report-row ${unread ? 'unread' : ''}`}>
      <span className={`activity-report-row-icon entity-${log.entity.toLowerCase()}`}><Icon size={17} /></span>
      <div className="activity-report-row-copy">
        <div className="activity-report-row-heading">
          <strong>{activityTitle(log)}</strong>
          <time title={new Date(log.createdAt).toLocaleString()}>{relativeTime(log.createdAt)}</time>
        </div>
        <p>{activitySummary(log)}</p>
        <small><UserRound size={12} /> {actor}{log.user?.role ? ` · ${titleCase(log.user.role)}` : ''}</small>
      </div>
      {unread && <span className="activity-report-new-dot" title="New activity" />}
    </article>
  )
}

export default function ActivityReportBridge() {
  const [button, setButton] = useState<HTMLButtonElement | null>(null)
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [entity, setEntity] = useState('ALL')
  const [unreadCount, setUnreadCount] = useState(0)
  const [position, setPosition] = useState<Position>({ top: 68, right: 20 })
  const panelRef = useRef<HTMLElement | null>(null)

  const lastSeen = useCallback(() => {
    const stored = window.localStorage.getItem(LAST_SEEN_KEY)
    return stored ? new Date(stored).getTime() : 0
  }, [])

  const updateUnread = useCallback((items: ActivityLog[]) => {
    const seenAt = lastSeen()
    if (!seenAt && items[0]) {
      window.localStorage.setItem(LAST_SEEN_KEY, items[0].createdAt)
      setUnreadCount(0)
      return
    }
    setUnreadCount(items.filter((item) => new Date(item.createdAt).getTime() > seenAt).length)
  }, [lastSeen])

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    setError('')
    try {
      const result = await api<{ logs: ActivityLog[] }>('/activity-logs')
      setLogs(result.logs)
      updateUnread(result.logs)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load the activity report')
    } finally {
      if (showSpinner) setLoading(false)
    }
  }, [updateUnread])

  const markSeen = useCallback(() => {
    if (logs[0]) window.localStorage.setItem(LAST_SEEN_KEY, logs[0].createdAt)
    else window.localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString())
    setUnreadCount(0)
  }, [logs])

  const refreshPosition = useCallback(() => {
    if (!button) return
    const rect = button.getBoundingClientRect()
    setPosition({
      top: Math.round(rect.bottom + 10),
      right: Math.max(12, Math.round(window.innerWidth - rect.right)),
    })
  }, [button])

  useEffect(() => {
    const sync = () => {
      const nextButton = document.querySelector<HTMLButtonElement>('.notification-button')
      setButton(nextButton)
      setPortalRoot(document.querySelector<HTMLElement>('.app'))
    }

    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { subtree: true, childList: true })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!button) return

    const handleClick = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      refreshPosition()
      setOpen((current) => !current)
    }

    button.title = 'Open activity report'
    button.setAttribute('aria-haspopup', 'dialog')
    button.addEventListener('click', handleClick)
    void load(false)

    const interval = window.setInterval(() => {
      if (!document.hidden) void load(false)
    }, POLL_INTERVAL_MS)

    return () => {
      button.removeEventListener('click', handleClick)
      window.clearInterval(interval)
    }
  }, [button, load, refreshPosition])

  useEffect(() => {
    if (!button) return
    const badge = button.querySelector<HTMLSpanElement>('span')
    if (!badge) return

    badge.classList.add('activity-report-badge')
    badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount || '')
    badge.hidden = unreadCount === 0
    button.setAttribute('aria-label', unreadCount > 0 ? `Activity report, ${unreadCount} unread` : 'Activity report')
  }, [button, unreadCount])

  useEffect(() => {
    if (!open) return
    refreshPosition()
    void load(true)

    const closeOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || button?.contains(target)) return
      setOpen(false)
    }
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const reposition = () => refreshPosition()

    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeEscape)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)

    return () => {
      document.removeEventListener('mousedown', closeOutside)
      document.removeEventListener('keydown', closeEscape)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [button, load, open, refreshPosition])

  useEffect(() => {
    if (open && logs.length > 0) markSeen()
  }, [logs, markSeen, open])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return logs.filter((log) => {
      if (entity !== 'ALL' && log.entity !== entity) return false
      if (!term) return true
      return [
        log.action,
        log.entity,
        log.user?.name,
        log.user?.email,
        activityTitle(log),
        activitySummary(log),
      ].some((value) => String(value || '').toLowerCase().includes(term))
    })
  }, [entity, logs, search])

  const todayCount = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return logs.filter((log) => new Date(log.createdAt) >= start).length
  }, [logs])

  if (!open || !portalRoot) return null

  return createPortal(
    <section
      ref={panelRef}
      className="activity-report-panel"
      style={{ top: position.top, right: position.right }}
      role="dialog"
      aria-modal="false"
      aria-label="Activity report"
    >
      <header className="activity-report-header">
        <span className="activity-report-header-icon"><Bell size={19} /></span>
        <div>
          <span className="eyebrow">Live audit feed</span>
          <h3>Activity report</h3>
          <p>Every important shop action is recorded automatically.</p>
        </div>
        <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close activity report"><X size={17} /></button>
      </header>

      <div className="activity-report-summary">
        <span><Activity size={15} /><strong>{logs.length}</strong> recent actions</span>
        <span><Check size={15} /><strong>{todayCount}</strong> today</span>
        <span className="activity-report-live"><i /> Refreshes every 15s</span>
      </div>

      <div className="activity-report-controls">
        <label className="activity-report-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search staff or action" /></label>
        <select value={entity} onChange={(event) => setEntity(event.target.value)} aria-label="Filter activity type">
          <option value="ALL">All modules</option>
          <option value="TRADE">Sales & purchases</option>
          <option value="PAWN">Pawn</option>
          <option value="INVENTORY">Stock</option>
          <option value="CUSTOMER">Customers</option>
          <option value="USER">Staff</option>
        </select>
        <button className="icon-button" onClick={() => void load(true)} disabled={loading} title="Refresh report"><RefreshCcw size={15} className={loading ? 'activity-spin' : ''} /></button>
      </div>

      {error && <div className="activity-report-error"><AlertTriangle size={16} /> {error}</div>}

      <div className="activity-report-list">
        {loading && logs.length === 0 && <div className="activity-report-empty"><RefreshCcw className="activity-spin" /><strong>Loading activity…</strong></div>}
        {!loading && !error && filtered.length === 0 && <div className="activity-report-empty"><BadgeDollarSign /><strong>No activity found</strong><span>New customer, stock, pawn, and transaction actions will appear here.</span></div>}
        {filtered.map((log) => (
          <ActivityRow key={log._id} log={log} unread={new Date(log.createdAt).getTime() > lastSeen()} />
        ))}
      </div>
    </section>,
    portalRoot,
  )
}
