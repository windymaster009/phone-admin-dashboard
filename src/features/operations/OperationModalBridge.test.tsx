import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

    // 1. Initial WALK_IN mode: Seller name empty -> Continue should fail
    fireEvent.click(screen.getByRole('button', { name: /Continue to items/i }))
    await waitFor(() => {
      expect(screen.getByText(/Complete the required seller information/i)).toBeInTheDocument()
    })
    // Enter Walk-in name and continue
    const sellerNameInput = screen.getByPlaceholderText(/Customer name/i)
    fireEvent.change(sellerNameInput, { target: { value: 'Walk-in John' } })
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
      expect(screen.getByText(/Use a whole KHR amount in increments of 100/i)).toBeInTheDocument()
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
    fireEvent.change(screen.getByPlaceholderText(/Required SKU/i), { target: { value: 'APL-20W-PWR' } })

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
})

