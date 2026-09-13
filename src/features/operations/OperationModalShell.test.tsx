import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OperationModalShell from './OperationModalShell'

describe('OperationModalShell component', () => {
  const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport')

  beforeEach(() => {
    document.body.className = ''
    vi.restoreAllMocks()
  })

  afterEach(() => {
    if (originalVisualViewport) {
      Object.defineProperty(window, 'visualViewport', originalVisualViewport)
    } else {
      Reflect.deleteProperty(window, 'visualViewport')
    }
  })

  it('renders with predefined kind metadata and handles close button', () => {
    const onClose = vi.fn()
    render(
      <OperationModalShell kind="stock" onClose={onClose}>
        <p>Stock adjustment content</p>
      </OperationModalShell>,
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Adjust stock')).toBeInTheDocument()
    expect(screen.getByText('PhoneFlow operation')).toBeInTheDocument()
    expect(screen.getByText('Correct the count or status of an existing inventory item.')).toBeInTheDocument()
    expect(screen.getByText('Stock adjustment content')).toBeInTheDocument()
    expect(document.body.classList.contains('operation-modal-open')).toBe(true)

    const closeButton = screen.getByRole('button', { name: /Close/i })
    fireEvent.click(closeButton)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('supports custom metadata, classes, and fallback values when kind is undefined', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <OperationModalShell
        title="Custom Modal"
        eyebrow="Custom Subtitle"
        description="Detailed description text"
        icon={<span data-testid="custom-test-icon">icon</span>}
        error="Something went wrong"
        compact
        confirmation
        scanner
        className="test-special-class"
        ariaLabel="Accessible Label"
        onClose={onClose}
      >
        <button type="button">Action</button>
      </OperationModalShell>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Accessible Label' })
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveClass('operation-modal-compact')
    expect(dialog).toHaveClass('loan-modal-confirmation')
    expect(dialog).toHaveClass('loan-modal-scanner')
    expect(dialog).toHaveClass('test-special-class')
    expect(screen.getByTestId('custom-test-icon')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')

    // Rerender with no metadata props to exercise fallback defaults
    rerender(
      <OperationModalShell onClose={onClose}>
        <span>Fallback body</span>
      </OperationModalShell>,
    )

    expect(screen.getByRole('dialog', { name: 'Operation' })).toBeInTheDocument()
    expect(screen.getByText('Operation')).toBeInTheDocument()
    expect(screen.getByText('Fallback body')).toBeInTheDocument()
  })

  it('handles dismissible=false and dismissOnEscape=false behaviors', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <OperationModalShell
        kind="sale"
        dismissible={false}
        onClose={onClose}
      >
        <div>Content</div>
      </OperationModalShell>,
    )

    // Close button should not exist
    expect(screen.queryByRole('button', { name: /Close/i })).not.toBeInTheDocument()

    // Escape should not trigger onClose
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()

    // Rerender with dismissible=true but dismissOnEscape=false
    rerender(
      <OperationModalShell
        kind="sale"
        dismissible
        dismissOnEscape={false}
        onClose={onClose}
      >
        <div>Content</div>
      </OperationModalShell>,
    )

    expect(screen.getByRole('button', { name: /Close/i })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()

    // Normal dismissOnEscape=true
    rerender(
      <OperationModalShell
        kind="sale"
        dismissible
        dismissOnEscape
        onClose={onClose}
      >
        <div>Content</div>
      </OperationModalShell>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('disables close button and suppresses Escape when busy=true', () => {
    const onClose = vi.fn()
    render(
      <OperationModalShell kind="purchase" busy onClose={onClose}>
        <div>Processing...</div>
      </OperationModalShell>,
    )

    const closeBtn = screen.getByRole('button', { name: /Close/i })
    expect(closeBtn).toBeDisabled()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('syncs visual viewport height, width, and offsets on resize and scroll events', () => {
    const listeners: Record<string, () => void> = {}
    const mockViewport = {
      height: 720,
      width: 400,
      offsetTop: 25,
      offsetLeft: 10,
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

    const { container, unmount } = render(
      <OperationModalShell kind="scan" onClose={vi.fn()}>
        <div>Scanner view</div>
      </OperationModalShell>,
    )

    const backdrop = container.parentElement?.querySelector('.operation-modal-backdrop') as HTMLElement
    expect(backdrop).toBeInTheDocument()
    expect(backdrop.style.getPropertyValue('--operation-viewport-height')).toBe('720px')
    expect(backdrop.style.getPropertyValue('--operation-viewport-width')).toBe('400px')
    expect(backdrop.style.getPropertyValue('--operation-viewport-top')).toBe('25px')
    expect(backdrop.style.getPropertyValue('--operation-viewport-left')).toBe('10px')

    // Simulate viewport changes and trigger listeners
    mockViewport.height = 680
    mockViewport.offsetTop = 40
    act(() => {
      window.dispatchEvent(new Event('resize'))
      listeners['resize']?.()
      listeners['scroll']?.()
    })

    expect(backdrop.style.getPropertyValue('--operation-viewport-height')).toBe('680px')
    expect(backdrop.style.getPropertyValue('--operation-viewport-top')).toBe('40px')

    unmount()
    expect(mockViewport.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(mockViewport.removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function))
  })

  it('traps focus inside the modal and focuses data-modal-initial-focus on mount', async () => {
    // Create button outside modal to verify restoration on unmount
    const outsideBtn = document.createElement('button')
    outsideBtn.textContent = 'Outside'
    document.body.appendChild(outsideBtn)
    outsideBtn.focus()
    expect(document.activeElement).toBe(outsideBtn)

    const { unmount } = render(
      <OperationModalShell kind="pawn" onClose={vi.fn()}>
        <input data-testid="first-input" placeholder="First" />
        <input data-testid="initial-input" data-modal-initial-focus placeholder="Preferred focus" />
        <button data-testid="last-btn" type="button">Last button</button>
      </OperationModalShell>,
    )

    const dialog = screen.getByRole('dialog')
    const closeBtn = screen.getByRole('button', { name: /Close/i })
    const firstInput = screen.getByTestId('first-input')
    const initialInput = screen.getByTestId('initial-input')
    const lastBtn = screen.getByTestId('last-btn')

    // requestAnimationFrame handles initial focus
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve))
    })
    expect(document.activeElement).toBe(initialInput)

    // Test Tab wrapping from last element to first
    lastBtn.focus()
    expect(document.activeElement).toBe(lastBtn)
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: false })
    expect(document.activeElement).toBe(closeBtn)

    // Test Shift+Tab wrapping from first element (closeBtn) to last
    closeBtn.focus()
    expect(document.activeElement).toBe(closeBtn)
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(lastBtn)

    // Test non-tab key doesn't trigger wrap
    firstInput.focus()
    fireEvent.keyDown(dialog, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(firstInput)

    // Unmount restores focus
    unmount()
    expect(document.activeElement).toBe(outsideBtn)
    outsideBtn.remove()
  })

  it('handles dialog with no focusable elements without error', () => {
    render(
      <OperationModalShell kind="label" dismissible={false} onClose={vi.fn()}>
        <div>No interactive items here</div>
      </OperationModalShell>,
    )

    const dialog = screen.getByRole('dialog')
    expect(() => {
      fireEvent.keyDown(dialog, { key: 'Tab' })
    }).not.toThrow()
  })
})
