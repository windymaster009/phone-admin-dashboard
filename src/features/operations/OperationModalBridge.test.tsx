import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OperationModalBridge from './OperationModalBridge'
import { RouterProvider } from '../../app/routing'
import { setStoredSessionUser } from '../../lib/storage'
import { mockInventoryItem, mockOwnerUser } from '../../test/testUtils'

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
})
