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
})
