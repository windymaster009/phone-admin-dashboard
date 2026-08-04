import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, BadgeCheck, RefreshCcw } from 'lucide-react'
import { api } from './api'

type BackupMetadata = {
  filename: string
  completedAt: string
  compressedBytes: number
  documentCount: number
  uploadCount: number
}

type BackupStatus = {
  enabled: boolean
  running: boolean
  schedule: string
  timezone: string
  retentionCount: number
  count: number
  latest: BackupMetadata | null
  lastError: string | null
  canRun: boolean
}

function backupTime(value?: string) {
  if (!value) return 'No successful backup yet'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export default function BackupStatusBridge() {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const locate = () => setHost(document.querySelector<HTMLElement>('.sidebar-footer .support-card'))
    locate()
    const observer = new MutationObserver(locate)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!host) return
    const originalChildren = Array.from(host.children) as HTMLElement[]
    originalChildren.forEach((child) => { child.hidden = true })
    host.classList.add('backup-status-host')
    return () => {
      originalChildren.forEach((child) => { child.hidden = false })
      host.classList.remove('backup-status-host')
    }
  }, [host])

  useEffect(() => {
    if (!host) return
    let active = true

    const load = async () => {
      try {
        const result = await api<BackupStatus>('/backups/status')
        if (!active) return
        setStatus(result)
        setError('')
      } catch (reason) {
        if (!active) return
        setError(reason instanceof Error ? reason.message : 'Unable to read backup status')
      }
    }

    load()
    const timer = window.setInterval(load, 60_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [host])

  async function runNow() {
    if (!status?.canRun || busy || status.running) return
    setBusy(true)
    setError('')
    setStatus((current) => current ? { ...current, running: true } : current)

    try {
      await api('/backups/run', { method: 'POST' })
      setStatus(await api<BackupStatus>('/backups/status'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Backup failed')
      try {
        setStatus(await api<BackupStatus>('/backups/status'))
      } catch {
        // Keep the original backup error visible.
      }
    } finally {
      setBusy(false)
    }
  }

  const view = useMemo(() => {
    if (error || status?.lastError) {
      return {
        tone: 'error',
        Icon: AlertTriangle,
        title: 'Backup needs attention',
        detail: error || status?.lastError || 'Backup failed',
      }
    }
    if (!status) {
      return { tone: 'loading', Icon: RefreshCcw, title: 'Checking backup', detail: 'Reading server status…' }
    }
    if (!status.enabled) {
      return { tone: 'disabled', Icon: AlertTriangle, title: 'Backup disabled', detail: 'Enable it in the server environment' }
    }
    if (busy || status.running) {
      return { tone: 'running', Icon: RefreshCcw, title: 'Backing up shop', detail: 'Database and images are being saved…' }
    }
    return {
      tone: 'success',
      Icon: BadgeCheck,
      title: 'Daily backup active',
      detail: status.latest ? `Last: ${backupTime(status.latest.completedAt)}` : `Scheduled ${status.schedule}`,
    }
  }, [busy, error, status])

  if (!host) return null
  const Icon = view.Icon

  return createPortal(
    <button
      type="button"
      className={`backup-status-content backup-${view.tone}`}
      onClick={runNow}
      disabled={!status?.canRun || busy || status?.running}
      title={status?.canRun ? 'Run a backup now' : view.detail}
    >
      <span className="backup-status-icon"><Icon size={19} /></span>
      <span className="backup-status-copy">
        <strong>{view.title}</strong>
        <small>{view.detail}</small>
      </span>
    </button>,
    host,
  )
}
