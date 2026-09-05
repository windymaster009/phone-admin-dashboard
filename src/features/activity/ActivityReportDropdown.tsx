import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
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
import { api } from '../../lib/api'
import { safeStorage } from '../../lib/storage'
import './activity-report.css'

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
  RENEW: 'Extended',
  REDEEM: 'Redeemed',
  FORFEIT: 'Claimed collateral',
  CANCEL: 'Cancelled',
  DELETE: 'Deleted',
  LOGIN: 'Signed in to',
  DUE_REMINDER: 'Due tomorrow:',
}

function titleCase(value: string) {
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
}

function formatMoney(value: unknown, currency: unknown = 'USD') {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return ''
  if (String(currency).toUpperCase() === 'KHR') return `${Math.round(amount).toLocaleString()} KHR`
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
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(value))
}

function activityTitle(log: ActivityLog) {
  const label = actionLabels[log.action] || titleCase(log.action)
  const entity = titleCase(log.entity)
  const details = log.details || {}
  const target = details.pawnNo
    || details.loanNo
    || details.tradeNo
    || details.sku
    || details.customerName
    || details.name
    || ''

  return [label, entity, target].filter(Boolean).join(' ')
}

function activitySummary(log: ActivityLog) {
  const details = log.details || {}
  const pieces: string[] = []

  if (details.amount !== undefined) {
    pieces.push(formatMoney(details.amount, details.currency))
  }
  if (details.itemSnapshot && typeof details.itemSnapshot === 'object') {
    const item = details.itemSnapshot as { name?: string }
    if (item.name) pieces.push(item.name)
  }
  if (details.phone) pieces.push(String(details.phone))
  if (details.role) pieces.push(titleCase(String(details.role)))
  if (details.note) pieces.push(String(details.note))

  return pieces.filter(Boolean).join(' · ')
}

function ActivityRow({ log, unread }: { log: ActivityLog; unread: boolean }) {
  const EntityIcon = entityIcons[log.entity] || UserRound
  const initials = (log.user?.name || 'PF')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return (
    <article className={`activity-row ${unread ? 'activity-unread' : ''}`}>
      <span className="activity-icon">
        <EntityIcon size={16} />
      </span>
      <div className="activity-content">
        <div className="activity-headline">
          <strong>{activityTitle(log)}</strong>
          <time dateTime={log.createdAt}>{relativeTime(log.createdAt)}</time>
        </div>
        {activitySummary(log) && <p className="activity-details">{activitySummary(log)}</p>}
        <div className="activity-meta">
          <span className="activity-avatar" title={log.user?.email || log.user?.name || 'System'}>
            {initials}
          </span>
          <span>{log.user?.name || 'System'}</span>
          {log.ipAddress && <small className="activity-ip">{log.ipAddress}</small>}
        </div>
      </div>
    </article>
  )
}

export interface ActivityReportDropdownProps {
  anchorRef?: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  onUnreadChange?: (count: number) => void
}

export default function ActivityReportDropdown({
  anchorRef,
  open,
  onClose,
  onUnreadChange,
}: ActivityReportDropdownProps) {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [entity, setEntity] = useState('ALL')
  const [position, setPosition] = useState<Position>({ top: 60, right: 16 })
  const panelRef = useRef<HTMLElement>(null)

  const lastSeen = useCallback(() => {
    const raw = safeStorage.getItem(LAST_SEEN_KEY)
    const timestamp = raw ? new Date(raw).getTime() : 0
    return Number.isFinite(timestamp) ? timestamp : 0
  }, [])

  const updateUnread = useCallback((items: ActivityLog[]) => {
    const seenAt = lastSeen()
    if (!seenAt) {
      if (items[0]) safeStorage.setItem(LAST_SEEN_KEY, items[0].createdAt)
      onUnreadChange?.(0)
      return
    }
    const count = items.filter((item) => new Date(item.createdAt).getTime() > seenAt).length
    onUnreadChange?.(count)
  }, [lastSeen, onUnreadChange])

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
    if (logs[0]) safeStorage.setItem(LAST_SEEN_KEY, logs[0].createdAt)
    else safeStorage.setItem(LAST_SEEN_KEY, new Date().toISOString())
    onUnreadChange?.(0)
  }, [logs, onUnreadChange])

  const refreshPosition = useCallback(() => {
    const anchor = anchorRef?.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    setPosition({
      top: Math.round(rect.bottom + 10),
      right: Math.max(12, Math.round(window.innerWidth - rect.right)),
    })
  }, [anchorRef])

  useEffect(() => {
    void load(false)
    const interval = window.setInterval(() => {
      if (!document.hidden) void load(false)
    }, POLL_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [load])

  useEffect(() => {
    if (!open) return
    refreshPosition()
    void load(true)

    const closeOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || anchorRef?.current?.contains(target)) return
      onClose()
    }
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
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
  }, [anchorRef, load, onClose, open, refreshPosition])

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
    const startTime = start.getTime()
    return logs.filter((log) => new Date(log.createdAt).getTime() >= startTime).length
  }, [logs])

  if (!open) return null

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
        <button className="icon-button" onClick={onClose} aria-label="Close activity report"><X size={17} /></button>
      </header>

      <div className="activity-report-summary">
        <span><Activity size={15} /><strong>{logs.length}</strong> recent actions</span>
        <span><Check size={15} /><strong>{todayCount}</strong> today</span>
        <span className="activity-report-live"><i /> Refreshes every 15s</span>
      </div>

      <div className="activity-report-controls">
        <label className="activity-report-search">
          <Search size={15} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search staff or action" />
        </label>
        <select value={entity} onChange={(event) => setEntity(event.target.value)} aria-label="Filter activity type">
          <option value="ALL">All modules</option>
          <option value="TRADE">Sales & purchases</option>
          <option value="PAWN">Pawn</option>
          <option value="INVENTORY">Stock</option>
          <option value="CUSTOMER">Customers</option>
          <option value="USER">Staff</option>
        </select>
        <button className="icon-button" onClick={() => void load(true)} disabled={loading} title="Refresh report">
          <RefreshCcw size={15} className={loading ? 'activity-spin' : ''} />
        </button>
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
    document.body,
  )
}
