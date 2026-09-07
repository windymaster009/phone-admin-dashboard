import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import OperationModalShell from '../features/operations/OperationModalShell'

describe('OperationModalShell component', () => {
  it('renders modal header, title, and children', () => {
    render(
      <OperationModalShell kind="stock" error="" busy={false} onClose={vi.fn()}>
        <p>Modal content body</p>
      </OperationModalShell>,
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Adjust stock')).toBeInTheDocument()
    expect(screen.getByText('Modal content body')).toBeInTheDocument()
  })

  it('renders error message when error prop is present', () => {
    render(
      <OperationModalShell kind="sale" error="Something went wrong" busy={false} onClose={vi.fn()}>
        <div>Child content</div>
      </OperationModalShell>,
    )

    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', async () => {
    const handleClose = vi.fn()
    const user = userEvent.setup()

    render(
      <OperationModalShell kind="pawn" error="" busy={false} onClose={handleClose}>
        <div>Pawn content</div>
      </OperationModalShell>,
    )

    const closeButton = screen.getByRole('button', { name: /Close/i })
    await user.click(closeButton)
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on Escape key press when not busy', async () => {
    const handleClose = vi.fn()
    const user = userEvent.setup()

    render(
      <OperationModalShell kind="purchase" error="" busy={false} onClose={handleClose}>
        <div>Purchase content</div>
      </OperationModalShell>,
    )

    await user.keyboard('{Escape}')
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose on Escape key press when busy or dismissOnEscape is false', async () => {
    const handleClose = vi.fn()
    const user = userEvent.setup()

    const { rerender } = render(
      <OperationModalShell kind="purchase" error="" busy={true} onClose={handleClose}>
        <div>Purchase content</div>
      </OperationModalShell>,
    )

    await user.keyboard('{Escape}')
    expect(handleClose).not.toHaveBeenCalled()

    rerender(
      <OperationModalShell kind="purchase" error="" busy={false} dismissOnEscape={false} onClose={handleClose}>
        <div>Purchase content</div>
      </OperationModalShell>,
    )

    await user.keyboard('{Escape}')
    expect(handleClose).not.toHaveBeenCalled()
  })

  it('sizes the shared backdrop from the visible browser viewport', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport')
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()

    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {
        height: 640,
        width: 390,
        offsetTop: 8,
        offsetLeft: 0,
        addEventListener,
        removeEventListener,
      } as unknown as VisualViewport,
    })

    try {
      render(
        <OperationModalShell kind="purchase" error="" onClose={vi.fn()}>
          <div>Safe viewport content</div>
        </OperationModalShell>,
      )

      const backdrop = screen.getByRole('dialog').parentElement
      expect(backdrop).toHaveStyle({
        '--operation-viewport-height': '640px',
        '--operation-viewport-width': '390px',
        '--operation-viewport-top': '8px',
        '--operation-viewport-left': '0px',
      })
      expect(addEventListener).toHaveBeenCalledWith('resize', expect.any(Function))
      expect(addEventListener).toHaveBeenCalledWith('scroll', expect.any(Function))
    } finally {
      if (originalDescriptor) Object.defineProperty(window, 'visualViewport', originalDescriptor)
      else Reflect.deleteProperty(window, 'visualViewport')
    }
  })
})
