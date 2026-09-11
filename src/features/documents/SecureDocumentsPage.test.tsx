import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SecureDocumentsPage from './SecureDocumentsPage'
import { setStoredSessionUser } from '../../lib/storage'
import { mockOwnerUser } from '../../test/testUtils'

describe('SecureDocumentsPage component', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
    setStoredSessionUser(mockOwnerUser)
  })

  it('renders loading state initially', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))

    render(<SecureDocumentsPage />)

    expect(screen.getByText(/Loading customers/i)).toBeInTheDocument()
  })

  it('renders customer list and document vault when API returns data', async () => {
    const mockCustomers = [
      { _id: 'c-1', name: 'John Doe', phone: '012345678', active: true },
    ]
    const mockStatus = {
      configured: true,
      keyId: 'key-1',
      maximumBytes: 10485760,
      maximumCustomerBytes: 52428800,
      maximumTotalBytes: 524288000,
      maximumCustomerDocuments: 10,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
    }
    const mockSummary = { documentCount: 1, encryptedBytes: 1024, customersWithDocuments: 1 }
    const mockDocuments = [
      {
        _id: 'doc-1',
        category: 'NATIONAL_ID_FRONT',
        relatedType: 'CUSTOMER',
        originalName: 'id_front.jpg',
        mimeType: 'image/jpeg',
        byteSize: 1024,
        note: 'Verified in store',
        createdAt: new Date().toISOString(),
      },
    ]

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/customer-documents/customers/')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ documents: mockDocuments }) } as Response
      }
      if (url.includes('/customer-documents/status')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => mockStatus } as Response
      }
      if (url.includes('/customer-documents/summary')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => mockSummary } as Response
      }
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: mockCustomers }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    render(<SecureDocumentsPage />)

    await waitFor(() => {
      expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0)
      expect(screen.getByText('id_front.jpg')).toBeInTheDocument()
      expect(screen.getAllByText('National ID — front').length).toBeGreaterThan(0)
    })
  })

  it('shows error notice when vault fails to load', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers({ 'X-Request-ID': 'req-vault-err' }),
      json: async () => ({ message: 'Failed to access vault', requestId: 'req-vault-err' }),
    } as Response)

    render(<SecureDocumentsPage />)

    await waitFor(() => {
      expect(screen.getByText(/Failed to access vault/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('shows empty state when selected customer has no documents', async () => {
    const mockCustomers = [
      { _id: 'c-1', name: 'No Docs Customer', phone: '012345678', active: true },
    ]
    const mockStatus = {
      configured: true,
      keyId: 'key-1',
      maximumBytes: 10485760,
      maximumCustomerBytes: 52428800,
      maximumTotalBytes: 524288000,
      maximumCustomerDocuments: 10,
      allowedMimeTypes: ['image/jpeg'],
    }
    const mockSummary = { documentCount: 0, encryptedBytes: 0, customersWithDocuments: 0 }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/customer-documents/customers/')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ documents: [] }) } as Response
      }
      if (url.includes('/customer-documents/status')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => mockStatus } as Response
      }
      if (url.includes('/customer-documents/summary')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => mockSummary } as Response
      }
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: mockCustomers }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    render(<SecureDocumentsPage />)

    await waitFor(() => {
      expect(screen.getByText(/No documents for this customer/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('successfully deletes a secure document, updates list, and displays success toast', async () => {
    const mockCustomers = [
      { _id: 'c-1', name: 'John Doe', phone: '012345678', active: true },
    ]
    const mockStatus = {
      configured: true,
      keyId: 'key-1',
      maximumBytes: 10485760,
      maximumCustomerBytes: 52428800,
      maximumTotalBytes: 524288000,
      maximumCustomerDocuments: 10,
      allowedMimeTypes: ['image/jpeg'],
    }
    const mockSummary = { documentCount: 1, encryptedBytes: 1024, customersWithDocuments: 1 }
    let mockDocuments = [
      {
        _id: 'doc-1',
        category: 'NATIONAL_ID_FRONT' as const,
        relatedType: 'CUSTOMER' as const,
        originalName: 'id_front.jpg',
        mimeType: 'image/jpeg',
        byteSize: 1024,
        note: 'Verified in store',
        createdAt: new Date().toISOString(),
      },
    ]

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/customer-documents/doc-1') && method === 'DELETE') {
        mockDocuments = []
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ success: true }) } as Response
      }
      if (url.includes('/customer-documents/customers/')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ documents: mockDocuments }) } as Response
      }
      if (url.includes('/customer-documents/status')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => mockStatus } as Response
      }
      if (url.includes('/customer-documents/summary')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => mockSummary } as Response
      }
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: mockCustomers }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<SecureDocumentsPage />)

    await waitFor(() => {
      expect(screen.getByText('id_front.jpg')).toBeInTheDocument()
    })

    // Click delete on document
    const deleteButton = screen.getByRole('button', { name: /Delete/i })
    await user.click(deleteButton)

    // Delete dialog opens
    expect(screen.getByText(/Delete this secure document\?/i)).toBeInTheDocument()

    // Confirm deletion
    const confirmButton = screen.getByRole('button', { name: /Delete document/i })
    await user.click(confirmButton)

    // Success toast appears
    await waitFor(() => {
      expect(screen.getByText('Secure document deleted successfully.')).toBeInTheDocument()
    })

    // Document removed from list
    expect(screen.queryByText('id_front.jpg')).not.toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/customer-documents/doc-1'),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('keeps delete dialog open and displays error notification on failed deletion', async () => {
    const mockCustomers = [
      { _id: 'c-1', name: 'John Doe', phone: '012345678', active: true },
    ]
    const mockStatus = {
      configured: true,
      keyId: 'key-1',
      maximumBytes: 10485760,
      maximumCustomerBytes: 52428800,
      maximumTotalBytes: 524288000,
      maximumCustomerDocuments: 10,
      allowedMimeTypes: ['image/jpeg'],
    }
    const mockSummary = { documentCount: 1, encryptedBytes: 1024, customersWithDocuments: 1 }
    const mockDocuments = [
      {
        _id: 'doc-2',
        category: 'NATIONAL_ID_FRONT' as const,
        relatedType: 'CUSTOMER' as const,
        originalName: 'locked_id.jpg',
        mimeType: 'image/jpeg',
        byteSize: 1024,
        note: 'Verified in store',
        createdAt: new Date().toISOString(),
      },
    ]

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/customer-documents/doc-2') && method === 'DELETE') {
        return {
          ok: false,
          status: 400,
          headers: new Headers(),
          json: async () => ({ message: 'Document is under legal compliance hold' }),
        } as Response
      }
      if (url.includes('/customer-documents/customers/')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ documents: mockDocuments }) } as Response
      }
      if (url.includes('/customer-documents/status')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => mockStatus } as Response
      }
      if (url.includes('/customer-documents/summary')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => mockSummary } as Response
      }
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: mockCustomers }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<SecureDocumentsPage />)

    await waitFor(() => {
      expect(screen.getByText('locked_id.jpg')).toBeInTheDocument()
    })

    const deleteButton = screen.getByRole('button', { name: /Delete/i })
    await user.click(deleteButton)

    const confirmButton = screen.getByRole('button', { name: /Delete document/i })
    await user.click(confirmButton)

    // Error is displayed
    await waitFor(() => {
      expect(screen.getAllByText(/Document is under legal compliance hold/i).length).toBeGreaterThan(0)
    })

    // Dialog remains open
    expect(screen.getByText(/Delete this secure document\?/i)).toBeInTheDocument()

    // No success toast is shown
    expect(screen.queryByText('Secure document deleted successfully.')).not.toBeInTheDocument()
  })

  it('does not delete document or show toast when user cancels confirmation', async () => {
    const mockCustomers = [
      { _id: 'c-1', name: 'John Doe', phone: '012345678', active: true },
    ]
    const mockStatus = {
      configured: true,
      keyId: 'key-1',
      maximumBytes: 10485760,
      maximumCustomerBytes: 52428800,
      maximumTotalBytes: 524288000,
      maximumCustomerDocuments: 10,
      allowedMimeTypes: ['image/jpeg'],
    }
    const mockSummary = { documentCount: 1, encryptedBytes: 1024, customersWithDocuments: 1 }
    const mockDocuments = [
      {
        _id: 'doc-3',
        category: 'NATIONAL_ID_FRONT' as const,
        relatedType: 'CUSTOMER' as const,
        originalName: 'passport.jpg',
        mimeType: 'image/jpeg',
        byteSize: 1024,
        createdAt: new Date().toISOString(),
      },
    ]

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/customer-documents/customers/')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ documents: mockDocuments }) } as Response
      }
      if (url.includes('/customer-documents/status')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => mockStatus } as Response
      }
      if (url.includes('/customer-documents/summary')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => mockSummary } as Response
      }
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: mockCustomers }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<SecureDocumentsPage />)

    await waitFor(() => {
      expect(screen.getByText('passport.jpg')).toBeInTheDocument()
    })

    const deleteButton = screen.getByRole('button', { name: /Delete/i })
    await user.click(deleteButton)

    expect(screen.getByText(/Delete this secure document\?/i)).toBeInTheDocument()

    // Click cancel
    const cancelButton = screen.getByRole('button', { name: /Cancel/i })
    await user.click(cancelButton)

    // Dialog closes
    expect(screen.queryByText(/Delete this secure document\?/i)).not.toBeInTheDocument()

    // No DELETE request sent
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: 'DELETE' }),
    )

    // No success toast
    expect(screen.queryByText('Secure document deleted successfully.')).not.toBeInTheDocument()
  })
})
