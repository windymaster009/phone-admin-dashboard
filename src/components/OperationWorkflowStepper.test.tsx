import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import OperationWorkflowStepper, { type WorkflowStep } from './OperationWorkflowStepper'

describe('OperationWorkflowStepper', () => {
  const sampleSteps: WorkflowStep[] = [
    { id: 'step-1', title: 'Customer verification', description: 'Identity and ownership', status: 'complete' },
    { id: 'step-2', title: 'Collateral & terms', description: 'Device valuation', status: 'active' },
    { id: 'step-3', title: 'Final agreement', status: 'pending' },
  ]

  it('renders all steps with correct titles and descriptions', () => {
    render(<OperationWorkflowStepper steps={sampleSteps} ariaLabel="Pawn contract progress" />)

    expect(screen.getByRole('group', { name: 'Pawn contract progress' })).toBeInTheDocument()
    expect(screen.getByText('Customer verification')).toBeInTheDocument()
    expect(screen.getByText('Identity and ownership')).toBeInTheDocument()
    expect(screen.getByText('Collateral & terms')).toBeInTheDocument()
    expect(screen.getByText('Device valuation')).toBeInTheDocument()
    expect(screen.getByText('Final agreement')).toBeInTheDocument()
  })

  it('marks the active step with aria-current="step"', () => {
    render(<OperationWorkflowStepper steps={sampleSteps} />)

    const activeStep = screen.getByLabelText(/Step 2 of 3: Collateral & terms/i)
    expect(activeStep).toHaveAttribute('aria-current', 'step')

    const completeStep = screen.getByLabelText(/Step 1 of 3: Customer verification/i)
    expect(completeStep).not.toHaveAttribute('aria-current')

    const pendingStep = screen.getByLabelText(/Step 3 of 3: Final agreement/i)
    expect(pendingStep).not.toHaveAttribute('aria-current')
  })

  it('renders completed icon for completed steps and step number for active/pending steps', () => {
    const { container } = render(<OperationWorkflowStepper steps={sampleSteps} />)

    // Complete step has lucide check icon (svg)
    const completeStepElement = screen.getByLabelText(/Step 1 of 3/i)
    expect(completeStepElement.querySelector('svg')).toBeInTheDocument()

    // Step 2 is active (shows 2)
    const activeStepElement = screen.getByLabelText(/Step 2 of 3/i)
    expect(activeStepElement).toHaveTextContent('2')

    // Step 3 is pending (shows 3)
    const pendingStepElement = screen.getByLabelText(/Step 3 of 3/i)
    expect(pendingStepElement).toHaveTextContent('3')

    // Check connector lines (steps.length - 1 = 2 lines)
    const dividers = container.querySelectorAll('.operation-workflow-stepper > i')
    expect(dividers).toHaveLength(2)
  })

  it('renders noninteractive div elements by default', () => {
    render(<OperationWorkflowStepper steps={sampleSteps} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('supports optional interactive clicks when onStepClick is provided', async () => {
    const user = userEvent.setup()
    const handleStepClick = vi.fn()
    render(<OperationWorkflowStepper steps={sampleSteps} onStepClick={handleStepClick} />)

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(3)

    await user.click(buttons[0])
    expect(handleStepClick).toHaveBeenCalledWith(sampleSteps[0], 0)
  })

  it('applies custom className safely', () => {
    const { container } = render(<OperationWorkflowStepper steps={sampleSteps} className="custom-stepper" />)
    expect(container.querySelector('.custom-stepper')).toBeInTheDocument()
  })
})
