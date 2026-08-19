import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, BadgeCheck, Check, Download, RefreshCcw, Trash2, X } from 'lucide-react'
import { api } from '../../lib/api'

type BackupMetadata = {
  filename: string
  createdAt: string
  completedAt: string
  trigger: 'MANUAL' | 'SCHEDULED'
  compressedBytes: number
  documentCount: number
  uploadCount: number
  sha256: string
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
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function fileSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function BackupStatusBridge() {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [backups, setBackups] = useState<BackupMetadata[]>([])
  const [error, setError] = useState('')
  const [managerOpen, setManagerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [downloadBusy, setDownloadBusy] = useState('')
  const [deleteBusy, setDeleteBusy] = useState('')
  const [selectedBackups, setSelectedBackups] = useState<Set<string>>(() => new Set())
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false)

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

  useEffect(() => {
    if (!managerOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setManagerOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [managerOpen])

  async function refreshStatus() {
    const result = await api<BackupStatus>('/backups/status')
    setStatus(result)
    setError('')
    return result
  }

  async function refreshList() {
    const result = await api<{ backups: BackupMetadata[] }>('/backups')
    setBackups(result.backups)
    const availableFilenames = new Set(result.backups.map((backup) => backup.filename))
    setSelectedBackups((current) => new Set([...current].filter((filename) => availableFilenames.has(filename))))
  }

  async function openManager() {
    if (!status?.canRun) return
    setManagerOpen(true)
    setSelectedBackups(new Set())
    setError('')
    try {
      await Promise.all([refreshStatus(), refreshList()])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load backups')
    }
  }

  async function runNow() {
    if (!status?.canRun || busy || status.running) return
    setBusy(true)
    setError('')
    setStatus((current) => current ? { ...current, running: true } : current)

    try {
      await api('/backups/run', { method: 'POST' })
      await Promise.all([refreshStatus(), refreshList()])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Backup failed')
      try {
        await refreshStatus()
      } catch {
        // Keep the original backup error visible.
      }
    } finally {
      setBusy(false)
    }
  }

  async function downloadBackup(backup: BackupMetadata) {
    setDownloadBusy(backup.filename)
    setError('')
    try {
      const response = await fetch(`/api/backups/${encodeURIComponent(backup.filename)}/download`, {
        credentials: 'include',
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { message?: string }
        throw new Error(payload.message || `Download failed (${response.status})`)
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = backup.filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to download backup')
    } finally {
      setDownloadBusy('')
    }
  }

  async function removeBackup(backup: BackupMetadata) {
    if (!window.confirm(`Delete ${backup.filename}? This cannot be undone.`)) return
    setDeleteBusy(backup.filename)
    setError('')
    try {
      await api(`/backups/${encodeURIComponent(backup.filename)}`, { method: 'DELETE' })
      await Promise.all([refreshStatus(), refreshList()])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete backup')
    } finally {
      setDeleteBusy('')
    }
  }

  function toggleBackupSelection(filename: string) {
    if (bulkDeleteBusy) return
    setSelectedBackups((current) => {
      const next = new Set(current)
      if (next.has(filename)) next.delete(filename)
      else next.add(filename)
      return next
    })
  }

  function toggleSelectAll() {
    if (bulkDeleteBusy) return
    setSelectedBackups((current) => (
      current.size === backups.length
        ? new Set()
        : new Set(backups.map((backup) => backup.filename))
    ))
  }

  async function removeSelectedBackups() {
    const filenames = backups
      .filter((backup) => selectedBackups.has(backup.filename))
      .map((backup) => backup.filename)
    if (filenames.length === 0 || bulkDeleteBusy) return

    const label = filenames.length === 1 ? 'backup' : 'backups'
    if (!window.confirm(`Delete ${filenames.length} selected ${label}? This cannot be undone.`)) return

    setBulkDeleteBusy(true)
    setError('')
    try {
      await api('/backups', {
        method: 'DELETE',
        body: JSON.stringify({ filenames }),
      })
      setSelectedBackups(new Set())
      await Promise.all([refreshStatus(), refreshList()])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete selected backups')
    } finally {
      setBulkDeleteBusy(false)
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
      return { tone: 'disabled', Icon: AlertTriangle, title: 'Daily backup disabled', detail: 'Manual backup is still available' }
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
  const selectedCount = selectedBackups.size
  const allBackupsSelected = backups.length > 0 && selectedCount === backups.length

  return (
    <>
      {createPortal(
        <button
          type="button"
          className={`backup-status-content backup-${view.tone}`}
          onClick={openManager}
          disabled={!status?.canRun}
          title={status?.canRun ? 'Open backup manager' : view.detail}
        >
          <span className="backup-status-icon"><Icon size={19} /></span>
          <span className="backup-status-copy">
            <strong>{view.title}</strong>
            <small>{view.detail}</small>
          </span>
        </button>,
        host,
      )}

      {managerOpen && createPortal(
        <div className="backup-manager-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setManagerOpen(false)
        }}>
          <section className="backup-manager surface-card" role="dialog" aria-modal="true" aria-labelledby="backup-manager-title">
            <header className="backup-manager-header">
              <div>
                <span className="eyebrow">Data protection</span>
                <h2 id="backup-manager-title">Backup manager</h2>
                <p>MongoDB collections and uploaded inventory images are saved together.</p>
              </div>
              <button className="icon-button" onClick={() => setManagerOpen(false)} aria-label="Close backup manager"><X size={18} /></button>
            </header>

            {error && <div className="backup-manager-error"><AlertTriangle size={16} />{error}</div>}

            <div className="backup-manager-summary">
              <div><span>Schedule</span><strong>{status?.enabled ? `${status.schedule} · ${status.timezone}` : 'Disabled'}</strong></div>
              <div><span>Retention</span><strong>{status?.retentionCount || 0} archives</strong></div>
              <div><span>Latest</span><strong>{backupTime(status?.latest?.completedAt)}</strong></div>
              <button className="primary-button" onClick={runNow} disabled={busy || status?.running}>
                <RefreshCcw size={16} className={busy || status?.running ? 'backup-button-spin' : ''} />
                {busy || status?.running ? 'Backing up…' : 'Back up now'}
              </button>
            </div>

            <div className="backup-manager-warning">
              Keep downloaded copies on another device or cloud drive. Backups on the same server do not protect against total disk loss.
            </div>

            <div className="backup-manager-list">
              <div className="backup-manager-list-heading">
                <div><span className="eyebrow">Archives</span><h3>Available backups</h3></div>
                <div className="backup-manager-list-actions">
                  {selectedCount > 0 && <span className="backup-manager-selection-count">{selectedCount} selected</span>}
                  {backups.length > 0 && (
                    <button className="ghost-button" onClick={toggleSelectAll} disabled={bulkDeleteBusy}>
                      {allBackupsSelected ? 'Clear selection' : 'Select all'}
                    </button>
                  )}
                  {selectedCount > 0 && (
                    <button className="backup-manager-delete-selected" onClick={removeSelectedBackups} disabled={bulkDeleteBusy}>
                      {bulkDeleteBusy ? <RefreshCcw className="backup-button-spin" size={15} /> : <Trash2 size={15} />}
                      {bulkDeleteBusy ? 'Deleting…' : 'Delete selected'}
                    </button>
                  )}
                  <button className="ghost-button" onClick={() => Promise.all([refreshStatus(), refreshList()]).catch((reason: Error) => setError(reason.message))} disabled={bulkDeleteBusy}><RefreshCcw size={15} />Refresh</button>
                </div>
              </div>

              {backups.map((backup) => {
                const selected = selectedBackups.has(backup.filename)
                return (
                  <article className={`backup-manager-row${selected ? ' is-selected' : ''}`} key={backup.filename}>
                    <button
                      type="button"
                      className="backup-manager-row-select"
                      onClick={() => toggleBackupSelection(backup.filename)}
                      disabled={bulkDeleteBusy}
                      aria-pressed={selected}
                      aria-label={`${selected ? 'Deselect' : 'Select'} backup from ${backupTime(backup.completedAt)}`}
                      title={`${selected ? 'Deselect' : 'Select'} this backup`}
                    >
                      {selected ? <Check size={19} strokeWidth={3} /> : <BadgeCheck size={18} />}
                    </button>
                    <div className="backup-manager-row-copy">
                      <strong>{backupTime(backup.completedAt)}</strong>
                      <small>{fileSize(backup.compressedBytes)} · {backup.documentCount} records · {backup.uploadCount} images · {backup.trigger.toLowerCase()}</small>
                      <code title={backup.sha256}>{backup.sha256.slice(0, 16)}…</code>
                    </div>
                    <div className="backup-manager-row-actions">
                      <button className="icon-button" onClick={() => downloadBackup(backup)} disabled={bulkDeleteBusy || downloadBusy === backup.filename} aria-label={`Download backup from ${backupTime(backup.completedAt)}`}>
                        {downloadBusy === backup.filename ? <RefreshCcw className="backup-button-spin" size={16} /> : <Download size={16} />}
                      </button>
                      <button className="icon-button danger-button" onClick={() => removeBackup(backup)} disabled={bulkDeleteBusy || deleteBusy === backup.filename} aria-label={`Delete backup from ${backupTime(backup.completedAt)}`}>
                        {deleteBusy === backup.filename ? <RefreshCcw className="backup-button-spin" size={16} /> : <Trash2 size={16} />}
                      </button>
                    </div>
                  </article>
                )
              })}

              {backups.length === 0 && <div className="backup-manager-empty">No backups exist yet. Run the first backup now.</div>}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  )
}
