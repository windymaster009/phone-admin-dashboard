import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, BadgeCheck, Check, Download, FileUp, RefreshCcw, RotateCcw, Trash2, X } from 'lucide-react'
import { ApiError, api, setAuthTransitionInProgress, setToken } from '../../lib/api'

type BackupMetadata = {
  filename: string
  createdAt: string
  completedAt: string
  trigger: 'MANUAL' | 'SCHEDULED'
  purpose?: 'RESTORE_SAFETY' | null
  compressedBytes: number
  documentCount: number
  uploadCount: number
  sha256: string
}

type BackupStatus = {
  enabled: boolean
  running: boolean
  restoring: boolean
  schedule: string
  timezone: string
  retentionCount: number
  count: number
  latest: BackupMetadata | null
  lastError: string | null
  canRun: boolean
}

type DeleteConfirmation =
  | { kind: 'single'; backup: BackupMetadata }
  | { kind: 'bulk'; filenames: string[] }

type RestorePreview = BackupMetadata & {
  token?: string
  collectionCount: number
  uncompressedUploadBytes: number
  database: string | null
}

type RestoreCandidate = {
  source: 'server' | 'upload'
  backup: RestorePreview
}

type RestoreResult = {
  restored: RestorePreview
  safetyBackup: BackupMetadata
  sessionsRevoked: boolean
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

function backupAge(candidateDate: string, latestDate?: string) {
  if (!latestDate) return { tone: 'neutral', label: 'No newer server backup to compare', detail: '' }
  const difference = new Date(candidateDate).getTime() - new Date(latestDate).getTime()
  if (Math.abs(difference) < 60_000) {
    return { tone: 'same', label: 'This is the latest backup', detail: `Matches ${backupTime(latestDate)}` }
  }

  const hours = Math.max(1, Math.round(Math.abs(difference) / (60 * 60 * 1000)))
  const days = Math.floor(hours / 24)
  const distance = days >= 1 ? `${days} ${days === 1 ? 'day' : 'days'}` : `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  return difference < 0
    ? { tone: 'older', label: `${distance} older than the latest`, detail: `Latest is ${backupTime(latestDate)}` }
    : { tone: 'newer', label: `${distance} newer than the latest`, detail: `Latest is ${backupTime(latestDate)}` }
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
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation | null>(null)
  const [restoreCandidate, setRestoreCandidate] = useState<RestoreCandidate | null>(null)
  const [restoreInspectBusy, setRestoreInspectBusy] = useState(false)
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [restoreConfirmation, setRestoreConfirmation] = useState('')
  const [restoreError, setRestoreError] = useState('')
  const [restoreSuccess, setRestoreSuccess] = useState<RestoreResult | null>(null)
  const restoreFileInput = useRef<HTMLInputElement>(null)

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
      if (event.key !== 'Escape') return
      if (deleteConfirmation) {
        if (!bulkDeleteBusy && !deleteBusy) setDeleteConfirmation(null)
        return
      }
      if (restoreCandidate) {
        if (restoreSuccess) return
        if (!restoreBusy) setRestoreCandidate(null)
        return
      }
      setManagerOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [bulkDeleteBusy, deleteBusy, deleteConfirmation, managerOpen, restoreBusy, restoreCandidate, restoreSuccess])

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
    setDeleteConfirmation(null)
    setRestoreCandidate(null)
    setRestoreSuccess(null)
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

  function removeBackup(backup: BackupMetadata) {
    setDeleteConfirmation({ kind: 'single', backup })
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

  function removeSelectedBackups() {
    const filenames = backups
      .filter((backup) => selectedBackups.has(backup.filename))
      .map((backup) => backup.filename)
    if (filenames.length === 0 || bulkDeleteBusy) return
    setDeleteConfirmation({ kind: 'bulk', filenames })
  }

  async function confirmDelete() {
    if (!deleteConfirmation || bulkDeleteBusy || deleteBusy) return
    setError('')

    if (deleteConfirmation.kind === 'single') {
      const { backup } = deleteConfirmation
      setDeleteBusy(backup.filename)
      try {
        await api(`/backups/${encodeURIComponent(backup.filename)}`, { method: 'DELETE' })
        await Promise.all([refreshStatus(), refreshList()])
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Unable to delete backup')
      } finally {
        setDeleteBusy('')
        setDeleteConfirmation(null)
      }
      return
    }

    setBulkDeleteBusy(true)
    try {
      await api('/backups', {
        method: 'DELETE',
        body: JSON.stringify({ filenames: deleteConfirmation.filenames }),
      })
      setSelectedBackups(new Set())
      await Promise.all([refreshStatus(), refreshList()])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete selected backups')
    } finally {
      setBulkDeleteBusy(false)
      setDeleteConfirmation(null)
    }
  }

  function requestServerRestore(backup: BackupMetadata) {
    setRestoreConfirmation('')
    setRestoreError('')
    setRestoreSuccess(null)
    setRestoreCandidate({
      source: 'server',
      backup: { ...backup, collectionCount: 0, uncompressedUploadBytes: 0, database: null },
    })
  }

  async function inspectLocalBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.json.gz')) {
      setError('Choose a PhoneFlow backup ending in .json.gz')
      return
    }

    setRestoreInspectBusy(true)
    setRestoreError('')
    setError('')
    try {
      const result = await api<{ backup: RestorePreview }>('/backups/restore/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/gzip',
          'X-Backup-Filename': file.name.replace(/[^\x20-\x7E]/g, '_'),
        },
        body: file,
      })
      setRestoreConfirmation('')
      setRestoreSuccess(null)
      setRestoreCandidate({ source: 'upload', backup: result.backup })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to inspect the selected backup')
    } finally {
      setRestoreInspectBusy(false)
    }
  }

  async function confirmRestore() {
    if (!restoreCandidate || restoreConfirmation !== 'RESTORE' || restoreBusy) return
    setRestoreBusy(true)
    setRestoreError('')
    setAuthTransitionInProgress(true)
    try {
      const endpoint = restoreCandidate.source === 'upload'
        ? `/backups/restore/upload/${encodeURIComponent(restoreCandidate.backup.token || '')}`
        : `/backups/restore/server/${encodeURIComponent(restoreCandidate.backup.filename)}`
      const result = await api<RestoreResult>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ confirmation: restoreConfirmation }),
      })
      try {
        sessionStorage.setItem('phoneflow_restore_success', JSON.stringify({
          restoredAt: result.restored.createdAt,
          filename: result.restored.filename,
          safetyBackupAt: result.safetyBackup.completedAt,
        }))
      } catch {
        // The in-app completion screen still confirms success when storage is unavailable.
      }
      setRestoreSuccess(result)
      setRestoreBusy(false)
    } catch (reason) {
      setAuthTransitionInProgress(false)
      setRestoreError(reason instanceof Error ? reason.message : 'Unable to restore this backup')
      setRestoreBusy(false)
      if (reason instanceof ApiError && reason.status === 401) setToken(null)
    }
  }

  function continueAfterRestore() {
    setAuthTransitionInProgress(false)
    setToken(null)
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
    if (status.restoring) {
      return { tone: 'running', Icon: RotateCcw, title: 'Restoring shop', detail: 'Replacing database and uploaded images…' }
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
  const confirmationCount = deleteConfirmation?.kind === 'bulk' ? deleteConfirmation.filenames.length : 1
  const confirmationPlural = confirmationCount === 1 ? 'backup' : 'backups'
  const deleteConfirmationBusy = bulkDeleteBusy || Boolean(deleteBusy)
  const restoreAge = restoreCandidate
    ? backupAge(restoreCandidate.backup.createdAt, status?.latest?.createdAt)
    : null

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
              <div className="backup-manager-header-actions">
                <input
                  ref={restoreFileInput}
                  className="backup-restore-file-input"
                  type="file"
                  accept=".json.gz,application/gzip"
                  onChange={inspectLocalBackup}
                  tabIndex={-1}
                />
                <button className="backup-manager-restore-button" onClick={() => restoreFileInput.current?.click()} disabled={restoreInspectBusy || restoreBusy || status?.running || status?.restoring}>
                  {restoreInspectBusy ? <RefreshCcw className="backup-button-spin" size={15} /> : <FileUp size={15} />}
                  {restoreInspectBusy ? 'Checking file…' : 'Restore local file'}
                </button>
                <button className="icon-button" onClick={() => setManagerOpen(false)} aria-label="Close backup manager"><X size={18} /></button>
              </div>
            </header>

            {error && <div className="backup-manager-error"><AlertTriangle size={16} />{error}</div>}

            <div className="backup-manager-summary">
              <div><span>Schedule</span><strong>{status?.enabled ? `${status.schedule} · ${status.timezone}` : 'Disabled'}</strong></div>
              <div><span>Retention</span><strong>{status?.retentionCount || 0} archives</strong></div>
              <div><span>Latest</span><strong>{backupTime(status?.latest?.completedAt)}</strong></div>
              <button className="primary-button" onClick={runNow} disabled={busy || status?.running || status?.restoring}>
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
                      <small>{fileSize(backup.compressedBytes)} · {backup.documentCount} records · {backup.uploadCount} images · {backup.purpose === 'RESTORE_SAFETY' ? 'safety before restore' : backup.trigger.toLowerCase()}</small>
                      <code title={backup.sha256}>{backup.sha256.slice(0, 16)}…</code>
                    </div>
                    {selectedCount === 0 && (
                      <div className="backup-manager-row-actions">
                        <button className="icon-button backup-row-restore-button" onClick={() => requestServerRestore(backup)} disabled={restoreBusy || status?.running || status?.restoring} aria-label={`Restore backup from ${backupTime(backup.completedAt)}`} title={`Restore shop to ${backupTime(backup.completedAt)}`}>
                          <RotateCcw size={16} />
                        </button>
                        <button className="icon-button" onClick={() => downloadBackup(backup)} disabled={downloadBusy === backup.filename} aria-label={`Download backup from ${backupTime(backup.completedAt)}`}>
                          {downloadBusy === backup.filename ? <RefreshCcw className="backup-button-spin" size={16} /> : <Download size={16} />}
                        </button>
                        <button className="icon-button danger-button" onClick={() => removeBackup(backup)} disabled={deleteBusy === backup.filename} aria-label={`Delete backup from ${backupTime(backup.completedAt)}`}>
                          {deleteBusy === backup.filename ? <RefreshCcw className="backup-button-spin" size={16} /> : <Trash2 size={16} />}
                        </button>
                      </div>
                    )}
                  </article>
                )
              })}

              {backups.length === 0 && <div className="backup-manager-empty">No backups exist yet. Run the first backup now.</div>}
            </div>
          </section>
        </div>,
        document.body,
      )}

      {deleteConfirmation && createPortal(
        <div className="backup-delete-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !deleteConfirmationBusy) setDeleteConfirmation(null)
        }}>
          <section
            className="backup-delete-dialog surface-card"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="backup-delete-title"
            aria-describedby="backup-delete-description"
          >
            <div className="backup-delete-dialog-icon"><AlertTriangle size={22} /></div>
            <div className="backup-delete-dialog-copy">
              <span className="eyebrow">Permanent action</span>
              <h3 id="backup-delete-title">Delete {confirmationCount} {confirmationPlural}?</h3>
              <p id="backup-delete-description">
                {deleteConfirmation.kind === 'single'
                  ? `The backup from ${backupTime(deleteConfirmation.backup.completedAt)} will be permanently removed.`
                  : 'The selected backup archives and their metadata will be permanently removed.'}
                {' '}This action cannot be undone.
              </p>
            </div>
            <div className="backup-delete-dialog-actions">
              <button className="ghost-button" onClick={() => setDeleteConfirmation(null)} disabled={deleteConfirmationBusy} autoFocus>Cancel</button>
              <button className="backup-delete-confirm-button" onClick={confirmDelete} disabled={deleteConfirmationBusy}>
                {deleteConfirmationBusy ? <RefreshCcw className="backup-button-spin" size={16} /> : <Trash2 size={16} />}
                {deleteConfirmationBusy ? 'Deleting…' : `Delete ${confirmationPlural}`}
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}

      {restoreSuccess && createPortal(
        <div className="backup-restore-backdrop" role="presentation">
          <section
            className="backup-restore-dialog backup-restore-success-dialog surface-card"
            role="status"
            aria-live="polite"
            aria-labelledby="backup-restore-success-title"
          >
            <div className="backup-restore-success-icon"><BadgeCheck size={30} /></div>
            <span className="eyebrow">Recovery complete</span>
            <h3 id="backup-restore-success-title">Backup restored successfully</h3>
            <p>Shop data and uploaded images were restored to <strong>{backupTime(restoreSuccess.restored.createdAt)}</strong>.</p>
            <div className="backup-restore-success-summary">
              <div><span>Restored archive</span><strong>{restoreSuccess.restored.filename}</strong></div>
              <div><span>Safety backup created</span><strong>{backupTime(restoreSuccess.safetyBackup.completedAt)}</strong></div>
            </div>
            <div className="backup-restore-success-note"><Check size={16} />Restore verified. All previous sessions were safely signed out.</div>
            <button className="primary-button" onClick={continueAfterRestore}>Continue to sign in</button>
          </section>
        </div>,
        document.body,
      )}

      {!restoreSuccess && restoreCandidate && restoreAge && createPortal(
        <div className="backup-restore-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !restoreBusy) setRestoreCandidate(null)
        }}>
          <section
            className="backup-restore-dialog surface-card"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="backup-restore-title"
          >
            <header className="backup-restore-dialog-header">
              <div className="backup-restore-dialog-heading">
                <span className="backup-restore-dialog-icon"><RotateCcw size={20} /></span>
                <div>
                  <span className="eyebrow">Restore preview</span>
                  <h3 id="backup-restore-title">Restore this backup?</h3>
                </div>
              </div>
              <button className="icon-button" onClick={() => setRestoreCandidate(null)} disabled={restoreBusy} aria-label="Close restore confirmation"><X size={18} /></button>
            </header>

            <div className="backup-restore-warning">
              <AlertTriangle size={17} />
              <span><strong>This replaces all current shop data and uploaded images.</strong> PhoneFlow creates a safety backup first, then signs everyone out after the restore.</span>
            </div>

            <div className="backup-restore-preview">
              <div className="backup-restore-preview-file">
                <span>{restoreCandidate.source === 'upload' ? 'Local file' : 'Saved archive'}</span>
                <strong title={restoreCandidate.backup.filename}>{restoreCandidate.backup.filename}</strong>
              </div>
              <div><span>Backup date</span><strong>{backupTime(restoreCandidate.backup.createdAt)}</strong></div>
              <div><span>Contents</span><strong>{restoreCandidate.backup.documentCount} records · {restoreCandidate.backup.uploadCount} images</strong></div>
              <div><span>Archive size</span><strong>{fileSize(restoreCandidate.backup.compressedBytes)}</strong></div>
            </div>

            <div className={`backup-restore-age is-${restoreAge.tone}`}>
              <RotateCcw size={17} />
              <div><strong>{restoreAge.label}</strong>{restoreAge.detail && <small>{restoreAge.detail}</small>}</div>
            </div>

            {restoreError && <div className="backup-restore-error"><AlertTriangle size={16} />{restoreError}</div>}

            <label className="backup-restore-confirmation-field">
              <span>Type <strong>RESTORE</strong> to confirm</span>
              <input
                value={restoreConfirmation}
                onChange={(event) => setRestoreConfirmation(event.target.value.toUpperCase())}
                placeholder="RESTORE"
                disabled={restoreBusy}
                autoComplete="off"
                autoFocus
              />
            </label>

            <div className="backup-restore-dialog-actions">
              <button className="ghost-button" onClick={() => setRestoreCandidate(null)} disabled={restoreBusy}>Cancel</button>
              <button className="backup-restore-confirm-button" onClick={confirmRestore} disabled={restoreConfirmation !== 'RESTORE' || restoreBusy}>
                {restoreBusy ? <RefreshCcw className="backup-button-spin" size={16} /> : <RotateCcw size={16} />}
                {restoreBusy ? 'Creating safety backup and restoring…' : `Restore ${backupTime(restoreCandidate.backup.createdAt)}`}
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  )
}
