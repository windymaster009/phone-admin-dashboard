import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BackupStatusCard from './BackupStatusCard'

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
