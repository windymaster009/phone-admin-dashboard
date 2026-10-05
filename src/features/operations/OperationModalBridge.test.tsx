import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OperationModalBridge from './OperationModalBridge'
import { RouterProvider } from '../../app/routing'
import { setStoredSessionUser } from '../../lib/storage'
import { mockInventoryItem, mockOwnerUser } from '../../test/testUtils'

vi.mock('../../components/scanner/CameraBarcodeReader', () => ({
  default: ({ onScan, onError }: { onScan: (code: string) => void; onError: (msg: string) => void }) => (
    <div data-testid="mock-camera-barcode-reader">
      <button type="button" onClick={() => onScan('12345')}>Simulate Short Scan</button>
      <button type="button" onClick={() => onScan('860123456789012')}>Simulate 15-digit Scan</button>
      <button type="button" onClick={() => onScan('8806091234567')}>Simulate Product Barcode</button>
      <button type="button" onClick={() => onScan('9999999999999')}>Simulate Unknown Scan</button>
      <button type="button" onClick={() => onError('Camera permission denied')}>Simulate Error</button>
    </div>
  ),
}))

function renderModalBridge() {
  return render(
    <RouterProvider>
      <OperationModalBridge />
    </RouterProvider>,
  )
}

async function openSaleProductPicker() {
  const input = screen.getByRole('combobox', { name: /inventory item/i })
  await waitFor(() => expect(input).not.toBeDisabled())
  fireEvent.focus(input)
  return input
}

describe('OperationModalBridge component', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
    setStoredSessionUser(mockOwnerUser)
  })

  it('renders nothing initially when no modal event has fired', () => {
    renderModalBridge()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens stock adjustment modal on phoneflow:open-operation event and validates inputs', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [mockInventoryItem] }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    // Trigger stock adjustment modal
    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'stock' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText(/Adjust stock/i)).toBeInTheDocument()
    })

    // Action button should be disabled without selecting item & reason
    const submitBtn = screen.getByRole('button', { name: /Select an item first/i })
    expect(submitBtn).toBeDisabled()

    // Close modal via close button
    const closeBtn = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closeBtn)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('adjust stock with zero search results renders empty state and maintains functional footer', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [] }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'stock' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText(/No matching inventory item/i)).toBeInTheDocument()
    })

    const resultsContainer = screen.getByRole('list', { name: /matching inventory items/i })
    expect(resultsContainer).toBeInTheDocument()
    expect(within(resultsContainer).queryByRole('listitem')).not.toBeInTheDocument()

    // Footer actions remain present
    const footerCancel = screen.getByRole('button', { name: /^cancel$/i })
    const footerSubmit = screen.getByRole('button', { name: /select an item first/i })
    expect(footerCancel).toBeInTheDocument()
    expect(footerSubmit).toBeDisabled()

    fireEvent.click(footerCancel)
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('adjust stock with one result has natural content height, reveals controls on select, and updates footer', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [mockInventoryItem] }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'stock' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    const resultsContainer = screen.getByRole('list', { name: /matching inventory items/i })
    await waitFor(() => {
      expect(within(resultsContainer).getAllByRole('listitem')).toHaveLength(1)
    })
    const resultButtons = within(resultsContainer).getAllByRole('listitem')
    expect(resultButtons[0]).toHaveTextContent(mockInventoryItem.name)

    // Footer starts with disabled "Select an item first"
    const submitBtn = screen.getByRole('button', { name: /select an item first/i })
    expect(submitBtn).toBeDisabled()

    // Select the single item
    fireEvent.click(resultButtons[0])

    // Controls are revealed
    await waitFor(() => {
      expect(screen.getByText('Selected inventory item')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /change item/i })).toBeInTheDocument()
    })

    // Serialized or quantity panel is visible
    expect(screen.getByText(mockInventoryItem.name)).toBeInTheDocument()
    expect(screen.getByLabelText(/reason/i)).toBeInTheDocument()

    // Footer button changes to "Update stock" (disabled until valid reason is selected)
    const updateBtn = screen.getByRole('button', { name: /update stock/i })
    expect(updateBtn).toBeDisabled()

    // Select reason and change status from IN_STOCK to REPAIR so stockAdjustmentValid becomes true
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'COUNT_CORRECTION' } })
    fireEvent.click(screen.getByRole('radio', { name: /in repair/i }))
    expect(updateBtn).toBeEnabled()

    // Cancel still works
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('adjust stock with multiple search results supports filtering and scrolling', async () => {
    const item1 = { ...mockInventoryItem, _id: 'item-1', name: 'iPhone 13 Pro', sku: 'IPHONE-13-PRO' }
    const item2 = { ...mockInventoryItem, _id: 'item-2', name: 'Samsung Galaxy S24', sku: 'SAM-S24' }
    const item3 = { ...mockInventoryItem, _id: 'item-3', name: 'Pixel 8 Pro', sku: 'PIX-8-PRO' }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [item1, item2, item3] }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'stock' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    const resultsContainer = screen.getByRole('list', { name: /matching inventory items/i })
    await waitFor(() => {
      expect(within(resultsContainer).getAllByRole('listitem')).toHaveLength(3)
    })

    // Filter by typing 'Pixel'
    const searchInput = screen.getByPlaceholderText(/search or scan a product code/i)
    fireEvent.change(searchInput, { target: { value: 'Pixel' } })

    expect(within(resultsContainer).getAllByRole('listitem')).toHaveLength(1)
    expect(within(resultsContainer).getByText('Pixel 8 Pro')).toBeInTheDocument()

    // Footer actions remain present and functional
    expect(screen.getByRole('button', { name: /select an item first/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeEnabled()
  })

  it('opens sale modal, selects customer and item, and allows cancellation', async () => {
    const mockCustomers = [
      { _id: 'cust-1', name: 'Bob Smith', phone: '012345678', active: true },
    ]

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: mockCustomers }) } as Response
      }
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [mockInventoryItem] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      if (url.includes('/payway/config')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ enabled: false, configured: false }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText(/New sale/i)).toBeInTheDocument()
    })

    // Modal can be dismissed with Escape key
    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('does not preselect a stale stock item still linked to an active pawn', async () => {
    const pawnedItem = { ...mockInventoryItem, _id: 'pawned-item', name: 'Pawned Phone', relatedPawn: { status: 'ACTIVE' } }
    const availableItem = { ...mockInventoryItem, _id: 'available-item', name: 'Available Phone' }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      const body = url.includes('/inventory/pawned-item')
        ? { item: pawnedItem }
        : url.includes('/inventory?status=IN_STOCK')
          ? { items: [pawnedItem, availableItem] }
          : url.includes('/customers')
            ? { customers: [] }
            : url.includes('/exchange-rates')
              ? { usdKhr: 4100 }
              : url.includes('/payway/config')
                ? { enabled: false, configured: false }
                : {}
      return { ok: true, status: 200, headers: new Headers(), json: async () => body } as Response
    })

    renderModalBridge()
    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', {
        detail: { kind: 'sale', itemId: pawnedItem._id, item: pawnedItem },
      }))
    })

    await waitFor(() => expect(screen.getByText(/no longer available for sale/i)).toBeInTheDocument())
    const itemSelect = screen.getByRole('combobox', { name: /inventory item/i })
    expect(itemSelect).toHaveValue('')
    expect(screen.queryByRole('listbox', { name: /available products/i })).not.toBeInTheDocument()
    fireEvent.focus(itemSelect)
    const results = screen.getByRole('listbox', { name: /available products/i })
    expect(within(results).queryByText(/Pawned Phone/)).not.toBeInTheDocument()
    expect(within(results).getByText(/Available Phone/)).toBeInTheDocument()
  })

  it('opens pawn modal and purchase modal via event triggers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ customers: [], suppliers: [], items: [], usdKhr: 4100 }),
    } as Response)

    renderModalBridge()

    // Trigger pawn modal
    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'pawn' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText(/New pawn contract/i)).toBeInTheDocument()
    })

    // Close pawn modal
    fireEvent.click(screen.getByRole('button', { name: /close/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // Trigger purchase modal
    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText(/New purchase/i)).toBeInTheDocument()
    })
  })

  it('handles pawn modal workflow, customer modes, validation error, step navigation and reset on reopen', async () => {
    const mockCustomers = [
      { _id: 'cust-pawn-1', name: 'Chanthy Sok', phone: '098765432', nationalIdNumber: '012345678', active: true },
    ]

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: mockCustomers }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [], suppliers: [], items: [], usdKhr: 4100 }) } as Response
    })

    renderModalBridge()

    // 1. Open pawn modal
    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'pawn' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText(/New pawn contract/i)).toBeInTheDocument()
    })

    // Check Step 1 stepper, header close, and structure
    expect(screen.getByLabelText(/Step 1 of 2: Customer verification/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Close/i })).toBeInTheDocument()

    // Verify customer tabs have tablist and tab roles with aria-selected
    const tablist = screen.getByRole('tablist', { name: /Customer type/i })
    expect(tablist).toBeInTheDocument()

    const existingTab = screen.getByRole('tab', { name: /Existing customer/i })
    const newTab = screen.getByRole('tab', { name: /New customer/i })
    expect(existingTab).toHaveAttribute('aria-selected', 'true')
    expect(existingTab).toHaveClass('active')
    expect(newTab).toHaveAttribute('aria-selected', 'false')

    // Test tab keyboard arrow navigation
    fireEvent.keyDown(existingTab, { key: 'ArrowRight' })
    expect(newTab).toHaveAttribute('aria-selected', 'true')
    expect(existingTab).toHaveAttribute('aria-selected', 'false')

    fireEvent.keyDown(newTab, { key: 'ArrowLeft' })
    expect(existingTab).toHaveAttribute('aria-selected', 'true')

    expect(screen.getByRole('button', { name: /Continue to collateral/i })).toBeInTheDocument()

    // 2. Validation error test: click continue without selecting customer/ownership
    fireEvent.click(screen.getByRole('button', { name: /Continue to collateral/i }))

    await waitFor(() => {
      expect(screen.getByText(/Select a customer and confirm identity and collateral ownership first/i)).toBeInTheDocument()
      expect(screen.getByText('Select a customer', { selector: 'small' })).toBeInTheDocument()
    })

    // 3. Switch to "New customer" mode via click
    fireEvent.click(newTab)
    expect(newTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByPlaceholderText(/Full name/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Leave blank to protect privacy/i)).toBeInTheDocument()

    // Switch back to "Existing customer" mode
    fireEvent.click(existingTab)
    expect(existingTab).toHaveAttribute('aria-selected', 'true')

    // Select the customer
    const customerSelect = screen.getByRole('combobox')
    fireEvent.change(customerSelect, { target: { value: 'cust-pawn-1' } })

    // Check ownership confirmation checkbox
    const ownershipCheckbox = screen.getByRole('checkbox')
    fireEvent.click(ownershipCheckbox)

    // 4. Advance to Step 2
    fireEvent.click(screen.getByRole('button', { name: /Continue to collateral/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Collateral and contract terms/i)).toBeInTheDocument()
      expect(screen.getByText(/Phone collateral/i)).toBeInTheDocument()
      expect(screen.getByText(/Phone valuation and contract terms/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Enter valuation details/i })).toBeInTheDocument()
    })

    // Verify term selector radiogroup and radio items
    const termRadiogroup = screen.getByRole('radiogroup', { name: /Pawn term/i })
    expect(termRadiogroup).toBeInTheDocument()
    const termRadios = screen.getAllByRole('radio')
    expect(termRadios).toHaveLength(4)
    const oneWeekRadio = screen.getByRole('radio', { name: /1 Week/i })
    expect(oneWeekRadio).toHaveAttribute('aria-checked', 'true')

    // Keyboard navigation between term radios (1 Week -> Half Month)
    fireEvent.keyDown(oneWeekRadio, { key: 'ArrowRight' })
    const halfMonthRadio = screen.getByRole('radio', { name: /Half Month/i })
    expect(halfMonthRadio).toHaveAttribute('aria-checked', 'true')

    // 5. Back button returns to Step 1
    fireEvent.click(screen.getByRole('button', { name: /Back/i }))
    expect(screen.getByLabelText(/Step 1 of 2: Customer verification/i)).toBeInTheDocument()

    // 6. Close and reopen resets to Step 1
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'pawn' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByLabelText(/Step 1 of 2: Customer verification/i)).toBeInTheDocument()
    })
  })

  it('handles long customer names, device strings, large KHR and USD amounts, and multi-clause errors safely', async () => {
    const longName = 'Sokha Chandravuthy International Trading Representative'
    const longAddress = 'Building 128, Street 608, Sangkat Boeung Kak II, Khan Toul Kork, Phnom Penh, Cambodia'
    const mockCustomers = [
      { _id: 'cust-long-1', name: longName, phone: '012 345 678', nationalIdNumber: '0987654321', active: true },
    ]

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: mockCustomers }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [], suppliers: [], items: [], usdKhr: 4100 }) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'pawn' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Step 1: Select customer with very long name
    const customerSelect = screen.getByRole('combobox')
    fireEvent.change(customerSelect, { target: { value: 'cust-long-1' } })

    // Verify long customer name renders in customer summary
    expect(screen.getByText(longName)).toBeInTheDocument()

    // Test new customer mode with long name and address
    const newTab = screen.getByRole('tab', { name: /New customer/i })
    fireEvent.click(newTab)

    const nameInput = screen.getByPlaceholderText(/Full name/i)
    const addressInput = screen.getByPlaceholderText(/Current address/i)
    fireEvent.change(nameInput, { target: { value: longName } })
    fireEvent.change(addressInput, { target: { value: longAddress } })
    expect(nameInput).toHaveValue(longName)
    expect(addressInput).toHaveValue(longAddress)

    // Switch back to existing customer and confirm ownership
    const existingTab = screen.getByRole('tab', { name: /Existing customer/i })
    fireEvent.click(existingTab)
    fireEvent.change(customerSelect, { target: { value: 'cust-long-1' } })
    fireEvent.click(screen.getByRole('checkbox'))

    // Advance to Step 2
    fireEvent.click(screen.getByRole('button', { name: /Continue to collateral/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Collateral and contract terms/i)).toBeInTheDocument()
    })

    // Step 2: Fill long device details
    const brandInput = screen.getByPlaceholderText(/Apple/i)
    const modelInput = screen.getByPlaceholderText(/iPhone 13 Pro/i)
    const colorInput = screen.getByPlaceholderText(/Blue/i)
    const imeiInput = screen.getByPlaceholderText(/15-digit IMEI/i)

    fireEvent.change(brandInput, { target: { value: 'Apple Authorized Refurbished Device' } })
    fireEvent.change(modelInput, { target: { value: 'iPhone 15 Pro Max International Dual SIM Edition' } })
    fireEvent.change(colorInput, { target: { value: 'Natural Titanium with Custom Protective Finish' } })
    fireEvent.change(imeiInput, { target: { value: '860123456789012' } })

    expect(brandInput).toHaveValue('Apple Authorized Refurbished Device')
    expect(modelInput).toHaveValue('iPhone 15 Pro Max International Dual SIM Edition')
    expect(colorInput).toHaveValue('Natural Titanium with Custom Protective Finish')
    expect(imeiInput).toHaveValue('860123456789012')

    // Switch currency to KHR and enter large KHR values
    const currencySelect = screen.getByRole('combobox', { name: /Valuation currency/i })
    fireEvent.change(currencySelect, { target: { value: 'KHR' } })

    // Enter large resale value in KHR
    const resaleInput = screen.getByRole('textbox', { name: /Resale value \(KHR\)/i })
    fireEvent.change(resaleInput, { target: { value: '999,999,999' } })

    // Verify calculation updates without overflow
    await waitFor(() => {
      // The offer card should show maximum principal text
      expect(screen.getByText(/Recommended maximum principal/i)).toBeInTheDocument()
    })

    // Enter principal in KHR that exceeds maximum to test clamping and warning message
    const principalInput = screen.getByRole('textbox', { name: /Principal \(KHR\)/i })
    fireEvent.change(principalInput, { target: { value: '999,999,999' } })

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Principal capped at/i)
    })

    // Enter a valid large principal within the limit
    fireEvent.change(principalInput, { target: { value: '50,000,000' } })

    await waitFor(() => {
      expect(screen.getByText(/50,000,000 KHR principal/i)).toBeInTheDocument()
    })

    // Fill long contract notes
    const notesInput = screen.getByRole('textbox', { name: /Contract notes/i })
    const longNotes = 'Collateral inspected in shop. Minor cosmetic micro-scratches on frame. Serial verified against customer invoice. Customer requested 1-month term with standard daily fee rate.'
    fireEvent.change(notesInput, { target: { value: longNotes } })
    expect(notesInput).toHaveValue(longNotes)

    // Verify contract summary card values
    expect(screen.getByText(/Calculated due date/i)).toBeInTheDocument()
    expect(screen.getByText(/Total to redeem at due/i)).toBeInTheDocument()
    expect(screen.getByText('Daily pawn fee', { selector: 'span' })).toBeInTheDocument()
  })

  it('preserves Pawn device state across back/forward navigation and submits payload correctly', async () => {
    let capturedPayload: Record<string, unknown> | null = null
    const mockCustomers = [
      { _id: 'cust-pawn-save', name: 'John Doe', phone: '012999888', nationalIdNumber: 'ID-12345', active: true },
    ]

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: mockCustomers }) } as Response
      }
      if (url.includes('/pawns') && init?.method === 'POST') {
        capturedPayload = JSON.parse(String(init.body))
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            pawn: { pawnNo: 'PWN-2026-001', principal: 100, currency: 'USD' },
          }),
        } as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ customers: [], suppliers: [], items: [], usdKhr: 4100 }),
      } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'pawn' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /New pawn contract/i })).toBeInTheDocument()
    })

    // Stepper starts on step 1
    expect(screen.getByLabelText(/Step 1 of 2: Customer verification/i)).toBeInTheDocument()

    // Test SegmentedControl keyboard navigation
    const existingCustomerTab = screen.getByRole('tab', { name: /Existing customer/i })
    const newCustomerTab = screen.getByRole('tab', { name: /New customer/i })
    expect(existingCustomerTab).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(existingCustomerTab, { key: 'ArrowRight' })
    expect(newCustomerTab).toHaveAttribute('aria-selected', 'true')

    // Navigate back to Existing customer
    fireEvent.keyDown(newCustomerTab, { key: 'ArrowLeft' })
    expect(existingCustomerTab).toHaveAttribute('aria-selected', 'true')

    // Select customer
    const customerSelect = screen.getByRole('combobox')
    fireEvent.change(customerSelect, { target: { value: 'cust-pawn-save' } })

    // KeyValueSummary displays customer info
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument()
      expect(screen.getByText('ID-12345')).toBeInTheDocument()
    })

    // Check ownership confirmation
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)

    // Advance to Step 2
    fireEvent.click(screen.getByRole('button', { name: /Continue to collateral/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Collateral and contract terms/i)).toBeInTheDocument()
    })

    // Fill SerializedDeviceFields
    const imeiInput = screen.getByPlaceholderText(/15-digit IMEI/i)
    const brandInput = screen.getByPlaceholderText(/Apple/i)
    const modelInput = screen.getByPlaceholderText(/iPhone 13 Pro/i)
    const storageInput = screen.getByPlaceholderText(/128/i)
    const colorInput = screen.getByPlaceholderText(/Blue/i)

    fireEvent.change(imeiInput, { target: { value: '354123456789012' } })
    fireEvent.change(brandInput, { target: { value: 'Samsung' } })
    fireEvent.change(modelInput, { target: { value: 'Galaxy S23 Ultra' } })
    fireEvent.change(storageInput, { target: { value: '256' } })
    fireEvent.change(colorInput, { target: { value: 'Phantom Black' } })

    // Verify Scanner trigger button exists and can be clicked
    const scanButton = screen.getByRole('button', { name: /Scan IMEI/i })
    expect(scanButton).toBeInTheDocument()
    fireEvent.click(scanButton)
    // Scanner overlay or trigger state is triggered without crash
    expect(scanButton).not.toBeDisabled()

    // Test Back button returns to Step 1
    const backButton = screen.getByRole('button', { name: /Back/i })
    fireEvent.click(backButton)

    await waitFor(() => {
      expect(screen.getByLabelText(/Step 1 of 2: Customer verification/i)).toBeInTheDocument()
    })

    // Advance back to Step 2: verify state was preserved!
    fireEvent.click(screen.getByRole('button', { name: /Continue to collateral/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Collateral and contract terms/i)).toBeInTheDocument()
    })

    expect(screen.getByPlaceholderText(/15-digit IMEI/i)).toHaveValue('354123456789012')
    expect(screen.getByPlaceholderText(/Apple/i)).toHaveValue('Samsung')
    expect(screen.getByPlaceholderText(/iPhone 13 Pro/i)).toHaveValue('Galaxy S23 Ultra')
    expect(screen.getByPlaceholderText(/128/i)).toHaveValue(256)
    expect(screen.getByPlaceholderText(/Blue/i)).toHaveValue('Phantom Black')

    // Provide resale value for calculation
    const resaleInput = screen.getByRole('textbox', { name: /Resale value \(USD\)/i })
    fireEvent.change(resaleInput, { target: { value: '600' } })

    // Enter principal
    const principalInput = screen.getByRole('textbox', { name: /Principal \(USD\)/i })
    fireEvent.change(principalInput, { target: { value: '100' } })

    // Submit the contract
    const submitButton = screen.getByRole('button', { name: /Create pawn contract/i })
    expect(submitButton).not.toBeDisabled()
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(capturedPayload).not.toBeNull()
      expect(capturedPayload?.customer).toBe('cust-pawn-save')
      const itemSnapshot = capturedPayload?.itemSnapshot as Record<string, unknown>
      expect(itemSnapshot?.imei).toBe('354123456789012')
      expect(itemSnapshot?.brand).toBe('Samsung')
      expect(itemSnapshot?.model).toBe('Galaxy S23 Ultra')
      expect(itemSnapshot?.color).toBe('Phantom Black')
      expect(capturedPayload?.principal).toBe(100)
    })
  })

  it('prefills a redeemed phone from the shortcut but still requires confirmation before re-pawn', async () => {
    let capturedPayload: Record<string, unknown> | null = null
    const customer = { _id: 'cust-returning', name: 'Returning Customer', phone: '012999111', nationalIdNumber: 'ID-RETURN', active: true }
    sessionStorage.setItem('phoneflow_last_valuation', JSON.stringify({ eligible: true, currency: 'USD', estimatedValue: 9999 }))

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [customer] }) } as Response
      }
      if (url.includes('/pawns/reuse-status/358901234567890')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            matched: true,
            canReuse: true,
            reason: 'REDEEMED',
            message: 'This phone was previously pawned and can be pawned again',
            item: {
              _id: 'inventory-returning-phone',
              sku: 'PWN-ORIGINAL',
              name: 'Samsung Galaxy S22',
              category: 'PHONE',
              quantity: 0,
              status: 'ARCHIVED',
              sellPrice: 0,
              brand: 'Samsung',
              model: 'Galaxy S22',
              storage: '128GB',
              ram: '8GB',
              color: 'Black',
              imei1: '358901234567890',
            },
            previousPawn: {
              _id: 'pawn-old',
              pawnNo: 'PW-OLD-REDEEMED',
              status: 'REDEEMED',
              redeemedAt: '2026-09-20T00:00:00.000Z',
              customer: { _id: 'cust-old', name: 'Previous Customer' },
            },
          }),
        } as Response
      }
      if (url.includes('/pawns') && init?.method === 'POST') {
        capturedPayload = JSON.parse(String(init.body))
        return {
          ok: true,
          status: 201,
          headers: new Headers(),
          json: async () => ({ pawn: { pawnNo: 'PW-NEW-REPAWN', principal: 100, currency: 'USD' } }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
    })

    renderModalBridge()
    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: {
        kind: 'pawn', repawnImei: '358901234567890', repawnPawnNo: 'PW-OLD-REDEEMED',
        repawnCustomerId: customer._id, repawnCustomerMode: 'EXISTING',
        repawnCustomerName: customer.name, repawnCustomerPhone: customer.phone,
        repawnEstimatedValue: 320, repawnCurrency: 'USD',
      } }))
    })
    await waitFor(() => expect(screen.getByRole('heading', { name: /New pawn contract/i })).toBeInTheDocument())
    expect(screen.getByText(/Re-pawning phone from PW-OLD-REDEEMED/)).toBeInTheDocument()
    expect(screen.getByLabelText('Resale value (USD)')).toHaveValue('320')
    const changeCustomer = screen.getByRole('button', { name: /Change customer/i })
    expect(changeCustomer).toBeInTheDocument()
    expect(changeCustomer).toHaveClass('pawn-change-customer-action')
    expect(changeCustomer.closest('.operation-section-heading')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Verify customer first/i })).toBeDisabled()
    await waitFor(() => expect(screen.getByText(customer.name)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('checkbox', { name: /Customer identity and collateral ownership confirmed/i }))
    await waitFor(() => expect(screen.getByPlaceholderText(/15-digit IMEI/i)).toBeInTheDocument())

    expect(screen.getByPlaceholderText(/15-digit IMEI/i)).toHaveValue('358901234567890')
    expect(screen.queryByText(/Standalone calculator offer imported/i)).not.toBeInTheDocument()
    expect(sessionStorage.getItem('phoneflow_last_valuation')).not.toBeNull()
    await waitFor(() => expect(screen.getByText('Re-pawn this phone?')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText(/15-digit IMEI/i), { target: { value: '358901234567891' } })
    await waitFor(() => expect(screen.getByText(/This IMEI does not match PW-OLD-REDEEMED/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Verify previous phone/i })).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText(/15-digit IMEI/i), { target: { value: '358901234567890' } })
    await waitFor(() => expect(screen.getByText('Re-pawn this phone?')).toBeInTheDocument())
    expect(screen.getByText('PW-OLD-REDEEMED')).toBeInTheDocument()
    expect(screen.queryByText(/Nothing is saved until you create the new contract/i)).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Apple/i)).toHaveValue('Samsung')
    expect(screen.getByPlaceholderText(/iPhone 13 Pro/i)).toHaveValue('Galaxy S22')
    expect(screen.getByRole('button', { name: /Confirm phone re-pawn/i })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /Yes, re-pawn phone/i }))
    expect(screen.getByText('Re-pawn confirmed')).toBeInTheDocument()
    expect(screen.getByText(/previous contract stays closed in history/i)).toBeInTheDocument()
    expect(screen.getByText('Ready')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByText('Re-pawn this phone?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Yes, re-pawn phone/i }))
    expect(screen.getByText('Re-pawn confirmed')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: /Resale value \(USD\)/i }), { target: { value: '600' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Principal \(USD\)/i }), { target: { value: '100' } })
    const submitButton = screen.getByRole('button', { name: /Create pawn contract/i })
    expect(submitButton).not.toBeDisabled()
    fireEvent.click(submitButton)

    await waitFor(() => expect(capturedPayload).not.toBeNull())
    const submittedPayload = capturedPayload as unknown as Record<string, unknown>
    expect(submittedPayload.reuseInventoryItem).toBe('inventory-returning-phone')
    expect((submittedPayload.itemSnapshot as Record<string, unknown>)?.imei).toBe('358901234567890')
  })

  it('supports Purchase workflow with OperationWorkflowStepper, SegmentedControl, and SerializedDeviceFields', async () => {
    const mockSuppliers = [
      { _id: 'sup-1', name: 'Global Tech Wholesale', phone: '011223344', active: true },
    ]

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/suppliers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ suppliers: mockSuppliers }) } as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ customers: [], suppliers: [], items: [], usdKhr: 4100 }),
      } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /^New purchase$/i })).toBeInTheDocument()
    })

    // Workflow stepper is rendered
    expect(screen.getByRole('group', { name: /Purchase progress/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Step 1 of 2: Seller & purchase/i)).toBeInTheDocument()

    // SegmentedControl for seller type
    const supplierTab = screen.getByRole('tab', { name: /Existing supplier/i })
    fireEvent.click(supplierTab)
    expect(supplierTab).toHaveAttribute('aria-selected', 'true')

    // Select the supplier
    const supplierSelect = screen.getByRole('combobox', { name: /Supplier/i })
    fireEvent.change(supplierSelect, { target: { value: 'sup-1' } })

    // Advance to Step 2: Items & payment
    const continueButton = screen.getByRole('button', { name: /Continue to items/i })
    fireEvent.click(continueButton)

    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Items & payment/i)).toBeInTheDocument()
      expect(screen.getByText(/Inventory items/i)).toBeInTheDocument()
      expect(screen.getByText(/Payment settlement/i)).toBeInTheDocument()
    })

    // In Step 2, the phone device form has SerializedDeviceFields
    const imeiInput = screen.getByPlaceholderText(/15-digit IMEI/i)
    const brandInput = screen.getByPlaceholderText(/Apple/i)
    const modelInput = screen.getByPlaceholderText(/iPhone 13 Pro/i)

    fireEvent.change(imeiInput, { target: { value: '861234567890123' } })
    fireEvent.change(brandInput, { target: { value: 'Google' } })
    fireEvent.change(modelInput, { target: { value: 'Pixel 8' } })

    expect(imeiInput).toHaveValue('861234567890123')
    expect(brandInput).toHaveValue('Google')
    expect(modelInput).toHaveValue('Pixel 8')

    // KeyValueSummary renders settlement items
    expect(screen.getByText(/Total amount/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Amount paid/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Balance due/i)).toBeInTheDocument()
    expect(screen.getByText(/Payment status/i)).toBeInTheDocument()

    // Test Back button
    const backButton = screen.getByRole('button', { name: /Back/i })
    fireEvent.click(backButton)

    await waitFor(() => {
      expect(screen.getByLabelText(/Step 1 of 2: Seller & purchase/i)).toBeInTheDocument()
    })

    // Test Cancel closes the modal
    const cancelButton = screen.getByRole('button', { name: /Cancel/i })
    fireEvent.click(cancelButton)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('covers all five seller modes and prevents invalid Step 1 navigation', async () => {
    const mockCustomers = [
      { _id: 'cust-1', name: 'Alice Walker', phone: '012345678', active: true },
    ]
    const mockSuppliers = [
      { _id: 'sup-1', name: 'Apex Wholesale', phone: '088997766', active: true },
    ]

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: mockCustomers }) } as Response
      }
      if (url.includes('/suppliers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ suppliers: mockSuppliers }) } as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ items: [], usdKhr: 4100 }),
      } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /^New purchase$/i })).toBeInTheDocument()
    })

    // 1. Initial WALK_IN mode: Seller name is optional -> Continue succeeds directly even with empty name
    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))
    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Items & payment/i)).toBeInTheDocument()
    })
    // Back to Step 1
    fireEvent.click(screen.getByRole('button', { name: /Back/i }))

    // 2. EXISTING_CUSTOMER mode
    const customerTab = screen.getByRole('tab', { name: /Existing customer/i })
    fireEvent.click(customerTab)
    const customerSelect = screen.getByRole('combobox', { name: /Customer/i })
    fireEvent.change(customerSelect, { target: { value: 'cust-1' } })
    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))
    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Items & payment/i)).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Back/i }))

    // 3. EXISTING_SUPPLIER mode
    const supplierTab = screen.getByRole('tab', { name: /Existing supplier/i })
    fireEvent.click(supplierTab)
    const supplierSelect = screen.getByRole('combobox', { name: /Supplier/i })
    fireEvent.change(supplierSelect, { target: { value: 'sup-1' } })
    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))
    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Items & payment/i)).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Back/i }))

    // 4. NEW_CUSTOMER mode: name + phone required
    const newCustomerTab = screen.getByRole('tab', { name: /New customer/i })
    fireEvent.click(newCustomerTab)
    const newCustNameInput = screen.getByPlaceholderText(/Customer name/i)
    fireEvent.change(newCustNameInput, { target: { value: 'Jane New' } })
    const phoneInput = screen.getByPlaceholderText(/012 345 678/i)
    fireEvent.change(phoneInput, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))
    await waitFor(() => {
      expect(screen.getByText(/Phone number is required for a new customer/i)).toBeInTheDocument()
    })
    fireEvent.change(phoneInput, { target: { value: '012998877' } })
    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))
    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Items & payment/i)).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Back/i }))

    // 5. NEW_SUPPLIER mode: business name required
    const newSupplierTab = screen.getByRole('tab', { name: /New supplier/i })
    fireEvent.click(newSupplierTab)
    const newSuppNameInput = screen.getByPlaceholderText(/Supplier or business name/i)
    fireEvent.change(newSuppNameInput, { target: { value: 'Shenzhen Direct Trade' } })
    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))
    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Items & payment/i)).toBeInTheDocument()
    })
  })

  it('protects against currency reinterpretation by clearing prices and showing notice', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ customers: [], suppliers: [], items: [], usdKhr: 4100 }),
    } as Response)

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Advance to step 2 as walk-in
    fireEvent.change(screen.getByPlaceholderText(/Customer name/i), { target: { value: 'Test Buyer' } })
    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Items & payment/i)).toBeInTheDocument()
    })

    // Enter price and amount paid in USD
    const priceInput = screen.getByRole('textbox', { name: /Unit purchase price \(USD\)/i })
    fireEvent.change(priceInput, { target: { value: '250' } })

    const paidInput = screen.getByRole('textbox', { name: /Amount paid \(USD\)/i })
    fireEvent.change(paidInput, { target: { value: '100' } })

    // Verify USD totals
    expect(screen.getAllByText('$250.00').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('PARTIAL')).toBeInTheDocument()

    // Back to Step 1
    fireEvent.click(screen.getByRole('button', { name: /Back/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/Step 1 of 2: Seller & purchase/i)).toBeInTheDocument()
    })

    // Change currency to KHR
    const currencySelect = screen.getByRole('combobox', { name: /Currency/i })
    fireEvent.change(currencySelect, { target: { value: 'KHR' } })

    // Notice banner is displayed
    expect(screen.getByRole('status')).toHaveTextContent(/Switched to KHR\. Previously entered purchase prices and amount paid were cleared/i)

    // Advance to Step 2 again
    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Items & payment/i)).toBeInTheDocument()
    })

    // Price input is cleared, amount paid is 0, payment status is UNPAID
    const khrPriceInput = screen.getByRole('textbox', { name: /Unit purchase price \(KHR\)/i })
    expect(khrPriceInput).toHaveValue('')
    const khrPaidInput = screen.getByRole('textbox', { name: /Amount paid \(KHR\)/i })
    expect(khrPaidInput).toHaveValue('0')
    expect(screen.getByText('UNPAID')).toBeInTheDocument()
  })

  it('validates positive prices, USD decimals, KHR increments, and payment settlement calculations', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/trades') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ trade: { items: [] } }),
        } as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ customers: [], suppliers: [], items: [], usdKhr: 4100 }),
      } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText(/Customer name/i), { target: { value: 'Buyer' } })
    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Items & payment/i)).toBeInTheDocument()
    })

    const priceInput = screen.getByRole('textbox', { name: /Unit purchase price \(USD\)/i })

    // Fill valid phone fields first
    fireEvent.change(screen.getByPlaceholderText(/15-digit IMEI/i), { target: { value: '354123456789012' } })
    fireEvent.change(screen.getByPlaceholderText(/Apple/i), { target: { value: 'Google' } })
    fireEvent.change(screen.getByPlaceholderText(/iPhone 13 Pro/i), { target: { value: 'Pixel 7' } })
    fireEvent.change(screen.getByPlaceholderText(/128/i), { target: { value: '128' } })
    fireEvent.change(screen.getByPlaceholderText(/Blue/i), { target: { value: 'Obsidian' } })

    // 1. Zero price rejected
    fireEvent.change(priceInput, { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /Complete (required fields|purchase)/i }))
    await waitFor(() => {
      expect(screen.getByText(/Enter a valid unit purchase price greater than zero/i)).toBeInTheDocument()
    })

    // 2. Valid USD price accepts positive values and clears zero error
    fireEvent.change(priceInput, { target: { value: '100.00' } })
    expect(screen.queryByText(/Enter a valid unit purchase price greater than zero/i)).not.toBeInTheDocument()

    // 3. Payment status transitions
    const paidInput = screen.getByRole('textbox', { name: /Amount paid \(USD\)/i })
    fireEvent.change(paidInput, { target: { value: '0' } })
    expect(screen.getByText('UNPAID')).toBeInTheDocument()

    fireEvent.change(paidInput, { target: { value: '40' } })
    expect(screen.getByText('PARTIAL')).toBeInTheDocument()

    fireEvent.change(paidInput, { target: { value: '100' } })
    expect(screen.getByText('PAID')).toBeInTheDocument()

    // 4. Amount paid exceeding total rejected
    fireEvent.change(paidInput, { target: { value: '150' } })
    fireEvent.click(screen.getByRole('button', { name: /Complete (required fields|purchase)/i }))
    await waitFor(() => {
      expect(screen.getByText(/Amount paid cannot exceed the total/i)).toBeInTheDocument()
    })

    // 5. Back to Step 1, switch to KHR (clears entered prices and amounts)
    fireEvent.click(screen.getByRole('button', { name: /Back/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /Currency/i }), { target: { value: 'KHR' } })
    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))

    // Refill KHR price with non-100 increment
    const khrPriceInput = screen.getByRole('textbox', { name: /Unit purchase price \(KHR\)/i })
    fireEvent.change(khrPriceInput, { target: { value: '150' } })
    fireEvent.click(screen.getByRole('button', { name: /Complete (required fields|purchase)/i }))
    await waitFor(() => {
      expect(screen.getAllByText(/Use a whole KHR amount in increments of 100/i).length).toBeGreaterThanOrEqual(1)
    })

    // Valid KHR increment of 100
    fireEvent.change(khrPriceInput, { target: { value: '400,000' } })
    expect(screen.queryByText(/Use a whole KHR amount in increments of 100/i)).not.toBeInTheDocument()
  })

  it('handles all product categories, cleans state on category change, and sanitizes submitted payload', async () => {
    let submittedPayload: Record<string, unknown> | null = null

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/trades') && init?.method === 'POST') {
        submittedPayload = JSON.parse(String(init.body))
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ trade: { items: [] } }),
        } as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ customers: [], suppliers: [], items: [], usdKhr: 4100 }),
      } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Seller: walk in
    fireEvent.change(screen.getByPlaceholderText(/Customer name/i), { target: { value: 'Sokha Seller' } })
    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Items & payment/i)).toBeInTheDocument()
    })

    // Item starts as PHONE: fill phone fields
    fireEvent.change(screen.getByPlaceholderText(/15-digit IMEI/i), { target: { value: '860123456789012' } })
    fireEvent.change(screen.getByPlaceholderText(/Apple/i), { target: { value: 'Apple' } })
    fireEvent.change(screen.getByPlaceholderText(/iPhone 13 Pro/i), { target: { value: 'iPhone 13' } })
    fireEvent.change(screen.getByPlaceholderText(/128/i), { target: { value: '128' } })
    fireEvent.change(screen.getByPlaceholderText(/Blue/i), { target: { value: 'Midnight' } })

    // Change category to TABLET
    fireEvent.click(screen.getByRole('button', { name: /^TABLET$/i }))

    // SerializedDeviceFields for TABLET does NOT have IMEI input
    expect(screen.queryByPlaceholderText(/15-digit IMEI/i)).not.toBeInTheDocument()
    // But Brand, Model, Storage, Color were preserved
    expect(screen.getByPlaceholderText(/Apple/i)).toHaveValue('Apple')
    expect(screen.getByPlaceholderText(/iPhone 13 Pro/i)).toHaveValue('iPhone 13')
    expect(screen.getByPlaceholderText(/128/i)).toHaveValue(128)
    expect(screen.getByPlaceholderText(/Blue/i)).toHaveValue('Midnight')

    // Change category to ACCESSORY
    fireEvent.click(screen.getByRole('button', { name: /^ACCESSORY$/i }))
    // Brand Apple is preserved
    expect(screen.getByPlaceholderText(/Anker/i)).toHaveValue('Apple')
    // Fill required accessory fields
    fireEvent.change(screen.getByPlaceholderText(/USB-C charger/i), { target: { value: '20W USB-C Adapter' } })
    fireEvent.change(screen.getByPlaceholderText(/Optional — generated if empty/i), { target: { value: 'APL-20W-PWR' } })

    // Change category to SPARE_PART
    fireEvent.click(screen.getByRole('button', { name: /^SPARE PART$/i }))
    fireEvent.change(screen.getByPlaceholderText(/OLED display assembly/i), { target: { value: 'iPhone 13 Display' } })
    fireEvent.change(screen.getByPlaceholderText(/iPhone 13, iPhone 13 Pro/i), { target: { value: 'iPhone 13' } })
    fireEvent.change(screen.getByRole('combobox', { name: /OEM quality/i }), { target: { value: 'ORIGINAL' } })

    // Change category to OTHER
    fireEvent.click(screen.getByRole('button', { name: /^OTHER$/i }))
    fireEvent.change(screen.getByPlaceholderText(/Product name/i), { target: { value: 'Microfiber Cleaning Cloth' } })
    fireEvent.change(screen.getByPlaceholderText(/Generated if empty/i), { target: { value: 'OTH-CLOTH-01' } })

    // Set price and submit
    fireEvent.change(screen.getByRole('textbox', { name: /Unit purchase price \(USD\)/i }), { target: { value: '5.00' } })

    fireEvent.click(screen.getByRole('button', { name: /Complete purchase/i }))

    await waitFor(() => {
      expect(submittedPayload).not.toBeNull()
      expect(submittedPayload?.type).toBe('BUY')
      const items = submittedPayload?.items as Array<Record<string, unknown>>
      expect(items).toHaveLength(1)
      expect(items[0].category).toBe('OTHER')
      expect(items[0].name).toBe('Microfiber Cleaning Cloth')
      expect(items[0].sku).toBe('OTH-CLOTH-01')
      expect(items[0].purchasePrice).toBe(5)
      // Assert that hidden incompatible fields from earlier phone/tablet/accessory selections were sanitized
      expect(items[0].imei).toBeUndefined()
      expect(items[0].model).toBeUndefined()
      expect(items[0].storage).toBeUndefined()
      expect(items[0].ram).toBeUndefined()
      expect(items[0].color).toBeUndefined()
      expect(items[0].batteryHealth).toBeUndefined()
      expect(items[0].carrierLock).toBeUndefined()
      expect(items[0].compatibleModels).toBeUndefined()
      expect(items[0].oemQuality).toBeUndefined()
    })
  })

  it('manages new and existing inventory modes, blocks duplicate restock items, and supports multi-item add/remove/collapse', async () => {
    const mockInventory = [
      {
        ...mockInventoryItem,
        _id: 'inv-case-1',
        name: 'Clear Case for iPhone 15',
        sku: 'CASE-CLR-15',
        category: 'ACCESSORY',
        quantity: 20,
      },
    ]

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: mockInventory }) } as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ customers: [], suppliers: [], items: mockInventory, usdKhr: 4100 }),
      } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Advance to Step 2
    fireEvent.change(screen.getByPlaceholderText(/Customer name/i), { target: { value: 'Accessory Vendor' } })
    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Items & payment/i)).toBeInTheDocument()
    })

    // Item 1: Set category to ACCESSORY and mode to EXISTING
    fireEvent.click(screen.getByRole('button', { name: /^ACCESSORY$/i }))
    fireEvent.click(screen.getByRole('button', { name: /Existing product/i }))

    // Select inventory item
    const existingSelect = screen.getByRole('combobox', { name: /Product/i })
    fireEvent.change(existingSelect, { target: { value: 'inv-case-1' } })
    expect(screen.getByText(/Current stock/i)).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: /Unit purchase price \(USD\)/i }), { target: { value: '3.50' } })

    // Add Item 2
    fireEvent.click(screen.getByRole('button', { name: /Add another item/i }))
    expect(screen.getAllByText(/2 items/i).length).toBeGreaterThanOrEqual(1)

    // In Item 2: select ACCESSORY and EXISTING product with the SAME inventory item
    const accessoryButtons = screen.getAllByRole('button', { name: /^ACCESSORY$/i })
    fireEvent.click(accessoryButtons[accessoryButtons.length - 1])

    const existingButtons = screen.getAllByRole('button', { name: /Existing product/i })
    fireEvent.click(existingButtons[existingButtons.length - 1])

    const existingSelects = screen.getAllByRole('combobox', { name: /Product/i })
    fireEvent.change(existingSelects[existingSelects.length - 1], { target: { value: 'inv-case-1' } })

    const priceInputs = screen.getAllByRole('textbox', { name: /Unit purchase price \(USD\)/i })
    fireEvent.change(priceInputs[priceInputs.length - 1], { target: { value: '3.50' } })

    // Submitting with duplicate existing inventory should show duplicate error
    const submitBtn = screen.getByRole('button', { name: /Complete required fields/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText(/Add each existing product only once per purchase/i)).toBeInTheDocument()
      expect(screen.getByText(/This product is already included in the purchase/i)).toBeInTheDocument()
    })

    // Remove item 2
    const removeButtons = screen.getAllByRole('button', { name: /Remove item/i })
    fireEvent.click(removeButtons[removeButtons.length - 1])

    // Duplicate error is resolved
    await waitFor(() => {
      expect(screen.queryByText(/This product is already included in the purchase/i)).not.toBeInTheDocument()
      expect(screen.getAllByText(/1 item/i).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('handles camera IMEI scanner dialog, 15-digit validation, error feedback, and focus restoration', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ customers: [], suppliers: [], items: [], usdKhr: 4100 }),
    } as Response)

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Step 1 -> Step 2
    fireEvent.change(screen.getByPlaceholderText(/Customer name/i), { target: { value: 'Phone Seller' } })
    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Items & payment/i)).toBeInTheDocument()
    })

    // Open scanner via Scan IMEI button
    const scanBtn = screen.getByRole('button', { name: /Scan IMEI/i })
    fireEvent.click(scanBtn)

    // Scanner modal is opened
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Point camera at the IMEI/i })).toBeInTheDocument()
      expect(screen.getByTestId('mock-camera-barcode-reader')).toBeInTheDocument()
    })

    // 1. Simulate short scan (5 digits) -> error feedback
    fireEvent.click(screen.getByRole('button', { name: /Simulate Short Scan/i }))
    await waitFor(() => {
      expect(screen.getByText(/IMEI must contain exactly 15 digits\. The scan returned 5\./i)).toBeInTheDocument()
    })
    // Scanner dialog remains open
    expect(screen.getByRole('heading', { name: /Point camera at the IMEI/i })).toBeInTheDocument()

    // 2. Simulate valid 15-digit scan -> successful insertion & dialog closed
    fireEvent.click(screen.getByRole('button', { name: /Simulate 15-digit Scan/i }))
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /Point camera at the IMEI/i })).not.toBeInTheDocument()
      expect(screen.getByPlaceholderText(/15-digit IMEI/i)).toHaveValue('860123456789012')
    })
  })

  it('transitions to label printing workflow upon successful purchase completion', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/trades') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            trade: {
              items: [
                { inventoryItem: { sku: 'TEST-SKU-99', name: 'Google Pixel 8', imei1: '860123456789012', sellPrice: 500 } },
              ],
            },
          }),
        } as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ customers: [], suppliers: [], items: [], usdKhr: 4100 }),
      } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Step 1
    fireEvent.change(screen.getByPlaceholderText(/Customer name/i), { target: { value: 'Pixel Vendor' } })
    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Items & payment/i)).toBeInTheDocument()
    })

    // Step 2: fill phone item
    fireEvent.change(screen.getByPlaceholderText(/15-digit IMEI/i), { target: { value: '860123456789012' } })
    fireEvent.change(screen.getByPlaceholderText(/Apple/i), { target: { value: 'Google' } })
    fireEvent.change(screen.getByPlaceholderText(/iPhone 13 Pro/i), { target: { value: 'Pixel 8' } })
    fireEvent.change(screen.getByPlaceholderText(/128/i), { target: { value: '128' } })
    fireEvent.change(screen.getByPlaceholderText(/Blue/i), { target: { value: 'Hazel' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Unit purchase price \(USD\)/i }), { target: { value: '350.00' } })

    // Submit purchase
    const submitBtn = screen.getByRole('button', { name: /Complete purchase/i })
    fireEvent.click(submitBtn)

    // Transitions to label prompt
    await waitFor(() => {
      expect(screen.getByText(/Print barcode labels now\?/i)).toBeInTheDocument()
      expect(screen.getByText('Google Pixel 8')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Print later/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Print labels/i })).toBeInTheDocument()
    })

    // Close via Print later
    fireEvent.click(screen.getByRole('button', { name: /Print later/i }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('handles long customer and supplier names, device strings, and large financial numbers safely in purchase', async () => {
    const longName = 'Kingdom of Cambodia Specialized Electronics Import Export International Co., Ltd'
    const longBrand = 'Motorola Solutions International Enterprise Mobility Division'
    const longModel = 'ThinkPhone by Motorola 256GB Dual SIM Enterprise Security Edition'
    const longColor = 'Carbon Black Matte Textured Kevlar Fiber Weave Finish'

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ customers: [], suppliers: [], items: [], usdKhr: 4100 }),
    } as Response)

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Step 1: Switch to KHR currency and enter long seller name
    fireEvent.change(screen.getByPlaceholderText(/Customer name/i), { target: { value: longName } })
    fireEvent.change(screen.getByRole('combobox', { name: /Currency/i }), { target: { value: 'KHR' } })
    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Items & payment/i)).toBeInTheDocument()
    })

    // Fill long device values
    fireEvent.change(screen.getByPlaceholderText(/15-digit IMEI/i), { target: { value: '860123456789012' } })
    fireEvent.change(screen.getByPlaceholderText(/Apple/i), { target: { value: longBrand } })
    fireEvent.change(screen.getByPlaceholderText(/iPhone 13 Pro/i), { target: { value: longModel } })
    fireEvent.change(screen.getByPlaceholderText(/128/i), { target: { value: '256' } })
    fireEvent.change(screen.getByPlaceholderText(/Blue/i), { target: { value: longColor } })

    // Large KHR price: 80,000,000 KHR (~$19,500)
    fireEvent.change(screen.getByRole('textbox', { name: /Unit purchase price \(KHR\)/i }), { target: { value: '80,000,000' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Amount paid \(KHR\)/i }), { target: { value: '40,000,000' } })

    // KeyValueSummary settlement handles large formatted KHR numbers safely
    expect(screen.getAllByText('80,000,000 ៛').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('40,000,000 ៛').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('PARTIAL')).toBeInTheDocument()
  })

  it('renders complete New Sale workflow with independent scroll container, non-scrolling action footer, and product validation', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [mockInventoryItem] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      if (url.includes('/payway/config')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ enabled: false, configured: false }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText(/New sale/i)).toBeInTheDocument()
    })

    // Header close button exists
    expect(screen.getByRole('button', { name: /Close/i })).toBeInTheDocument()

    // Independent scroll container exists
    const scrollContainer = document.querySelector('.sale-form-scroll')
    expect(scrollContainer).toBeInTheDocument()

    // Non-scrolling footer with OperationWorkflowFooter exists
    const footer = document.querySelector('.sale-actions.operation-modal-actions')
    expect(footer).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument()

    // Submit button is disabled before selecting an inventory item
    const submitBtn = screen.getByRole('button', { name: /Select a product first/i })
    expect(submitBtn).toBeDisabled()
    expect(submitBtn).toHaveAttribute('title', 'Choose an inventory product before continuing')

    // Product search stays available without a separate camera scanner button.
    expect(screen.getByRole('combobox', { name: /Inventory item/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Scan item/i })).not.toBeInTheDocument()
  })

  it('supports customer selection, calculates totals & discounts, and validates maximum discount and minimum sell price', async () => {
    const mockCustomers = [
      { _id: 'cust-1', name: 'Bob Smith', phone: '012345678', active: true },
    ]

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: mockCustomers }) } as Response
      }
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [mockInventoryItem] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      if (url.includes('/payway/config')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ enabled: false, configured: false }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Select customer
    const customerSelect = screen.getByLabelText(/Customer/i)
    fireEvent.change(customerSelect, { target: { value: 'cust-1' } })

    // Wait for inventory options to load, then open the picker explicitly.
    await openSaleProductPicker()
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /iPhone 15 Pro Max/i })).toBeInTheDocument()
    })
    const itemSelect = screen.getByLabelText(/Inventory item/i)
    fireEvent.change(itemSelect, { target: { value: 'inv-item-1' } })

    // Selling price displays $1,150.00
    await waitFor(() => {
      expect(screen.getAllByText('$1,150.00').length).toBeGreaterThanOrEqual(1)
    })

    // Provide warranty days
    const warrantyInput = screen.getByPlaceholderText(/Enter days/i)
    fireEvent.change(warrantyInput, { target: { value: '30' } })

    // Maximum discount allowed is unitPrice ($1150) - minUnitPrice ($1100) = $50
    // Try setting discount to $100 -> validation error
    const discountInput = screen.getByPlaceholderText('0.00')
    fireEvent.change(discountInput, { target: { value: '100' } })

    // Submit button should show "Reduce discount" and be disabled
    const discountBtn = screen.getByRole('button', { name: /Reduce discount/i })
    expect(discountBtn).toBeDisabled()

    // Lower discount to $50 -> validation succeeds, submit button becomes "Complete sale"
    fireEvent.change(discountInput, { target: { value: '50' } })
    const submitBtn = screen.getByRole('button', { name: /Complete sale/i })
    expect(submitBtn).toBeEnabled()

    // Total in footer summary should be $1,100.00
    const totalEl = document.querySelector('.sale-total strong')
    expect(totalEl).toHaveTextContent('$1,100.00')
  })

  it('completes cash sale, updates inventory, displays completed sale details, and allows receipt printing', async () => {
    let postTradesPayload: unknown = null
    const receiptHandler = vi.fn()
    window.addEventListener('phoneflow:open-trade-receipt', receiptHandler)

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [mockInventoryItem] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      if (url.includes('/payway/config')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ enabled: false, configured: false }) } as Response
      }
      if (url.includes('/trades') && init?.method === 'POST') {
        postTradesPayload = JSON.parse(String(init.body))
        return {
          ok: true,
          status: 201,
          headers: new Headers(),
          json: async () => ({
            trade: {
              _id: 'trade-123',
              tradeNo: 'SL-2026-0088',
              type: 'SELL',
              status: 'COMPLETED',
              total: 1150,
              amountPaid: 1150,
              balance: 0,
              currency: 'USD',
              items: [{ name: 'iPhone 15 Pro Max', quantity: 1, unitPrice: 1150 }],
              paymentMethod: 'CASH',
            },
          }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
    })

    await openSaleProductPicker()
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /iPhone 15 Pro Max/i })).toBeInTheDocument()
    })

    // Select inventory item
    fireEvent.change(screen.getByLabelText(/Inventory item/i), { target: { value: 'inv-item-1' } })

    // Provide warranty days
    const warrantyInput = screen.getByRole('spinbutton', { name: /warranty period in days/i })
    expect(warrantyInput).toHaveValue(0)
    fireEvent.change(warrantyInput, { target: { value: '0' } })

    const submitBtn = screen.getByRole('button', { name: /Complete sale/i })
    expect(submitBtn).toBeEnabled()
    fireEvent.click(submitBtn)

    // Verify trade POST payload
    await waitFor(() => {
      expect(postTradesPayload).toEqual(
        expect.objectContaining({
          type: 'SELL',
          paymentMethod: 'CASH',
          currency: 'USD',
          amountPaid: 1150,
          amountReceived: 1150,
        }),
      )
    })

    // Verify completion screen
    await waitFor(() => {
      expect(screen.getByText(/Sale saved/i)).toBeInTheDocument()
      expect(screen.getByText(/Payment successful/i)).toBeInTheDocument()
      expect(screen.getByText('SL-2026-0088')).toBeInTheDocument()
    })

    // Print receipt triggers receipt event and closes modal
    const printBtn = screen.getByRole('button', { name: /Print receipt/i })
    fireEvent.click(printBtn)

    await waitFor(() => {
      expect(receiptHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({ reference: 'SL-2026-0088' }),
        }),
      )
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    window.removeEventListener('phoneflow:open-trade-receipt', receiptHandler)
  })

  it('handles KHQR payment flow, deeplink display, manual verification check, and completion', async () => {
    let khqrCreated = false
    let checkCount = 0

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [mockInventoryItem] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      if (url.includes('/payway/config')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ enabled: true, configured: true }) } as Response
      }
      if (url.includes('/payway/khqr') && init?.method === 'POST') {
        khqrCreated = true
        return {
          ok: true,
          status: 201,
          headers: new Headers(),
          json: async () => ({
            transactionId: 'payway-tran-101',
            qrString: '00020101021229370016A0000007270399990106123456520459995303840540411505802KH5911PhoneFlow6010Phnom Penh6304ABCD',
            deeplink: 'abamobilebank://khqr?tran=payway-tran-101',
            amount: 1150,
            currency: 'USD',
          }),
        } as Response
      }
      if (url.includes('/payway/khqr/payway-tran-101/status')) {
        checkCount++
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            approved: checkCount >= 2,
            paymentStatus: checkCount >= 2 ? 'COMPLETED' : 'WAITING',
            paymentStatusCode: checkCount >= 2 ? 0 : 1,
            amount: 1150,
            currency: 'USD',
          }),
        } as Response
      }
      if (url.includes('/trades') && init?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          headers: new Headers(),
          json: async () => ({
            trade: {
              _id: 'trade-khqr-99',
              tradeNo: 'SL-2026-0099',
              type: 'SELL',
              status: 'COMPLETED',
              total: 1150,
              amountPaid: 1150,
              balance: 0,
              currency: 'USD',
              items: [{ name: 'iPhone 15 Pro Max', quantity: 1, unitPrice: 1150 }],
              paymentMethod: 'KHQR',
            },
          }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
    })

    await openSaleProductPicker()
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /iPhone 15 Pro Max/i })).toBeInTheDocument()
    })

    // Select inventory item
    fireEvent.change(screen.getByLabelText(/Inventory item/i), { target: { value: 'inv-item-1' } })

    // Provide warranty days
    fireEvent.change(screen.getByPlaceholderText(/Enter days/i), { target: { value: '0' } })

    // Switch payment method to KHQR
    const khqrBtn = screen.getByRole('button', { name: /Pay with KHQR/i })
    fireEvent.click(khqrBtn)

    // Submit button changes to "Generate KHQR"
    const createKhqrBtn = screen.getByRole('button', { name: /Generate KHQR/i })
    expect(createKhqrBtn).toBeEnabled()
    fireEvent.click(createKhqrBtn)

    // Transitions to KHQR workflow screen
    await waitFor(() => {
      expect(khqrCreated).toBe(true)
      expect(screen.getByText(/Scan to pay/i)).toBeInTheDocument()
    })

    // Check deeplink is displayed
    const mobileLink = screen.getByRole('link', { name: /Open ABA Mobile/i })
    expect(mobileLink).toHaveAttribute('href', 'abamobilebank://khqr?tran=payway-tran-101')

    // Click "Check now" to trigger status check
    const checkBtn = screen.getByRole('button', { name: /Check now/i })
    fireEvent.click(checkBtn)

    // Second check approves payment and transitions to completed state
    await waitFor(() => {
      expect(screen.getByText(/Payment successful/i)).toBeInTheDocument()
      expect(screen.getByText(/ABA KHQR payment/i)).toBeInTheDocument()
    })

    // Click "Done"
    fireEvent.click(screen.getByRole('button', { name: /Done/i }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('prevents duplicate in-flight submissions when Complete purchase is clicked rapidly', async () => {
    let purchasePostCount = 0

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/suppliers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ suppliers: [] }) } as Response
      }
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      if (url.includes('/trades') && init?.method === 'POST') {
        purchasePostCount += 1
        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 80))
        return {
          ok: true,
          status: 201,
          headers: new Headers(),
          json: async () => ({
            trade: {
              _id: 'trade-buy-1',
              tradeNo: 'BY-2026-0001',
              type: 'BUY',
              items: [{ inventoryItem: { _id: 'item-1', name: 'Apple iPhone 13 128GB', barcode: 'PF-001' } }],
            },
          }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText(/New purchase/i)).toBeInTheDocument()
    })

    // Step 1: Walk-in seller
    const sellerInput = screen.getByPlaceholderText(/Customer name/i)
    fireEvent.change(sellerInput, { target: { value: 'Walk-in Alice' } })

    // Advance to Step 2
    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))

    await waitFor(() => {
      expect(screen.getByText(/Inventory items/i)).toBeInTheDocument()
    })

    // Fill device fields
    fireEvent.change(screen.getByPlaceholderText(/Apple/i), { target: { value: 'Apple' } })
    fireEvent.change(screen.getByPlaceholderText(/iPhone 13 Pro/i), { target: { value: 'iPhone 13' } })
    fireEvent.change(screen.getByPlaceholderText(/^128$/), { target: { value: '128' } })
    fireEvent.change(screen.getByPlaceholderText(/Blue/i), { target: { value: 'Midnight' } })
    fireEvent.change(screen.getByPlaceholderText(/15-digit IMEI/i), { target: { value: '123456789012345' } })
    fireEvent.change(screen.getAllByPlaceholderText(/0\.00/i)[0], { target: { value: '450' } })

    // Settle amount paid
    fireEvent.change(screen.getByLabelText(/Amount paid/i), { target: { value: '450' } })

    const form = screen.getByRole('dialog').querySelector('form')!

    // Rapid double-submission
    fireEvent.submit(form)
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText(/Purchase completed/i)).toBeInTheDocument()
    })

    // Must have only sent 1 POST request
    expect(purchasePostCount).toBe(1)
  })

  it('prevents duplicate in-flight submissions when Complete sale is clicked rapidly', async () => {
    let salePostCount = 0

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [mockInventoryItem] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      if (url.includes('/payway/config')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ enabled: false, configured: false }) } as Response
      }
      if (url.includes('/trades') && init?.method === 'POST') {
        salePostCount += 1
        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 80))
        return {
          ok: true,
          status: 201,
          headers: new Headers(),
          json: async () => ({
            trade: {
              _id: 'trade-sale-dup',
              tradeNo: 'SL-2026-0099',
              type: 'SELL',
              status: 'COMPLETED',
              total: 1150,
              amountPaid: 1150,
              balance: 0,
              currency: 'USD',
              items: [{ name: 'iPhone 15 Pro Max', quantity: 1, unitPrice: 1150 }],
              paymentMethod: 'CASH',
            },
          }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
    })

    await openSaleProductPicker()
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /iPhone 15 Pro Max/i })).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText(/Inventory item/i), { target: { value: 'inv-item-1' } })
    fireEvent.change(screen.getByPlaceholderText(/Enter days/i), { target: { value: '0' } })

    const form = screen.getByRole('dialog').querySelector('form')!

    // Rapid double-submission
    fireEvent.submit(form)
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText(/Payment successful/i)).toBeInTheDocument()
    })

    // Must have only sent 1 POST request
    expect(salePostCount).toBe(1)
  })

  it('failed purchase save preserves entered form data, shows error inside dialog, and allows retry', async () => {
    let attempt = 0

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/suppliers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ suppliers: [] }) } as Response
      }
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      if (url.includes('/trades') && init?.method === 'POST') {
        attempt += 1
        if (attempt === 1) {
          return {
            ok: false,
            status: 409,
            headers: new Headers(),
            json: async () => ({ message: 'IMEI 123456789012345 already exists in inventory' }),
          } as Response
        }
        return {
          ok: true,
          status: 201,
          headers: new Headers(),
          json: async () => ({
            trade: {
              _id: 'trade-buy-retry',
              tradeNo: 'BY-2026-0002',
              type: 'BUY',
              items: [{ inventoryItem: { _id: 'item-2', name: 'Apple iPhone 14 128GB', barcode: 'PF-002' } }],
            },
          }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Step 1: Walk-in seller
    const sellerInput = screen.getByPlaceholderText(/Customer name/i)
    fireEvent.change(sellerInput, { target: { value: 'Bob Seller' } })

    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))

    await waitFor(() => {
      expect(screen.getByText(/Inventory items/i)).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText(/Apple/i), { target: { value: 'Apple' } })
    fireEvent.change(screen.getByPlaceholderText(/iPhone 13 Pro/i), { target: { value: 'iPhone 14' } })
    fireEvent.change(screen.getByPlaceholderText(/^128$/), { target: { value: '128' } })
    fireEvent.change(screen.getByPlaceholderText(/Blue/i), { target: { value: 'Blue' } })
    const imeiInput = screen.getByPlaceholderText(/15-digit IMEI/i)
    fireEvent.change(imeiInput, { target: { value: '123456789012345' } })
    fireEvent.change(screen.getAllByPlaceholderText(/0\.00/i)[0], { target: { value: '600' } })
    fireEvent.change(screen.getByLabelText(/Amount paid/i), { target: { value: '600' } })

    const form = screen.getByRole('dialog').querySelector('form')!
    fireEvent.submit(form)

    // First attempt fails: Error displayed inside dialog
    await waitFor(() => {
      expect(screen.getByText(/IMEI 123456789012345 already exists in inventory/i)).toBeInTheDocument()
    })

    // Dialog must remain open
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()

    // Form inputs must be preserved!
    expect(screen.getByPlaceholderText(/iPhone 13 Pro/i)).toHaveValue('iPhone 14')
    expect(screen.getByPlaceholderText(/15-digit IMEI/i)).toHaveValue('123456789012345')

    // Correct the conflicting IMEI
    fireEvent.change(screen.getByPlaceholderText(/15-digit IMEI/i), { target: { value: '123456789012346' } })

    // Retry submission
    fireEvent.submit(form)

    // Second attempt succeeds and transitions to label view
    await waitFor(() => {
      expect(screen.getByText(/Purchase completed/i)).toBeInTheDocument()
    })
  })

  it('failed sale save preserves entered form data, shows error inside dialog, and allows retry', async () => {
    let attempt = 0

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [mockInventoryItem] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      if (url.includes('/payway/config')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ enabled: false, configured: false }) } as Response
      }
      if (url.includes('/trades') && init?.method === 'POST') {
        attempt += 1
        if (attempt === 1) {
          return {
            ok: false,
            status: 409,
            headers: new Headers(),
            json: async () => ({ message: 'This item is no longer available in stock' }),
          } as Response
        }
        return {
          ok: true,
          status: 201,
          headers: new Headers(),
          json: async () => ({
            trade: {
              _id: 'trade-sale-retry',
              tradeNo: 'SL-2026-0100',
              type: 'SELL',
              status: 'COMPLETED',
              total: 1100,
              amountPaid: 1100,
              balance: 0,
              currency: 'USD',
              items: [{ name: 'iPhone 15 Pro Max', quantity: 1, unitPrice: 1150 }],
              paymentMethod: 'CASH',
            },
          }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
    })

    await openSaleProductPicker()
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /iPhone 15 Pro Max/i })).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText(/Inventory item/i), { target: { value: 'inv-item-1' } })
    fireEvent.change(screen.getByPlaceholderText(/Enter days/i), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText(/Discount/i), { target: { value: '50' } })

    const form = screen.getByRole('dialog').querySelector('form')!
    fireEvent.submit(form)

    // First attempt fails: Error displayed inside dialog
    await waitFor(() => {
      expect(screen.getByText(/This item is no longer available in stock/i)).toBeInTheDocument()
    })

    // Dialog remains open
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Form inputs preserved
    expect(screen.getByPlaceholderText(/Enter days/i)).toHaveValue(30)
    expect(screen.getByLabelText(/Discount/i)).toHaveValue('50')

    // Retry submission
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText(/Payment successful/i)).toBeInTheDocument()
    })
  })

  it('dispatches customer and supplier updated events when new profiles are created during purchase', async () => {
    const customerUpdatedHandler = vi.fn()
    const supplierUpdatedHandler = vi.fn()
    window.addEventListener('phoneflow:customers-updated', customerUpdatedHandler)
    window.addEventListener('phoneflow:suppliers-updated', supplierUpdatedHandler)

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/suppliers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ suppliers: [] }) } as Response
      }
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      if (url.includes('/trades') && init?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          headers: new Headers(),
          json: async () => ({
            trade: {
              _id: 'trade-buy-newcust',
              tradeNo: 'BY-2026-0003',
              type: 'BUY',
              items: [{ inventoryItem: { _id: 'item-3', name: 'Apple iPhone 12 64GB', barcode: 'PF-003' } }],
            },
          }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Step 1: Select NEW_CUSTOMER seller
    fireEvent.click(screen.getByRole('tab', { name: /New customer/i }))
    fireEvent.change(screen.getByPlaceholderText(/Customer name/i), { target: { value: 'New Customer Dara' } })
    fireEvent.change(screen.getByPlaceholderText(/012 345 678/i), { target: { value: '012987654' } })

    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))

    await waitFor(() => {
      expect(screen.getByText(/Inventory items/i)).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText(/Apple/i), { target: { value: 'Apple' } })
    fireEvent.change(screen.getByPlaceholderText(/iPhone 13 Pro/i), { target: { value: 'iPhone 12' } })
    fireEvent.change(screen.getByPlaceholderText(/^128$/), { target: { value: '64' } })
    fireEvent.change(screen.getByPlaceholderText(/Blue/i), { target: { value: 'Black' } })
    fireEvent.change(screen.getByPlaceholderText(/15-digit IMEI/i), { target: { value: '987654321098765' } })
    fireEvent.change(screen.getAllByPlaceholderText(/0\.00/i)[0], { target: { value: '300' } })
    fireEvent.change(screen.getByLabelText(/Amount paid/i), { target: { value: '300' } })

    const form = screen.getByRole('dialog').querySelector('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText(/Purchase completed/i)).toBeInTheDocument()
    })

    // phoneflow:customers-updated must have been dispatched
    expect(customerUpdatedHandler).toHaveBeenCalled()

    window.removeEventListener('phoneflow:customers-updated', customerUpdatedHandler)
    window.removeEventListener('phoneflow:suppliers-updated', supplierUpdatedHandler)
  })

  it('guards pawn creation against rapid double submission before React rerenders', async () => {
    let postCallCount = 0
    let submittedPawn: Record<string, unknown> | undefined
    let resolvePost: (value: Response) => void
    const postPromise = new Promise<Response>((resolve) => {
      resolvePost = resolve
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/pawns') && method === 'POST') {
        postCallCount++
        submittedPawn = JSON.parse(String(init?.body))
        return postPromise
      }

      if (url.includes('/exchange-rates')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ usdKhr: 4100 }),
        } as Response
      }

      if (url.includes('/customers')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ customers: [] }),
        } as Response
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({}),
      } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'pawn' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Step 1: Fill a walk-in customer without adding them to Customer management
    fireEvent.click(screen.getByRole('tab', { name: /Walk-in customer/i }))
    expect(screen.getByText(/will not be added to Customer management/i)).toBeInTheDocument()
    const walkInNameInput = screen.getByPlaceholderText(/Full name/i)
    expect(walkInNameInput).not.toBeRequired()
    expect(walkInNameInput.closest('label')).toHaveTextContent('Optional')
    fireEvent.change(screen.getByPlaceholderText(/012 345 678/i), { target: { value: '012334455' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Customer identity and collateral ownership confirmed/i }))

    fireEvent.click(screen.getByRole('button', { name: /Continue to collateral/i }))

    await waitFor(() => {
      expect(screen.getByText(/Phone collateral/i)).toBeInTheDocument()
    })

    // Step 2: Fill collateral details
    fireEvent.change(screen.getByPlaceholderText(/15-digit IMEI/i), { target: { value: '354321098765432' } })
    fireEvent.change(screen.getByPlaceholderText(/Apple/i), { target: { value: 'Apple' } })
    fireEvent.change(screen.getByPlaceholderText(/iPhone 13 Pro/i), { target: { value: 'iPhone 15' } })
    fireEvent.change(screen.getByPlaceholderText(/^128$/), { target: { value: '128' } })

    // Fill resale value and principal for valuation
    const resaleInput = screen.getByRole('textbox', { name: /Resale value \(USD\)/i })
    fireEvent.change(resaleInput, { target: { value: '600' } })

    const principalInput = screen.getByRole('textbox', { name: /Principal \(USD\)/i })
    fireEvent.change(principalInput, { target: { value: '100' } })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create pawn contract/i })).not.toBeDisabled()
    })

    const form = screen.getByRole('dialog').querySelector('form')!

    // Rapid double-submission before React rerenders
    act(() => {
      fireEvent.submit(form)
      fireEvent.submit(form)
    })

    // Before submittingPawnRef fix, postCallCount is 2. Must be 1.
    expect(postCallCount).toBe(1)
    expect(submittedPawn).toMatchObject({
      walkInCustomer: true,
      customerDetails: { name: '', phone: '012334455' },
    })
    expect(submittedPawn?.customer).toBeUndefined()

    resolvePost!({
      ok: true,
      status: 201,
      headers: new Headers(),
      json: async () => ({
        pawn: {
          _id: 'pawn-rapid-1',
          pawnNo: 'PW-2026-RAPID',
          principal: 300,
          currency: 'USD',
        },
      }),
    } as Response)

    await waitFor(() => {
      expect(screen.getByText(/Pawn contract created/i)).toBeInTheDocument()
    })
  })

  it('failed pawn creation preserves entered form data, shows error inside dialog, and allows retry', async () => {
    let attempt = 0

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/pawns') && method === 'POST') {
        attempt++
        if (attempt === 1) {
          return {
            ok: false,
            status: 400,
            headers: new Headers(),
            json: async () => ({ message: 'Valuation limit exceeded for this model' }),
          } as Response
        }
        return {
          ok: true,
          status: 201,
          headers: new Headers(),
          json: async () => ({
            pawn: {
              _id: 'pawn-retry-1',
              pawnNo: 'PW-2026-RETRY',
              principal: 100,
              currency: 'USD',
            },
          }),
        } as Response
      }

      if (url.includes('/exchange-rates')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ usdKhr: 4100 }),
        } as Response
      }

      if (url.includes('/customers')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ customers: [] }),
        } as Response
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({}),
      } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'pawn' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Step 1: Fill customer
    fireEvent.click(screen.getByRole('tab', { name: /New customer/i }))
    fireEvent.change(screen.getByPlaceholderText(/Full name/i), { target: { value: 'Retry Pawn Customer' } })
    fireEvent.change(screen.getByPlaceholderText(/012 345 678/i), { target: { value: '012999000' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Customer identity and collateral ownership confirmed/i }))

    fireEvent.click(screen.getByRole('button', { name: /Continue to collateral/i }))

    await waitFor(() => {
      expect(screen.getByText(/Phone collateral/i)).toBeInTheDocument()
    })

    // Step 2: Fill collateral details
    fireEvent.change(screen.getByPlaceholderText(/15-digit IMEI/i), { target: { value: '354321098765432' } })
    fireEvent.change(screen.getByPlaceholderText(/Apple/i), { target: { value: 'Apple' } })
    fireEvent.change(screen.getByPlaceholderText(/iPhone 13 Pro/i), { target: { value: 'iPhone 15' } })
    fireEvent.change(screen.getByPlaceholderText(/^128$/), { target: { value: '128' } })

    const resaleInput = screen.getByRole('textbox', { name: /Resale value \(USD\)/i })
    fireEvent.change(resaleInput, { target: { value: '600' } })

    const principalInput = screen.getByRole('textbox', { name: /Principal \(USD\)/i })
    fireEvent.change(principalInput, { target: { value: '100' } })

    const form = screen.getByRole('dialog').querySelector('form')!
    fireEvent.submit(form)

    // First attempt fails: Error displayed inside active dialog
    await waitFor(() => {
      expect(screen.getByText('Valuation limit exceeded for this model')).toBeInTheDocument()
    })

    // Dialog remains open
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Values preserved
    expect(screen.getByPlaceholderText(/iPhone 13 Pro/i)).toHaveValue('iPhone 15')
    expect(screen.getByPlaceholderText(/15-digit IMEI/i)).toHaveValue('354321098765432')

    // Retry submission: submission guard must be released
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText(/Pawn contract created/i)).toBeInTheDocument()
    })
    expect(attempt).toBe(2)
  })

  it('guards stock adjustment against rapid double submission before React rerenders', async () => {
    let adjustCallCount = 0
    let resolveAdjust: (val: any) => void
    const adjustPromise = new Promise((resolve) => {
      resolveAdjust = resolve
    })

    const sampleItem = {
      ...mockInventoryItem,
      _id: 'inv-item-1',
      name: 'USB-C Cable',
      category: 'ACCESSORY' as const,
      quantity: 10,
      sellPrice: 5,
      status: 'IN_STOCK',
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/inventory') && !url.includes('/adjust')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ items: [sampleItem] }),
        } as Response
      }
      if (url.includes('/adjust')) {
        adjustCallCount++
        await adjustPromise
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ item: { ...sampleItem, quantity: 15 } }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'stock' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('USB-C Cable')).toBeInTheDocument()
    })

    // Select the accessory
    fireEvent.click(screen.getByText('USB-C Cable'))

    // Fill reason
    const reasonSelect = screen.getByRole('combobox')
    fireEvent.change(reasonSelect, { target: { value: 'COUNT_CORRECTION' } })

    const form = screen.getByRole('dialog').querySelector('form')!

    // Rapid double submission within ONE act()
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    // Before submittingStockRef fix, adjustCallCount is 2. Must be 1!
    expect(adjustCallCount).toBe(1)

    // Complete the request
    act(() => {
      resolveAdjust!({})
    })

    await waitFor(() => {
      expect(screen.getByText(/Inventory adjustment saved/i)).toBeInTheDocument()
    })
  })

  it('prevents late requests from a previous operation from overwriting a newly opened operation', async () => {
    let resolveStockInventory: (val: any) => void
    const stockInventoryPromise = new Promise((resolve) => {
      resolveStockInventory = resolve
    })

    const stockItems = [
      { ...mockInventoryItem, _id: 'out-of-stock-1', name: 'Broken Phone', status: 'ARCHIVED', quantity: 0 },
    ]
    const saleItems = [
      { ...mockInventoryItem, _id: 'sale-item-1', name: 'Active iPhone', status: 'IN_STOCK', quantity: 5, sellPrice: 500 },
    ]

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url === '/inventory' || url.endsWith('/inventory')) {
        // Delayed response for stock
        await stockInventoryPromise
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ items: stockItems }),
        } as Response
      }
      if (url.includes('/inventory?status=IN_STOCK')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ items: saleItems }),
        } as Response
      }
      if (url.includes('/customers')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ customers: [] }),
        } as Response
      }
      if (url.includes('/exchange-rates')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ usdKhr: 4100 }),
        } as Response
      }
      if (url.includes('/payway/config')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ enabled: false, configured: false }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    // 1. Open stock modal
    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'stock' } }))
    })

    // 2. Before stock inventory resolves, user switches to sale modal
    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
    })

    await openSaleProductPicker()
    await waitFor(() => {
      expect(screen.getByText(/New sale/i)).toBeInTheDocument()
      expect(screen.getByText(/Active iPhone/)).toBeInTheDocument()
    })

    // 3. Now the delayed stock inventory resolves!
    await act(async () => {
      resolveStockInventory!({})
    })

    // The sale inventory must NOT be overwritten with the out-of-stock items from the stock modal
    expect(screen.getByText(/Active iPhone/)).toBeInTheDocument()
    expect(screen.queryByText(/Broken Phone/)).not.toBeInTheDocument()
  })

  it('handles failed stock adjustment: preserves entered inputs, displays error inside dialog, and allows retry', async () => {
    let attempt = 0
    const sampleItem = {
      ...mockInventoryItem,
      _id: 'inv-item-fail',
      name: 'AirPods Pro',
      category: 'ACCESSORY' as const,
      quantity: 5,
      sellPrice: 200,
      status: 'IN_STOCK',
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/inventory') && !url.includes('/adjust')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ items: [sampleItem] }),
        } as Response
      }
      if (url.includes('/adjust')) {
        attempt++
        if (attempt === 1) {
          return {
            ok: false,
            status: 400,
            headers: new Headers(),
            json: async () => ({ message: 'Database connection failed during adjust' }),
          } as Response
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ item: { ...sampleItem, quantity: 8 } }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'stock' } }))
    })

    await waitFor(() => {
      expect(screen.getByText('AirPods Pro')).toBeInTheDocument()
    })

    // Select accessory
    fireEvent.click(screen.getByText('AirPods Pro'))

    // Change quantity to 3
    const qtyInput = screen.getByRole('dialog').querySelector('input[type="number"]') as HTMLInputElement
    fireEvent.change(qtyInput, { target: { value: '3' } })

    // Select reason
    const reasonSelect = screen.getByRole('combobox')
    fireEvent.change(reasonSelect, { target: { value: 'COUNT_CORRECTION' } })

    // Add note
    const noteInput = screen.getByPlaceholderText(/Explain what was checked or corrected/i)
    fireEvent.change(noteInput, { target: { value: 'Found 3 extra units in drawer' } })

    const form = screen.getByRole('dialog').querySelector('form')!

    // First attempt: Fails
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('Database connection failed during adjust')).toBeInTheDocument()
    })

    // Dialog remains open
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Inputs preserved
    expect(qtyInput).toHaveValue(3)
    expect(reasonSelect).toHaveValue('COUNT_CORRECTION')
    expect(noteInput).toHaveValue('Found 3 extra units in drawer')

    // Second attempt: Retry succeeds
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText(/Inventory adjustment saved/i)).toBeInTheDocument()
    })
    expect(attempt).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: /Done/i }))
  })

  it('supports stock adjustment for serialized phone items: uses STATUS mode and omits quantity', async () => {
    let capturedBody: any = null
    const serializedPhone = {
      ...mockInventoryItem,
      _id: 'phone-inv-1',
      name: 'iPhone 15 Pro Max',
      category: 'PHONE' as const,
      quantity: 1,
      sellPrice: 1100,
      status: 'IN_STOCK',
      imei1: '356789012345678',
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/inventory') && !url.includes('/adjust')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ items: [serializedPhone] }),
        } as Response
      }
      if (url.includes('/adjust')) {
        capturedBody = JSON.parse(String(init?.body || '{}'))
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ item: { ...serializedPhone, status: 'REPAIR' } }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'stock' } }))
    })

    await waitFor(() => {
      expect(screen.getByText('iPhone 15 Pro Max')).toBeInTheDocument()
    })

    // Select phone
    fireEvent.click(screen.getByText('iPhone 15 Pro Max'))

    // Notice that for serialized phone: mode is STATUS, not Add/Remove/Set quantity
    expect(screen.getByText(/Device status/i)).toBeInTheDocument()
    expect(screen.queryByText(/Quantity adjustment/i)).not.toBeInTheDocument()

    // Select 'In repair' status
    const repairOption = screen.getByRole('radio', { name: /In repair/i })
    fireEvent.click(repairOption)

    // Select reason
    const reasonSelect = screen.getByRole('combobox')
    fireEvent.change(reasonSelect, { target: { value: 'DAMAGED' } })

    const form = screen.getByRole('dialog').querySelector('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText(/Inventory adjustment saved/i)).toBeInTheDocument()
      expect(screen.getByText(/Status set to repair/i)).toBeInTheDocument()
    })

    expect(capturedBody).toEqual({
      mode: 'STATUS',
      status: 'REPAIR',
      reason: 'DAMAGED',
      notes: '',
    })
  })

  it('handles scan modal workflow: searches barcode, displays item & related pawn, and triggers Sell this item', async () => {
    const scannedPhone = {
      ...mockInventoryItem,
      _id: 'scanned-phone-1',
      name: 'Samsung Galaxy S24',
      status: 'IN_STOCK',
      quantity: 1,
      sellPrice: 850,
      pricingCurrency: 'USD' as const,
      barcode: '8806091234567',
    }

    const relatedPawn = {
      _id: 'pawn-rel-1',
      pawnNo: 'PW-2026-0099',
      status: 'ACTIVE',
      customer: { _id: 'cust-pawn-1', name: 'Sokha Meng' },
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/inventory/scan/')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ item: scannedPhone, relatedPawn }),
        } as Response
      }
      if (url.includes('/inventory')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ items: [scannedPhone] }),
        } as Response
      }
      if (url.includes('/customers')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ customers: [] }),
        } as Response
      }
      if (url.includes('/exchange-rates')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ usdKhr: 4100 }),
        } as Response
      }
      if (url.includes('/payway/config')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ enabled: false, configured: false }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    // 1. Open scanner modal via PRODUCT_SCANNER_EVENT
    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-scanner'))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText(/^Scan product$/i)).toBeInTheDocument()
    })

    // 2. Type barcode in scanner input and submit
    const codeInput = screen.getByRole('textbox', { name: /Barcode, SKU, IMEI/i })
    fireEvent.change(codeInput, { target: { value: '8806091234567' } })
    fireEvent.submit(codeInput.closest('form')!)

    await waitFor(() => {
      expect(screen.getByText('Samsung Galaxy S24')).toBeInTheDocument()
      expect(screen.getByText(/Linked pawn contract/i)).toBeInTheDocument()
      expect(screen.getByText(/PW-2026-0099/)).toBeInTheDocument()
      expect(screen.getByText(/Sokha Meng/)).toBeInTheDocument()
    })

    // An item still linked to an active pawn cannot enter a new sale.
    const sellButton = screen.getByRole('button', { name: /Sell product/i })
    expect(sellButton).toBeDisabled()
    fireEvent.click(sellButton)
    expect(screen.getByText(/^Scan product$/i)).toBeInTheDocument()
  })

  it('ignores a pending scanner error after switching to another operation', async () => {
    let finish!: (response: Response) => void
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/inventory/scan/')) return new Promise<Response>((resolve) => { finish = resolve })
      return new Response(JSON.stringify({ items: [], customers: [], suppliers: [], usdKhr: 4100 }))
    })
    renderModalBridge()
    act(() => { window.dispatchEvent(new CustomEvent('phoneflow:open-scanner')) })
    const code = screen.getByRole('textbox', { name: /Barcode, SKU, IMEI/i })
    fireEvent.change(code, { target: { value: '1234567890123' } })
    fireEvent.submit(code.closest('form')!)
    act(() => { window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } })) })
    await screen.findByText(/New purchase/i)
    await act(async () => { finish(new Response(JSON.stringify({ message: 'Obsolete scanner error' }), { status: 404 })) })
    expect(screen.queryByText('Obsolete scanner error')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Continue to items/i })).toBeEnabled()
  })

  it('handles label modal workflow: renders label previews, calls printInventoryLabels, or allows Print later', async () => {
    const purchasedItems = [
      {
        ...mockInventoryItem,
        _id: 'label-item-1',
        sku: 'SKU-LBL-1',
        name: 'Case for iPhone 15',
        imei1: '',
        brand: 'Apple',
        model: 'Case',
      },
      {
        ...mockInventoryItem,
        _id: 'label-item-2',
        sku: 'SKU-LBL-2',
        name: 'Screen Protector',
        imei1: '',
        brand: 'Spigen',
        model: 'Glass',
      },
    ]

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/suppliers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ suppliers: [] }) } as Response
      }
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      if (url.includes('/trades')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            trade: {
              tradeNo: 'PO-2026-001',
              items: purchasedItems.map((item) => ({ inventoryItem: item })),
            },
          }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const popupMock = {
      document: {
        open: vi.fn(),
        write: vi.fn(),
        close: vi.fn(),
      },
      focus: vi.fn(),
      print: vi.fn(),
    }
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(popupMock as any)

    renderModalBridge()

    // Open purchase modal
    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Step 1: Walk-in seller details
    fireEvent.change(screen.getByPlaceholderText(/Customer name/i), { target: { value: 'Supplier Walk-in' } })
    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Items & payment/i)).toBeInTheDocument()
    })

    // Step 2: Fill phone item
    fireEvent.change(screen.getByPlaceholderText(/15-digit IMEI/i), { target: { value: '860123456789012' } })
    fireEvent.change(screen.getByPlaceholderText(/Apple/i), { target: { value: 'Apple' } })
    fireEvent.change(screen.getByPlaceholderText(/iPhone 13 Pro/i), { target: { value: 'iPhone 15' } })
    fireEvent.change(screen.getByPlaceholderText(/128/i), { target: { value: '128' } })
    fireEvent.change(screen.getByPlaceholderText(/Blue/i), { target: { value: 'Black' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Unit purchase price \(USD\)/i }), { target: { value: '100.00' } })

    const submitBtn = screen.getByRole('button', { name: /Complete purchase/i })
    fireEvent.click(submitBtn)

    // Transitions to Label modal with items
    await waitFor(() => {
      expect(screen.getByText(/Print barcode labels now\?/i)).toBeInTheDocument()
      expect(screen.getByText('Case for iPhone 15')).toBeInTheDocument()
      expect(screen.getByText('Screen Protector')).toBeInTheDocument()
    })

    // Click "Print labels"
    const printBtn = screen.getByRole('button', { name: /Print labels/i })
    fireEvent.click(printBtn)

    expect(openSpy).toHaveBeenCalledWith('', 'phoneflow-label', 'width=520,height=640')

    // Dialog closes
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('covers KHQR payment state machine: scanned phase, expired error, cancel payment, and enlarged QR modal', async () => {
    let pollCount = 0
    let closeCalled = false

    const saleItem = {
      ...mockInventoryItem,
      _id: 'khqr-item-1',
      name: 'KHQR Demo Phone',
      quantity: 5,
      sellPrice: 350,
      minimumSellPrice: 300,
      pricingCurrency: 'USD' as const,
      status: 'IN_STOCK',
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [saleItem] }) } as Response
      }
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      if (url.includes('/payway/config')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ enabled: true, configured: true }) } as Response
      }
      if (url.includes('/payway/khqr') && !url.includes('/status') && !url.includes('/close')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            transactionId: 'TX-KHQR-999',
            amount: 350,
            currency: 'USD',
            qrImage: '',
            qrString: '00020101021229300012aba.khqr999',
            deeplink: 'https://link.payway.com.kh/khqr-999',
            expiresAt: new Date(Date.now() + 600000).toISOString(),
            environment: 'sandbox',
          }),
        } as Response
      }
      if (url.includes('/payway/khqr/TX-KHQR-999/status')) {
        pollCount++
        if (pollCount === 1) {
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({ approved: false, paymentStatus: 'SCANNED' }),
          } as Response
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ approved: false, paymentStatus: 'EXPIRED' }),
        } as Response
      }
      if (url.includes('/payway/khqr/TX-KHQR-999/close')) {
        closeCalled = true
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ success: true }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
    })

    await openSaleProductPicker()
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText(/KHQR Demo Phone/)).toBeInTheDocument()
    })

    // Select inventory item
    const select = screen.getByRole('combobox', { name: /Inventory item/i })
    fireEvent.change(select, { target: { value: 'khqr-item-1' } })

    // Provide warranty days
    fireEvent.change(screen.getByPlaceholderText(/Enter days/i), { target: { value: '0' } })

    // Select KHQR payment method
    const khqrBtn = screen.getByRole('button', { name: /Pay with KHQR/i })
    fireEvent.click(khqrBtn)

    // Submit sale to generate KHQR
    const generateBtn = screen.getByRole('button', { name: /Generate KHQR/i })
    fireEvent.click(generateBtn)

    // KHQR view is rendered
    await waitFor(() => {
      expect(screen.getByText(/Scan to pay \$350.00/i)).toBeInTheDocument()
      expect(screen.getByText('SANDBOX TEST')).toBeInTheDocument()
    })

    // First check status sets SCANNED
    await waitFor(() => {
      expect(screen.getByText('QR scanned successfully')).toBeInTheDocument()
    })

    // Click "Check now" to trigger second status check -> sets EXPIRED
    const checkNowBtn = screen.getByRole('button', { name: /Check now/i })
    fireEvent.click(checkNowBtn)

    await waitFor(() => {
      expect(screen.getByText('Payment request expired')).toBeInTheDocument()
    })

    // Click payment card to enlarge QR (zoom dialog)
    const zoomCard = screen.getByRole('button', { name: /Enlarge ABA KHQR payment card/i })
    fireEvent.click(zoomCard)

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Enlarged KHQR payment/i })).toBeInTheDocument()
    })

    // Close enlarged QR
    const closeZoomBtn = screen.getByRole('button', { name: /Close enlarged KHQR/i })
    fireEvent.click(closeZoomBtn)

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Enlarged KHQR payment/i })).not.toBeInTheDocument()
    })

    // Cancel payment: calls /payway/khqr/:id/close
    const cancelBtn = screen.getByRole('button', { name: /Cancel payment/i })
    fireEvent.click(cancelBtn)

    await waitFor(() => {
      expect(screen.getAllByText('Payment cancelled').length).toBeGreaterThanOrEqual(1)
    })
    expect(closeCalled).toBe(true)

    // Click "Start another payment" to restart sale form
    const restartBtn = screen.getByRole('button', { name: /Start another payment/i })
    fireEvent.click(restartBtn)

    await waitFor(() => {
      expect(screen.getByText(/New sale/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
  })

  it('dispatches print receipt events and navigation events from completed sale and stock modals', async () => {
    let capturedReceiptDetail: any = null
    const receiptHandler = (event: Event) => {
      capturedReceiptDetail = (event as CustomEvent).detail
    }
    window.addEventListener('phoneflow:open-trade-receipt', receiptHandler)

    const saleItem = {
      ...mockInventoryItem,
      _id: 'sale-receipt-item',
      name: 'Printed iPhone',
      quantity: 3,
      sellPrice: 600,
      minimumSellPrice: 500,
      pricingCurrency: 'USD' as const,
      status: 'IN_STOCK',
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [saleItem] }) } as Response
      }
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      if (url.includes('/payway/config')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ enabled: false, configured: false }) } as Response
      }
      if (url.includes('/trades')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            trade: {
              tradeNo: 'SL-2026-5555',
              total: 600,
              amountPaid: 600,
              balance: 0,
              currency: 'USD',
              items: [{ name: 'Printed iPhone', quantity: 1 }],
            },
          }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
    })

    await openSaleProductPicker()
    await waitFor(() => {
      expect(screen.getByText(/Printed iPhone/)).toBeInTheDocument()
    })

    const select = screen.getByRole('combobox', { name: /Inventory item/i })
    fireEvent.change(select, { target: { value: 'sale-receipt-item' } })

    const form = screen.getByRole('dialog').querySelector('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText(/Payment successful/i)).toBeInTheDocument()
      expect(screen.getByText('SL-2026-5555')).toBeInTheDocument()
    })

    // Click "Print receipt"
    const printReceiptBtn = screen.getByRole('button', { name: /Print receipt/i })
    fireEvent.click(printReceiptBtn)

    await waitFor(() => {
      expect(capturedReceiptDetail).toEqual({
        reference: 'SL-2026-5555',
        currency: 'USD',
        autoPrint: true,
      })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    window.removeEventListener('phoneflow:open-trade-receipt', receiptHandler)
  })

  it('validates pawn step 1 customer info and ownership confirmation before advancing to Step 2', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'pawn' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /New pawn contract/i })).toBeInTheDocument()
    })

    // 1. Without customer or ownership confirmation, clicking continue shows error
    fireEvent.click(screen.getByRole('tab', { name: /New customer/i }))
    const continueBtn = screen.getByRole('button', { name: /Continue to collateral/i })
    fireEvent.click(continueBtn)

    expect(screen.getByText('Name is required')).toBeInTheDocument()
    expect(screen.getByText(/Select a customer and confirm identity and collateral ownership first/i)).toBeInTheDocument()

    // 2. Fill name and phone, but skip ownership checkbox
    fireEvent.change(screen.getByPlaceholderText(/Full name/i), { target: { value: 'Pawn Customer' } })
    fireEvent.change(screen.getByPlaceholderText(/012 345 678/i), { target: { value: '012345678' } })
    fireEvent.click(continueBtn)

    expect(screen.getByText(/Select a customer and confirm identity and collateral ownership first/i)).toBeInTheDocument()

    // 3. Confirm ownership
    const checkbox = screen.getByRole('checkbox', { name: /Customer identity and collateral ownership confirmed/i })
    fireEvent.click(checkbox)

    fireEvent.click(continueBtn)

    // Advances to Step 2
    await waitFor(() => {
      expect(screen.getByText(/Phone collateral/i)).toBeInTheDocument()
    })

    // 4. Clicking "Back" returns to Step 1 with preserved customer name and phone
    const backBtn = screen.getByRole('button', { name: /Back/i })
    fireEvent.click(backBtn)

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Full name/i)).toHaveValue('Pawn Customer')
      expect(screen.getByPlaceholderText(/012 345 678/i)).toHaveValue('012345678')
    })

    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
  })

  it('imports valid calculator valuation snapshot from sessionStorage, sets fields, clears session, and allows ticket printing', async () => {
    let capturedTicketDetail: any = null
    const ticketHandler = (event: Event) => {
      capturedTicketDetail = (event as CustomEvent).detail
    }
    window.addEventListener('phoneflow:open-pawn-ticket', ticketHandler)

    const valuationSnapshot = {
      id: 'VAL-TEST-001',
      eligible: true,
      currency: 'USD',
      estimatedValue: 500,
      marketPrice: 600,
      repairCost: 40,
      ageMonths: 5,
      pawnRate: 45,
      maximumPawn: 250,
      batteryHealth: 92,
      condition: 'excellent',
      lockStatus: 'unlocked',
      accessoriesIncluded: ['BOX', 'CHARGER'],
      calculationMode: 'AUTO',
    }
    sessionStorage.setItem('phoneflow_last_valuation', JSON.stringify(valuationSnapshot))

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      if (url.includes('/pawns') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            pawn: {
              _id: 'pawn-imported-1',
              pawnNo: 'PWN-2026-VAL',
              principal: 250,
              currency: 'USD',
            },
          }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-pawn'))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /New pawn contract/i })).toBeInTheDocument()
    })

    // Step 1: Customer verification
    fireEvent.click(screen.getByRole('tab', { name: /New customer/i }))
    fireEvent.change(screen.getByPlaceholderText(/Full name/i), { target: { value: 'Sok San' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Customer identity and collateral ownership confirmed/i }))

    // Continue to Step 2
    fireEvent.click(screen.getByRole('button', { name: /Continue to collateral/i }))

    await waitFor(() => {
      expect(screen.getByText(/Phone collateral/i)).toBeInTheDocument()
    })

    // Assert valuation was imported and sessionStorage was cleared
    expect(screen.getByText(/Standalone calculator offer imported/i)).toBeInTheDocument()
    expect(sessionStorage.getItem('phoneflow_last_valuation')).toBeNull()

    // Assert battery health was imported
    expect(screen.getByDisplayValue('92')).toBeInTheDocument()

    // Fill collateral info
    fireEvent.change(screen.getByPlaceholderText(/15-digit IMEI/i), { target: { value: '860123456789012' } })
    fireEvent.change(screen.getByPlaceholderText(/Apple/i), { target: { value: 'Apple' } })
    fireEvent.change(screen.getByPlaceholderText(/iPhone 13 Pro/i), { target: { value: 'iPhone 13 Pro' } })
    fireEvent.change(screen.getByPlaceholderText(/128/i), { target: { value: '128' } })
    fireEvent.change(screen.getByPlaceholderText(/Blue/i), { target: { value: 'Sierra Blue' } })

    // Submit pawn contract
    const submitBtn = screen.getByRole('button', { name: /Create pawn contract/i })
    expect(submitBtn).not.toBeDisabled()
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText(/Pawn contract created/i)).toBeInTheDocument()
      expect(screen.getByText('PWN-2026-VAL')).toBeInTheDocument()
    })

    // Print ticket
    const printBtn = screen.getByRole('button', { name: /Print 80mm pawn ticket/i })
    fireEvent.click(printBtn)

    await waitFor(() => {
      expect(capturedTicketDetail).toEqual({ reference: 'PWN-2026-VAL' })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    window.removeEventListener('phoneflow:open-pawn-ticket', ticketHandler)
  })

  it('prints collateral physical label immediately after pawn creation encoding linked item PWN SKU', async () => {
    let capturedPawn: any = null
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      if (url.includes('/pawns') && init?.method === 'POST') {
        const payload = JSON.parse(String(init.body))
        capturedPawn = {
          _id: 'pawn-test-print-1',
          pawnNo: 'PW-2026-TICKET01',
          principal: 300,
          currency: 'USD',
          inventoryItem: {
            _id: 'inv-item-collateral-1',
            sku: 'PWN-20260918-COLLATERAL',
            barcode: 'PWN-20260918-COLLATERAL',
            name: payload.itemSnapshot.name,
            brand: payload.itemSnapshot.brand,
            model: payload.itemSnapshot.model,
            storage: payload.itemSnapshot.storage,
            color: payload.itemSnapshot.color,
            imei1: payload.itemSnapshot.imei,
            sellPrice: 0,
            status: 'PAWNED',
          },
          itemSnapshot: {
            sku: 'PWN-20260918-COLLATERAL',
            name: payload.itemSnapshot.name,
            brand: payload.itemSnapshot.brand,
            model: payload.itemSnapshot.model,
            imei: payload.itemSnapshot.imei,
          },
        }
        return {
          ok: true,
          status: 201,
          headers: new Headers(),
          json: async () => ({ pawn: capturedPawn }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    const valuationSnapshot = {
      id: 'VAL-TEST-PRINT-1',
      eligible: true,
      currency: 'USD',
      estimatedValue: 600,
      marketPrice: 700,
      repairCost: 0,
      ageMonths: 3,
      pawnRate: 45,
      maximumPawn: 300,
      batteryHealth: 95,
      condition: 'excellent',
      lockStatus: 'unlocked',
      accessoriesIncluded: ['BOX', 'CHARGER'],
      calculationMode: 'AUTO',
    }
    sessionStorage.setItem('phoneflow_last_valuation', JSON.stringify(valuationSnapshot))

    const popupMock = {
      document: { open: vi.fn(), write: vi.fn(), close: vi.fn() },
      focus: vi.fn(),
      print: vi.fn(),
    }
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(popupMock as any)

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-pawn'))
    })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /New pawn contract/i })).toBeInTheDocument()
    })

    // Step 1: Customer details & verification
    fireEvent.click(screen.getByRole('tab', { name: /New customer/i }))
    fireEvent.change(screen.getByPlaceholderText(/Full name/i), { target: { value: 'Collateral Owner' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Customer identity and collateral ownership confirmed/i }))
    fireEvent.click(screen.getByRole('button', { name: /Continue to collateral/i }))

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/15-digit IMEI/i)).toBeInTheDocument()
    })

    // Step 2: Collateral & loan details
    fireEvent.change(screen.getByPlaceholderText(/15-digit IMEI/i), { target: { value: '359123456789012' } })
    fireEvent.change(screen.getByPlaceholderText(/Apple/i), { target: { value: 'Apple' } })
    fireEvent.change(screen.getByPlaceholderText(/iPhone 13 Pro/i), { target: { value: 'iPhone 15 Pro' } })
    fireEvent.change(screen.getByPlaceholderText(/128/i), { target: { value: '256' } })
    fireEvent.change(screen.getByPlaceholderText(/Blue/i), { target: { value: 'Black Titanium' } })

    const submitBtn = screen.getByRole('button', { name: /Create pawn contract/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText(/Pawn contract created/i)).toBeInTheDocument()
    })

    // Verify contract number is PW-2026-TICKET01
    expect(screen.getByText('PW-2026-TICKET01')).toBeInTheDocument()

    // Click "Print label"
    const printLabelBtn = screen.getByRole('button', { name: /Print label/i })
    fireEvent.click(printLabelBtn)

    expect(openSpy).toHaveBeenCalledWith('', 'phoneflow-label', 'width=520,height=640')
    const htmlCalls = popupMock.document.write.mock.calls
    expect(htmlCalls.length).toBeGreaterThan(0)
    const labelHtml = htmlCalls[0][0]
    // The physical label must encode and display the PWN SKU, NOT the pawn contract number PW-
    expect(labelHtml).toContain('PWN-20260918-COLLATERAL')
    expect(labelHtml).not.toContain('<p class="scan-value">PW-2026-TICKET01</p>')
  })

  it('handles invalid or ineligible calculator valuation in sessionStorage, displaying error inside dialog', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    // Case 1: Ineligible valuation
    sessionStorage.setItem('phoneflow_last_valuation', JSON.stringify({ eligible: false }))

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-pawn'))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('The calculator valuation could not be imported. Review the contract values before continuing.')).toBeInTheDocument()
    })
    expect(sessionStorage.getItem('phoneflow_last_valuation')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Close/i }))

    // Case 2: KHR valuation with invalid exchange rate (< 1000)
    sessionStorage.setItem('phoneflow_last_valuation', JSON.stringify({ eligible: true, currency: 'KHR', exchangeRate: 400 }))

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-pawn'))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('The calculator valuation could not be imported. Review the contract values before continuing.')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Close/i }))

    // Case 3: Corrupt JSON
    sessionStorage.setItem('phoneflow_last_valuation', '{invalid-json')

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-pawn'))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('The calculator valuation could not be imported. Review the contract values before continuing.')).toBeInTheDocument()
    })
  })

  it('toggles auto-calculate and switches pawn currency with exchange rate recalculation', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4000 }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-pawn'))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Advance to Step 2
    fireEvent.click(screen.getByRole('tab', { name: /New customer/i }))
    fireEvent.change(screen.getByPlaceholderText(/Full name/i), { target: { value: 'Dara Nim' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Customer identity and collateral ownership confirmed/i }))
    fireEvent.click(screen.getByRole('button', { name: /Continue to collateral/i }))

    await waitFor(() => {
      expect(screen.getByText(/Phone collateral/i)).toBeInTheDocument()
    })

    // Check auto calculate toggle
    const toggle = screen.getByRole('switch', { name: /Auto calculate/i })
    expect(toggle).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-checked', 'true')

    // Turn auto calculate off
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    // Turn auto calculate back on
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')

    // Switch currency from USD to KHR
    const currencySelect = screen.getByRole('combobox', { name: /Valuation currency/i })
    fireEvent.change(currencySelect, { target: { value: 'KHR' } })

    // Check that KHR currency is active in valuation
    expect(screen.getByText(/Resale value \(KHR\)/i)).toBeInTheDocument()

    // Switch back to USD
    fireEvent.change(currencySelect, { target: { value: 'USD' } })
    expect(screen.getByText(/Resale value \(USD\)/i)).toBeInTheDocument()
  })

  it('falls back to 4100 exchange rate when /exchange-rates API fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return Promise.reject(new Error('Rate service offline'))
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-pawn'))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('tab', { name: /New customer/i }))
    fireEvent.change(screen.getByPlaceholderText(/Full name/i), { target: { value: 'Rate Fallback Customer' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Customer identity and collateral ownership confirmed/i }))
    fireEvent.click(screen.getByRole('button', { name: /Continue to collateral/i }))

    await waitFor(() => {
      expect(screen.getByText(/1 USD = 4,100 KHR/i)).toBeInTheDocument()
    })
  })

  it('validates and submits multiple non-phone purchase categories (TABLET, ACCESSORY, SPARE_PART)', async () => {
    let capturedPayload: any = null

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/suppliers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ suppliers: [{ _id: 'sup-tech', name: 'Tech Supplies Co', phone: '012999000' }] }) } as Response
      }
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      if (url.includes('/trades') && init?.method === 'POST') {
        capturedPayload = JSON.parse(String(init.body))
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            trade: { _id: 'pur-multi-1', tradeNo: 'TR-BUY-MULTI', type: 'BUY', total: 620, amountPaid: 620, balance: 0, currency: 'USD' },
            items: [],
          }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Step 1: Select supplier
    fireEvent.click(screen.getByRole('tab', { name: /Existing supplier/i }))
    const supplierSelect = screen.getByRole('combobox', { name: /Supplier/i })
    fireEvent.change(supplierSelect, { target: { value: 'sup-tech' } })

    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))

    await waitFor(() => {
      expect(screen.getByText(/Inventory items/i)).toBeInTheDocument()
    })

    // Item 1: Switch to TABLET
    fireEvent.click(screen.getByRole('button', { name: /^TABLET$/i }))
    fireEvent.change(screen.getByPlaceholderText(/Apple/i), { target: { value: 'Apple' } })
    fireEvent.change(screen.getByPlaceholderText(/iPhone 13 Pro/i), { target: { value: 'iPad Pro 11' } })
    fireEvent.change(screen.getByPlaceholderText(/128/i), { target: { value: '256' } })
    fireEvent.change(screen.getByPlaceholderText(/Blue/i), { target: { value: 'Space Gray' } })
    fireEvent.change(screen.getByPlaceholderText(/Generated if empty/i), { target: { value: 'TAB-IPAD-01' } })
    const item1Qty = screen.getByRole('spinbutton', { name: /Quantity/i })
    fireEvent.change(item1Qty, { target: { value: '2' } })
    const item1Price = screen.getByRole('textbox', { name: /Unit purchase price \(USD\)/i })
    fireEvent.change(item1Price, { target: { value: '200.00' } })

    // Add Item 2: ACCESSORY
    fireEvent.click(screen.getByRole('button', { name: /Add another item/i }))
    const accessoryBtn = screen.getByRole('button', { name: /^ACCESSORY$/i })
    fireEvent.click(accessoryBtn)
    fireEvent.change(screen.getByPlaceholderText(/USB-C charger/i), { target: { value: 'Fast GaN Charger' } })
    fireEvent.change(screen.getByPlaceholderText(/Anker/i), { target: { value: 'Anker' } })
    const skuInputs = screen.getAllByPlaceholderText(/Optional — generated if empty/i)
    fireEvent.change(skuInputs[skuInputs.length - 1], { target: { value: 'ACC-ANK-65W' } })
    const item2Qty = screen.getByRole('spinbutton', { name: /Quantity/i })
    fireEvent.change(item2Qty, { target: { value: '5' } })
    const item2Price = screen.getByRole('textbox', { name: /Unit purchase price \(USD\)/i })
    fireEvent.change(item2Price, { target: { value: '20.00' } })

    // Add Item 3: SPARE_PART
    fireEvent.click(screen.getByRole('button', { name: /Add another item/i }))
    const sparePartBtn = screen.getByRole('button', { name: /^SPARE PART$/i })
    fireEvent.click(sparePartBtn)
    fireEvent.change(screen.getByPlaceholderText(/OLED display assembly/i), { target: { value: 'OLED Assembly Screen' } })
    fireEvent.change(screen.getByPlaceholderText(/iPhone 13, iPhone 13 Pro/i), { target: { value: 'iPhone 14' } })
    fireEvent.change(screen.getByRole('combobox', { name: /OEM quality/i }), { target: { value: 'OEM' } })
    const item3Qty = screen.getByRole('spinbutton', { name: /Quantity/i })
    fireEvent.change(item3Qty, { target: { value: '3' } })
    const item3Price = screen.getByRole('textbox', { name: /Unit purchase price \(USD\)/i })
    fireEvent.change(item3Price, { target: { value: '40.00' } })

    // Total: 2 * 200 + 5 * 20 + 3 * 40 = 400 + 100 + 120 = 620
    const paidInput = screen.getByRole('textbox', { name: /Amount paid \(USD\)/i })
    fireEvent.change(paidInput, { target: { value: '620.00' } })

    // Complete purchase
    fireEvent.click(screen.getByRole('button', { name: /Complete purchase/i }))

    await waitFor(() => {
      expect(capturedPayload).not.toBeNull()
    })

    expect(capturedPayload.items).toHaveLength(3)
    expect(capturedPayload.items[0]).toMatchObject({
      category: 'TABLET',
      brand: 'Apple',
      model: 'iPad Pro 11',
      storage: '256',
      color: 'Space Gray',
      sku: 'TAB-IPAD-01',
      quantity: 2,
      purchasePrice: 200,
    })
    expect(capturedPayload.items[1]).toMatchObject({
      category: 'ACCESSORY',
      name: 'Fast GaN Charger',
      brand: 'Anker',
      sku: 'ACC-ANK-65W',
      quantity: 5,
      purchasePrice: 20,
    })
    expect(capturedPayload.items[2]).toMatchObject({
      category: 'SPARE_PART',
      name: 'OLED Assembly Screen',
      compatibleModels: 'iPhone 14',
      oemQuality: 'OEM',
      quantity: 3,
      purchasePrice: 40,
    })
  })

  it('validates restock restrictions for existing inventory and duplicate products', async () => {
    const existingCase = {
      ...mockInventoryItem,
      _id: 'inv-case-existing',
      name: 'Silicone Case Black',
      category: 'ACCESSORY' as const,
      sku: 'ACC-CASE-BLK',
      quantity: 12,
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [existingCase] }) } as Response
      }
      if (url.includes('/suppliers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ suppliers: [] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Step 1: Existing supplier without selection shows error
    fireEvent.click(screen.getByRole('tab', { name: /Existing supplier/i }))
    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))
    expect(screen.getByText('Complete the required seller information')).toBeInTheDocument()

    // Switch to Walk-in customer with name
    fireEvent.click(screen.getByRole('tab', { name: /Walk-in customer/i }))
    fireEvent.change(screen.getByPlaceholderText(/Customer name/i), { target: { value: 'Walk-in Vendor' } })
    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))

    await waitFor(() => {
      expect(screen.getByText(/Inventory items/i)).toBeInTheDocument()
    })

    // Switch to ACCESSORY
    fireEvent.click(screen.getByRole('button', { name: /^ACCESSORY$/i }))

    // Switch to Existing product
    fireEvent.click(screen.getByRole('button', { name: /Existing product.*Increase current quantity/i }))

    // Select existing product
    const productSelect = screen.getByRole('combobox', { name: /Product/i })
    fireEvent.change(productSelect, { target: { value: 'inv-case-existing' } })
    expect(screen.getByText('Current stock')).toBeInTheDocument()

    // Add another item with the SAME existing product
    fireEvent.click(screen.getByRole('button', { name: /Add another item/i }))
    const item2Accessory = screen.getByRole('button', { name: /^ACCESSORY$/i })
    fireEvent.click(item2Accessory)
    const item2Existing = screen.getByRole('button', { name: /Existing product.*Increase current quantity/i })
    fireEvent.click(item2Existing)

    const item2ProductSelect = screen.getByRole('combobox', { name: /Product/i })
    fireEvent.change(item2ProductSelect, { target: { value: 'inv-case-existing' } })

    // Submit form to trigger purchaseAttempted validation
    const form = screen.getByRole('dialog').querySelector('form')!
    fireEvent.submit(form)

    // Error about duplicate product appears
    expect(screen.getByText('This product is already included in the purchase')).toBeInTheDocument()
    expect(screen.getByText('Add each existing product only once per purchase')).toBeInTheDocument()
  })

  it('enforces maximum discount and opens the shared pricing component for saved-price changes', async () => {
    const protectedItem = {
      ...mockInventoryItem,
      _id: 'item-protected-price',
      name: 'Protected Price iPhone',
      category: 'PHONE' as const,
      quantity: 1,
      sellPrice: 800,
      minimumSellPrice: 750,
      khrSellPrice: undefined,
      khrMinimumSellPrice: undefined,
      pricingCurrency: 'USD' as const,
      status: 'IN_STOCK',
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [protectedItem] }) } as Response
      }
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      if (url.includes('/payway/config')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ enabled: false, configured: false }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
    })

    await openSaleProductPicker()
    await waitFor(() => {
      expect(screen.getByText(/Protected Price iPhone/)).toBeInTheDocument()
    })

    const select = screen.getByRole('combobox', { name: /Inventory item/i })
    fireEvent.change(select, { target: { value: 'item-protected-price' } })
    fireEvent.change(screen.getByPlaceholderText(/Enter days/i), { target: { value: '0' } })

    // Max discount is 800 - 750 = $50.00
    // Try to enter discount of $70.00
    const discountInput = screen.getByRole('textbox', { name: /Discount \(USD\)/i })
    fireEvent.change(discountInput, { target: { value: '70.00' } })

    const form = screen.getByRole('dialog').querySelector('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('Discount cannot exceed $50.00')).toBeInTheDocument()
    })

    // Reset the discount. Manual pricing is not offered; saved prices use the shared editor.
    fireEvent.change(discountInput, { target: { value: '0' } })
    const priceGroup = screen.getByRole('group', { name: /Selling price in USD/i })
    expect(within(priceGroup).queryByRole('button', { name: /Enter manually/i })).not.toBeInTheDocument()
    fireEvent.click(within(priceGroup).getByRole('button', { name: /Change price/i }))
    const pricingDialog = await screen.findByRole('dialog', { name: /Change selling price/i })
    expect(within(pricingDialog).getByRole('heading', { name: /Set selling prices/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /New sale/i })).toBeInTheDocument()
  })

  it('validates KHR currency increments for prices, discounts, and amount received', async () => {
    const khrItem = {
      ...mockInventoryItem,
      _id: 'item-khr-unit',
      name: 'KHR Case',
      category: 'ACCESSORY' as const,
      quantity: 5,
      sellPrice: 20000,
      pricingCurrency: 'KHR' as const,
      status: 'IN_STOCK',
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [khrItem] }) } as Response
      }
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      if (url.includes('/payway/config')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ enabled: false, configured: false }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
    })

    await openSaleProductPicker()
    await waitFor(() => {
      expect(screen.getByText(/KHR Case/)).toBeInTheDocument()
    })

    const select = screen.getByRole('combobox', { name: /Inventory item/i })
    fireEvent.change(select, { target: { value: 'item-khr-unit' } })

    // KHR discount with non-100 increment (e.g. 250)
    const discountInput = screen.getByRole('textbox', { name: /Discount \(KHR\)/i })
    fireEvent.change(discountInput, { target: { value: '250' } })

    const form = screen.getByRole('dialog').querySelector('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('KHR prices and discounts must use whole 100 KHR increments')).toBeInTheDocument()
    })

    // Fix discount, enter non-100 amount received
    fireEvent.change(discountInput, { target: { value: '0' } })
    const paidInput = screen.getByRole('textbox', { name: /Amount received \(KHR\)/i })
    fireEvent.change(paidInput, { target: { value: '19850' } })

    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('Amount received must use whole 100 KHR increments')).toBeInTheDocument()
    })
  })

  it('covers KHQR payment failure branches, trade creation failure, cancel errors, and closing in-flight', async () => {
    let khqrStatus = 'WAITING'
    let khqrApproved = false
    let closeCalled = false

    const salePhone = {
      ...mockInventoryItem,
      _id: 'item-khqr-lifecycle',
      name: 'KHQR Lifecycle Phone',
      quantity: 1,
      sellPrice: 1150,
      minimumSellPrice: 1100,
      khrSellPrice: undefined,
      khrMinimumSellPrice: undefined,
      pricingCurrency: 'USD' as const,
      status: 'IN_STOCK',
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [salePhone] }) } as Response
      }
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      if (url.includes('/payway/config')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ enabled: true, configured: true, qrExpiresInSeconds: 120 }) } as Response
      }
      if (url.includes('/payway/khqr/TX-KHQR-LIFE/close')) {
        closeCalled = true
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ success: true }) } as Response
      }
      if (url.includes('/payway/khqr') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            transactionId: 'TX-KHQR-LIFE',
            qrString: 'sample-khqr-string',
            amount: 1150,
            currency: 'USD',
          }),
        } as Response
      }
      if (url.includes('/payway/khqr/TX-KHQR-LIFE/status')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            approved: khqrApproved,
            paymentStatus: khqrStatus,
          }),
        } as Response
      }
      if (url.includes('/trades') && init?.method === 'POST') {
        return {
          ok: false,
          status: 400,
          headers: new Headers(),
          json: async () => ({ message: 'Trade transaction failed' }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
    })

    await openSaleProductPicker()
    await waitFor(() => {
      expect(screen.getByText(/KHQR Lifecycle Phone/)).toBeInTheDocument()
    })

    const select = screen.getByRole('combobox', { name: /Inventory item/i })
    fireEvent.change(select, { target: { value: 'item-khqr-lifecycle' } })
    fireEvent.change(screen.getByPlaceholderText(/Enter days/i), { target: { value: '0' } })

    // Select KHQR
    const khqrBtn = screen.getByRole('button', { name: /Pay with KHQR/i })
    fireEvent.click(khqrBtn)

    // Generate KHQR
    const generateBtn = screen.getByRole('button', { name: /Generate KHQR/i })
    fireEvent.click(generateBtn)

    await waitFor(() => {
      expect(screen.getByText(/Scan to pay \$1150\.00/i)).toBeInTheDocument()
      expect(screen.getByText('Waiting for payment')).toBeInTheDocument()
    })

    // 1. Status is DECLINED
    khqrStatus = 'DECLINED'
    const checkNowBtn = screen.getByRole('button', { name: /Check now/i })
    fireEvent.click(checkNowBtn)

    await waitFor(() => {
      expect(screen.getByText('Payment was not completed')).toBeInTheDocument()
    })

    // 2. Status is approved, but trade creation fails
    khqrStatus = 'PAID'
    khqrApproved = true
    fireEvent.click(screen.getByRole('button', { name: /Check now/i }))

    await waitFor(() => {
      expect(screen.getByText('Unable to verify payment')).toBeInTheDocument()
      expect(screen.getByText('Trade transaction failed')).toBeInTheDocument()
    })

    // 3. Cancel payment: calls /close and transitions to CANCELLED, then Close button closes dialog
    const cancelBtn = screen.getByRole('button', { name: /Cancel payment/i })
    fireEvent.click(cancelBtn)

    await waitFor(() => {
      expect(closeCalled).toBe(true)
      expect(screen.getByRole('button', { name: /^Close$/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /^Close$/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('handles failure when cancelling KHQR payment', async () => {
    const salePhone = {
      ...mockInventoryItem,
      _id: 'item-khqr-cancel-fail',
      name: 'KHQR Cancel Fail Phone',
      quantity: 1,
      sellPrice: 1150,
      minimumSellPrice: 1100,
      khrSellPrice: undefined,
      khrMinimumSellPrice: undefined,
      pricingCurrency: 'USD' as const,
      status: 'IN_STOCK',
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [salePhone] }) } as Response
      }
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      if (url.includes('/payway/config')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ enabled: true, configured: true, qrExpiresInSeconds: 120 }) } as Response
      }
      if (url.includes('/payway/khqr/TX-KHQR-CANCEL-ERR/close')) {
        return {
          ok: false,
          status: 400,
          headers: new Headers(),
          json: async () => ({ message: 'Unable to close this KHQR request' }),
        } as Response
      }
      if (url.includes('/payway/khqr/TX-KHQR-CANCEL-ERR/status')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ approved: false, paymentStatus: 'WAITING' }) } as Response
      }
      if (url.includes('/payway/khqr') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            transactionId: 'TX-KHQR-CANCEL-ERR',
            qrString: 'sample-qr-cancel',
            amount: 1150,
            currency: 'USD',
          }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
    })

    await openSaleProductPicker()
    await waitFor(() => {
      expect(screen.getByText(/KHQR Cancel Fail Phone/)).toBeInTheDocument()
    })

    const select = screen.getByRole('combobox', { name: /Inventory item/i })
    fireEvent.change(select, { target: { value: 'item-khqr-cancel-fail' } })
    fireEvent.change(screen.getByPlaceholderText(/Enter days/i), { target: { value: '0' } })

    fireEvent.click(screen.getByRole('button', { name: /Pay with KHQR/i }))
    fireEvent.click(screen.getByRole('button', { name: /Generate KHQR/i }))

    await waitFor(() => {
      expect(screen.getByText(/Scan to pay \$1150\.00/i)).toBeInTheDocument()
    })

    // Click "Cancel payment"
    const cancelBtn = screen.getByRole('button', { name: /Cancel payment/i })
    fireEvent.click(cancelBtn)

    await waitFor(() => {
      expect(screen.getByText('Unable to close this KHQR request')).toBeInTheDocument()
      expect(screen.getByText('Unable to cancel payment')).toBeInTheDocument()
    })
  })

  it('covers interactive stock adjustment search, modes (ADD, REMOVE, SET), and changing selected item', async () => {
    const item1 = { ...mockInventoryItem, _id: 'item-stk-1', name: 'USB-C Fast Cable', quantity: 10, category: 'ACCESSORY' as const, status: 'IN_STOCK' }
    const item2 = { ...mockInventoryItem, _id: 'item-stk-2', name: 'Lightning Audio Adapter', quantity: 5, category: 'ACCESSORY' as const, status: 'IN_STOCK' }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/inventory') && !url.includes('/adjust')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [item1, item2] }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'stock' } }))
    })

    await waitFor(() => {
      expect(screen.getByText('USB-C Fast Cable')).toBeInTheDocument()
    })

    // 1. Search filter input
    const searchInput = screen.getByPlaceholderText(/Search or scan a product code/i)
    fireEvent.change(searchInput, { target: { value: 'Lightning' } })
    expect(screen.queryByText('USB-C Fast Cable')).not.toBeInTheDocument()
    expect(screen.getByText('Lightning Audio Adapter')).toBeInTheDocument()

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } })
    expect(screen.getByText('USB-C Fast Cable')).toBeInTheDocument()

    // 2. Select item1
    fireEvent.click(screen.getByText('USB-C Fast Cable'))
    expect(screen.getByText('Current quantity')).toBeInTheDocument()

    // 3. Switch adjustment modes: REMOVE, SET, ADD
    const removeModeBtn = screen.getByRole('radio', { name: /Remove/i })
    fireEvent.click(removeModeBtn)
    expect(removeModeBtn).toHaveClass('active')

    const setModeBtn = screen.getByRole('radio', { name: /Set count/i })
    fireEvent.click(setModeBtn)
    expect(setModeBtn).toHaveClass('active')

    const addModeBtn = screen.getByRole('radio', { name: /Add/i })
    fireEvent.click(addModeBtn)
    expect(addModeBtn).toHaveClass('active')

    // 4. Click "Change item" to return to search
    const changeItemBtn = screen.getByRole('button', { name: /Change item/i })
    fireEvent.click(changeItemBtn)

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search or scan a product code/i)).toBeInTheDocument()
    })
  })

  it('covers purchase phone optional details, condition, notes, and sale notes toggle', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/suppliers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ suppliers: [] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Walk in customer name
    fireEvent.change(screen.getByPlaceholderText(/Customer name/i), { target: { value: 'Jane Doe' } })
    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))

    await waitFor(() => {
      expect(screen.getByText(/Inventory items/i)).toBeInTheDocument()
    })

    // Phone item: battery health, carrier lock, accessories checkboxes
    const batteryInput = screen.getByPlaceholderText('88')
    fireEvent.change(batteryInput, { target: { value: '95' } })
    expect(batteryInput).toHaveValue(95)

    const carrierSelect = screen.getByRole('combobox', { name: /Carrier lock/i })
    fireEvent.change(carrierSelect, { target: { value: 'LOCKED' } })
    expect(carrierSelect).toHaveValue('LOCKED')

    // Accessories checkboxes
    const boxCheckbox = screen.getByRole('checkbox', { name: /Box/i })
    const chargerCheckbox = screen.getByRole('checkbox', { name: /Charger/i })
    fireEvent.click(boxCheckbox)
    expect(boxCheckbox).toBeChecked()
    fireEvent.click(chargerCheckbox)
    expect(chargerCheckbox).toBeChecked()
    // Uncheck box
    fireEvent.click(boxCheckbox)
    expect(boxCheckbox).not.toBeChecked()

    // Condition select
    const conditionSelect = screen.getByRole('combobox', { name: /Condition/i })
    fireEvent.change(conditionSelect, { target: { value: 'LIKE_NEW' } })
    expect(conditionSelect).toHaveValue('LIKE_NEW')

    // Notes textarea
    const notesTextarea = screen.getByRole('textbox', { name: /Item notes/i })
    fireEvent.change(notesTextarea, { target: { value: 'Screen protector pre-installed' } })
    expect(notesTextarea).toHaveValue('Screen protector pre-installed')

    // Close purchase and open sale to test sale notes toggle
    fireEvent.click(screen.getByRole('button', { name: /Close/i }))

    const salePhone = {
      ...mockInventoryItem,
      _id: 'sale-note-item',
      name: 'Sale Note Phone',
      quantity: 1,
      sellPrice: 500,
      status: 'IN_STOCK',
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [salePhone] }) } as Response
      }
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      if (url.includes('/payway/config')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ enabled: false, configured: false }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
    })

    await openSaleProductPicker()
    await waitFor(() => {
      expect(screen.getByText(/Sale Note Phone/)).toBeInTheDocument()
    })

    const noteToggleBtn = screen.getByRole('button', { name: /Add sale note/i })
    fireEvent.click(noteToggleBtn)

    const saleNotesTextarea = screen.getByRole('textbox', { name: /Notes/i })
    fireEvent.change(saleNotesTextarea, { target: { value: 'Customer requested quick test' } })
    expect(saleNotesTextarea).toHaveValue('Customer requested quick test')

    // Collapse sale note
    fireEvent.click(screen.getByRole('button', { name: /Sale note/i }))
    expect(screen.queryByRole('textbox', { name: /Notes/i })).not.toBeInTheDocument()
  })

  it('covers pawn valuation inputs: condition, age, lock status, accessories, fee rate, LTV range, and term buttons', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'pawn' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Fill Step 1: Switch to New customer tab
    fireEvent.click(screen.getByRole('tab', { name: /New customer/i }))
    fireEvent.change(screen.getByPlaceholderText(/Full name/i), { target: { value: 'Pawn Customer' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /Continue to collateral/i }))

    await waitFor(() => {
      expect(screen.getByText(/Phone valuation and contract terms/i)).toBeInTheDocument()
    })

    // Physical condition
    const conditionSelect = screen.getByRole('combobox', { name: /Physical condition/i })
    fireEvent.change(conditionSelect, { target: { value: 'LIKE_NEW' } })
    expect(conditionSelect).toHaveValue('LIKE_NEW')
    fireEvent.change(conditionSelect, { target: { value: 'DAMAGED' } })
    expect(conditionSelect).toHaveValue('DAMAGED')

    // Phone age
    const ageInput = screen.getByRole('spinbutton', { name: /Phone age/i })
    fireEvent.change(ageInput, { target: { value: '12' } })
    expect(ageInput).toHaveValue(12)

    // Lock status
    const lockSelect = screen.getByRole('combobox', { name: /Lock status/i })
    fireEvent.change(lockSelect, { target: { value: 'LOCKED' } })
    expect(lockSelect).toHaveValue('LOCKED')

    // Included accessories checkbox toggle
    const earphonesCheckbox = screen.getByRole('checkbox', { name: /Earphones/i })
    fireEvent.click(earphonesCheckbox)
    expect(earphonesCheckbox).toBeChecked()
    fireEvent.click(earphonesCheckbox)
    expect(earphonesCheckbox).not.toBeChecked()

    // Loan to value range slider (40-50%)
    const ltvSlider = screen.getByRole('slider')
    fireEvent.change(ltvSlider, { target: { value: '50' } })
    expect(screen.getByText('50%')).toBeInTheDocument()

    // Daily pawn fee rate input
    const feeRateInput = screen.getByRole('spinbutton', { name: /Daily pawn fee rate/i })
    fireEvent.change(feeRateInput, { target: { value: '3.0' } })
    expect(feeRateInput).toHaveValue(3)

    // Pawn term buttons: 3 Days, 15 Days, 1 Month
    const day3Btn = screen.getByRole('radio', { name: /3 Days/i })
    fireEvent.click(day3Btn)
    expect(day3Btn).toHaveClass('active')

    const day15Btn = screen.getByRole('radio', { name: /Half Month/i })
    fireEvent.click(day15Btn)
    expect(day15Btn).toHaveClass('active')

    const day30Btn = screen.getByRole('radio', { name: /1 Month/i })
    fireEvent.click(day30Btn)
    expect(day30Btn).toHaveClass('active')
  })

  it('maintains visible header, scrollable content, and fixed footer when mobile keyboard resizes visualViewport in pawn workflow', async () => {
    const scrollIntoViewMock = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock

    const listeners: Record<string, () => void> = {}
    const mockViewport = {
      height: 844,
      width: 390,
      offsetTop: 0,
      offsetLeft: 0,
      addEventListener: vi.fn((event: string, cb: () => void) => {
        listeners[event] = cb
      }),
      removeEventListener: vi.fn((event: string) => {
        delete listeners[event]
      }),
    }

    Object.defineProperty(window, 'visualViewport', {
      writable: true,
      configurable: true,
      value: mockViewport,
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ customers: [], suppliers: [], items: [], usdKhr: 4100 }),
      } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'pawn' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /New pawn contract/i })).toBeInTheDocument()
    })

    const backdrop = document.querySelector('.operation-modal-backdrop') as HTMLElement
    expect(backdrop).toBeInTheDocument()
    expect(backdrop.style.getPropertyValue('--operation-viewport-height')).toBe('844px')

    // Switch to New customer tab
    fireEvent.click(screen.getByRole('tab', { name: /New customer/i }))
    const nameInput = screen.getByPlaceholderText(/Full name/i)

    // Focus input and verify scrollIntoView was called
    nameInput.focus()
    fireEvent.focusIn(nameInput)
    await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalled())

    // Simulate mobile keyboard opening: visualViewport height reduces to 380px
    mockViewport.height = 380
    act(() => {
      listeners['resize']?.()
    })

    // Verify modal backdrop updates to remaining visual viewport height
    expect(backdrop.style.getPropertyValue('--operation-viewport-height')).toBe('380px')

    // Header and footer actions remain in document and visible
    expect(screen.getByRole('heading', { name: /New pawn contract/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Close/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument()
    const continueBtn = screen.getByRole('button', { name: /Continue to collateral/i })
    expect(continueBtn).toBeInTheDocument()

    // Type customer name and confirm ownership
    fireEvent.change(nameInput, { target: { value: 'Sokha Mobile' } })
    fireEvent.click(screen.getByRole('checkbox'))

    // Advance to Step 2 under keyboard-sized viewport
    fireEvent.click(continueBtn)

    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Collateral and contract terms/i)).toBeInTheDocument()
    })

    // Step 2 controls remain functional under keyboard viewport
    const imeiInput = screen.getByPlaceholderText(/15-digit IMEI/i)
    imeiInput.focus()
    fireEvent.focusIn(imeiInput)
    expect(scrollIntoViewMock).toHaveBeenCalled()

    // Footer actions in Step 2 include Back and Enter valuation details
    expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Enter valuation details/i })).toBeInTheDocument()

    // Close modal via header Close button
    const closeBtn = screen.getByRole('button', { name: /Close/i })
    fireEvent.click(closeBtn)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('maintains visible header, scrollable content, and fixed footer when mobile keyboard resizes visualViewport in purchase workflow', async () => {
    const scrollIntoViewMock = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock

    const listeners: Record<string, () => void> = {}
    const mockViewport = {
      height: 844,
      width: 390,
      offsetTop: 0,
      offsetLeft: 0,
      addEventListener: vi.fn((event: string, cb: () => void) => {
        listeners[event] = cb
      }),
      removeEventListener: vi.fn((event: string) => {
        delete listeners[event]
      }),
    }

    Object.defineProperty(window, 'visualViewport', {
      writable: true,
      configurable: true,
      value: mockViewport,
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ customers: [], suppliers: [], items: [], usdKhr: 4100 }),
      } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /^New purchase$/i })).toBeInTheDocument()
    })

    const backdrop = document.querySelector('.operation-modal-backdrop') as HTMLElement
    expect(backdrop.style.getPropertyValue('--operation-viewport-height')).toBe('844px')

    // Fill Walk-in seller name
    const sellerInput = screen.getByPlaceholderText(/Customer name/i)
    sellerInput.focus()
    fireEvent.focusIn(sellerInput)

    // Keyboard opens: viewport shrinks to 380px
    mockViewport.height = 380
    act(() => {
      listeners['resize']?.()
    })

    expect(backdrop.style.getPropertyValue('--operation-viewport-height')).toBe('380px')

    fireEvent.change(sellerInput, { target: { value: 'Walk-in seller' } })

    // Step navigation works under keyboard viewport
    const continueBtn = screen.getByRole('button', { name: /Continue to items/i })
    fireEvent.click(continueBtn)

    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Items & payment/i)).toBeInTheDocument()
    })

    // Header and footer actions remain rendered and accessible
    expect(screen.getByRole('heading', { name: /^New purchase$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Close/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Complete required fields/i })).toBeInTheDocument()

    // Dismiss with Escape
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  describe.each([320, 390, 430])('Mobile Pawn Step 1 layout at %ipx width', (width) => {
    it(`renders compact customer summary, redesigned ownership checkbox, clear stepper, and fitting card at ${width}px`, async () => {
      window.innerWidth = width
      const mockViewport = {
        width,
        height: width === 320 ? 568 : 844,
        offsetTop: 0,
        offsetLeft: 0,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }
      Object.defineProperty(window, 'visualViewport', {
        writable: true,
        configurable: true,
        value: mockViewport,
      })

      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            customers: [
              { _id: 'cust-mob-1', name: 'Sok Dara', phone: '012 345 678', nationalIdNumber: '0987654321', active: true },
              { _id: 'cust-mob-2', name: 'Keo Bopha', phone: '', nationalIdNumber: '', active: true },
            ],
            suppliers: [],
            items: [],
            usdKhr: 4100,
          }),
        } as Response
      })

      renderModalBridge()

      act(() => {
        window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'pawn' } }))
      })

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: /New pawn contract/i })).toBeInTheDocument()
      })

      // 1. Step Indicator (Stepper)
      expect(screen.getByLabelText(/Step 1 of 2: Customer verification/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Step 2 of 2: Collateral and contract terms/i)).toBeInTheDocument()
      const stepper = document.querySelector('.operation-workflow-stepper') as HTMLElement
      expect(stepper).toBeInTheDocument()
      const stepItems = stepper.querySelectorAll('.operation-workflow-step')
      expect(stepItems.length).toBe(2)
      expect(stepItems[0].querySelector('span')?.textContent).toBe('1')
      expect(stepItems[1].querySelector('span')?.textContent).toBe('2')

      // 2. Customer verification card fits content
      const card = document.querySelector('.operation-section-card') as HTMLElement
      expect(card).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 3, name: /Customer verification/i })).toBeInTheDocument()

      // 3. Ownership confirmation redesign
      const checkbox = screen.getByRole('checkbox') as HTMLInputElement
      expect(checkbox).toBeInTheDocument()
      expect(checkbox.checked).toBe(false)
      expect(checkbox.getAttribute('aria-describedby')).toBe('pawn-ownership-explanation')

      expect(screen.getByText('Confirm identity and collateral ownership')).toBeInTheDocument()
      expect(screen.getByText('No National ID will be stored.')).toBeInTheDocument()

      const fullExplanation = document.getElementById('pawn-ownership-explanation')
      expect(fullExplanation).toBeInTheDocument()
      expect(fullExplanation?.textContent).toContain('No National ID will be stored. I confirmed ownership using the information and evidence available to the shop.')

      const checkCard = document.querySelector('.pawn-verification-check') as HTMLLabelElement
      expect(checkCard).toBeInTheDocument()
      fireEvent.click(checkCard)
      expect(checkbox.checked).toBe(true)
      fireEvent.click(checkCard)
      expect(checkbox.checked).toBe(false)

      // 4. Customer summary (Existing customer)
      const customerSelect = screen.getByRole('combobox')
      fireEvent.change(customerSelect, { target: { value: 'cust-mob-1' } })

      const summaryCard = document.querySelector('.pawn-customer-summary') as HTMLElement
      expect(summaryCard).toBeInTheDocument()
      expect(summaryCard.getAttribute('role')).toBe('list')
      const summaryItems = summaryCard.querySelectorAll('.key-value-item')
      expect(summaryItems.length).toBe(3)
      expect(summaryItems[0].textContent).toContain('Customer')
      expect(summaryItems[0].textContent).toContain('Sok Dara')
      expect(summaryItems[1].textContent).toContain('Phone')
      expect(summaryItems[1].textContent).toContain('012 345 678')
      expect(summaryItems[2].textContent).toContain('National ID')
      expect(summaryItems[2].textContent).toContain('0987654321')
      expect(screen.getByText('National ID checked.')).toBeInTheDocument()

      fireEvent.change(customerSelect, { target: { value: 'cust-mob-2' } })
      expect(summaryItems[0].textContent).toContain('Keo Bopha')
      expect(summaryItems[1].textContent).toContain('Not recorded')
      expect(summaryItems[2].textContent).toContain('Not provided (optional)')

      // 5. Footer buttons visible and functional
      const continueBtn = screen.getByRole('button', { name: /Continue to collateral/i })
      const cancelBtn = screen.getByRole('button', { name: /Cancel/i })
      expect(continueBtn).toBeInTheDocument()
      expect(cancelBtn).toBeInTheDocument()

      fireEvent.click(continueBtn)
      expect(screen.getByText(/Select a customer and confirm identity and collateral ownership first/i)).toBeInTheDocument()

      fireEvent.click(checkCard)
      expect(checkbox.checked).toBe(true)
      fireEvent.click(continueBtn)

      await waitFor(() => {
        expect(screen.getByLabelText(/Step 2 of 2: Collateral and contract terms/i)).toBeInTheDocument()
        expect(screen.getByRole('heading', { level: 3, name: /Phone collateral/i })).toBeInTheDocument()
      })
    })
  })

  it('handles blank walk-in seller: allows continuing to Step 2 and saves with blank name without creating customer', async () => {
    let savedPayload: any = null
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/trades') && init?.method === 'POST') {
        savedPayload = JSON.parse(String(init.body))
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ trade: { items: [] } }),
        } as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ customers: [], suppliers: [], items: [], usdKhr: 4100 }),
      } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /^New purchase$/i })).toBeInTheDocument()
    })

    // In WALK_IN mode, Seller name input is blank and has Optional indicator
    const sellerInput = screen.getByPlaceholderText(/Customer name/i)
    expect(sellerInput).toHaveValue('')
    expect(screen.getAllByText(/Optional/i).length).toBeGreaterThanOrEqual(1)

    // Continue to items succeeds without required-field error
    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Items & payment/i)).toBeInTheDocument()
    })

    // Fill valid phone fields
    fireEvent.change(screen.getByPlaceholderText(/15-digit IMEI/i), { target: { value: '860123456789012' } })
    fireEvent.change(screen.getByPlaceholderText(/Apple/i), { target: { value: 'Apple' } })
    fireEvent.change(screen.getByPlaceholderText(/iPhone 13 Pro/i), { target: { value: 'iPhone 15' } })
    fireEvent.change(screen.getByPlaceholderText(/128/i), { target: { value: '256' } })
    fireEvent.change(screen.getByPlaceholderText(/Blue/i), { target: { value: 'Black' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Unit purchase price \(USD\)/i }), { target: { value: '240' } })

    // Submit purchase
    fireEvent.click(screen.getByRole('button', { name: /Complete purchase/i }))

    await waitFor(() => {
      expect(savedPayload).not.toBeNull()
    })

    expect(savedPayload.type).toBe('BUY')
    expect(savedPayload.sellerType).toBe('WALK_IN')
    expect(savedPayload.seller).toEqual({ name: '', phone: '', nationalIdNumber: '' })
    expect(savedPayload.customer).toBeUndefined()
    expect(savedPayload.supplier).toBeUndefined()
  })

  it('defaults Amount paid to calculated total, auto-updates when total changes, and preserves manual 0 or partial payments', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ customers: [], suppliers: [], items: [], usdKhr: 4100 }),
    } as Response)

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Advance to Step 2
    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))
    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Items & payment/i)).toBeInTheDocument()
    })

    const priceInput = screen.getByRole('textbox', { name: /Unit purchase price \(USD\)/i })
    const paidInput = screen.getByRole('textbox', { name: /Amount paid \(USD\)/i })

    // 1. Enter $240 price -> Amount paid automatically defaults to 240 and balance is $0
    fireEvent.change(priceInput, { target: { value: '240' } })

    await waitFor(() => {
      expect(paidInput).toHaveValue('240')
      expect(screen.getAllByText('$240.00').length).toBeGreaterThanOrEqual(2)
      expect(screen.getByText('$0.00')).toBeInTheDocument()
      expect(screen.getByText('PAID')).toBeInTheDocument()
    })

    // 2. Change total to $300 -> Amount paid automatically follows because user has not manually edited it
    fireEvent.change(priceInput, { target: { value: '300' } })

    await waitFor(() => {
      expect(paidInput).toHaveValue('300')
      expect(screen.getAllByText('$300.00').length).toBeGreaterThanOrEqual(2)
      expect(screen.getByText('$0.00')).toBeInTheDocument()
    })

    // 3. Manually enter 0 in Amount paid -> preserves 0 and changes payment status to UNPAID
    fireEvent.change(paidInput, { target: { value: '0' } })

    await waitFor(() => {
      expect(paidInput).toHaveValue('0')
      expect(screen.getByText('UNPAID')).toBeInTheDocument()
    })

    // Now change the item price to $400 -> Amount paid MUST remain 0! Not overwritten!
    fireEvent.change(priceInput, { target: { value: '400' } })

    await waitFor(() => {
      expect(paidInput).toHaveValue('0')
      expect(screen.getByText('UNPAID')).toBeInTheDocument()
    })

    // 4. Manually enter partial payment of $150 -> preserves 150 and status PARTIAL
    fireEvent.change(paidInput, { target: { value: '150' } })

    await waitFor(() => {
      expect(paidInput).toHaveValue('150')
      expect(screen.getByText('PARTIAL')).toBeInTheDocument()
    })

    // Change item price to $500 -> Amount paid MUST remain 150! Balance updates to 500 - 150 = $350.00
    fireEvent.change(priceInput, { target: { value: '500' } })

    await waitFor(() => {
      expect(paidInput).toHaveValue('150')
      expect(screen.getByText('$350.00')).toBeInTheDocument()
      expect(screen.getByText('PARTIAL')).toBeInTheDocument()
    })
  })

  it('handles currency changes safely by resetting amount paid auto-sync', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ customers: [], suppliers: [], items: [], usdKhr: 4100 }),
    } as Response)

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Switch to KHR in Step 1
    const currencySelect = screen.getByRole('combobox', { name: /Currency/i })
    fireEvent.change(currencySelect, { target: { value: 'KHR' } })

    // Advance to Step 2
    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))
    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Items & payment/i)).toBeInTheDocument()
    })

    const khrPriceInput = screen.getByRole('textbox', { name: /Unit purchase price \(KHR\)/i })
    const khrPaidInput = screen.getByRole('textbox', { name: /Amount paid \(KHR\)/i })

    // Enter 1,000,000 KHR -> auto-fills 1,000,000 KHR
    fireEvent.change(khrPriceInput, { target: { value: '1000000' } })

    await waitFor(() => {
      expect(khrPaidInput).toHaveValue('1,000,000')
      expect(screen.getAllByText('1,000,000 ៛').length).toBeGreaterThanOrEqual(2)
      expect(screen.getByText('0 ៛')).toBeInTheDocument()
      expect(screen.getByText('PAID')).toBeInTheDocument()
    })

    // Manually enter partial 400,000 KHR
    fireEvent.change(khrPaidInput, { target: { value: '400000' } })

    await waitFor(() => {
      expect(khrPaidInput).toHaveValue('400,000')
      expect(screen.getByText('PARTIAL')).toBeInTheDocument()
      expect(screen.getByText('600,000 ៛')).toBeInTheDocument()
    })
  })

  it('makes SKU optional for a NEW accessory with label and placeholder "Optional — generated if empty", and allows submission with blank SKU', async () => {
    let savedPayload: Record<string, unknown> | null = null
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/trades') && init?.method === 'POST') {
        savedPayload = JSON.parse(String(init.body))
        return {
          ok: true,
          status: 201,
          headers: new Headers(),
          json: async () => ({
            trade: {
              _id: 'trd-acc-1',
              tradeNo: 'BY-2026-001',
              items: [{
                inventoryItem: {
                  _id: 'inv-acc-1',
                  name: 'GaN 65W Fast Charger',
                  category: 'ACCESSORY',
                  sku: 'BUY-20260918-99999',
                  barcode: 'PF-20260918-11111',
                },
              }],
            },
          }),
        } as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ customers: [], suppliers: [], items: [], usdKhr: 4100 }),
      } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Advance to Step 2
    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))
    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Items & payment/i)).toBeInTheDocument()
    })

    // Switch to ACCESSORY
    fireEvent.click(screen.getByRole('button', { name: /^ACCESSORY$/i }))

    // Verify SKU label has "Optional — generated if empty"
    expect(screen.getByText(/Optional — generated if empty/i)).toBeInTheDocument()

    // Verify SKU input has placeholder "Optional — generated if empty" and is not required
    const skuInput = screen.getByPlaceholderText(/Optional — generated if empty/i)
    expect(skuInput).not.toBeRequired()
    expect(skuInput).toHaveValue('')

    // Fill only Item name, Brand, and Price (leave SKU blank)
    fireEvent.change(screen.getByPlaceholderText(/USB-C charger/i), { target: { value: 'GaN 65W Fast Charger' } })
    fireEvent.change(screen.getByPlaceholderText(/Anker/i), { target: { value: 'Baseus' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Unit purchase price \(USD\)/i }), { target: { value: '18.00' } })

    // Submit purchase
    fireEvent.click(screen.getByRole('button', { name: /Complete purchase/i }))

    await waitFor(() => {
      expect(savedPayload).not.toBeNull()
    })

    expect((savedPayload as any).items[0].category).toBe('ACCESSORY')
    expect((savedPayload as any).items[0].name).toBe('GaN 65W Fast Charger')
    expect((savedPayload as any).items[0].brand).toBe('Baseus')
    expect((savedPayload as any).items[0].sku).toBeUndefined()

    // Barcode label preview is displayed with the generated SKU
    await waitFor(() => {
      expect(screen.getByText(/Print barcode labels now\?/i)).toBeInTheDocument()
      expect(screen.getByText('BUY-20260918-99999')).toBeInTheDocument()
    })
  })

  it('preserves owner-supplied SKU for NEW accessory and displays it on barcode label preview', async () => {
    let savedPayload: Record<string, unknown> | null = null
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/trades') && init?.method === 'POST') {
        savedPayload = JSON.parse(String(init.body))
        return {
          ok: true,
          status: 201,
          headers: new Headers(),
          json: async () => ({
            trade: {
              _id: 'trd-acc-2',
              tradeNo: 'BY-2026-002',
              items: [{
                inventoryItem: {
                  _id: 'inv-acc-2',
                  name: 'Spigen Tough Armor',
                  category: 'ACCESSORY',
                  sku: 'SPG-TA-15P',
                  barcode: 'PF-20260918-22222',
                },
              }],
            },
          }),
        } as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ customers: [], suppliers: [], items: [], usdKhr: 4100 }),
      } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Advance to Step 2
    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))
    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Items & payment/i)).toBeInTheDocument()
    })

    // Switch to ACCESSORY
    fireEvent.click(screen.getByRole('button', { name: /^ACCESSORY$/i }))

    // Fill Item name, Brand, Owner-supplied SKU, and Price
    fireEvent.change(screen.getByPlaceholderText(/USB-C charger/i), { target: { value: 'Spigen Tough Armor' } })
    fireEvent.change(screen.getByPlaceholderText(/Anker/i), { target: { value: 'Spigen' } })
    fireEvent.change(screen.getByPlaceholderText(/Optional — generated if empty/i), { target: { value: 'spg-ta-15p' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Unit purchase price \(USD\)/i }), { target: { value: '14.50' } })

    // Submit purchase
    fireEvent.click(screen.getByRole('button', { name: /Complete purchase/i }))

    await waitFor(() => {
      expect(savedPayload).not.toBeNull()
    })

    expect((savedPayload as any).items[0].sku).toBe('SPG-TA-15P')

    // Barcode label preview shows the owner-supplied SKU
    await waitFor(() => {
      expect(screen.getByText(/Print barcode labels now\?/i)).toBeInTheDocument()
      expect(screen.getByText('SPG-TA-15P')).toBeInTheDocument()
    })
  })

  it('displays duplicate SKU error returned by server and keeps form usable on mobile layout', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/trades') && init?.method === 'POST') {
        return {
          ok: false,
          status: 409,
          headers: new Headers(),
          json: async () => ({ message: 'The same SKU appears more than once in this purchase' }),
        } as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ customers: [], suppliers: [], items: [], usdKhr: 4100 }),
      } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'purchase' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))
    await waitFor(() => {
      expect(screen.getByLabelText(/Step 2 of 2: Items & payment/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /^ACCESSORY$/i }))
    fireEvent.change(screen.getByPlaceholderText(/USB-C charger/i), { target: { value: 'Magnetic Stand' } })
    fireEvent.change(screen.getByPlaceholderText(/Anker/i), { target: { value: 'UGREEN' } })
    fireEvent.change(screen.getByPlaceholderText(/Optional — generated if empty/i), { target: { value: 'UGR-STD-01' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Unit purchase price \(USD\)/i }), { target: { value: '12.00' } })

    fireEvent.click(screen.getByRole('button', { name: /Complete purchase/i }))

    await waitFor(() => {
      expect(screen.getByText(/The same SKU appears more than once in this purchase/i)).toBeInTheDocument()
    })

    // Verify modal has proper mobile layout class
    const modal = screen.getByRole('dialog')
    expect(modal).toHaveClass('operation-modal-purchase')
  })

  it('supports Money and Percent discount methods, calculates percent from subtotal, handles quantity changes and resets safely', async () => {
    const mockItem = {
      ...mockInventoryItem,
      _id: 'inv-accessory-1',
      name: 'Anker 65W GaN Charger',
      category: 'ACCESSORY' as const,
      sellPrice: 120,
      minimumSellPrice: 0,
      pricingCurrency: 'USD' as const,
      quantity: 10,
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [mockItem] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      if (url.includes('/payway/config')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ enabled: false, configured: false }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Select product after opening the search picker.
    await openSaleProductPicker()
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Anker 65W GaN Charger/i })).toBeInTheDocument()
    })
    fireEvent.change(screen.getByLabelText(/Inventory item/i), { target: { value: 'inv-accessory-1' } })

    // Defaults to Money method
    const moneyBtn = screen.getByRole('button', { name: /^Money$/i })
    const percentBtn = screen.getByRole('button', { name: /^Percent$/i })
    expect(moneyBtn).toHaveClass('selected')
    expect(percentBtn).not.toHaveClass('selected')
    expect(screen.getByRole('textbox', { name: /Discount \(USD\)/i })).toBeInTheDocument()

    // Change quantity to 2 -> subtotal = 2 * 120 = $240
    const qtyInput = screen.getByLabelText(/Quantity/i)
    fireEvent.change(qtyInput, { target: { value: '2' } })

    // Switch to Percent method
    fireEvent.click(percentBtn)
    expect(percentBtn).toHaveClass('selected')
    expect(moneyBtn).not.toHaveClass('selected')

    // In Percent mode, discount input has label "Discount (%)" and placeholder "0"
    const percentInput = screen.getByRole('spinbutton', { name: /Discount percentage/i })
    expect(percentInput).toHaveValue(0)

    // Apply 10% discount -> 10% of $240 = $24 discount, total = $216
    fireEvent.change(percentInput, { target: { value: '10' } })

    // Displays calculated discount beside input
    const calculatedDiscount = document.querySelector('.sale-calculated-discount')
    expect(calculatedDiscount).toHaveTextContent('− $24.00')

    // Updates footer total immediately
    const totalEl = document.querySelector('.sale-total strong')
    expect(totalEl).toHaveTextContent('$216.00')

    // Updates sale summary immediately
    const summaryEl = document.querySelector<HTMLElement>('.sale-summary-calculation')!
    expect(within(summaryEl).getByText('$240.00')).toBeInTheDocument()
    expect(within(summaryEl).getByText('− $24.00')).toBeInTheDocument()
    expect(within(summaryEl).getAllByText('$216.00').length).toBeGreaterThanOrEqual(2)

    // Changing quantity resets discount to 0
    fireEvent.change(qtyInput, { target: { value: '3' } })
    expect(percentInput).toHaveValue(0)
    expect(document.querySelector('.sale-total strong')).toHaveTextContent('$360.00')

    // Reapply 10% on 3 items ($360 subtotal) -> $36 discount, $324 total
    fireEvent.change(percentInput, { target: { value: '10' } })
    expect(document.querySelector('.sale-calculated-discount')).toHaveTextContent('− $36.00')
    expect(document.querySelector('.sale-total strong')).toHaveTextContent('$324.00')

    // Switching back to Money method resets discount to 0
    fireEvent.click(moneyBtn)
    expect(moneyBtn).toHaveClass('selected')
    expect(percentBtn).not.toHaveClass('selected')
    expect(screen.getByRole('textbox', { name: /Discount \(USD\)/i })).toHaveValue('0')
    expect(document.querySelector('.sale-total strong')).toHaveTextContent('$360.00')
  })

  it('enforces minimum-selling-price protection in percent mode without silently clamping percentage', async () => {
    const mockItem = {
      ...mockInventoryItem,
      _id: 'inv-accessory-min-price',
      name: 'Wireless Earbuds',
      category: 'ACCESSORY' as const,
      sellPrice: 120,
      minimumSellPrice: 100,
      pricingCurrency: 'USD' as const,
      quantity: 5,
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [mockItem] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ enabled: false }) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    await waitFor(() => expect(screen.getByRole('combobox', { name: /Inventory item/i })).not.toBeDisabled())
    fireEvent.focus(screen.getByRole('combobox', { name: /Inventory item/i }))
    await screen.findByRole('option', { name: /Wireless Earbuds/i })
    fireEvent.change(screen.getByLabelText(/Inventory item/i), { target: { value: 'inv-accessory-min-price' } })
    fireEvent.change(screen.getByPlaceholderText(/Enter days/i), { target: { value: '0' } })

    // Qty = 2 -> subtotal = $240, max discount = 2 * (120 - 100) = $40.00
    fireEvent.change(await screen.findByLabelText(/Quantity/i), { target: { value: '2' } })

    // Switch to Percent
    fireEvent.click(screen.getByRole('button', { name: /^Percent$/i }))

    const percentInput = screen.getByRole('spinbutton', { name: /Discount percentage/i })

    // Enter 20% -> 20% of $240 = $48 discount, which exceeds maximum allowed discount of $40
    fireEvent.change(percentInput, { target: { value: '20' } })

    // Percentage value is NOT silently altered or clamped
    expect(percentInput).toHaveValue(20)

    // Shows calculated discount with invalid styling
    const calculatedDiscount = document.querySelector('.sale-calculated-discount')
    expect(calculatedDiscount).toHaveTextContent('− $48.00')
    expect(calculatedDiscount).toHaveClass('invalid')

    // Shows clear validation message
    expect(screen.getByText(/Maximum discount is \$40\.00/i)).toBeInTheDocument()

    // Action button shows "Reduce discount" and is disabled
    const submitBtn = screen.getByRole('button', { name: /Reduce discount/i })
    expect(submitBtn).toBeDisabled()

    // Submitting form directly displays error
    const form = screen.getByRole('dialog').querySelector('form')!
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByText('Discount cannot exceed $40.00')).toBeInTheDocument()
    })

    // Reduce discount to 15% -> 15% of $240 = $36 discount <= $40 -> valid
    fireEvent.change(percentInput, { target: { value: '15' } })
    expect(percentInput).toHaveValue(15)
    expect(screen.getByRole('button', { name: /Complete sale/i })).toBeEnabled()
  })

  it('applies USD cent rounding and KHR 100-riel rounding rules in percent mode', async () => {
    const mockUsdItem = {
      ...mockInventoryItem,
      _id: 'inv-odd-usd',
      name: 'Screen Protector',
      category: 'ACCESSORY' as const,
      sellPrice: 19.99,
      minimumSellPrice: 0,
      pricingCurrency: 'USD' as const,
      quantity: 5,
    }
    const mockKhrItem = {
      ...mockInventoryItem,
      _id: 'inv-khr-item',
      name: 'Power Bank',
      category: 'ACCESSORY' as const,
      sellPrice: 245300,
      minimumSellPrice: 0,
      khrSellPrice: 245300,
      khrMinimumSellPrice: 0,
      pricingCurrency: 'KHR' as const,
      quantity: 5,
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [mockUsdItem, mockKhrItem] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ enabled: false }) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    await waitFor(() => expect(screen.getByRole('combobox', { name: /Inventory item/i })).not.toBeDisabled())
    fireEvent.focus(screen.getByRole('combobox', { name: /Inventory item/i }))
    await screen.findByRole('option', { name: /Screen Protector/i })
    // 1. USD cent rounding: $19.99 with 15% discount -> 19.99 * 0.15 = 2.9985 -> $3.00
    fireEvent.change(screen.getByLabelText(/Inventory item/i), { target: { value: 'inv-odd-usd' } })
    fireEvent.click(screen.getByRole('button', { name: /^Percent$/i }))
    const percentInput = screen.getByRole('spinbutton', { name: /Discount percentage/i })
    fireEvent.change(percentInput, { target: { value: '15' } })

    expect(document.querySelector('.sale-calculated-discount')).toHaveTextContent('− $3.00')
    expect(document.querySelector('.sale-total strong')).toHaveTextContent('$16.99')

    // 2. KHR 100-riel rounding: 245,300 KHR with 10% discount -> 24,530 -> 24,500 KHR
    fireEvent.click(screen.getByRole('button', { name: /Remove Screen Protector from sale/i }))
    fireEvent.change(screen.getByLabelText(/Inventory item/i), { target: { value: 'inv-khr-item' } })
    fireEvent.click(screen.getByRole('button', { name: /^Percent$/i }))
    const khrPercentInput = screen.getByRole('spinbutton', { name: /Discount percentage/i })
    fireEvent.change(khrPercentInput, { target: { value: '10' } })

    // 245,300 * 0.10 = 24,530 -> rounded to nearest 100 = 24,500
    expect(document.querySelector('.sale-calculated-discount')).toHaveTextContent('− 24,500 KHR')
    // Total = 245,300 - 24,500 = 220,800 KHR
    expect(document.querySelector('.sale-total strong')).toHaveTextContent('220,800 KHR')
  })

  it('submits calculated money discount for cash and KHQR sales in percent mode', async () => {
    const mockItem = {
      ...mockInventoryItem,
      _id: 'inv-sale-payload',
      name: 'AirPods Pro',
      category: 'ACCESSORY' as const,
      sellPrice: 120,
      minimumSellPrice: 0,
      khrSellPrice: 0,
      khrMinimumSellPrice: 0,
      pricingCurrency: 'USD' as const,
      quantity: 5,
    }

    let lastTradePayload: any = null
    let lastKhqrPayload: any = null

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/customers')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
      }
      if (url.includes('/inventory')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items: [mockItem] }) } as Response
      }
      if (url.includes('/exchange-rates')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
      }
      if (url.includes('/payway/config')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ enabled: true, configured: true }) } as Response
      }
      if (url.includes('/trades') && init?.method === 'POST') {
        lastTradePayload = JSON.parse(String(init.body))
        return {
          ok: true,
          status: 201,
          headers: new Headers(),
          json: async () => ({
            trade: {
              _id: 'trade-cash-1',
              type: 'SELL',
              total: 216,
              amountPaid: 216,
              amountReceived: 216,
              currency: 'USD',
              createdAt: new Date().toISOString(),
              items: [{ name: mockItem.name, quantity: 2, unitPrice: 120 }],
            },
          }),
        } as Response
      }
      if (url.includes('/payway/khqr') && init?.method === 'POST') {
        lastKhqrPayload = JSON.parse(String(init.body))
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            qrString: 'dummy-qr-string',
            md5: 'dummy-md5',
            amount: 216,
            currency: 'USD',
            transactionId: 'trx-1',
          }),
        } as Response
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
    })

    renderModalBridge()

    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText(/Inventory item/i), { target: { value: 'inv-sale-payload' } })
    fireEvent.change(screen.getByLabelText(/Quantity/i), { target: { value: '2' } })
    fireEvent.change(screen.getByPlaceholderText(/Enter days/i), { target: { value: '30' } })

    // Switch to Percent and enter 10%
    fireEvent.click(screen.getByRole('button', { name: /^Percent$/i }))
    fireEvent.change(screen.getByRole('spinbutton', { name: /Discount percentage/i }), { target: { value: '10' } })

    // 1. Submit Cash sale
    fireEvent.click(screen.getByRole('button', { name: /Complete sale/i }))

    await waitFor(() => {
      expect(lastTradePayload).not.toBeNull()
    })

    // Expect discount to be the money amount 24, NOT the percentage 10
    expect(lastTradePayload.discount).toBe(24)
    expect(lastTradePayload.amountPaid).toBe(216)
    expect(lastTradePayload.amountReceived).toBe(216)

    // Reset and test KHQR submission
    act(() => {
      window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText(/Inventory item/i), { target: { value: 'inv-sale-payload' } })
    fireEvent.change(screen.getByLabelText(/Quantity/i), { target: { value: '2' } })
    fireEvent.change(screen.getByPlaceholderText(/Enter days/i), { target: { value: '30' } })

    // Select KHQR payment method
    const khqrBtn = screen.getByRole('button', { name: /Pay with KHQR/i })
    fireEvent.click(khqrBtn)

    // Switch to Percent and enter 10%
    fireEvent.click(screen.getByRole('button', { name: /^Percent$/i }))
    fireEvent.change(screen.getByRole('spinbutton', { name: /Discount percentage/i }), { target: { value: '10' } })

    // Submit KHQR sale
    fireEvent.click(screen.getByRole('button', { name: /Generate KHQR/i }))

    await waitFor(() => {
      expect(lastKhqrPayload).not.toBeNull()
    })

    // Expect discount to be the money amount 24, NOT the percentage 10
    expect(lastKhqrPayload.discount).toBe(24)
    expect(lastKhqrPayload.quantity).toBe(2)
    expect(lastKhqrPayload.unitPrice).toBe(120)
  })

  describe('New sale multi-product cart and searchable picker', () => {
    const phoneProduct = {
      _id: 'inv-phone-s24',
      name: 'Samsung Galaxy S24 Ultra',
      sku: 'SAM-S24U-256',
      barcode: '8801234567890',
      category: 'PHONE' as const,
      brand: 'Samsung',
      model: 'Galaxy S24 Ultra',
      storage: '256GB',
      color: 'Titanium Black',
      condition: 'EXCELLENT',
      quantity: 1,
      sellPrice: 1200,
      minimumSellPrice: 1100,
      khrSellPrice: 4920000,
      khrMinimumSellPrice: 4510000,
      pricingCurrency: 'USD' as const,
      status: 'IN_STOCK' as const,
      imei1: '359999999999999',
      serialNumber: 'SN-S24U-001',
    }

    const accessoryProduct = {
      _id: 'inv-acc-charger',
      name: 'Anker 65W Fast Charger',
      sku: 'ANK-65W-BLK',
      barcode: '8809999999999',
      category: 'ACCESSORY' as const,
      brand: 'Anker',
      model: 'PowerPort',
      condition: 'NEW',
      quantity: 8,
      sellPrice: 40,
      minimumSellPrice: 30,
      khrSellPrice: 164000,
      khrMinimumSellPrice: 123000,
      pricingCurrency: 'USD' as const,
      status: 'IN_STOCK' as const,
      serialNumber: 'SN-ANK-002',
    }

    const pawnedStaleProduct = {
      _id: 'inv-pawned-collateral',
      name: 'Pawned Locked Phone',
      sku: 'PWN-LOCKED-01',
      category: 'PHONE' as const,
      quantity: 1,
      sellPrice: 500,
      status: 'IN_STOCK' as const,
      pawn: 'pawn-active-999',
      relatedPawn: { _id: 'pawn-999', pawnNo: 'PW-999', status: 'ACTIVE' },
    }

    function setupMultiProductFetch(opts?: {
      inventoryItems?: any[]
      onTradePost?: (body: any) => void
      onKhqrPost?: (body: any) => void
      onPricePatch?: (body: any) => void
    }) {
      const items = opts?.inventoryItems ?? [phoneProduct, accessoryProduct, pawnedStaleProduct]
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input)
        if (url.includes('/customers')) {
          return { ok: true, status: 200, headers: new Headers(), json: async () => ({ customers: [] }) } as Response
        }
        if (url.includes('/inventory?status=IN_STOCK') || (url.includes('/inventory') && !url.includes('/inventory/'))) {
          return { ok: true, status: 200, headers: new Headers(), json: async () => ({ items }) } as Response
        }
        if (url.includes('/exchange-rates')) {
          return { ok: true, status: 200, headers: new Headers(), json: async () => ({ usdKhr: 4100 }) } as Response
        }
        if (url.includes('/payway/config')) {
          return { ok: true, status: 200, headers: new Headers(), json: async () => ({ enabled: true, configured: true }) } as Response
        }
        if (url.includes('/inventory/') && init?.method === 'PATCH') {
          const body = JSON.parse(String(init.body))
          opts?.onPricePatch?.(body)
          const itemId = decodeURIComponent(url.split('/inventory/')[1].split(/[?#]/)[0])
          const original = items.find((item) => item._id === itemId)
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({
              item: {
                ...original,
                sellPrice: body.sellPriceUsd,
                minimumSellPrice: body.minimumSellPriceUsd,
                khrSellPrice: body.sellPriceKhr,
                khrMinimumSellPrice: body.minimumSellPriceKhr,
                pricingCurrency: body.currency,
                pricingExchangeRate: body.exchangeRate,
              },
            }),
          } as Response
        }
        if (url.includes('/trades') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body))
          opts?.onTradePost?.(body)
          return {
            ok: true,
            status: 201,
            headers: new Headers(),
            json: async () => ({
              trade: {
                _id: 'trade-multi-01',
                tradeNo: 'SL-2026-MULTI01',
                type: 'SELL',
                status: 'COMPLETED',
                total: body.amountPaid || body.total || 1200,
                amountPaid: body.amountPaid || 1200,
                amountReceived: body.amountReceived || 1200,
                currency: body.currency,
                items: (body.items || []).map((it: any) => {
                  const itemId = it.inventoryItem || it.inventoryItemId
                  return {
                    inventoryItemId: itemId,
                    inventoryItem: itemId,
                    name: itemId === phoneProduct._id ? phoneProduct.name : accessoryProduct.name,
                    quantity: it.quantity,
                    unitPrice: it.unitPrice,
                  }
                }),
                paymentMethod: body.paymentMethod || 'CASH',
                createdAt: new Date().toISOString(),
              },
            }),
          } as Response
        }
        if (url.includes('/payway/khqr') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body))
          opts?.onKhqrPost?.(body)
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({
              qrString: 'dummy-multi-qr-string',
              md5: 'dummy-multi-md5',
              amount: body.amount ?? 1240,
              currency: body.currency,
              transactionId: 'trx-multi-1',
            }),
          } as Response
        }
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as Response
      })
    }

    it('filters inventory by product name, SKU, barcode, IMEI, serial number, and avoids invented results', async () => {
      setupMultiProductFetch()
      renderModalBridge()

      act(() => {
        window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
      })

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      const searchInput = screen.getByRole('combobox', { name: /inventory item/i })

      await waitFor(() => expect(searchInput).not.toBeDisabled())
      expect(searchInput).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByRole('listbox', { name: /available products/i })).not.toBeInTheDocument()

      // The list opens only when the owner interacts with the search box.
      fireEvent.focus(searchInput)
      const listbox = screen.getByRole('listbox', { name: /available products/i })
      expect(listbox).toBeInTheDocument()

      // Pawned item must NEVER appear in available products
      expect(within(listbox).queryByText(/Pawned Locked Phone/i)).not.toBeInTheDocument()
      // Real available items appear
      expect(within(listbox).getByText(/Samsung Galaxy S24 Ultra/i)).toBeInTheDocument()
      expect(within(listbox).getByText(/Anker 65W Fast Charger/i)).toBeInTheDocument()

      // 1. Search by product name
      fireEvent.change(searchInput, { target: { value: 'Galaxy' } })
      expect(within(listbox).getByText(/Samsung Galaxy S24 Ultra/i)).toBeInTheDocument()
      expect(within(listbox).queryByText(/Anker 65W Fast Charger/i)).not.toBeInTheDocument()
      // Verify result card details: name, code, available quantity, price
      expect(within(listbox).getByText(/Qty: 1/i)).toBeInTheDocument()
      expect(within(listbox).getByText(/\$1,200\.00/i)).toBeInTheDocument()
      expect(within(listbox).getByText(/IMEI: 359999999999999/i)).toBeInTheDocument()

      // 2. Search by SKU
      fireEvent.change(searchInput, { target: { value: 'ANK-65W' } })
      expect(within(listbox).getByText(/Anker 65W Fast Charger/i)).toBeInTheDocument()
      expect(within(listbox).queryByText(/Samsung Galaxy/i)).not.toBeInTheDocument()
      expect(within(listbox).getByText(/Qty: 8/i)).toBeInTheDocument()
      expect(within(listbox).getByText(/\$40\.00/i)).toBeInTheDocument()

      // 3. Search by barcode
      fireEvent.change(searchInput, { target: { value: '8801234567890' } })
      expect(within(listbox).getByText(/Samsung Galaxy S24 Ultra/i)).toBeInTheDocument()
      expect(within(listbox).queryByText(/Anker 65W/i)).not.toBeInTheDocument()

      // 4. Search by IMEI
      fireEvent.change(searchInput, { target: { value: '359999999999999' } })
      expect(within(listbox).getByText(/Samsung Galaxy S24 Ultra/i)).toBeInTheDocument()

      // 5. Search by serial number
      fireEvent.change(searchInput, { target: { value: 'SN-ANK-002' } })
      expect(within(listbox).getByText(/Anker 65W Fast Charger/i)).toBeInTheDocument()

      // Clear search button
      const clearBtn = screen.getByRole('button', { name: /clear search/i })
      fireEvent.click(clearBtn)
      expect(searchInput).toHaveValue('')

      // Single item isolation test: when only 1 product is in inventory, show only that one and never invent results
      fireEvent.click(screen.getByRole('button', { name: /close/i }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      setupMultiProductFetch({ inventoryItems: [phoneProduct] })
      act(() => {
        window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
      })
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

      const newSearchInput = screen.getByRole('combobox', { name: /inventory item/i })
      fireEvent.focus(newSearchInput)
      const singleListbox = screen.getByRole('listbox', { name: /available products/i })
      const singleOptions = within(singleListbox).getAllByRole('option')
      expect(singleOptions).toHaveLength(1)
      expect(singleOptions[0]).toHaveTextContent('Samsung Galaxy S24 Ultra')
    })

    it('routes typing to inventory search when no form field is selected', async () => {
      setupMultiProductFetch()
      renderModalBridge()

      act(() => {
        window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
      })

      const searchInput = await screen.findByRole('combobox', { name: /inventory item/i })
      await waitFor(() => expect(searchInput).not.toBeDisabled())
      expect(searchInput).toHaveValue('')

      fireEvent.keyDown(document.body, { key: 'A' })
      fireEvent.keyDown(document.body, { key: 'n' })

      expect(searchInput).toHaveFocus()
      expect(searchInput).toHaveValue('An')
      expect(searchInput).toHaveAttribute('aria-expanded', 'true')

      const warrantyInput = screen.getByPlaceholderText(/Enter days/i)
      fireEvent.focus(warrantyInput)
      fireEvent.keyDown(warrantyInput, { key: '5' })
      expect(searchInput).toHaveValue('An')
    })

    it('supports keyboard navigation (ArrowDown/Up, Enter, Escape) and barcode scanner input', async () => {
      setupMultiProductFetch()
      renderModalBridge()

      act(() => {
        window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
      })

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      const searchInput = screen.getByRole('combobox', { name: /inventory item/i })
      fireEvent.focus(searchInput)
      fireEvent.change(searchInput, { target: { value: 'a' } }) // matches both products

      const listbox = screen.getByRole('listbox', { name: /available products/i })
      const options = within(listbox).getAllByRole('option')
      expect(options).toHaveLength(2)
      // Active index starts at 0
      expect(options[0]).toHaveAttribute('aria-selected', 'true')
      expect(options[1]).toHaveAttribute('aria-selected', 'false')

      // Navigate down with ArrowDown
      fireEvent.keyDown(searchInput, { key: 'ArrowDown' })
      expect(options[0]).toHaveAttribute('aria-selected', 'false')
      expect(options[1]).toHaveAttribute('aria-selected', 'true')

      // Navigate up with ArrowUp
      fireEvent.keyDown(searchInput, { key: 'ArrowUp' })
      expect(options[0]).toHaveAttribute('aria-selected', 'true')

      // Press Enter to select active item (Galaxy S24)
      fireEvent.keyDown(searchInput, { key: 'Enter' })
      const cartSection = screen.getByLabelText('Cart items')
      expect(within(cartSection).getByText('Samsung Galaxy S24 Ultra')).toBeInTheDocument()
      expect(searchInput).toHaveValue('')

      // Dropdown escape test: typing open dropdown and pressing Escape closes dropdown without closing modal
      fireEvent.change(searchInput, { target: { value: 'Anker' } })
      expect(screen.getByRole('listbox', { name: /available products/i })).toBeInTheDocument()
      fireEvent.keyDown(searchInput, { key: 'Escape' })
      expect(screen.queryByRole('listbox', { name: /available products/i })).not.toBeInTheDocument()
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      // Scanner input: scanning barcode of next product adds it without replacing the first
      fireEvent.change(searchInput, { target: { value: '8809999999999' } })
      fireEvent.keyDown(searchInput, { key: 'Enter' })

      // Cart now holds BOTH products
      expect(within(cartSection).getByText('Samsung Galaxy S24 Ultra')).toBeInTheDocument()
      expect(within(cartSection).getByText('Anker 65W Fast Charger')).toBeInTheDocument()
      expect(within(cartSection).getByText(/Cart items \(2\)/i)).toBeInTheDocument()

      // Scanning the same quantity-based product again increments its cart quantity.
      fireEvent.change(searchInput, { target: { value: '8809999999999' } })
      fireEvent.keyDown(searchInput, { key: 'Enter' })
      const accessoryRow = within(cartSection).getByText('Anker 65W Fast Charger').closest('.sale-cart-item-card') as HTMLElement
      expect(within(accessoryRow).getByRole('spinbutton', { name: /Quantity/i })).toHaveValue(2)
      expect(searchInput).toHaveValue('')
      expect(within(cartSection).getByText('3 total units')).toBeInTheDocument()
    })

    it('enforces multi-product cart limits: phone quantity locked at 1, stock limits, duplicate prevention, and line removal', async () => {
      setupMultiProductFetch()
      renderModalBridge()

      act(() => {
        window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
      })

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      const searchInput = screen.getByRole('combobox', { name: /inventory item/i })

      // Add phone
      fireEvent.change(searchInput, { target: { value: 'SAM-S24U-256' } })
      fireEvent.keyDown(searchInput, { key: 'Enter' })

      // Add accessory
      fireEvent.change(searchInput, { target: { value: 'ANK-65W-BLK' } })
      fireEvent.keyDown(searchInput, { key: 'Enter' })

      const cartSection = screen.getByLabelText('Cart items')
      expect(within(cartSection).getByText(/Cart items \(2\)/i)).toBeInTheDocument()

      // 1. Phone quantity locked at 1
      const phoneItem = within(cartSection).getByText('Samsung Galaxy S24 Ultra').closest('.sale-cart-item-card') as HTMLElement
      expect(within(phoneItem).getByText(/Qty: 1/i)).toBeInTheDocument()
      const phoneInput = phoneItem.querySelector('input[type="number"]') as HTMLInputElement
      expect(phoneInput).toBeDisabled()
      expect(phoneInput.value).toBe('1')

      // 2. Accessory quantity stepper, typing, keyboard controls, and stock limit (8)
      const accItem = within(cartSection).getByText('Anker 65W Fast Charger').closest('.sale-cart-item-card') as HTMLElement
      const accInput = within(accItem).getByRole('spinbutton', { name: /quantity/i }) as HTMLInputElement
      const minusBtn = within(accItem).getByRole('button', { name: /decrease/i })
      const plusBtn = within(accItem).getByRole('button', { name: /increase/i })

      expect(accInput.value).toBe('1')
      expect(accInput).toHaveClass('sale-cart-qty-input')
      expect(minusBtn).toBeDisabled()
      expect(plusBtn).toBeEnabled()

      // Click + button increments to 2
      fireEvent.click(plusBtn)
      expect(accInput.value).toBe('2')
      expect(minusBtn).toBeEnabled()

      // Click - button decrements back to 1
      fireEvent.click(minusBtn)
      expect(accInput.value).toBe('1')
      expect(minusBtn).toBeDisabled()

      // Keyboard ArrowUp increments to 2, ArrowDown decrements to 1
      fireEvent.keyDown(accInput, { key: 'ArrowUp' })
      expect(accInput.value).toBe('2')
      fireEvent.keyDown(accInput, { key: 'ArrowDown' })
      expect(accInput.value).toBe('1')

      // Direct typing increases to 5
      fireEvent.change(accInput, { target: { value: '5' } })
      expect(accInput.value).toBe('5')

      // Attempt to exceed available stock (e.g. 15 > 8) -> clamps to max available (8)
      fireEvent.change(accInput, { target: { value: '15' } })
      expect(accInput.value).toBe('8')
      expect(plusBtn).toBeDisabled()

      // 3. A second scan of a one-unit phone keeps quantity at 1 and explains why.
      fireEvent.change(searchInput, { target: { value: 'Samsung Galaxy S24 Ultra' } })
      fireEvent.keyDown(searchInput, { key: 'Enter' })
      expect(screen.getByRole('alert')).toHaveTextContent(/Only 1 unit is available.*Quantity was not increased/i)
      expect(within(cartSection).getByText(/Cart items \(2\)/i)).toBeInTheDocument()

      // 4. Remove line from cart
      const removePhoneBtn = within(cartSection).getByRole('button', { name: /Remove Samsung Galaxy S24 Ultra from sale/i })
      fireEvent.click(removePhoneBtn)
      expect(within(cartSection).queryByText('Samsung Galaxy S24 Ultra')).not.toBeInTheDocument()
      expect(within(cartSection).getByText(/Cart items \(1\)/i)).toBeInTheDocument()
    })

    it('changes the selected product saved price without changing the first product', async () => {
      let submittedTradePayload: any = null
      let pricePatch: any = null
      setupMultiProductFetch({
        onTradePost: (body) => { submittedTradePayload = body },
        onPricePatch: (body) => { pricePatch = body },
      })
      renderModalBridge()

      act(() => {
        window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
      })
      const searchInput = await screen.findByRole('combobox', { name: /inventory item/i })
      await waitFor(() => expect(searchInput).not.toBeDisabled())
      fireEvent.change(searchInput, { target: { value: phoneProduct._id } })
      fireEvent.change(searchInput, { target: { value: accessoryProduct._id } })

      const priceGroup = screen.getByRole('group', { name: /Selling price in USD/i })
      expect(within(priceGroup).getByText(/Anker 65W Fast Charger/)).toBeInTheDocument()
      expect(within(priceGroup).queryByRole('button', { name: /Enter manually/i })).not.toBeInTheDocument()
      fireEvent.click(within(priceGroup).getByRole('button', { name: /Change price/i }))
      const pricingDialog = await screen.findByRole('dialog', { name: /Change selling price/i })
      fireEvent.change(within(pricingDialog).getByRole('textbox', { name: /Regular selling price in US dollars/i }), { target: { value: '35' } })
      fireEvent.click(within(pricingDialog).getByRole('button', { name: /Save prices/i }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: /Change selling price/i })).not.toBeInTheDocument())
      expect(pricePatch).toMatchObject({ sellPriceUsd: 35, minimumSellPriceUsd: 30 })
      expect(within(screen.getByRole('table', { name: /Sale summary items/i })).getByText('$35.00')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: `Edit selling price for ${phoneProduct.name}` }))
      expect(within(priceGroup).getByText(/Samsung Galaxy S24 Ultra/)).toBeInTheDocument()
      expect(within(priceGroup).getByText('$1,200.00')).toBeInTheDocument()

      fireEvent.change(screen.getByPlaceholderText(/Enter days/i), { target: { value: '0' } })
      fireEvent.click(screen.getByRole('button', { name: /Complete sale/i }))
      await waitFor(() => expect(submittedTradePayload).not.toBeNull())
      expect(submittedTradePayload.items.map((item: any) => item.unitPrice)).toEqual([1200, 35])
    })

    it('keeps existing cart products when adding an item saved in another currency', async () => {
      const khrAccessory = {
        ...accessoryProduct,
        _id: 'inv-acc-khr',
        name: 'KHR Charger',
        pricingCurrency: 'KHR' as const,
        sellPrice: 10,
        minimumSellPrice: 5,
        khrSellPrice: 41000,
        khrMinimumSellPrice: 20500,
      }
      setupMultiProductFetch({ inventoryItems: [phoneProduct, khrAccessory] })
      renderModalBridge()
      act(() => {
        window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
      })
      const searchInput = await screen.findByRole('combobox', { name: /inventory item/i })
      await waitFor(() => expect(searchInput).not.toBeDisabled())
      fireEvent.change(searchInput, { target: { value: phoneProduct._id } })
      fireEvent.change(searchInput, { target: { value: khrAccessory._id } })

      const cartSection = screen.getByLabelText('Cart items')
      expect(within(cartSection).getByText(phoneProduct.name)).toBeInTheDocument()
      expect(within(cartSection).getByText(khrAccessory.name)).toBeInTheDocument()
      expect(within(cartSection).getByText(/Cart items \(2\)/i)).toBeInTheDocument()
      const currencySelect = screen.getByText('Currency').closest('label')?.querySelector('select')
      expect(currencySelect).toHaveValue('USD')
    })

    it('opens and saves pricing for an unpriced cart product without leaving New Sale', async () => {
      const unpricedAccessory = { ...accessoryProduct, sellPrice: 0, minimumSellPrice: 0, khrSellPrice: 0, khrMinimumSellPrice: 0 }
      let pricePatch: any = null
      setupMultiProductFetch({ inventoryItems: [phoneProduct, unpricedAccessory], onPricePatch: (body) => { pricePatch = body } })
      renderModalBridge()

      act(() => {
        window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
      })
      const searchInput = await screen.findByRole('combobox', { name: /inventory item/i })
      await waitFor(() => expect(searchInput).not.toBeDisabled())
      fireEvent.change(searchInput, { target: { value: phoneProduct._id } })
      fireEvent.change(searchInput, { target: { value: unpricedAccessory._id } })

      const priceGroup = screen.getByRole('group', { name: /Selling price in USD/i })
      expect(within(priceGroup).getByText(/Anker 65W Fast Charger/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Enter a valid price/i })).toBeDisabled()
      const productRow = screen.getByText(unpricedAccessory.name).closest('.sale-cart-item-card') as HTMLElement
      expect(within(productRow).queryByRole('button', { name: /^Set price$/i })).not.toBeInTheDocument()
      fireEvent.click(within(priceGroup).getByRole('button', { name: /^Set price$/i }))

      const pricingDialog = await screen.findByRole('dialog', { name: /^Set selling price$/i })
      fireEvent.change(within(pricingDialog).getByRole('textbox', { name: /Regular selling price in US dollars/i }), { target: { value: '25' } })
      fireEvent.change(within(pricingDialog).getByRole('textbox', { name: /Minimum selling price in US dollars/i }), { target: { value: '20' } })
      fireEvent.click(within(pricingDialog).getByRole('button', { name: /Save prices/i }))

      await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Set selling price$/i })).not.toBeInTheDocument())
      expect(pricePatch).toMatchObject({
        sellPriceUsd: 25,
        minimumSellPriceUsd: 20,
        sellPriceKhr: 102500,
        minimumSellPriceKhr: 82000,
        currency: 'USD',
        exchangeRate: 4100,
      })
      expect(screen.getByRole('heading', { name: /New sale/i })).toBeInTheDocument()
      expect(within(productRow).getAllByText('$25.00')).toHaveLength(2)
      expect(within(priceGroup).getByRole('button', { name: /^Change price$/i })).toBeInTheDocument()
    })

    it('calculates line totals, subtotal, money/percent discounts, and minimum allowed total across cart', async () => {
      setupMultiProductFetch()
      renderModalBridge()

      act(() => {
        window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
      })

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      const searchInput = screen.getByRole('combobox', { name: /inventory item/i })

      // Add phone: unitPrice $1,200, minimumSellPrice $1,100, qty 1 -> line total $1,200
      fireEvent.change(searchInput, { target: { value: 'SAM-S24U-256' } })
      fireEvent.keyDown(searchInput, { key: 'Enter' })

      // Add accessory: unitPrice $40, minimumSellPrice $30, qty 2 -> line total $80
      fireEvent.change(searchInput, { target: { value: 'ANK-65W-BLK' } })
      fireEvent.keyDown(searchInput, { key: 'Enter' })

      const cartSection = screen.getByLabelText('Cart items')
      const accItem = within(cartSection).getByText('Anker 65W Fast Charger').closest('.sale-cart-item-card') as HTMLElement
      const accInput = within(accItem).getByRole('spinbutton', { name: /quantity/i })
      fireEvent.change(accInput, { target: { value: '2' } })

      // Set warranty days
      fireEvent.change(screen.getByPlaceholderText(/Enter days/i), { target: { value: '30' } })

      // Subtotal = $1,200 + $80 = $1,280.00
      // Minimum allowed total = $1,100 + (2 * $30) = $1,160.00
      // Maximum allowed discount = $1,280 - $1,160 = $120.00
      const summaryTable = screen.getByRole('table', { name: /Sale summary items/i })
      expect(within(summaryTable).getByText(/Samsung Galaxy S24 Ultra × 1/i)).toBeInTheDocument()
      expect(within(summaryTable).getByText(/Anker 65W Fast Charger × 2/i)).toBeInTheDocument()

      expect(screen.getByText(/Maximum allowed: \$120\.00/i)).toBeInTheDocument()

      // Money discount test: $100 discount is allowed
      const discountInput = screen.getByPlaceholderText('0.00')
      fireEvent.change(discountInput, { target: { value: '100' } })
      // Total = $1,280 - $100 = $1,180.00
      const totalSpan = screen.getByText((content, element) => {
        return element?.tagName.toLowerCase() === 'small' && content === 'Total'
      }).closest('span')!
      expect(within(totalSpan).getByText('$1,180.00')).toBeInTheDocument()

      // Exceeding discount limit in Money mode: $150 > $120
      fireEvent.change(discountInput, { target: { value: '150' } })
      expect(screen.getByText(/Maximum discount is \$120\.00/i)).toBeInTheDocument()
      const reduceDiscountBtn = screen.getByRole('button', { name: /Reduce discount/i })
      expect(reduceDiscountBtn).toBeDisabled()

      // Switch to Percent mode
      fireEvent.click(screen.getByRole('button', { name: /^Percent$/i }))
      const percentInput = screen.getByRole('spinbutton', { name: /discount percentage/i })
      // 5% of $1,280 = $64.00 (allowed)
      fireEvent.change(percentInput, { target: { value: '5' } })
      const discountWrapper = percentInput.closest('.sale-discount-input-wrapper') as HTMLElement
      expect(within(discountWrapper).getByText(/− \$64\.00/i)).toBeInTheDocument()
      expect(screen.getByText(/5% = \$64\.00 · Maximum allowed: \$120\.00/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Complete sale/i })).toBeEnabled()

      // 15% of $1,280 = $192.00 (exceeds $120 maximum discount)
      fireEvent.change(percentInput, { target: { value: '15' } })
      expect(screen.getByText(/Maximum discount is \$120\.00/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Reduce discount/i })).toBeDisabled()
    })

    it('submits multi-item cash and KHQR sales and dispatches receipt printing event with all cart items', async () => {
      let submittedTradePayload: any = null
      let submittedKhqrPayload: any = null
      setupMultiProductFetch({
        onTradePost: (body) => { submittedTradePayload = body },
        onKhqrPost: (body) => { submittedKhqrPayload = body },
      })

      const receiptHandler = vi.fn()
      window.addEventListener('phoneflow:open-trade-receipt', receiptHandler)

      renderModalBridge()

      act(() => {
        window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
      })

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      const searchInput = screen.getByRole('combobox', { name: /inventory item/i })

      // Add phone ($1,200) and accessory ($40 * 2 = $80)
      fireEvent.change(searchInput, { target: { value: 'SAM-S24U-256' } })
      fireEvent.keyDown(searchInput, { key: 'Enter' })

      fireEvent.change(searchInput, { target: { value: 'ANK-65W-BLK' } })
      fireEvent.keyDown(searchInput, { key: 'Enter' })

      const cartSection = screen.getByLabelText('Cart items')
      const accItem = within(cartSection).getByText('Anker 65W Fast Charger').closest('.sale-cart-item-card') as HTMLElement
      fireEvent.change(within(accItem).getByRole('spinbutton', { name: /quantity/i }), { target: { value: '2' } })

      // Set warranty days
      fireEvent.change(screen.getByPlaceholderText(/Enter days/i), { target: { value: '30' } })

      // Set $80 money discount -> Subtotal $1,280 - $80 = $1,200 Total
      const discountInput = screen.getByPlaceholderText('0.00')
      fireEvent.change(discountInput, { target: { value: '80' } })

      // 1. Submit Cash sale
      fireEvent.click(screen.getByRole('button', { name: /Complete sale/i }))

      await waitFor(() => {
        expect(submittedTradePayload).not.toBeNull()
      })

      expect(submittedTradePayload.items).toHaveLength(2)
      expect(submittedTradePayload.items[0]).toEqual(
        expect.objectContaining({
          inventoryItem: phoneProduct._id,
          name: phoneProduct.name,
          quantity: 1,
          unitPrice: 1200,
        }),
      )
      expect(submittedTradePayload.items[1]).toEqual(
        expect.objectContaining({
          inventoryItem: accessoryProduct._id,
          name: accessoryProduct.name,
          quantity: 2,
          unitPrice: 40,
        }),
      )
      expect(submittedTradePayload.discount).toBe(80)
      expect(submittedTradePayload.amountPaid).toBe(1200)
      expect(submittedTradePayload.amountReceived).toBe(1200)

      // Verify Completed Sale card displays both line items
      await waitFor(() => {
        expect(screen.getByText(/Payment successful/i)).toBeInTheDocument()
      })
      const completeList = screen.getByLabelText(/Sale items/i)
      expect(within(completeList).getByText(/Samsung Galaxy S24 Ultra × 1/i)).toBeInTheDocument()
      expect(within(completeList).getByText(/Anker 65W Fast Charger × 2/i)).toBeInTheDocument()

      // Click Print receipt button and verify event
      const printBtn = screen.getByRole('button', { name: /Print receipt/i })
      fireEvent.click(printBtn)

      await waitFor(() => {
        expect(receiptHandler).toHaveBeenCalledTimes(1)
        const detail = (receiptHandler.mock.calls[0][0] as CustomEvent).detail
        expect(detail).toEqual(
          expect.objectContaining({
            reference: 'SL-2026-MULTI01',
            currency: 'USD',
            autoPrint: true,
          }),
        )
      })

      window.removeEventListener('phoneflow:open-trade-receipt', receiptHandler)

      // 2. KHQR flow for multi-item cart
      act(() => {
        window.dispatchEvent(new CustomEvent('phoneflow:open-operation', { detail: { kind: 'sale' } }))
      })

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      const searchInputKhqr = screen.getByRole('combobox', { name: /inventory item/i })
      fireEvent.change(searchInputKhqr, { target: { value: 'SAM-S24U-256' } })
      fireEvent.keyDown(searchInputKhqr, { key: 'Enter' })

      fireEvent.change(searchInputKhqr, { target: { value: 'ANK-65W-BLK' } })
      fireEvent.keyDown(searchInputKhqr, { key: 'Enter' })

      fireEvent.change(screen.getByPlaceholderText(/Enter days/i), { target: { value: '14' } })

      // Select KHQR payment method
      fireEvent.click(screen.getByRole('button', { name: /Pay with KHQR/i }))
      fireEvent.click(screen.getByRole('button', { name: /Generate KHQR/i }))

      await waitFor(() => {
        expect(submittedKhqrPayload).not.toBeNull()
      })

      expect(submittedKhqrPayload.items).toHaveLength(2)
      expect(submittedKhqrPayload.items[0]).toEqual(
        expect.objectContaining({
          inventoryItem: phoneProduct._id,
          quantity: 1,
          unitPrice: 1200,
        }),
      )
      expect(submittedKhqrPayload.items[1]).toEqual(
        expect.objectContaining({
          inventoryItem: accessoryProduct._id,
          quantity: 1,
          unitPrice: 40,
        }),
      )
    })
  })
})
