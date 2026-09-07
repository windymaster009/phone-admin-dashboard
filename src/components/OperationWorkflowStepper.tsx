import { Fragment, type ReactNode } from 'react'
import { CheckCircle2 } from 'lucide-react'

export type WorkflowStep = {
  id: string
  title: string
  description?: string
  status: 'pending' | 'active' | 'complete'
  ariaLabel?: string
}

export type OperationWorkflowStepperProps = {
  steps: ReadonlyArray<WorkflowStep>
  ariaLabel?: string
  className?: string
  onStepClick?: (step: WorkflowStep, index: number) => void
}

export default function OperationWorkflowStepper({
  steps,
  ariaLabel = 'Workflow progress',
  className = '',
  onStepClick,
}: OperationWorkflowStepperProps) {
  return (
    <div
      className={`operation-workflow-stepper ${className}`.trim()}
      role="group"
      aria-label={ariaLabel}
    >
      {steps.map((step, index) => {
        const stepNumber = index + 1
        const totalSteps = steps.length
        const isActive = step.status === 'active'
        const isComplete = step.status === 'complete'
        const stepClass = `operation-workflow-step ${isActive ? 'active' : ''} ${isComplete ? 'complete' : ''}`.trim()
        const stepAriaLabel = step.ariaLabel || `Step ${stepNumber} of ${totalSteps}: ${step.title}${step.description ? ` · ${step.description}` : ''}`

        const content: ReactNode = (
          <>
            <span aria-hidden="true">
              {isComplete ? <CheckCircle2 size={17} /> : stepNumber}
            </span>
            <p>
              <strong>{step.title}</strong>
              {step.description && <small>{step.description}</small>}
            </p>
          </>
        )

        const isInteractive = Boolean(onStepClick)

        return (
          <Fragment key={step.id}>
            {index > 0 && <i aria-hidden="true" />}
            {isInteractive ? (
              <button
                type="button"
                className={stepClass}
                aria-current={isActive ? 'step' : undefined}
                aria-label={stepAriaLabel}
                onClick={() => onStepClick?.(step, index)}
              >
                {content}
              </button>
            ) : (
              <div
                className={stepClass}
                aria-current={isActive ? 'step' : undefined}
                aria-label={stepAriaLabel}
              >
                {content}
              </div>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
