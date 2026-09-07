import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import OperationWorkflowFooter from './OperationWorkflowFooter'

describe('OperationWorkflowFooter', () => {
  it('renders primary and secondary actions with click handlers', async () => {
    const user = userEvent.setup()
    const handleSecondary = vi.fn()
    const handlePrimary = vi.fn()

    render(
      <OperationWorkflowFooter
        secondaryAction={
          <button type="button" className="ghost-button" onClick={handleSecondary}>
            Cancel
          </button>
        }
        primaryAction={
          <button type="button" className="primary-button" onClick={handlePrimary}>
            Continue to items
          </button>
        }
      />,
    )

    const secondaryBtn = screen.getByRole('button', { name: /cancel/i })
    const primaryBtn = screen.getByRole('button', { name: /continue to items/i })

    expect(secondaryBtn).toBeInTheDocument()
    expect(primaryBtn).toBeInTheDocument()

    await user.click(secondaryBtn)
    expect(handleSecondary).toHaveBeenCalledTimes(1)

    await user.click(primaryBtn)
    expect(handlePrimary).toHaveBeenCalledTimes(1)
  })

  it('renders structured summary information properly', () => {
    render(
      <OperationWorkflowFooter
        summary={{
          stepText: 'Step 1 of 2',
          detailText: 'Customer verification',
        }}
        primaryAction={<button type="button">Next</button>}
      />,
    )

    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
    expect(screen.getByText('Customer verification')).toBeInTheDocument()
  })

  it('renders arbitrary custom summary node when passed', () => {
    render(
      <OperationWorkflowFooter
        summary={<div data-testid="custom-summary">Total: 50,000 KHR</div>}
        primaryAction={<button type="button">Pay</button>}
      />,
    )

    expect(screen.getByTestId('custom-summary')).toHaveTextContent('Total: 50,000 KHR')
  })

  it('supports disabled and loading states on primary action', () => {
    render(
      <OperationWorkflowFooter
        secondaryAction={<button type="button">Back</button>}
        primaryAction={
          <button type="button" disabled aria-disabled="true">
            Saving contract...
          </button>
        }
      />,
    )

    const primaryBtn = screen.getByRole('button', { name: /saving contract.../i })
    expect(primaryBtn).toBeDisabled()
    expect(primaryBtn).toHaveAttribute('aria-disabled', 'true')
  })

  it('renders arbitrary children when provided instead of slot props', () => {
    render(
      <OperationWorkflowFooter>
        <button type="button">Custom 1</button>
        <button type="button">Custom 2</button>
      </OperationWorkflowFooter>,
    )

    expect(screen.getByRole('button', { name: 'Custom 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Custom 2' })).toBeInTheDocument()
  })
})
