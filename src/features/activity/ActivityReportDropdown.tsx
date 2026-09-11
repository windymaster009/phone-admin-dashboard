import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  Activity,
  AlertTriangle,
  Archive,
  BadgeDollarSign,
  Bell,
  Boxes,
  Check,
  CheckCheck,
  Database,
  Eye,
  EyeOff,
  FileText,
  HandCoins,
  KeyRound,
  Landmark,
  LogIn,
  LogOut,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  Truck,
  UserRound,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import { api, type SessionUser } from '../../lib/api'
import {
  getActivityClearedKey,
  getActivityLastSeenKey,
  getStoredSessionUser,
  safeStorage,
} from '../../lib/storage'
import type { ActivityLog } from '../../types/domain'
import './activity-report.css'

type Position = {
  top: number
  right: number
}

const POLL_INTERVAL_MS = 15_000

export const MODULE_FILTER_GROUPS = [
  { key: 'ALL', label: 'All modules' },
  { key: 'TRADE', label: 'Sales & purchases' },
  { key: 'PAWN', label: 'Pawn' },
  { key: 'LOAN', label: 'Loans' },
  { key: 'INVENTORY', label: 'Stock' },
  { key: 'CUSTOMER', label: 'Customers' },
  { key: 'SUPPLIER', label: 'Suppliers' },
  { key: 'SERVICE', label: 'Services' },
  { key: 'CUSTOMER_DOCUMENT', label: 'Documents' },
  { key: 'RECEIPT', label: 'Receipts' },
  { key: 'BACKUP', label: 'Backups' },
  { key: 'USER', label: 'Staff' },
  { key: 'AUTH_SESSION', label: 'Security & sign-ins' },
] as const

const entityIcons: Record<string, LucideIcon> = {
  TRADE: ShoppingCart,
  PAWN: HandCoins,
  LOAN: Landmark,
  LOAN_PAYMENT: Landmark,
  INVENTORY: Boxes,
  CUSTOMER: Users,
  SUPPLIER: Truck,
  SERVICE_OFFERING: Wrench,
  SERVICE_CHARGE: Wrench,
  CUSTOMER_DOCUMENT: FileText,
  RECEIPT: FileText,
  BACKUP: Database,
  USER: UserRound,
  AUTH_SESSION: KeyRound,
}

const entityFriendlyNames: Record<string, string> = {
  TRADE: 'Sale',
  PAWN: 'Pawn',
  LOAN: 'Loan',
  LOAN_PAYMENT: 'Loan payment',
  INVENTORY: 'Product',
  CUSTOMER: 'Customer',
  SUPPLIER: 'Supplier',
  SERVICE_OFFERING: 'Service',
  SERVICE_CHARGE: 'Service charge',
  CUSTOMER_DOCUMENT: 'Document',
  RECEIPT: 'Receipt',
  BACKUP: 'Backup',
  USER: 'Staff',
  AUTH_SESSION: '', // Do not append Auth Session
}

const actionLabels: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
  PAYMENT: 'Recorded payment for',
  RENEW: 'Extended',
  REDEEM: 'Redeemed',
  FORFEIT: 'Claimed collateral',
  CANCEL: 'Cancelled',
  REFUND: 'Refunded',
  ADJUST: 'Adjusted stock for',
  UPLOAD: 'Uploaded',
  DOWNLOAD: 'Downloaded',
  VIEW: 'Viewed',
  DUE_REMINDER: 'Due tomorrow:',
  LOGIN: 'Signed in',
  LOGIN_FAILED: 'Failed sign-in',
  LOGOUT: 'Signed out',
  SESSION_REVOKED: 'Device session revoked',
  OTHER_SESSIONS_REVOKED: 'Other devices signed out',
  ALL_SESSIONS_REVOKED: 'All devices signed out',
  ANDROID_PAIRED: 'Android device paired',
  ANDROID_PAIRING_CREATED: 'Pairing code created',
  TWO_FACTOR_CHALLENGE: 'Two-factor challenge created',
  TWO_FACTOR_VERIFIED: 'Two-factor sign-in verified',
  TWO_FACTOR_RECOVERY_USED: 'Recovery code used',
  TWO_FACTOR_SETUP_STARTED: 'Two-factor setup started',
  TWO_FACTOR_ENABLED: 'Two-factor enabled',
  TWO_FACTOR_DISABLED: 'Two-factor disabled',
  TWO_FACTOR_RECOVERY_REGENERATED: 'Recovery codes regenerated',
}

export function titleCase(value: string) {
  return String(value || '')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
}

export function formatIpAddress(ip?: string): string {
  if (!ip) return ''
  const trimmed = String(ip).trim()
  if (trimmed === '127.0.0.1' || trimmed === '::1' || trimmed === '::ffff:127.0.0.1') {
    return 'Local device'
  }
  return trimmed
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

export function activityTitle(log: ActivityLog): string {
  if (log.entity === 'AUTH_SESSION') {
    const rawUser = typeof log.user === 'object' && log.user !== null
      ? ((log.user as any).name || (log.user as any).username || '')
      : String(log.user || '')
    const userName = rawUser
      || (typeof log.details?.name === 'string' ? log.details.name : '')
      || 'Staff member'
    const failedTarget = (typeof log.details?.email === 'string' && log.details.email)
      || (typeof log.details?.user === 'string' && log.details.user)
      || userName

    switch (log.action) {
      case 'LOGIN':
        return `${userName} signed in`
      case 'LOGOUT':
        return `${userName} signed out`
      case 'LOGIN_FAILED':
        return `Failed sign-in for ${failedTarget}`
      case 'SESSION_REVOKED':
        return 'Device session revoked'
      case 'OTHER_SESSIONS_REVOKED':
        return 'Other devices signed out'
      case 'ALL_SESSIONS_REVOKED':
        return 'All devices signed out'
      case 'ANDROID_PAIRED':
        return 'Android device paired'
      case 'ANDROID_PAIRING_CREATED':
        return 'Pairing code created'
      case 'TWO_FACTOR_VERIFIED':
        return `Two-factor verified for ${userName}`
      case 'TWO_FACTOR_ENABLED':
        return `Two-factor enabled for ${userName}`
      case 'TWO_FACTOR_DISABLED':
        return `Two-factor disabled for ${userName}`
      case 'TWO_FACTOR_RECOVERY_USED':
        return `Recovery code used by ${userName}`
      default:
        return actionLabels[log.action] || titleCase(log.action)
    }
  }

  const label = actionLabels[log.action] || titleCase(log.action)
  const entityName = entityFriendlyNames[log.entity] ?? titleCase(log.entity)
  const details = log.details || {}
  const target = String(
    details.tradeNo
    || details.pawnNo
    || details.loanNo
    || details.paymentNo
    || details.sku
    || details.receiptNo
    || details.serviceNo
    || details.documentName
    || details.filename
    || details.customerName
    || details.supplierName
    || details.name
    || log.reference
    || '',
  ).trim()

  return [label, entityName, target].filter(Boolean).join(' ')
}

export function activitySummary(log: ActivityLog): string {
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

  if (pieces.length > 0) return pieces.filter(Boolean).join(' · ')
  return log.summary || ''
}

function ActivityRow({ log, unread }: { log: ActivityLog; unread: boolean }) {
  const EntityIcon = entityIcons[log.entity] || Activity
  const rawUser = typeof log.user === 'object' && log.user !== null
    ? ((log.user as any).name || (log.user as any).username || '')
    : String(log.user || '')
  const userName = rawUser || (typeof log.details?.name === 'string' ? log.details.name : '') || 'System'
  const initials = userName
    .split(/\s+/)
    .slice(0, 2)
    .map((part: string) => part[0])
    .join('')
    .toUpperCase() || 'PF'

  const formattedIp = formatIpAddress(log.ipAddress)

  return (
    <article className={`activity-report-row ${unread ? 'unread' : ''}`}>
      <span className={`activity-report-row-icon entity-${log.entity.toLowerCase()}`}>
        <EntityIcon size={16} />
      </span>
      <div className="activity-report-row-copy">
        <div className="activity-report-row-heading">
          <strong>{activityTitle(log)}</strong>
          <time dateTime={log.createdAt}>{relativeTime(log.createdAt)}</time>
        </div>
        {activitySummary(log) && <p className="activity-report-details">{activitySummary(log)}</p>}
        <div className="activity-report-meta">
          <span className="activity-report-avatar" title={userName}>
            {initials}
          </span>
          <span className="activity-report-staff">{userName}</span>
          {formattedIp && <small className="activity-report-ip">{formattedIp}</small>}
        </div>
      </div>
      {unread && <span className="activity-report-new-dot" aria-label="Unread" />}
    </article>
  )
}

export interface ActivityReportDropdownProps {
  anchorRef?: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  onUnreadChange?: (count: number) => void
  user?: SessionUser
}

export default function ActivityReportDropdown({
  anchorRef,
  open,
  onClose,
  onUnreadChange,
  user,
}: ActivityReportDropdownProps) {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [entity, setEntity] = useState('ALL')
  const [showClearedHistory, setShowClearedHistory] = useState(false)
  const [clearedAt, setClearedAt] = useState<string | null>(null)
  const [position, setPosition] = useState<Position>({ top: 60, right: 16 })
  const panelRef = useRef<HTMLElement>(null)
  const currentUserId = user?.id || getStoredSessionUser()?.id || 'default'
  const lastSeenKey = getActivityLastSeenKey(currentUserId)
  const clearedKey = getActivityClearedKey(currentUserId)

  const logsRef = useRef<ActivityLog[]>([])
  logsRef.current = logs

  const onUnreadChangeRef = useRef(onUnreadChange)
  onUnreadChangeRef.current = onUnreadChange

  useEffect(() => {
    setClearedAt(safeStorage.getItem(clearedKey))
  }, [clearedKey])

  const getLastSeenTime = useCallback(() => {
    const raw = safeStorage.getItem(lastSeenKey)
    const timestamp = raw ? new Date(raw).getTime() : 0
    return Number.isFinite(timestamp) ? timestamp : 0
  }, [lastSeenKey])

  const updateUnread = useCallback((items: ActivityLog[]) => {
    const raw = safeStorage.getItem(lastSeenKey)
    const seenAt = raw ? new Date(raw).getTime() : 0
    if (!seenAt) {
      if (items[0]) safeStorage.setItem(lastSeenKey, items[0].createdAt)
      onUnreadChangeRef.current?.(0)
      return
    }
    const count = items.filter((item) => new Date(item.createdAt).getTime() > seenAt).length
    onUnreadChangeRef.current?.(count)
  }, [lastSeenKey])

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Load initial page or refresh
  const load = useCallback(async (showSpinner = false) => {
    if (!mountedRef.current) return
    if (showSpinner) setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (entity !== 'ALL') params.set('entity', entity)
      if (search.trim()) params.set('search', search.trim())
      params.set('limit', '30')

      const result = await api<{
        logs: ActivityLog[]
        nextCursor?: string | null
        hasMore?: boolean
        totalCount?: number
      }>(`/activity-logs?${params.toString()}`)

      if (!mountedRef.current) return
      const items = Array.isArray(result?.logs) ? result.logs : []
      setLogs(items)
      setNextCursor(result?.nextCursor ?? null)
      setHasMore(Boolean(result?.hasMore))
      updateUnread(items)
    } catch (reason) {
      if (!mountedRef.current) return
      setError(reason instanceof Error ? reason.message : 'Unable to load the activity report')
    } finally {
      if (mountedRef.current && showSpinner) setLoading(false)
    }
  }, [entity, search, updateUnread])

  // Load older records via cursor pagination
  const loadOlder = useCallback(async () => {
    if (!nextCursor || loadingOlder || !mountedRef.current) return
    setLoadingOlder(true)
    try {
      const params = new URLSearchParams()
      if (entity !== 'ALL') params.set('entity', entity)
      if (search.trim()) params.set('search', search.trim())
      params.set('cursor', nextCursor)
      params.set('limit', '30')

      const result = await api<{
        logs: ActivityLog[]
        nextCursor?: string | null
        hasMore?: boolean
      }>(`/activity-logs?${params.toString()}`)

      if (!mountedRef.current) return
      const olderItems = Array.isArray(result?.logs) ? result.logs : []
      setLogs((current) => {
        const existingIds = new Set(current.map((item) => item.id || item._id))
        const uniqueOlder = olderItems.filter((item) => !existingIds.has(item.id || item._id))
        return [...current, ...uniqueOlder]
      })
      setNextCursor(result?.nextCursor ?? null)
      setHasMore(Boolean(result?.hasMore))
    } catch (reason) {
      if (!mountedRef.current) return
      setError(reason instanceof Error ? reason.message : 'Unable to load older activity')
    } finally {
      if (mountedRef.current) setLoadingOlder(false)
    }
  }, [entity, loadingOlder, nextCursor, search])

  // Poll for newer records without replacing or duplicating loaded list
  const pollNewer = useCallback(async () => {
    const currentList = logsRef.current
    if (!mountedRef.current || currentList.length === 0) return
    const newestDate = currentList[0].createdAt
    try {
      const params = new URLSearchParams()
      if (entity !== 'ALL') params.set('entity', entity)
      if (search.trim()) params.set('search', search.trim())
      params.set('since', newestDate)

      const result = await api<{ logs: ActivityLog[] }>(`/activity-logs?${params.toString()}`)
      if (!mountedRef.current) return
      const newerItems = Array.isArray(result?.logs) ? result.logs : []
      if (newerItems.length > 0) {
        setLogs((current) => {
          const existingIds = new Set(current.map((item) => item.id || item._id))
          const uniqueNewer = newerItems.filter((item) => !existingIds.has(item.id || item._id))
          return [...uniqueNewer, ...current]
        })
        updateUnread([...newerItems, ...currentList])
      }
    } catch {
      // Background poll failure silently ignored
    }
  }, [entity, search, updateUnread])

  const pollNewerRef = useRef(pollNewer)
  pollNewerRef.current = pollNewer

  const markAllAsRead = useCallback(() => {
    const currentList = logsRef.current
    const timestamp = currentList[0]?.createdAt || new Date().toISOString()
    safeStorage.setItem(lastSeenKey, timestamp)
    onUnreadChangeRef.current?.(0)
  }, [lastSeenKey])

  const clearNotificationsFromView = useCallback(() => {
    const nowIso = new Date().toISOString()
    safeStorage.setItem(clearedKey, nowIso)
    setClearedAt(nowIso)
    setShowClearedHistory(false)
    markAllAsRead()
  }, [clearedKey, markAllAsRead])

  const undoClear = useCallback(() => {
    safeStorage.removeItem(clearedKey)
    setClearedAt(null)
  }, [clearedKey])

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
    void load(open)
  }, [load, open])

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!document.hidden && mountedRef.current) {
        void pollNewerRef.current()
      }
    }, POLL_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!open) return
    refreshPosition()

    const closeOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || anchorRef?.current?.contains(target)) return
      onClose()
    }

    const reposition = () => refreshPosition()
    window.addEventListener('mousedown', closeOutside)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)

    return () => {
      window.removeEventListener('mousedown', closeOutside)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [anchorRef, onClose, open, refreshPosition])

  // Apply per-user cleared cutoff unless user requested to show cleared history
  const visibleLogs = useMemo(() => {
    if (!clearedAt || showClearedHistory) return logs
    const clearedTimestamp = new Date(clearedAt).getTime()
    return logs.filter((log) => new Date(log.createdAt).getTime() > clearedTimestamp)
  }, [clearedAt, logs, showClearedHistory])

  const todayCount = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const startTime = start.getTime()
    return visibleLogs.filter((log) => new Date(log.createdAt).getTime() >= startTime).length
  }, [visibleLogs])

  const hasClearedHidden = Boolean(clearedAt && !showClearedHistory && logs.length > visibleLogs.length)

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
        <span><Activity size={15} /><strong>{visibleLogs.length}</strong> {showClearedHistory ? 'all actions' : 'active actions'}</span>
        <span><Check size={15} /><strong>{todayCount}</strong> today</span>
        <div className="activity-report-actions-cluster">
          <button
            type="button"
            className="activity-action-btn"
            onClick={markAllAsRead}
            title="Mark all as read"
          >
            <CheckCheck size={13} />
            <span>Mark read</span>
          </button>
          <button
            type="button"
            className="activity-action-btn"
            onClick={clearNotificationsFromView}
            title="Clear notifications from current view (audit records are retained)"
          >
            <Trash2 size={13} />
            <span>Clear view</span>
          </button>
        </div>
      </div>

      <div className="activity-report-controls">
        <label className="activity-report-search">
          <Search size={15} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search staff, record reference, or action"
          />
        </label>
        <select
          value={entity}
          onChange={(event) => setEntity(event.target.value)}
          aria-label="Filter activity type"
        >
          {MODULE_FILTER_GROUPS.map((group) => (
            <option key={group.key} value={group.key}>{group.label}</option>
          ))}
        </select>
        <button
          className="icon-button"
          onClick={() => void load(true)}
          disabled={loading}
          title="Refresh report"
        >
          <RefreshCcw size={15} className={loading ? 'activity-spin' : ''} />
        </button>
      </div>

      {hasClearedHidden && (
        <aside className="activity-report-cleared-banner" role="status">
          <p>
            Current notifications cleared from view. <strong>Audit history is retained.</strong>
          </p>
          <div className="activity-report-banner-actions">
            <button type="button" className="activity-banner-link" onClick={undoClear}>
              <RotateCcw size={12} /> Undo
            </button>
            <button
              type="button"
              className="activity-banner-link"
              onClick={() => setShowClearedHistory(true)}
            >
              <Eye size={12} /> Show all
            </button>
          </div>
        </aside>
      )}

      {showClearedHistory && clearedAt && (
        <aside className="activity-report-cleared-banner is-showing-all" role="status">
          <p>Viewing complete audit history (including cleared items).</p>
          <button
            type="button"
            className="activity-banner-link"
            onClick={() => setShowClearedHistory(false)}
          >
            <EyeOff size={12} /> Hide cleared
          </button>
        </aside>
      )}

      {error && <div className="activity-report-error"><AlertTriangle size={16} /> {error}</div>}

      <div className="activity-report-list">
        {loading && logs.length === 0 && (
          <div className="activity-report-empty">
            <RefreshCcw className="activity-spin" />
            <strong>Loading activity…</strong>
          </div>
        )}
        {!loading && !error && visibleLogs.length === 0 && (
          <div className="activity-report-empty">
            <BadgeDollarSign />
            <strong>No activity found</strong>
            <span>
              {hasClearedHidden
                ? 'All notifications have been cleared from view. Click "Show all" to view retained audit records.'
                : 'New customer, stock, pawn, and transaction actions will appear here.'}
            </span>
          </div>
        )}
        {visibleLogs.map((log) => (
          <ActivityRow
            key={log.id || log._id}
            log={log}
            unread={new Date(log.createdAt).getTime() > getLastSeenTime()}
          />
        ))}

        {hasMore && (
          <div className="activity-report-pagination">
            <button
              type="button"
              className="secondary-button activity-load-more"
              onClick={() => void loadOlder()}
              disabled={loadingOlder}
            >
              {loadingOlder ? (
                <>
                  <RefreshCcw size={14} className="activity-spin" />
                  <span>Loading older activity…</span>
                </>
              ) : (
                'Load older activity'
              )}
            </button>
          </div>
        )}
      </div>
    </section>,
    document.body,
  )
}
