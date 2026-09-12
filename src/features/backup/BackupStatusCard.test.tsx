import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BackupStatusCard from './BackupStatusCard'
import * as apiModule from '../../lib/api'

const mockStatus = {
  enabled: true,
  running: false,
  restoring: false,
  schedule: '0 2 * * *',
  timezone: 'Asia/Phnom_Penh',
  retentionCount: 14,
  count: 2,
  latest: {
    filename: 'backup-2026-09-10.json.gz',
    createdAt: '2026-09-10T02:00:00.000Z',
    completedAt: '2026-09-10T02:02:00.000Z',
    trigger: 'SCHEDULED' as const,
    purpose: null,
    compressedBytes: 1048576,
    documentCount: 50,
    uploadCount: 10,
    sha256: 'abc123sha',
  },
  lastError: null,
  canRun: true,
}

const mockBackups = [
  {
    filename: 'backup-2026-09-10.json.gz',
    createdAt: '2026-09-10T02:00:00.000Z',
    completedAt: '2026-09-10T02:02:00.000Z',
    trigger: 'SCHEDULED' as const,
    purpose: null,
    compressedBytes: 1048576,
    documentCount: 50,
    uploadCount: 10,
    sha256: 'abc123sha',
  },
  {
    filename: 'backup-2026-09-09.json.gz',
    createdAt: '2026-09-09T02:00:00.000Z',
    completedAt: '2026-09-09T02:02:00.000Z',
    trigger: 'MANUAL' as const,
    purpose: null,
    compressedBytes: 1048576,
    documentCount: 48,
    uploadCount: 8,
    sha256: 'def456sha',
  },
]

describe('BackupStatusCard delete flows', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('deletes a single backup, displays success toast, and refreshes list', async () => {
    let backupList = [...mockBackups]
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/api/backups/status')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => mockStatus,
        } as Response
      }

      if (url.includes('/api/backups/backup-2026-09-10.json.gz') && method === 'DELETE') {
        backupList = backupList.filter((b) => b.filename !== 'backup-2026-09-10.json.gz')
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ success: true }),
        } as Response
      }

      if (url.includes('/api/backups') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ backups: backupList }),
        } as Response
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({}),
      } as Response
    })

    const user = userEvent.setup()
    render(<BackupStatusCard />)

    // Open backup manager dialog
    const manageButton = await screen.findByTitle('Open backup manager')
    await user.click(manageButton)

    // Wait for manager dialog
    await screen.findByRole('dialog', { name: /Backup manager/i })

    // Find delete button for the first backup
    const deleteButtons = screen.getAllByRole('button', { name: /Delete backup from/i })
    await user.click(deleteButtons[0])

    // Alert dialog opens
    const alertDialog = screen.getByRole('alertdialog')
    expect(alertDialog).toBeInTheDocument()
    expect(alertDialog).toHaveTextContent(/Delete 1 backup\?/i)

    // Confirm deletion
    const confirmButton = screen.getByRole('button', { name: /Delete backup$/i })
    await user.click(confirmButton)

    // Success toast appears
    await waitFor(() => {
      expect(screen.getByText('Backup deleted successfully.')).toBeInTheDocument()
    })

    // Confirmation dialog is closed
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    // API DELETE was called
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/backups/backup-2026-09-10.json.gz'),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('deletes multiple backups in bulk, displays count in success toast, and refreshes list', async () => {
    let backupList = [...mockBackups]
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/api/backups/status')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => mockStatus,
        } as Response
      }

      if (url.includes('/api/backups') && method === 'DELETE') {
        backupList = []
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ success: true, count: 2 }),
        } as Response
      }

      if (url.includes('/api/backups') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ backups: backupList }),
        } as Response
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({}),
      } as Response
    })

    const user = userEvent.setup()
    render(<BackupStatusCard />)

    // Open backup manager dialog
    const manageButton = await screen.findByTitle('Open backup manager')
    await user.click(manageButton)

    await screen.findByRole('dialog', { name: /Backup manager/i })

    // Select all backups
    const selectAllButton = screen.getByRole('button', { name: 'Select all' })
    await user.click(selectAllButton)

    // Click "Delete selected"
    const deleteSelectedButton = screen.getByRole('button', { name: 'Delete selected' })
    await user.click(deleteSelectedButton)

    // Alert dialog opens
    const alertDialog = screen.getByRole('alertdialog')
    expect(alertDialog).toHaveTextContent(/Delete 2 backups\?/i)

    // Confirm bulk deletion
    const confirmButton = screen.getByRole('button', { name: 'Delete backups' })
    await user.click(confirmButton)

    // Success toast appears with count
    await waitFor(() => {
      expect(screen.getByText('2 backups deleted successfully.')).toBeInTheDocument()
    })

    // Confirmation dialog is closed
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    // API DELETE was called with body
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/backups'),
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ filenames: ['backup-2026-09-10.json.gz', 'backup-2026-09-09.json.gz'] }),
      }),
    )
  })

  it('keeps confirmation dialog open and displays error when deletion fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/api/backups/status')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => mockStatus,
        } as Response
      }

      if (url.includes('/api/backups/backup-2026-09-10.json.gz') && method === 'DELETE') {
        return {
          ok: false,
          status: 400,
          headers: new Headers(),
          json: async () => ({ message: 'Cannot delete backup while database is locked' }),
        } as Response
      }

      if (url.includes('/api/backups') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ backups: mockBackups }),
        } as Response
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({}),
      } as Response
    })

    const user = userEvent.setup()
    render(<BackupStatusCard />)

    const manageButton = await screen.findByTitle('Open backup manager')
    await user.click(manageButton)

    await screen.findByRole('dialog', { name: /Backup manager/i })

    const deleteButtons = screen.getAllByRole('button', { name: /Delete backup from/i })
    await user.click(deleteButtons[0])

    const confirmButton = screen.getByRole('button', { name: /Delete backup$/i })
    await user.click(confirmButton)

    // Error is displayed
    await waitFor(() => {
      expect(screen.getAllByText(/Cannot delete backup while database is locked/i).length).toBeGreaterThan(0)
    })

    // Alert dialog remains open
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    // No success toast is shown
    expect(screen.queryByText('Backup deleted successfully.')).not.toBeInTheDocument()
  })

  it('does not send delete request or show toast when user cancels confirmation', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/backups/status')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => mockStatus,
        } as Response
      }

      if (url.includes('/api/backups')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ backups: mockBackups }),
        } as Response
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({}),
      } as Response
    })

    const user = userEvent.setup()
    render(<BackupStatusCard />)

    const manageButton = await screen.findByTitle('Open backup manager')
    await user.click(manageButton)

    await screen.findByRole('dialog', { name: /Backup manager/i })

    const deleteButtons = screen.getAllByRole('button', { name: /Delete backup from/i })
    await user.click(deleteButtons[0])

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    // Click cancel
    const cancelButton = screen.getByRole('button', { name: /Cancel/i })
    await user.click(cancelButton)

    // Alert dialog is closed
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    // No DELETE request was made
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: 'DELETE' }),
    )

    // No toast shown
    expect(screen.queryByText('Backup deleted successfully.')).not.toBeInTheDocument()
  })
})

describe('BackupStatusCard creation, download, permission, and restore flows', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    sessionStorage.clear()
    localStorage.clear()
  })

  it('disables manager trigger button when user cannot run backups (canRun: false)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/backups/status')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ ...mockStatus, canRun: false }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    render(<BackupStatusCard />)

    const manageButton = await screen.findByRole('button', { name: /Daily backup active/i })
    expect(manageButton).toBeDisabled()
  })

  it('renders empty state when no backups exist yet', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/backups/status')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ ...mockStatus, count: 0, latest: null }),
        } as Response
      }
      if (url.includes('/api/backups')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ backups: [] }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<BackupStatusCard />)

    const manageButton = await screen.findByTitle('Open backup manager')
    await user.click(manageButton)

    await screen.findByRole('dialog', { name: /Backup manager/i })
    expect(screen.getByText(/No backups exist yet\. Run the first backup now\./i)).toBeInTheDocument()
  })

  it('triggers backup creation and prevents duplicate in-flight triggers', async () => {
    let postCallCount = 0
    let resolveBackup: () => void
    const backupPendingPromise = new Promise<void>((resolve) => {
      resolveBackup = resolve
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/api/backups/status')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => mockStatus,
        } as Response
      }
      if (url.includes('/api/backups/run') && method === 'POST') {
        postCallCount++
        await backupPendingPromise
        if (postCallCount === 1) return new Response(JSON.stringify({ message: 'Backup rejected' }), { status: 409 })
        return {
          ok: true,
          status: 201,
          headers: new Headers(),
          json: async () => ({ backup: mockStatus.latest }),
        } as Response
      }
      if (url.includes('/api/backups') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ backups: mockBackups }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<BackupStatusCard />)

    const manageButton = await screen.findByTitle('Open backup manager')
    await user.click(manageButton)

    await screen.findByRole('dialog', { name: /Backup manager/i })
    const runButton = screen.getByRole('button', { name: /Back up now/i })

    act(() => {
      runButton.click()
      runButton.click()
    })

    // Button transitions to "Backing up…" and is disabled
    expect(screen.getByRole('button', { name: /Backing up…/i })).toBeDisabled()

    // Second click while in flight is ignored
    await user.click(runButton)
    expect(postCallCount).toBe(1)

    // Resolve in-flight request
    resolveBackup!()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Back up now/i })).not.toBeDisabled()
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Backup rejected')
    await user.click(runButton)
    await waitFor(() => expect(postCallCount).toBe(2))
    await waitFor(() => expect(runButton).not.toBeDisabled())
  })

  it('displays error notice with role=alert when backup creation fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/api/backups/status')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => mockStatus,
        } as Response
      }
      if (url.includes('/api/backups/run') && method === 'POST') {
        return {
          ok: false,
          status: 409,
          headers: new Headers(),
          json: async () => ({ message: 'A backup is already running' }),
        } as Response
      }
      if (url.includes('/api/backups') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ backups: mockBackups }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<BackupStatusCard />)

    const manageButton = await screen.findByTitle('Open backup manager')
    await user.click(manageButton)

    await screen.findByRole('dialog', { name: /Backup manager/i })
    const runButton = screen.getByRole('button', { name: /Back up now/i })
    await user.click(runButton)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/A backup is already running/i)
  })

  it('handles archive download and revokes temporary object URL', async () => {
    let downloadCalls = 0
    const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/temp-backup-url')
    const revokeObjectURLMock = vi.fn()
    window.URL.createObjectURL = createObjectURLMock
    window.URL.revokeObjectURL = revokeObjectURLMock

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/backups/status')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => mockStatus,
        } as Response
      }
      if (url.includes('/api/backups/backup-2026-09-10.json.gz/download')) {
        downloadCalls++
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/gzip' }),
          blob: async () => new Blob(['mock-backup-bytes'], { type: 'application/gzip' }),
        } as unknown as Response
      }
      if (url.includes('/api/backups')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ backups: mockBackups }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<BackupStatusCard />)

    const manageButton = await screen.findByTitle('Open backup manager')
    await user.click(manageButton)

    await screen.findByRole('dialog', { name: /Backup manager/i })
    const downloadButtons = screen.getAllByRole('button', { name: /Download backup from/i })

    act(() => {
      downloadButtons[0].click()
      downloadButtons[0].click()
    })
    expect(downloadCalls).toBe(1)

    await waitFor(() => {
      expect(createObjectURLMock).toHaveBeenCalled()
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:http://localhost/temp-backup-url')
    })
    await user.click(downloadButtons[0])
    expect(downloadCalls).toBe(2)
  })

  it('displays error alert when archive download fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/backups/status')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => mockStatus,
        } as Response
      }
      if (url.includes('/download')) {
        return {
          ok: false,
          status: 404,
          headers: new Headers(),
          json: async () => ({ message: 'Backup file missing on disk' }),
        } as Response
      }
      if (url.includes('/api/backups')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ backups: mockBackups }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<BackupStatusCard />)

    const manageButton = await screen.findByTitle('Open backup manager')
    await user.click(manageButton)

    await screen.findByRole('dialog', { name: /Backup manager/i })
    const downloadButtons = screen.getAllByRole('button', { name: /Download backup from/i })
    await user.click(downloadButtons[0])

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/Backup file missing on disk/i)
  })

  it('rejects local file selection if not ending in .json.gz', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/backups/status')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => mockStatus } as Response
      }
      if (url.includes('/api/backups')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ backups: mockBackups }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<BackupStatusCard />)

    const manageButton = await screen.findByTitle('Open backup manager')
    await user.click(manageButton)

    await screen.findByRole('dialog', { name: /Backup manager/i })

    const fileInput = document.querySelector('input.backup-restore-file-input') as HTMLInputElement
    const badFile = new File(['corrupt data'], 'backup.tar', { type: 'application/x-tar' })

    fireEvent.change(fileInput, { target: { files: [badFile] } })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/Choose a PhoneFlow backup ending in \.json\.gz/i)
  })

  it('executes server restore flow with RESTORE confirmation and signs out upon continuation', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/api/backups/status')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => mockStatus } as Response
      }
      if (url.includes('/api/backups') && method === 'GET') {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ backups: mockBackups }) } as Response
      }
      if (url.includes('/api/backups/restore/server/backup-2026-09-10.json.gz') && method === 'POST') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            restored: {
              ...mockStatus.latest,
              collectionCount: 5,
              uncompressedUploadBytes: 2048,
              database: 'phone_shop',
            },
            safetyBackup: {
              ...mockStatus.latest,
              filename: 'safety-backup.json.gz',
              completedAt: '2026-09-13T01:00:00.000Z',
            },
            sessionsRevoked: true,
          }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<BackupStatusCard />)

    const manageButton = await screen.findByTitle('Open backup manager')
    await user.click(manageButton)

    await screen.findByRole('dialog', { name: /Backup manager/i })
    const restoreButtons = screen.getAllByRole('button', { name: /Restore backup from/i })
    await user.click(restoreButtons[0])

    // Alertdialog for restore preview opens
    const restoreDialog = await screen.findByRole('alertdialog', { name: /Restore this backup\?/i })
    expect(restoreDialog).toBeInTheDocument()

    // Confirm button is disabled until RESTORE is typed
    const confirmButton = within(restoreDialog).getByRole('button', { name: /^Restore \d/i })
    expect(confirmButton).toBeDisabled()

    // Type partial string
    const input = within(restoreDialog).getByPlaceholderText('RESTORE')
    await user.type(input, 'REST')
    expect(confirmButton).toBeDisabled()

    // Type full confirmation
    await user.type(input, 'ORE')
    expect(confirmButton).not.toBeDisabled()

    // Click confirm restore
    await user.click(confirmButton)

    // Restore request was sent with confirmation body
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/backups/restore/server/backup-2026-09-10.json.gz'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ confirmation: 'RESTORE' }),
      }),
    )

    // Success dialog appears
    const successDialog = await screen.findByRole('status')
    expect(successDialog).toHaveTextContent(/Backup restored successfully/i)

    // Continue button clears token and finishes
    const tokenSpy = vi.spyOn(apiModule, 'setToken')
    const continueButton = screen.getByRole('button', { name: /Continue to sign in/i })
    await user.click(continueButton)
    expect(tokenSpy).toHaveBeenCalledWith(null)
  })

  it('displays restore error when restore API call fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/api/backups/status')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => mockStatus } as Response
      }
      if (url.includes('/api/backups') && method === 'GET') {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ backups: mockBackups }) } as Response
      }
      if (url.includes('/api/backups/restore/server/') && method === 'POST') {
        return {
          ok: false,
          status: 400,
          headers: new Headers(),
          json: async () => ({ message: 'Corrupt archive: checksum validation failed' }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<BackupStatusCard />)

    const manageButton = await screen.findByTitle('Open backup manager')
    await user.click(manageButton)

    await screen.findByRole('dialog', { name: /Backup manager/i })
    const restoreButtons = screen.getAllByRole('button', { name: /Restore backup from/i })
    await user.click(restoreButtons[0])

    const restoreDialog = await screen.findByRole('alertdialog', { name: /Restore this backup\?/i })
    const input = within(restoreDialog).getByPlaceholderText('RESTORE')
    await user.type(input, 'RESTORE')

    const confirmButton = within(restoreDialog).getByRole('button', { name: /^Restore \d/i })
    await user.click(confirmButton)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/Corrupt archive: checksum validation failed/i)
  })
})
