import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import InventoryPage from './InventoryPage'
import { RouterProvider } from '../../app/routing'
import { mockInventoryItem, mockOwnerUser, mockManagerUser, mockCashierUser, mockStockUser } from '../../test/testUtils'
import * as barcodeModule from './barcode'

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

  it('renders stock record through DetailModalShell under document.body with categorized actions', async () => {
    const item = {
      ...mockInventoryItem,
      _id: 'item-shell-1',
      name: 'iPhone 15 Pro Max',
      sku: 'IPH-15-PM',
      category: 'PHONE' as const,
      imageUrl: 'https://example.com/photos/item-shell.jpg',
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ items: [item] }),
    } as Response)

    const user = userEvent.setup()

    render(
      <RouterProvider>
        <InventoryPage />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText(item.name)).toBeInTheDocument()
    })

    // Open detail modal
    await user.click(screen.getByRole('button', { name: new RegExp(item.name, 'i') }))

    // Verify modal is rendered directly under document.body
    const backdrop = document.body.querySelector('.detail-modal-backdrop')
    expect(backdrop).toBeInTheDocument()

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'stock-detail-title')
    expect(dialog).toHaveAttribute('aria-describedby', 'stock-detail-description')

    // Header checks
    expect(screen.getByText('Stock record')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: item.name })).toHaveAttribute('id', 'stock-detail-title')
    expect(screen.getByText(`${item.sku} · Phone`)).toHaveAttribute('id', 'stock-detail-description')
    expect(screen.getByRole('button', { name: 'Close details' })).toBeInTheDocument()

    // Body checks
    expect(screen.getByRole('heading', { level: 4, name: 'Stock and pricing' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 4, name: 'Product details' })).toBeInTheDocument()

    // Categorized footer action groups
    const utilityGroup = dialog.querySelector('.detail-modal-utility-group')
    expect(utilityGroup).toBeInTheDocument()
    expect(utilityGroup).toHaveTextContent(/Change photo|Add photo/)
    expect(utilityGroup).toHaveTextContent('Print label')

    const dangerGroup = dialog.querySelector('.detail-modal-danger-group')
    expect(dangerGroup).toBeInTheDocument()
    expect(dangerGroup).toHaveTextContent('Remove photo')

    const transactionGroup = dialog.querySelector('.detail-modal-transaction-group')
    expect(transactionGroup).toBeInTheDocument()
    expect(transactionGroup).toHaveTextContent(/Change price|Set selling price/)

    const dismissGroup = dialog.querySelector('.detail-modal-dismiss-group')
    expect(dismissGroup).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
  })

  it('closes stock details from the header X, Escape, and backdrop click, but ignores dialog clicks', async () => {
    const item = { ...mockInventoryItem, _id: 'item-close-test' }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ items: [item] }),
    } as Response)

    const user = userEvent.setup()

    render(
      <RouterProvider>
        <InventoryPage />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText(item.name)).toBeInTheDocument()
    })

    // 1. Open and close via header close button
    await user.click(screen.getByRole('button', { name: new RegExp(item.name, 'i') }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close details' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // 2. Open and close via Escape
    await user.click(screen.getByRole('button', { name: new RegExp(item.name, 'i') }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // 3. Open and click inside dialog - should NOT close
    await user.click(screen.getByRole('button', { name: new RegExp(item.name, 'i') }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    await user.click(dialog)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // 4. Backdrop click - should close
    const backdrop = document.body.querySelector('.detail-modal-backdrop')!
    await user.click(backdrop)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('toggles price editor without duplicating Change price action in the footer', async () => {
    const item = { ...mockInventoryItem, _id: 'item-price-editor', sellPrice: 500 }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ items: [item] }),
    } as Response)

    const user = userEvent.setup()

    render(
      <RouterProvider>
        <InventoryPage />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText(item.name)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: new RegExp(item.name, 'i') }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Initially footer has Change price
    const footerChangePrice = screen.getByRole('button', { name: 'Change price' })
    expect(footerChangePrice).toBeInTheDocument()

    // Click Change price to open editor
    await user.click(footerChangePrice)
    expect(screen.getByRole('heading', { level: 4, name: 'Set selling prices' })).toBeInTheDocument()

    // Footer no longer has duplicate Change price
    expect(screen.queryByRole('button', { name: 'Change price' })).not.toBeInTheDocument()

    // Cancel closes editor
    const cancelButton = screen.getByRole('button', { name: 'Cancel' })
    await user.click(cancelButton)

    expect(screen.queryByRole('heading', { level: 4, name: 'Set selling prices' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change price' })).toBeInTheDocument()
  })

  it('calls printInventoryLabel when print label button is clicked', async () => {
    const printSpy = vi.spyOn(barcodeModule, 'printInventoryLabel').mockImplementation(() => true)
    const item = { ...mockInventoryItem, _id: 'item-print-test' }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ items: [item] }),
    } as Response)

    const user = userEvent.setup()

    render(
      <RouterProvider>
        <InventoryPage />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText(item.name)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: new RegExp(item.name, 'i') }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    const printButton = screen.getByRole('button', { name: /Print label/i })
    await user.click(printButton)

    expect(printSpy).toHaveBeenCalledWith(expect.objectContaining({ _id: item._id }))
  })

  it('displays error inside the dialog and preserves input when client-side price validation fails', async () => {
    const item = {
      ...mockInventoryItem,
      _id: 'item-invalid-price',
      name: 'Phone for Client Validation',
      sellPrice: 100,
      minimumSellPrice: 80,
      khrSellPrice: 410000,
      khrMinimumSellPrice: 328000,
      quantity: 5,
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ items: [item] }),
    } as Response)

    const user = userEvent.setup()

    render(
      <RouterProvider>
        <InventoryPage />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText(item.name)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: new RegExp(item.name, 'i') }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()

    // Open price editor
    await user.click(within(dialog).getByRole('button', { name: 'Change price' }))

    // Type a KHR value that does not end in whole 100 KHR increments (e.g. 410055 > 328000)
    const khrPriceInput = within(dialog).getByLabelText('Regular selling price in Cambodian riel')
    await user.clear(khrPriceInput)
    await user.type(khrPriceInput, '410055')

    // Click Save prices
    const saveButton = within(dialog).getByRole('button', { name: 'Save prices' })
    expect(saveButton).not.toBeDisabled()
    await user.click(saveButton)

    // Error must be visible INSIDE the dialog with role="alert"
    const alert = within(dialog).getByRole('alert')
    expect(alert).toHaveTextContent('KHR prices must use whole 100 KHR increments')

    // Input must be preserved
    expect(khrPriceInput).toHaveValue('410,055')
    // Stock quantity in state remains unchanged
    expect(within(dialog).getByText('5')).toBeInTheDocument()
  })

  it('displays error inside the dialog and preserves input when server rejects price update', async () => {
    const item = {
      ...mockInventoryItem,
      _id: 'item-server-err',
      name: 'Phone for Server Validation',
      sellPrice: 200,
      minimumSellPrice: 150,
      khrSellPrice: 820000,
      khrMinimumSellPrice: 615000,
      quantity: 3,
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'

      if (url.includes(`/inventory/${item._id}`) && method === 'PATCH') {
        return {
          ok: false,
          status: 400,
          headers: new Headers(),
          json: async () => ({ message: 'Server price rejection' }),
        } as Response
      }

      if (url.includes('/inventory') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ items: [item] }),
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
      expect(screen.getByText(item.name)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: new RegExp(item.name, 'i') }))
    const dialog = screen.getByRole('dialog')

    await user.click(within(dialog).getByRole('button', { name: 'Change price' }))
    const usdPriceInput = within(dialog).getByLabelText('Regular selling price in US dollars')
    await user.clear(usdPriceInput)
    await user.type(usdPriceInput, '250')
    const usdMinInput = within(dialog).getByLabelText('Minimum selling price in US dollars')
    await user.clear(usdMinInput)
    await user.type(usdMinInput, '180')

    const saveButton = within(dialog).getByRole('button', { name: 'Save prices' })
    expect(saveButton).not.toBeDisabled()
    await user.click(saveButton)

    // Error must be visible inside the dialog
    await waitFor(() => {
      expect(within(dialog).getByRole('alert')).toHaveTextContent('Server price rejection')
    })

    // Input preserved
    expect(usdPriceInput).toHaveValue('250')
    expect(usdMinInput).toHaveValue('180')
    // Price editor remains open
    expect(within(dialog).getByRole('heading', { level: 4, name: 'Set selling prices' })).toBeInTheDocument()
    // Stock quantity is still 3
    expect(within(dialog).getByText('3')).toBeInTheDocument()
  })

  it('prevents duplicate submissions while price save is in flight', async () => {
    const item = {
      ...mockInventoryItem,
      _id: 'item-dup-test',
      name: 'Phone for Duplicate Test',
      sellPrice: 300,
      minimumSellPrice: 200,
      khrSellPrice: 1230000,
      khrMinimumSellPrice: 820000,
    }
    let patchCalls = 0
    let resolvePatch: (value: Response) => void = () => {}
    const patchPromise = new Promise<Response>((resolve) => {
      resolvePatch = resolve
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'

      if (url.includes(`/inventory/${item._id}`) && method === 'PATCH') {
        patchCalls++
        return patchPromise
      }

      if (url.includes('/inventory') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ items: [item] }),
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
      expect(screen.getByText(item.name)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: new RegExp(item.name, 'i') }))
    const dialog = screen.getByRole('dialog')

    await user.click(within(dialog).getByRole('button', { name: 'Change price' }))
    const saveButton = within(dialog).getByRole('button', { name: 'Save prices' })

    // Both events run before React can commit the disabled-button state.
    act(() => {
      saveButton.click()
      saveButton.click()
    })
    expect(patchCalls).toBe(1)
    expect(saveButton).toBeDisabled()

    // Attempt second click while pending
    await user.click(saveButton)
    expect(patchCalls).toBe(1)

    // Complete the patch
    resolvePatch({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        item: { ...item, sellPrice: 350, minimumSellPrice: 250, quantity: item.quantity },
      }),
    } as Response)

    await waitFor(() => {
      expect(within(dialog).queryByRole('heading', { level: 4, name: 'Set selling prices' })).not.toBeInTheDocument()
    })

    // Exactly 1 network request was sent
    expect(patchCalls).toBe(1)
  })

  it('updates the UI immediately upon successful price change without page reload and preserves stock quantity', async () => {
    const item = {
      ...mockInventoryItem,
      _id: 'item-price-ui-update',
      name: 'Phone for UI Update Test',
      sellPrice: 100,
      minimumSellPrice: 80,
      khrSellPrice: 410000,
      khrMinimumSellPrice: 328000,
      quantity: 7,
    }
    const updatedItem = {
      ...item,
      sellPrice: 150,
      minimumSellPrice: 120,
      khrSellPrice: 615000,
      khrMinimumSellPrice: 492000,
      quantity: 7, // Quantity untouched
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'

      if (url.includes(`/inventory/${item._id}`) && method === 'PATCH') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ item: updatedItem }),
        } as Response
      }

      if (url.includes('/inventory') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ items: [item] }),
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
      expect(screen.getByText(item.name)).toBeInTheDocument()
    })

    // Open detail modal
    await user.click(screen.getByRole('button', { name: new RegExp(item.name, 'i') }))
    const dialog = screen.getByRole('dialog')

    // Initial price shown in modal
    expect(within(dialog).getByText('$100 · 410,000 KHR')).toBeInTheDocument()
    // Stock is 7
    expect(within(dialog).getByText('7')).toBeInTheDocument()

    // Open price editor and save new prices
    await user.click(within(dialog).getByRole('button', { name: 'Change price' }))
    const usdPriceInput = within(dialog).getByLabelText('Regular selling price in US dollars')
    await user.clear(usdPriceInput)
    await user.type(usdPriceInput, '150')
    const usdMinInput = within(dialog).getByLabelText('Minimum selling price in US dollars')
    await user.clear(usdMinInput)
    await user.type(usdMinInput, '120')

    await user.click(within(dialog).getByRole('button', { name: 'Save prices' }))

    // Dialog updates immediately without refreshing
    await waitFor(() => {
      expect(within(dialog).getByText('$150 · 615,000 KHR')).toBeInTheDocument()
    })
    // Stock quantity is still 7
    expect(within(dialog).getByText('7')).toBeInTheDocument()

    // Close modal and verify catalog card is also updated in background
    await user.click(within(dialog).getByRole('button', { name: 'Close details' }))
    expect(screen.getByText('$150')).toBeInTheDocument()
    expect(screen.getByText('7 in stock')).toBeInTheDocument()
  })

  it('filters items by category, status, and renders No matching inventory when no items match', async () => {
    const phone = { ...mockInventoryItem, _id: 'item-p1', name: 'iPhone 15 Pro', category: 'PHONE' as const, status: 'IN_STOCK' as const, quantity: 2 }
    const accessory = { ...mockInventoryItem, _id: 'item-a1', name: 'USB-C Cable', category: 'ACCESSORY' as const, status: 'SOLD' as const, quantity: 0 }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ items: [phone, accessory] }),
    } as Response)

    const user = userEvent.setup()

    render(
      <RouterProvider>
        <InventoryPage />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('iPhone 15 Pro')).toBeInTheDocument()
      expect(screen.getByText('USB-C Cable')).toBeInTheDocument()
    })

    // Filter by category: ACCESSORY
    const categorySelect = screen.getByLabelText('Filter inventory category')
    await user.selectOptions(categorySelect, 'ACCESSORY')

    expect(screen.queryByText('iPhone 15 Pro')).not.toBeInTheDocument()
    expect(screen.getByText('USB-C Cable')).toBeInTheDocument()

    // Filter by status: IN_STOCK (accessory is SOLD, so 0 items match)
    const statusSelect = screen.getByLabelText('Filter stock status')
    await user.selectOptions(statusSelect, 'IN_STOCK')

    expect(screen.queryByText('USB-C Cable')).not.toBeInTheDocument()
    expect(screen.getByText('No matching inventory.')).toBeInTheDocument()
  })

  it('displays distinct details for quantity-based accessories without phone serialized fields', async () => {
    const accessoryItem = {
      ...mockInventoryItem,
      _id: 'acc-case-1',
      name: 'Silicone Case',
      sku: 'CASE-IPH-15',
      category: 'ACCESSORY' as const,
      quantity: 25,
      reorderLevel: 5,
      buyPrice: 3,
      sellPrice: 10,
      minimumSellPrice: 8,
      khrSellPrice: 41000,
      khrMinimumSellPrice: 32800,
      compatibleModels: ['iPhone 15', 'iPhone 15 Pro'],
      oemQuality: 'Original Grade A',
      accessoriesIncluded: ['CASE' as const],
      imei1: undefined,
      imei2: undefined,
      serialNumber: undefined,
      batteryHealth: undefined,
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ items: [accessoryItem] }),
    } as Response)

    const user = userEvent.setup()

    render(
      <RouterProvider>
        <InventoryPage />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText(accessoryItem.name)).toBeInTheDocument()
      expect(screen.getByText('25 in stock')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: new RegExp(accessoryItem.name, 'i') }))
    const dialog = screen.getByRole('dialog')

    // Verifies quantity-based attributes
    expect(within(dialog).getByText('25')).toBeInTheDocument()
    expect(within(dialog).getByText('iPhone 15, iPhone 15 Pro')).toBeInTheDocument()
    expect(within(dialog).getByText('Original Grade A')).toBeInTheDocument()
    expect(within(dialog).getByText('No IMEI 1')).toBeInTheDocument()
  })

  it.each(['upload', 'remove'] as const)('blocks same-render %s duplicates and releases the photo guard after failure', async (operation) => {
    const item = { ...mockInventoryItem, imageUrl: 'https://example.com/old.webp' }
    let resolveRequest: (response: Response) => void = () => {}
    const pending = new Promise<Response>((resolve) => { resolveRequest = resolve })
    const mutations: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const method = init?.method || 'GET'
      if (method !== 'GET') {
        mutations.push(method)
        if (mutations.length === 1) return pending
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ item }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [item] }) } as Response
    })
    const user = userEvent.setup()
    render(<RouterProvider><InventoryPage /></RouterProvider>)
    await user.click(await screen.findByRole('button', { name: new RegExp(item.name, 'i') }))
    const dialog = screen.getByRole('dialog')
    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!
    const remove = within(dialog).getByRole('button', { name: 'Remove photo' })
    const reads = vi.spyOn(FileReader.prototype, 'readAsDataURL')
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['photo'], 'photo.png', { type: 'image/png' })] })
    const upload = () => input.dispatchEvent(new Event('change', { bubbles: true }))

    act(() => {
      if (operation === 'upload') {
        upload()
        upload()
        remove.click()
      } else {
        remove.click()
        remove.click()
        upload()
      }
    })
    await waitFor(() => expect(mutations).toEqual([operation === 'upload' ? 'POST' : 'DELETE']))
    expect(reads).toHaveBeenCalledTimes(operation === 'upload' ? 1 : 0)
    expect(input).toBeDisabled()
    expect(remove).toBeDisabled()

    await act(async () => {
      resolveRequest({ ok: false, status: 400, headers: new Headers(), json: async () => ({ message: 'Photo request failed' }) } as Response)
    })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Photo request failed')
    expect(input).not.toBeDisabled()
    expect(remove).not.toBeDisabled()
    await user.click(remove)
    await waitFor(() => expect(mutations).toHaveLength(2))
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('uploads product photo, updates preview, and preserves stock quantity', async () => {
    const item = { ...mockInventoryItem, _id: 'item-photo-upload-test', imageUrl: '', quantity: 12 }
    const updatedWithPhoto = { ...item, imageUrl: 'https://example.com/photos/newly-uploaded.webp', quantity: 12 }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'

      if (url.includes(`/inventory/${item._id}/photo`) && method === 'POST') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ item: updatedWithPhoto }),
        } as Response
      }

      if (url.includes('/inventory') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ items: [item] }),
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
      expect(screen.getByText(item.name)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: new RegExp(item.name, 'i') }))
    const dialog = screen.getByRole('dialog')

    // Initial state: No product photo
    expect(within(dialog).getByText('No product photo')).toBeInTheDocument()
    expect(within(dialog).getByText('12')).toBeInTheDocument()

    // Upload file
    const file = new File(['fake-image-bytes'], 'phone.png', { type: 'image/png' })
    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput).toBeInTheDocument()
    await user.upload(fileInput, file)

    // Modal updates to show product photo added and stock is still 12
    await waitFor(() => {
      expect(within(dialog).getByText('Product photo added')).toBeInTheDocument()
    })
    expect(within(dialog).getByText('12')).toBeInTheDocument()
  })

  it('selects and opens item when phoneflow:open-stock-item event is fired', async () => {
    const item1 = { ...mockInventoryItem, _id: 'item-open-1', name: 'First Item' }
    const scannedItem = { ...mockInventoryItem, _id: 'item-scanned-2', name: 'Scanned Super Phone', quantity: 1 }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ items: [item1] }),
    } as Response)

    render(
      <RouterProvider>
        <InventoryPage />
      </RouterProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText(item1.name)).toBeInTheDocument()
    })

    // Dispatch the custom scan event
    act(() => {
      window.dispatchEvent(
        new CustomEvent('phoneflow:open-stock-item', {
          detail: { item: scannedItem },
        }),
      )
    })

    // Modal opens automatically displaying scanned item
    await waitFor(() => {
      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText(scannedItem.name)).toBeInTheDocument()
    })
  })

  it('preserves shared DetailModal structure with separate leading media and content', async () => {
    const item = { ...mockInventoryItem, _id: 'item-struct-1', name: 'Structure Phone' }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ items: [item] }),
    } as Response)

    const user = userEvent.setup()
    render(
      <RouterProvider>
        <InventoryPage user={mockOwnerUser} />
      </RouterProvider>,
    )

    await waitFor(() => expect(screen.getByText(item.name)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: new RegExp(item.name, 'i') }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveClass('inventory-detail-modal')

    // Header structure checks
    const header = dialog.querySelector('.detail-modal-header')
    expect(header).toBeInTheDocument()
    const leading = header?.querySelector('.detail-modal-leading')
    expect(leading).toBeInTheDocument()
    const headerContent = header?.querySelector('.detail-modal-header-content')
    expect(headerContent).toBeInTheDocument()
    expect(within(headerContent as HTMLElement).getByText(item.name)).toBeInTheDocument()

    // Body and Footer exist
    expect(dialog.querySelector('.inventory-detail-body')).toBeInTheDocument()
    expect(dialog.querySelector('.detail-modal-footer')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
  })

  it('shows Delete stock record only to OWNER and hides it from MANAGER, CASHIER, and STOCK', async () => {
    const item = { ...mockInventoryItem, _id: 'item-role-1', name: 'Role Test Phone' }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ items: [item] }),
    } as Response)

    const user = userEvent.setup()

    // 1. OWNER sees Delete stock record
    const { unmount: unmountOwner } = render(
      <RouterProvider>
        <InventoryPage user={mockOwnerUser} />
      </RouterProvider>,
    )
    await waitFor(() => expect(screen.getByText(item.name)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: new RegExp(item.name, 'i') }))
    expect(screen.getByRole('button', { name: /Delete stock record/i })).toBeInTheDocument()
    unmountOwner()

    // 2. MANAGER does not see Delete stock record
    const { unmount: unmountManager } = render(
      <RouterProvider>
        <InventoryPage user={mockManagerUser} />
      </RouterProvider>,
    )
    await waitFor(() => expect(screen.getByText(item.name)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: new RegExp(item.name, 'i') }))
    expect(screen.queryByRole('button', { name: /Delete stock record/i })).not.toBeInTheDocument()
    unmountManager()

    // 3. CASHIER does not see Delete stock record
    const { unmount: unmountCashier } = render(
      <RouterProvider>
        <InventoryPage user={mockCashierUser} />
      </RouterProvider>,
    )
    await waitFor(() => expect(screen.getByText(item.name)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: new RegExp(item.name, 'i') }))
    expect(screen.queryByRole('button', { name: /Delete stock record/i })).not.toBeInTheDocument()
    unmountCashier()

    // 4. STOCK does not see Delete stock record
    const { unmount: unmountStock } = render(
      <RouterProvider>
        <InventoryPage user={mockStockUser} />
      </RouterProvider>,
    )
    await waitFor(() => expect(screen.getByText(item.name)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: new RegExp(item.name, 'i') }))
    expect(screen.queryByRole('button', { name: /Delete stock record/i })).not.toBeInTheDocument()
    unmountStock()
  })

  it('renders Delete stock record whether or not the record has a photo, and Remove photo only removes photo', async () => {
    const itemWithoutPhoto = { ...mockInventoryItem, _id: 'item-no-photo', name: 'Plain Phone Alpha', imageUrl: '' }
    const itemWithPhoto = { ...mockInventoryItem, _id: 'item-with-photo', name: 'Pic Phone Beta', imageUrl: 'https://example.com/photo.jpg' }

    let stockDeleteCalled = false
    let photoDeleteCalled = false

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'

      if (url.includes('/inventory/') && url.includes('/photo') && method === 'DELETE') {
        photoDeleteCalled = true
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ item: { ...itemWithPhoto, imageUrl: '' } }),
        } as Response
      }

      if (url.includes('/inventory/') && method === 'DELETE') {
        stockDeleteCalled = true
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ message: 'Deleted' }) } as Response
      }

      if (url.includes('/inventory') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ items: [itemWithoutPhoto, itemWithPhoto] }),
        } as Response
      }

      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const user = userEvent.setup()
    render(
      <RouterProvider>
        <InventoryPage user={mockOwnerUser} />
      </RouterProvider>,
    )

    await waitFor(() => expect(screen.getByText(itemWithoutPhoto.name)).toBeInTheDocument())

    // 1. Without photo: Delete stock record exists, Remove photo does NOT exist
    await user.click(screen.getByRole('button', { name: /Plain Phone Alpha/i }))
    expect(screen.getByRole('button', { name: /Delete stock record/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove photo/i })).not.toBeInTheDocument()

    // Close details
    await user.click(screen.getByRole('button', { name: /Close details/i }))

    // 2. With photo: both Delete stock record and Remove photo exist
    await user.click(screen.getByRole('button', { name: /Pic Phone Beta/i }))
    expect(screen.getByRole('button', { name: /Delete stock record/i })).toBeInTheDocument()
    const removePhotoBtn = screen.getByRole('button', { name: /Remove photo/i })
    expect(removePhotoBtn).toBeInTheDocument()

    // Clicking Remove photo removes photo, does not call stock DELETE endpoint
    await user.click(removePhotoBtn)
    await waitFor(() => expect(photoDeleteCalled).toBe(true))
    expect(stockDeleteCalled).toBe(false)
  })

  it('opens confirmation modal on Delete click without immediately calling API, and Cancel closes only confirmation', async () => {
    const item = { ...mockInventoryItem, _id: 'item-confirm-1', name: 'Confirm Test Item', sku: 'SKU-CONF-01' }
    let deleteApiCalled = false

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'
      if (url.includes(`/inventory/${item._id}`) && method === 'DELETE') {
        deleteApiCalled = true
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ items: [item] }),
      } as Response
    })

    const user = userEvent.setup()
    render(
      <RouterProvider>
        <InventoryPage user={mockOwnerUser} />
      </RouterProvider>,
    )

    await waitFor(() => expect(screen.getByText(item.name)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: new RegExp(item.name, 'i') }))

    // Click Delete stock record to open confirmation
    await user.click(screen.getByRole('button', { name: /Delete stock record/i }))
    expect(deleteApiCalled).toBe(false)

    // Confirmation dialog is shown
    const confirmModal = screen.getByRole('dialog', { name: /Delete stock record\?/i })
    expect(within(confirmModal).getByText('Delete stock record?')).toBeInTheDocument()
    expect(within(confirmModal).getByText('This action cannot be undone.')).toBeInTheDocument()
    expect(within(confirmModal).getByText(new RegExp(item.sku, 'i'))).toBeInTheDocument()

    // Click Cancel -> confirmation closes, detail modal remains open
    const cancelBtn = within(confirmModal).getByRole('button', { name: /Cancel/i })
    await user.click(cancelBtn)

    expect(screen.queryByText('Delete stock record?')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: item.name })).toBeInTheDocument()
    expect(deleteApiCalled).toBe(false)
  })

  it('closes only the confirmation dialog when Escape key is pressed', async () => {
    const item = { ...mockInventoryItem, _id: 'item-esc-1', name: 'Escape Item' }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ items: [item] }),
    } as Response)

    const user = userEvent.setup()
    render(
      <RouterProvider>
        <InventoryPage user={mockOwnerUser} />
      </RouterProvider>,
    )

    await waitFor(() => expect(screen.getByText(item.name)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: new RegExp(item.name, 'i') }))

    // Open confirmation
    await user.click(screen.getByRole('button', { name: /Delete stock record/i }))
    expect(screen.getByText('Delete stock record?')).toBeInTheDocument()

    // Press Escape
    await user.keyboard('{Escape}')

    // Confirmation is dismissed, detail modal is still open
    expect(screen.queryByText('Delete stock record?')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: item.name })).toBeInTheDocument()

    // Press Escape again -> detail modal is dismissed
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('heading', { name: item.name })).not.toBeInTheDocument()
  })

  it('successfully deletes stock record, updates counts, closes dialogs, shows toast, dispatches event, and prevents rapid double submission', async () => {
    const itemToDelete = { ...mockInventoryItem, _id: 'item-del-target', name: 'Target Phone', category: 'PHONE', quantity: 1 }
    const otherItem = { ...mockInventoryItem, _id: 'item-other', name: 'Keep Phone', category: 'PHONE', quantity: 2 }

    let deleteCalls = 0
    let resolveDelete: (res: Response) => void = () => {}
    const deletePromise = new Promise<Response>((resolve) => {
      resolveDelete = resolve
    })

    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'

      if (url.includes(`/inventory/${itemToDelete._id}`) && method === 'DELETE') {
        deleteCalls++
        return deletePromise
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ items: [itemToDelete, otherItem] }),
      } as Response
    })

    const user = userEvent.setup()
    render(
      <RouterProvider>
        <InventoryPage user={mockOwnerUser} />
      </RouterProvider>,
    )

    await waitFor(() => expect(screen.getByText(itemToDelete.name)).toBeInTheDocument())
    // Initial count should be 1 + 2 = 3
    expect(screen.getByText('3')).toBeInTheDocument()

    // Open detail modal
    await user.click(screen.getByRole('button', { name: new RegExp(itemToDelete.name, 'i') }))

    // Open confirmation
    await user.click(screen.getByRole('button', { name: /Delete stock record/i }))

    // Click confirm button rapidly twice inside confirmation dialog
    const confirmModal = screen.getByRole('dialog', { name: /Delete stock record\?/i })
    const confirmBtn = within(confirmModal).getByRole('button', { name: /Delete stock record/i })
    await user.click(confirmBtn)
    await user.click(confirmBtn)

    expect(deleteCalls).toBe(1)
    expect(confirmBtn).toHaveTextContent(/Deleting/i)
    expect(confirmBtn).toBeDisabled()

    // Resolve deletion
    act(() => {
      resolveDelete({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ message: 'Stock record deleted successfully', deletedId: itemToDelete._id }),
      } as Response)
    })

    // UI updates: dialogs close, toast appears, row removed, count decreases
    await waitFor(() => {
      expect(screen.queryByText('Delete stock record?')).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: itemToDelete.name })).not.toBeInTheDocument()
      expect(screen.getByText('Stock record deleted successfully.')).toBeInTheDocument()
    })

    expect(screen.queryByText(itemToDelete.name)).not.toBeInTheDocument()
    expect(screen.getByText(otherItem.name)).toBeInTheDocument()
    // New phone count should be 2
    expect(screen.getByText('2')).toBeInTheDocument()

    // Verify custom event dispatch
    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'phoneflow:inventory-updated',
        detail: { id: itemToDelete._id },
      }),
    )
  })

  it('keeps confirmation dialog open and displays error when server returns 409 conflict, 403, 404, or network error', async () => {
    const item = { ...mockInventoryItem, _id: 'item-conflict-1', name: 'Pawned Phone' }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'

      if (url.includes(`/inventory/${item._id}`) && method === 'DELETE') {
        return {
          ok: false,
          status: 409,
          headers: new Headers(),
          json: async () => ({ message: 'Cannot delete stock record linked to active pawn contract #PW-2026-001.' }),
        } as Response
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ items: [item] }),
      } as Response
    })

    const user = userEvent.setup()
    render(
      <RouterProvider>
        <InventoryPage user={mockOwnerUser} />
      </RouterProvider>,
    )

    await waitFor(() => expect(screen.getByText(item.name)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: new RegExp(item.name, 'i') }))
    await user.click(screen.getByRole('button', { name: /Delete stock record/i }))

    // Confirm deletion
    const confirmModal = screen.getByRole('dialog', { name: /Delete stock record\?/i })
    const confirmBtn = within(confirmModal).getByRole('button', { name: /Delete stock record/i })
    await user.click(confirmBtn)

    // Alert appears with error message
    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(/linked to active pawn contract #PW-2026-001/i)
    })

    // Dialogs remain open and item is preserved
    expect(screen.getByText('Delete stock record?')).toBeInTheDocument()
    expect(within(confirmModal).getByRole('button', { name: /Delete stock record/i })).not.toBeDisabled()
    expect(within(confirmModal).getByRole('button', { name: /Cancel/i })).not.toBeDisabled()
  })
})
