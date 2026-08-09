import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  KeyRound,
  LogOut,
  Monitor,
  RefreshCcw,
  ShieldCheck,
  Smartphone,
  Trash2,
} from 'lucide-react'
import { api, getSessionUser } from '../../lib/api'
import LoadingState from '../../components/LoadingState'

type AuthSession = {
  id: string
  kind: 'WEB' | 'ANDROID'
  deviceName: string
  ipAddress: string
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  revokedAt?: string | null
  current: boolean
}

type PairingCode = {
  code: string
  expiresAt: string
}

type SecurityEvent = {
  _id: string
  action: string
  details?: Record<string, unknown>
  ipAddress?: string
  createdAt: string
}

function dateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function relativeTime(value: string) {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return 'Unknown'
  const difference = Math.max(0, Date.now() - time)
  const minutes = Math.floor(difference / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  return `${Math.floor(hours / 24)} day${hours >= 48 ? 's' : ''} ago`
}

function eventLabel(action: string) {
  const labels: Record<string, string> = {
    LOGIN: 'Signed in',
    LOGIN_FAILED: 'Failed sign-in',
    LOGOUT: 'Signed out',
    ANDROID_PAIRED: 'Android device paired',
    ANDROID_PAIRING_CREATED: 'Pairing code created',
    SESSION_REVOKED: 'Session revoked',
    OTHER_SESSIONS_REVOKED: 'Other devices signed out',
    ALL_SESSIONS_REVOKED: 'All devices signed out',
  }
  return labels[action] || action.replaceAll('_', ' ').toLowerCase().replace(/^./, (value) => value.toUpperCase())
}

function SecurityWorkspace() {
  const user = getSessionUser()
  const [sessions, setSessions] = useState<AuthSession[]>([])
  const [events, setEvents] = useState<SecurityEvent[]>([])
  const [pairing, setPairing] = useState<PairingCode | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [clock, setClock] = useState(Date.now())

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [sessionResult, eventResult] = await Promise.all([
        api<{ sessions: AuthSession[] }>('/security/sessions'),
        api<{ events: SecurityEvent[] }>('/security/events?limit=20'),
      ])
      setSessions(sessionResult.sessions)
      setEvents(eventResult.events)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load security information')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!pairing) return
    const timer = window.setInterval(() => setClock(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [pairing])

  const pairingSeconds = pairing
    ? Math.max(0, Math.ceil((new Date(pairing.expiresAt).getTime() - clock) / 1_000))
    : 0
  const pairingExpired = Boolean(pairing && pairingSeconds <= 0)
  const activeSessions = useMemo(() => sessions.filter((session) => !session.revokedAt), [sessions])
  const otherSessions = activeSessions.filter((session) => !session.current)

  const generatePairing = async () => {
    setBusy(true)
    setError('')
    setCopied(false)
    try {
      const result = await api<PairingCode>('/security/android-pairing', { method: 'POST' })
      setPairing(result)
      setClock(Date.now())
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create Android pairing code')
    } finally {
      setBusy(false)
    }
  }

  const copyPairing = async () => {
    if (!pairing || pairingExpired) return
    try {
      await navigator.clipboard.writeText(pairing.code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      setError('Unable to copy the pairing code. Enter it manually on the other device.')
    }
  }

  const revokeSession = async (session: AuthSession) => {
    if (session.current || session.revokedAt) return
    if (!window.confirm(`Sign out ${session.deviceName}?`)) return
    setBusy(true)
    setError('')
    try {
      await api(`/security/sessions/${encodeURIComponent(session.id)}`, { method: 'DELETE' })
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to revoke the session')
    } finally {
      setBusy(false)
    }
  }

  const revokeOthers = async () => {
    if (otherSessions.length === 0) return
    if (!window.confirm(`Sign out ${otherSessions.length} other active device${otherSessions.length === 1 ? '' : 's'}?`)) return
    setBusy(true)
    setError('')
    try {
      await api('/security/sessions/revoke-others', { method: 'POST' })
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign out other devices')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="security-workspace"><LoadingState label="Loading security" detail="Checking active devices and recent security activity…" /></div>

  return (
    <div className="security-workspace">
      <header className="page-heading security-heading">
        <div>
          <span className="eyebrow">Account protection</span>
          <h1>Security</h1>
          <p>Manage signed-in devices, pair Android safely, and review security activity for {user?.name || 'your account'}.</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => void load()} disabled={busy}><RefreshCcw size={16} /> Refresh</button>
      </header>

      {error && <div className="security-error"><AlertTriangle size={17} /><span>{error}</span></div>}

      <section className="security-summary">
        <article className="card"><ShieldCheck size={21} /><div><span>Active sessions</span><strong>{activeSessions.length}</strong><small>{otherSessions.length} other device{otherSessions.length === 1 ? '' : 's'}</small></div></article>
        <article className="card"><Smartphone size={21} /><div><span>Android pairing</span><strong>One-time code</strong><small>Expires automatically</small></div></article>
        <article className="card"><Clock3 size={21} /><div><span>Session lifetime</span><strong>{activeSessions[0] ? dateTime(activeSessions[0].expiresAt) : '—'}</strong><small>Server-enforced expiry</small></div></article>
      </section>

      <div className="security-grid">
        <section className="card security-panel">
          <div className="security-panel-title"><div><h2>Signed-in devices</h2><p>Revoking a session signs that device out on its next request.</p></div><button type="button" className="danger-button" disabled={busy || otherSessions.length === 0} onClick={() => void revokeOthers()}><LogOut size={15} /> Sign out others</button></div>
          <div className="security-session-list">
            {sessions.map((session) => <article key={session.id} className={session.revokedAt ? 'revoked' : ''}>
              <span className="security-device-icon">{session.kind === 'ANDROID' ? <Smartphone size={19} /> : <Monitor size={19} />}</span>
              <div className="security-session-info">
                <div><strong>{session.deviceName}</strong>{session.current && <span className="security-current"><CheckCircle2 size={12} /> Current</span>}{session.revokedAt && <span className="security-revoked">Revoked</span>}</div>
                <span>{session.kind === 'ANDROID' ? 'PhoneFlow Android' : 'Web session'}{session.ipAddress ? ` · ${session.ipAddress}` : ''}</span>
                <small>Last active {relativeTime(session.lastSeenAt)} · Created {dateTime(session.createdAt)}</small>
              </div>
              {!session.current && !session.revokedAt && <button type="button" className="icon-button danger" disabled={busy} onClick={() => void revokeSession(session)} aria-label={`Sign out ${session.deviceName}`}><Trash2 size={16} /></button>}
            </article>)}
            {sessions.length === 0 && <div className="security-empty">No sessions are recorded yet.</div>}
          </div>
        </section>

        <section className="card security-panel security-pairing-panel">
          <div className="security-panel-title"><div><h2>Pair Android</h2><p>Create a code on this trusted session, then enter it on the Android sign-in screen.</p></div><KeyRound size={21} /></div>
          {pairing && !pairingExpired ? (
            <div className="security-pairing-code">
              <span>One-time code</span>
              <strong>{pairing.code}</strong>
              <small>Expires in {pairingSeconds}s</small>
              <button type="button" className="secondary-button" onClick={() => void copyPairing()}>{copied ? <CheckCircle2 size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy code'}</button>
            </div>
          ) : (
            <div className="security-pairing-empty"><Smartphone size={28} /><strong>{pairingExpired ? 'Pairing code expired' : 'No active pairing code'}</strong><span>Codes can be used once and expire quickly.</span></div>
          )}
          <button type="button" className="primary-button full-width" disabled={busy} onClick={() => void generatePairing()}><KeyRound size={16} /> {pairing && !pairingExpired ? 'Generate a new code' : 'Generate pairing code'}</button>
        </section>
      </div>

      <section className="card security-panel security-events-panel">
        <div className="security-panel-title"><div><h2>Recent security activity</h2><p>Sign-ins, pairing, sign-outs, and session revocations for your account.</p></div></div>
        <div className="security-event-list">
          {events.map((event) => <article key={event._id}>
            <span className={`security-event-dot ${event.action === 'LOGIN_FAILED' ? 'danger' : ''}`} />
            <div><strong>{eventLabel(event.action)}</strong><span>{event.ipAddress || 'IP not recorded'}</span></div>
            <time>{dateTime(event.createdAt)}</time>
          </article>)}
          {events.length === 0 && <div className="security-empty">No security activity has been recorded yet.</div>}
        </div>
      </section>
    </div>
  )
}

export default function SecurityWorkspaceBridge() {
  const [mainTarget, setMainTarget] = useState<HTMLElement | null>(null)
  const [navTarget, setNavTarget] = useState<HTMLElement | null>(null)
  const [active, setActive] = useState(() => window.location.pathname === '/security')
  const directRoute = useRef(window.location.pathname === '/security')

  const locate = useCallback(() => {
    setMainTarget(document.querySelector<HTMLElement>('.main-content'))
    let host = document.querySelector<HTMLElement>('.security-nav-host')
    if (!host) {
      const group = Array.from(document.querySelectorAll<HTMLElement>('.nav-group')).find((item) => item.querySelector('.nav-group-label')?.textContent?.trim() === 'Finance & Control')
      if (group) {
        host = document.createElement('span')
        host.className = 'security-nav-host'
        const settings = Array.from(group.querySelectorAll<HTMLElement>(':scope > button')).find((button) => button.textContent?.includes('Settings'))
        if (settings) settings.before(host)
        else group.append(host)
      }
    }
    setNavTarget(host)
  }, [])

  useEffect(() => {
    locate()
    const observer = new MutationObserver(locate)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    const pop = () => setActive(window.location.pathname === '/security')
    const sidebar = (event: MouseEvent) => {
      const button = event.target instanceof Element ? event.target.closest('.sidebar-nav button') : null
      if (button && !button.closest('.security-nav-host')) setActive(false)
    }
    window.addEventListener('popstate', pop)
    document.addEventListener('click', sidebar, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('popstate', pop)
      document.removeEventListener('click', sidebar, true)
      document.querySelector('.security-nav-host')?.remove()
      document.querySelector('.main-content')?.classList.remove('security-route-active')
    }
  }, [locate])

  useEffect(() => {
    if (!directRoute.current || !mainTarget) return
    if (window.location.pathname !== '/security') window.history.replaceState({ view: 'security' }, '', '/security')
    setActive(true)
  }, [mainTarget])

  useEffect(() => {
    if (!mainTarget) return
    mainTarget.classList.toggle('security-route-active', active)
    if (active) {
      document.querySelectorAll('.sidebar-nav button.active').forEach((button) => button.classList.remove('active'))
      document.title = 'Security · PhoneFlow'
    }
  }, [active, mainTarget])

  const openPage = () => {
    if (window.location.pathname !== '/security') window.history.pushState({ view: 'security' }, '', '/security')
    setActive(true)
  }

  return <>
    {navTarget && createPortal(<button className={active ? 'active' : ''} onClick={openPage}><ShieldCheck size={19} /><span>Security</span></button>, navTarget)}
    {active && mainTarget && createPortal(<SecurityWorkspace />, mainTarget)}
  </>
}
