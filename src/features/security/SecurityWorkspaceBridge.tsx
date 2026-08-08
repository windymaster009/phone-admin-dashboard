import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  KeyRound,
  LockKeyhole,
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
  twoFactorVerifiedAt?: string | null
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

type TwoFactorStatus = {
  configured: boolean
  eligible: boolean
  enabled: boolean
  enabledAt?: string | null
  recoveryCodesRemaining: number
  lastUsedAt?: string | null
  lastRecoveryUsedAt?: string | null
}

type TwoFactorSetup = {
  setupId: string
  secret: string
  otpauthUri: string
  expiresAt: string
}

function dateTime(value?: string | null) {
  if (!value) return '—'
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
    TWO_FACTOR_CHALLENGE: 'Two-factor challenge created',
    TWO_FACTOR_VERIFIED: 'Two-factor sign-in verified',
    TWO_FACTOR_RECOVERY_USED: 'Recovery code used',
    TWO_FACTOR_SETUP_STARTED: 'Two-factor setup started',
    TWO_FACTOR_ENABLED: 'Two-factor authentication enabled',
    TWO_FACTOR_DISABLED: 'Two-factor authentication disabled',
    TWO_FACTOR_RECOVERY_REGENERATED: 'Recovery codes regenerated',
  }
  return labels[action] || action.replaceAll('_', ' ').toLowerCase().replace(/^./, (value) => value.toUpperCase())
}

function SecurityWorkspace() {
  const user = getSessionUser()
  const [sessions, setSessions] = useState<AuthSession[]>([])
  const [events, setEvents] = useState<SecurityEvent[]>([])
  const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatus | null>(null)
  const [twoFactorSetup, setTwoFactorSetup] = useState<TwoFactorSetup | null>(null)
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [pairing, setPairing] = useState<PairingCode | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const [clock, setClock] = useState(Date.now())

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [sessionResult, eventResult, twoFactorResult] = await Promise.all([
        api<{ sessions: AuthSession[] }>('/security/sessions'),
        api<{ events: SecurityEvent[] }>('/security/events?limit=30'),
        api<TwoFactorStatus>('/security/two-factor'),
      ])
      setSessions(sessionResult.sessions)
      setEvents(eventResult.events)
      setTwoFactorStatus(twoFactorResult)
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

  const rememberCopied = (name: string) => {
    setCopied(name)
    window.setTimeout(() => setCopied((current) => current === name ? '' : current), 1_500)
  }

  const copyText = async (name: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      rememberCopied(name)
    } catch {
      setError('Unable to copy automatically. Select and copy the value manually.')
    }
  }

  const generatePairing = async () => {
    setBusy(true)
    setError('')
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

  const startTwoFactorSetup = async () => {
    setBusy(true)
    setError('')
    setRecoveryCodes([])
    try {
      const result = await api<TwoFactorSetup>('/security/two-factor/setup', { method: 'POST' })
      setTwoFactorSetup(result)
      setTwoFactorCode('')
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to start two-factor setup')
    } finally {
      setBusy(false)
    }
  }

  const enableTwoFactor = async () => {
    if (!twoFactorSetup || !twoFactorCode.trim()) return
    setBusy(true)
    setError('')
    try {
      const result = await api<{ recoveryCodes: string[] }>('/security/two-factor/enable', {
        method: 'POST',
        body: JSON.stringify({ setupId: twoFactorSetup.setupId, code: twoFactorCode }),
      })
      setRecoveryCodes(result.recoveryCodes)
      setTwoFactorSetup(null)
      setTwoFactorCode('')
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to enable two-factor authentication')
    } finally {
      setBusy(false)
    }
  }

  const regenerateRecovery = async () => {
    if (!twoFactorCode.trim()) {
      setError('Enter a current authenticator or recovery code first.')
      return
    }
    if (!window.confirm('Replace all existing recovery codes? Any previously saved recovery codes will stop working.')) return
    setBusy(true)
    setError('')
    try {
      const result = await api<{ recoveryCodes: string[] }>('/security/two-factor/recovery-codes', {
        method: 'POST',
        body: JSON.stringify({ code: twoFactorCode }),
      })
      setRecoveryCodes(result.recoveryCodes)
      setTwoFactorCode('')
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to regenerate recovery codes')
    } finally {
      setBusy(false)
    }
  }

  const turnOffTwoFactor = async () => {
    if (!twoFactorCode.trim()) {
      setError('Enter a current authenticator or recovery code before disabling 2FA.')
      return
    }
    if (!window.confirm('Disable two-factor authentication for this account? Other signed-in devices will be revoked.')) return
    setBusy(true)
    setError('')
    try {
      await api('/security/two-factor/disable', {
        method: 'POST',
        body: JSON.stringify({ code: twoFactorCode }),
      })
      setTwoFactorCode('')
      setRecoveryCodes([])
      setTwoFactorSetup(null)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to disable two-factor authentication')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="security-workspace"><LoadingState label="Loading security" detail="Checking active devices and account protection…" /></div>

  return (
    <div className="security-workspace">
      <header className="page-heading security-heading">
        <div>
          <span className="eyebrow">Account protection</span>
          <h1>Security</h1>
          <p>Manage signed-in devices, two-factor authentication, Android pairing, and security activity for {user?.name || 'your account'}.</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => void load()} disabled={busy}><RefreshCcw size={16} /> Refresh</button>
      </header>

      {error && <div className="security-error"><AlertTriangle size={17} /><span>{error}</span></div>}

      <section className="security-summary">
        <article className="card"><ShieldCheck size={21} /><div><span>Active sessions</span><strong>{activeSessions.length}</strong><small>{otherSessions.length} other device{otherSessions.length === 1 ? '' : 's'}</small></div></article>
        <article className="card"><LockKeyhole size={21} /><div><span>Two-factor</span><strong>{twoFactorStatus?.enabled ? 'Enabled' : 'Not enabled'}</strong><small>{twoFactorStatus?.eligible ? `${twoFactorStatus.recoveryCodesRemaining} recovery codes` : 'Owner / Manager only'}</small></div></article>
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
                <div><strong>{session.deviceName}</strong>{session.current && <span className="security-current"><CheckCircle2 size={12} /> Current</span>}{session.twoFactorVerifiedAt && <span className="security-2fa-badge"><LockKeyhole size={11} /> 2FA</span>}{session.revokedAt && <span className="security-revoked">Revoked</span>}</div>
                <span>{session.kind === 'ANDROID' ? 'PhoneFlow Android' : 'Web session'}{session.ipAddress ? ` · ${session.ipAddress}` : ''}</span>
                <small>Last active {relativeTime(session.lastSeenAt)} · Created {dateTime(session.createdAt)}</small>
              </div>
              {!session.current && !session.revokedAt && <button type="button" className="icon-button danger" disabled={busy} onClick={() => void revokeSession(session)} aria-label={`Sign out ${session.deviceName}`}><Trash2 size={16} /></button>}
            </article>)}
            {sessions.length === 0 && <div className="security-empty">No sessions are recorded yet.</div>}
          </div>
        </section>

        <div className="security-side-stack">
          <section className="card security-panel security-two-factor-panel">
            <div className="security-panel-title"><div><h2>Two-factor authentication</h2><p>Require an authenticator or recovery code after the password.</p></div><LockKeyhole size={21} /></div>

            {!twoFactorStatus?.eligible ? (
              <div className="security-pairing-empty"><LockKeyhole size={28} /><strong>Not required for this role</strong><span>PhoneFlow currently offers 2FA to Owner and Manager accounts.</span></div>
            ) : !twoFactorStatus.configured ? (
              <div className="security-2fa-warning"><AlertTriangle size={17} /><span>Set <code>TWO_FACTOR_ENCRYPTION_KEY</code> on the server before enabling 2FA.</span></div>
            ) : twoFactorStatus.enabled ? (
              <>
                <div className="security-2fa-enabled"><CheckCircle2 size={24} /><div><strong>Authenticator protection is on</strong><span>Enabled {dateTime(twoFactorStatus.enabledAt)} · {twoFactorStatus.recoveryCodesRemaining} recovery codes remaining</span>{twoFactorStatus.lastUsedAt && <small>Last verified {dateTime(twoFactorStatus.lastUsedAt)}</small>}</div></div>
                <label className="security-code-field">Current authenticator or recovery code<input value={twoFactorCode} onChange={(event) => setTwoFactorCode(event.target.value)} autoComplete="one-time-code" placeholder="123456 or PF2F-…" /></label>
                <div className="security-2fa-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => void regenerateRecovery()}><RefreshCcw size={15} /> New recovery codes</button><button type="button" className="danger-button" disabled={busy} onClick={() => void turnOffTwoFactor()}><Trash2 size={15} /> Disable 2FA</button></div>
              </>
            ) : twoFactorSetup ? (
              <div className="security-2fa-setup">
                <p>Add a new time-based account in your authenticator app using this setup key.</p>
                <div className="security-secret"><code>{twoFactorSetup.secret}</code><button type="button" className="icon-button" onClick={() => void copyText('secret', twoFactorSetup.secret)} aria-label="Copy setup key">{copied === 'secret' ? <CheckCircle2 size={15} /> : <Copy size={15} />}</button></div>
                <button type="button" className="secondary-button full-width" onClick={() => void copyText('uri', twoFactorSetup.otpauthUri)}>{copied === 'uri' ? <CheckCircle2 size={15} /> : <Copy size={15} />} {copied === 'uri' ? 'Setup link copied' : 'Copy authenticator setup link'}</button>
                <label className="security-code-field">6-digit code<input value={twoFactorCode} onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" /></label>
                <button type="button" className="primary-button full-width" disabled={busy || twoFactorCode.length !== 6} onClick={() => void enableTwoFactor()}><ShieldCheck size={15} /> Verify and enable 2FA</button>
              </div>
            ) : (
              <div className="security-pairing-empty"><LockKeyhole size={28} /><strong>Protect this account</strong><span>Your password will be followed by a code from an authenticator app.</span><button type="button" className="primary-button" disabled={busy} onClick={() => void startTwoFactorSetup()}><KeyRound size={15} /> Set up 2FA</button></div>
            )}

            {recoveryCodes.length > 0 && <div className="security-recovery-box"><div><strong>Save these recovery codes now</strong><span>Each code works once. They will not be shown again after this page is refreshed.</span></div><div className="security-recovery-grid">{recoveryCodes.map((code) => <code key={code}>{code}</code>)}</div><button type="button" className="secondary-button full-width" onClick={() => void copyText('recovery', recoveryCodes.join('\n'))}>{copied === 'recovery' ? <CheckCircle2 size={15} /> : <Copy size={15} />} {copied === 'recovery' ? 'Copied' : 'Copy all recovery codes'}</button></div>}
          </section>

          <section className="card security-panel security-pairing-panel">
            <div className="security-panel-title"><div><h2>Pair Android</h2><p>Create a code on this trusted session, then enter it on the Android sign-in screen.</p></div><KeyRound size={21} /></div>
            {pairing && !pairingExpired ? (
              <div className="security-pairing-code"><span>One-time code</span><strong>{pairing.code}</strong><small>Expires in {pairingSeconds}s</small><button type="button" className="secondary-button" onClick={() => void copyText('pairing', pairing.code)}>{copied === 'pairing' ? <CheckCircle2 size={15} /> : <Copy size={15} />}{copied === 'pairing' ? 'Copied' : 'Copy code'}</button></div>
            ) : (
              <div className="security-pairing-empty"><Smartphone size={28} /><strong>{pairingExpired ? 'Pairing code expired' : 'No active pairing code'}</strong><span>Codes can be used once and expire quickly.</span></div>
            )}
            <button type="button" className="primary-button full-width" disabled={busy} onClick={() => void generatePairing()}><KeyRound size={16} /> {pairing && !pairingExpired ? 'Generate a new code' : 'Generate pairing code'}</button>
          </section>
        </div>
      </div>

      <section className="card security-panel security-events-panel">
        <div className="security-panel-title"><div><h2>Recent security activity</h2><p>Sign-ins, 2FA, pairing, sign-outs, and session revocations for your account.</p></div></div>
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
