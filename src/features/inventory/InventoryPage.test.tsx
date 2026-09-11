import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import InventoryPage from './InventoryPage'
import { RouterProvider } from '../../app/routing'
import { mockInventoryItem } from '../../test/testUtils'

describe('InventoryPage feature integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders loading state initially while fetching inventory', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))

    render(
      <RouterProvider>
        <InventoryPage />
      </RouterProvider>,
    )

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Loading inventory')).toBeInTheDocument()
  })

  it('renders inventory cards with item information when API returns items', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ items: [mockInventoryItem] }),
    } as Response)

    render(
      <RouterProvider>
        <InventoryPage />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText(mockInventoryItem.name)).toBeInTheDocument()
      expect(screen.getByText(`${mockInventoryItem.quantity} in stock`)).toBeInTheDocument()
    })
  })

  it('renders empty state when inventory is empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ items: [] }),
    } as Response)

    render(
      <RouterProvider>
        <InventoryPage />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('No inventory in the database yet.')).toBeInTheDocument()
    })
  })

  it('filters items by search input', async () => {
    const item1 = { ...mockInventoryItem, _id: 'i-1', sku: 'IPHONE-15', name: 'Apple iPhone 15' }
    const item2 = { ...mockInventoryItem, _id: 'i-2', sku: 'SAMS-S24', name: 'Samsung Galaxy S24' }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ items: [item1, item2] }),
    } as Response)

    const user = userEvent.setup()

    render(
      <RouterProvider>
        <InventoryPage />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Apple iPhone 15')).toBeInTheDocument()
      expect(screen.getByText('Samsung Galaxy S24')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/Search SKU, product/i)
    await user.type(searchInput, 'Samsung')

    expect(screen.queryByText('Apple iPhone 15')).not.toBeInTheDocument()
    expect(screen.getByText('Samsung Galaxy S24')).toBeInTheDocument()
  })

  it('renders error notice when inventory fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers({ 'X-Request-ID': 'req-inv-err' }),
      json: async () => ({ message: 'Database connection failed', requestId: 'req-inv-err' }),
    } as Response)

    render(
      <RouterProvider>
        <InventoryPage />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText(/Database connection failed/i)).toBeInTheDocument()
    })
  })

  it('removes product photo, disables button while saving, and shows success toast', async () => {
    const itemWithPhoto = {
      ...mockInventoryItem,
      _id: 'item-photo-1',
      imageUrl: 'https://example.com/photos/item-1.jpg',
    }
    const itemWithoutPhoto = {
      ...itemWithPhoto,
      imageUrl: '',
    }

    let deleteResolver: (value: Response) => void = () => {}
    const deletePromise = new Promise<Response>((resolve) => {
      deleteResolver = resolve
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'

      if (url.includes('/inventory/item-photo-1/photo') && method === 'DELETE') {
        return deletePromise
      }

      if (url.includes('/inventory') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ items: [itemWithPhoto] }),
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

    render(
      <RouterProvider>
        <InventoryPage />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText(itemWithPhoto.name)).toBeInTheDocument()
    })

    // Open detail modal by clicking the product card
    await user.click(screen.getByRole('button', { name: new RegExp(itemWithPhoto.name, 'i') }))

    const removeButton = await screen.findByRole('button', { name: 'Remove photo' })
    expect(removeButton).toBeInTheDocument()

    // Click remove photo
    await user.click(removeButton)

    // Button should be disabled while request is in-flight
    expect(removeButton).toBeDisabled()

    // Resolve deletion
    deleteResolver({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ item: itemWithoutPhoto }),
    } as Response)

    // Success toast should appear
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Product photo removed successfully.')
    })

    // Remove photo button should be gone since imageUrl is now empty
    expect(screen.queryByRole('button', { name: 'Remove photo' })).not.toBeInTheDocument()
  })

  it('keeps detail modal open and displays error when photo removal fails, with no success toast', async () => {
    const itemWithPhoto = {
      ...mockInventoryItem,
      _id: 'item-photo-fail',
      imageUrl: 'https://example.com/photos/item-fail.jpg',
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'

      if (url.includes('/inventory/item-photo-fail/photo') && method === 'DELETE') {
        return {
          ok: false,
          status: 400,
          headers: new Headers(),
          json: async () => ({ message: 'Failed to delete photo from storage' }),
        } as Response
      }

      if (url.includes('/inventory') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ items: [itemWithPhoto] }),
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

    render(
      <RouterProvider>
        <InventoryPage />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText(itemWithPhoto.name)).toBeInTheDocument()
    })

    // Open detail modal
    await user.click(screen.getByRole('button', { name: new RegExp(itemWithPhoto.name, 'i') }))

    const removeButton = await screen.findByRole('button', { name: 'Remove photo' })
    await user.click(removeButton)

    // Modal stays open, error message shown
    await waitFor(() => {
      expect(screen.getByText('Failed to delete photo from storage')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Remove photo' })).toBeInTheDocument()

    // No success toast shown
    expect(screen.queryByText('Product photo removed successfully.')).not.toBeInTheDocument()
  })
})
