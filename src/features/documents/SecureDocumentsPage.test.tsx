import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SecureDocumentsPage from './SecureDocumentsPage'
import { setStoredSessionUser } from '../../lib/storage'
import { mockOwnerUser, mockCashierUser } from '../../test/testUtils'

describe('SecureDocumentsPage component', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
    setStoredSessionUser(mockOwnerUser)
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
      this.onload?.({ target: { result: 'data:image/jpeg;base64,dGVzdA==' } } as ProgressEvent<FileReader>)
    })
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

  it('rejects upload when file exceeds maximumBytes limit without making network call', async () => {
    const mockCustomers = [
      { _id: 'c-1', name: 'John Doe', phone: '012345678', active: true },
    ]
    const mockStatus = {
      configured: true,
      keyId: 'key-1',
      maximumBytes: 1024,
      maximumCustomerBytes: 52428800,
      maximumTotalBytes: 524288000,
      maximumCustomerDocuments: 10,
      allowedMimeTypes: ['image/jpeg'],
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/customer-documents/customers/')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ documents: [] }) } as Response
      }
      if (url.includes('/customer-documents/status')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => mockStatus } as Response
      }
      if (url.includes('/customer-documents/summary')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ documentCount: 0, encryptedBytes: 0, customersWithDocuments: 0 }) } as Response
      }
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: mockCustomers }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<SecureDocumentsPage />)

    await waitFor(() => {
      expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0)
    })

    const fileInput = document.querySelector('input.secure-file-input') as HTMLInputElement
    const oversizedFile = new File(['a'.repeat(2048)], 'huge.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput, { target: { files: [oversizedFile] } })

    const uploadButton = screen.getByRole('button', { name: /Encrypt & upload/i })
    fireEvent.submit(uploadButton.closest('form')!)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/exceeds the 1.0 KB limit/i)

    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('/customer-documents/customers/c-1'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('displays configuration warning and disables upload when encryption key is unconfigured', async () => {
    const mockCustomers = [
      { _id: 'c-1', name: 'John Doe', phone: '012345678', active: true },
    ]
    const mockStatus = {
      configured: false,
      keyId: null,
      maximumBytes: 10485760,
      maximumCustomerBytes: 52428800,
      maximumTotalBytes: 524288000,
      maximumCustomerDocuments: 10,
      allowedMimeTypes: ['image/jpeg'],
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/customer-documents/customers/')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ documents: [] }) } as Response
      }
      if (url.includes('/customer-documents/status')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => mockStatus } as Response
      }
      if (url.includes('/customer-documents/summary')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ documentCount: 0, encryptedBytes: 0, customersWithDocuments: 0 }) } as Response
      }
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: mockCustomers }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    render(<SecureDocumentsPage />)

    await waitFor(() => {
      expect(screen.getByText('Encryption setup required')).toBeInTheDocument()
      expect(screen.getByText(/Add DOCUMENT_ENCRYPTION_KEY to the server/i)).toBeInTheDocument()
    })

    const uploadButton = screen.getByRole('button', { name: /Encrypt & upload/i })
    expect(uploadButton).toBeDisabled()
  })

  it('uploads a document with category, reference, and note, then refreshes list and summary', async () => {
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

    let uploaded = false
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/customer-documents/customers/c-1') && method === 'POST') {
        uploaded = true
        return {
          ok: true,
          status: 201,
          headers: new Headers(),
          json: async () => ({
            document: {
              _id: 'doc-new',
              category: 'CUSTOMER_PHOTO',
              originalName: 'customer_photo.jpg',
              mimeType: 'image/jpeg',
              byteSize: 500,
              note: 'Verified in person',
              relatedReference: 'PW-1001',
              createdAt: new Date().toISOString(),
            },
          }),
        } as Response
      }

      if (url.includes('/customer-documents/customers/')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            documents: uploaded
              ? [{
                _id: 'doc-new',
                category: 'CUSTOMER_PHOTO',
                originalName: 'customer_photo.jpg',
                mimeType: 'image/jpeg',
                byteSize: 500,
                note: 'Verified in person',
                relatedReference: 'PW-1001',
                createdAt: new Date().toISOString(),
              }]
              : [],
          }),
        } as Response
      }

      if (url.includes('/customer-documents/status')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => mockStatus } as Response
      }
      if (url.includes('/customer-documents/summary')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            documentCount: uploaded ? 1 : 0,
            encryptedBytes: uploaded ? 500 : 0,
            customersWithDocuments: uploaded ? 1 : 0,
          }),
        } as Response
      }
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: mockCustomers }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<SecureDocumentsPage />)

    await waitFor(() => {
      expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0)
    })

    // Select category
    const categorySelect = screen.getByRole('combobox')
    await user.selectOptions(categorySelect, 'CUSTOMER_PHOTO')

    // Attach file
    const fileInput = document.querySelector('input.secure-file-input') as HTMLInputElement
    const validFile = new File(['valid-image-bytes'], 'customer_photo.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput, { target: { files: [validFile] } })

    // Fill reference & note
    const referenceInput = screen.getByPlaceholderText('PW-… or BY-/SL-…')
    await user.type(referenceInput, 'PW-1001')

    const noteInput = screen.getByPlaceholderText('Short context for authorized staff')
    await user.type(noteInput, 'Verified in person')

    // Submit upload
    const uploadButton = screen.getByRole('button', { name: /Encrypt & upload/i })
    fireEvent.submit(uploadButton.closest('form')!)

    await waitFor(() => {
      expect(screen.getByText('customer_photo.jpg')).toBeInTheDocument()
      expect(screen.getByText(/Linked to PW-1001/i)).toBeInTheDocument()
      expect(screen.getByText('Verified in person')).toBeInTheDocument()
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/customer-documents/customers/c-1'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('displays error alert when upload request fails', async () => {
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

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/customer-documents/customers/c-1') && method === 'POST') {
        return {
          ok: false,
          status: 409,
          headers: new Headers(),
          json: async () => ({ message: 'This exact document is already stored for the customer' }),
        } as Response
      }
      if (url.includes('/customer-documents/customers/')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ documents: [] }) } as Response
      }
      if (url.includes('/customer-documents/status')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => mockStatus } as Response
      }
      if (url.includes('/customer-documents/summary')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ documentCount: 0, encryptedBytes: 0, customersWithDocuments: 0 }) } as Response
      }
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: mockCustomers }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<SecureDocumentsPage />)

    await waitFor(() => {
      expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0)
    })

    const fileInput = document.querySelector('input.secure-file-input') as HTMLInputElement
    const validFile = new File(['dup-bytes'], 'duplicate.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput, { target: { files: [validFile] } })

    const uploadButton = screen.getByRole('button', { name: /Encrypt & upload/i })
    fireEvent.submit(uploadButton.closest('form')!)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/This exact document is already stored for the customer/i)
  })

  it('prevents duplicate in-flight document upload submissions', async () => {
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

    let postCount = 0
    let resolvePost: () => void
    const pendingPostPromise = new Promise<void>((resolve) => {
      resolvePost = resolve
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/customer-documents/customers/c-1') && method === 'POST') {
        postCount++
        await pendingPostPromise
        if (postCount === 1) return new Response(JSON.stringify({ message: 'Upload rejected' }), { status: 400 })
        return {
          ok: true,
          status: 201,
          headers: new Headers(),
          json: async () => ({
            document: {
              _id: 'doc-new',
              category: 'NATIONAL_ID_FRONT',
              originalName: 'test.jpg',
              mimeType: 'image/jpeg',
              byteSize: 100,
              createdAt: new Date().toISOString(),
            },
          }),
        } as Response
      }
      if (url.includes('/customer-documents/customers/')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ documents: [] }) } as Response
      }
      if (url.includes('/customer-documents/status')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => mockStatus } as Response
      }
      if (url.includes('/customer-documents/summary')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ documentCount: 0, encryptedBytes: 0, customersWithDocuments: 0 }) } as Response
      }
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: mockCustomers }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    render(<SecureDocumentsPage />)

    await waitFor(() => {
      expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0)
    })

    const fileInput = document.querySelector('input.secure-file-input') as HTMLInputElement
    const validFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput, { target: { files: [validFile] } })

    const uploadButton = screen.getByRole('button', { name: /Encrypt & upload/i })

    // Both submissions arrive before React commits the disabled state.
    act(() => {
      const form = uploadButton.closest('form')!
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    // Button shows "Encrypting…" and is disabled
    expect(screen.getByRole('button', { name: /Encrypting…/i })).toBeDisabled()

    // Wait for in-flight network request
    await waitFor(() => {
      expect(postCount).toBe(1)
    })

    // Second submit while in-flight is ignored
    fireEvent.submit(uploadButton.closest('form')!)
    expect(postCount).toBe(1)

    // Resolve in-flight upload
    resolvePost!()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Encrypt & upload/i })).toBeInTheDocument()
    })
    await screen.findByText('Upload rejected')
    fireEvent.submit(uploadButton.closest('form')!)
    await waitFor(() => expect(postCount).toBe(2))
    await waitFor(() => expect(screen.queryByText('Upload rejected')).not.toBeInTheDocument())
  })

  it('handles document view/open flow and creates object URL', async () => {
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
    const mockDocuments = [
      {
        _id: 'doc-view-1',
        category: 'CUSTOMER_PHOTO' as const,
        relatedType: 'CUSTOMER' as const,
        originalName: 'view_me.jpg',
        mimeType: 'image/jpeg',
        byteSize: 1024,
        createdAt: new Date().toISOString(),
      },
    ]

    const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/view-doc-url')
    window.URL.createObjectURL = createObjectURLMock

    const mockPopup = {
      opener: null,
      document: { write: vi.fn(), close: vi.fn() },
      location: { replace: vi.fn() },
      close: vi.fn(),
    }
    vi.spyOn(window, 'open').mockReturnValue(mockPopup as unknown as Window)

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/customer-documents/doc-view-1/file') && !url.includes('download=1')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'image/jpeg' }),
          blob: async () => new Blob(['image-bytes'], { type: 'image/jpeg' }),
        } as unknown as Response
      }
      if (url.includes('/customer-documents/customers/')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ documents: mockDocuments }) } as Response
      }
      if (url.includes('/customer-documents/status')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => mockStatus } as Response
      }
      if (url.includes('/customer-documents/summary')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ documentCount: 1, encryptedBytes: 1024, customersWithDocuments: 1 }) } as Response
      }
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: mockCustomers }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<SecureDocumentsPage />)

    await waitFor(() => {
      expect(screen.getByText('view_me.jpg')).toBeInTheDocument()
    })

    const openButton = screen.getByRole('button', { name: /Open/i })
    await user.click(openButton)

    await waitFor(() => {
      expect(createObjectURLMock).toHaveBeenCalled()
      expect(mockPopup.location.replace).toHaveBeenCalledWith('blob:http://localhost/view-doc-url')
    })
  })

  it('handles document download flow and revokes temporary object URL', async () => {
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
    const mockDocuments = [
      {
        _id: 'doc-dl-1',
        category: 'SIGNED_AGREEMENT' as const,
        relatedType: 'CUSTOMER' as const,
        originalName: 'agreement.pdf',
        mimeType: 'application/pdf',
        byteSize: 2048,
        createdAt: new Date().toISOString(),
      },
    ]

    const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/download-doc-url')
    const revokeObjectURLMock = vi.fn()
    window.URL.createObjectURL = createObjectURLMock
    window.URL.revokeObjectURL = revokeObjectURLMock

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/customer-documents/doc-dl-1/file?download=1')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/pdf' }),
          blob: async () => new Blob(['pdf-bytes'], { type: 'application/pdf' }),
        } as unknown as Response
      }
      if (url.includes('/customer-documents/customers/')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ documents: mockDocuments }) } as Response
      }
      if (url.includes('/customer-documents/status')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => mockStatus } as Response
      }
      if (url.includes('/customer-documents/summary')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ documentCount: 1, encryptedBytes: 2048, customersWithDocuments: 1 }) } as Response
      }
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: mockCustomers }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(<SecureDocumentsPage />)

    await waitFor(() => {
      expect(screen.getByText('agreement.pdf')).toBeInTheDocument()
    })

    const downloadButton = screen.getByRole('button', { name: /Download/i })
    await user.click(downloadButton)

    await waitFor(() => {
      expect(createObjectURLMock).toHaveBeenCalled()
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:http://localhost/download-doc-url')
    })
  })

  it('hides delete button when current user role is CASHIER', async () => {
    setStoredSessionUser(mockCashierUser)

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
    const mockDocuments = [
      {
        _id: 'doc-cashier-1',
        category: 'CUSTOMER_PHOTO' as const,
        relatedType: 'CUSTOMER' as const,
        originalName: 'photo.jpg',
        mimeType: 'image/jpeg',
        byteSize: 1024,
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
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ documentCount: 1, encryptedBytes: 1024, customersWithDocuments: 1 }) } as Response
      }
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: mockCustomers }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    render(<SecureDocumentsPage />)

    await waitFor(() => {
      expect(screen.getByText('photo.jpg')).toBeInTheDocument()
    })

    // Open and Download buttons exist
    expect(screen.getByRole('button', { name: /Open/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Download/i })).toBeInTheDocument()

    // Delete button does NOT exist for CASHIER
    expect(screen.queryByRole('button', { name: /Delete/i })).not.toBeInTheDocument()
  })
})
