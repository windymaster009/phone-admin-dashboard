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
    })
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
})
