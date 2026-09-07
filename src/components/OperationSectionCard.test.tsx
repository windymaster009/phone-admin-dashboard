import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import OperationSectionCard from './OperationSectionCard'

describe('OperationSectionCard', () => {
  it('renders title, description, marker, badge, and children', () => {
    render(
      <OperationSectionCard
        marker="1"
        title="Customer verification"
        description="Verify identity and confirm collateral ownership."
        badge="1 phone"
      >
        <p>Section body content</p>
      </OperationSectionCard>,
    )

    expect(screen.getByRole('heading', { level: 3, name: 'Customer verification' })).toBeInTheDocument()
    expect(screen.getByText('Verify identity and confirm collateral ownership.')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('1 phone')).toBeInTheDocument()
    expect(screen.getByText('Section body content')).toBeInTheDocument()
  })

  it('renders without marker and applies plain heading style class', () => {
    const { container } = render(
      <OperationSectionCard title="Plain section">
        <div>Content</div>
      </OperationSectionCard>,
    )

    expect(screen.getByText('Plain section')).toBeInTheDocument()
    expect(container.querySelector('.purchase-section-heading-plain')).toBeInTheDocument()
    expect(container.querySelector('.operation-section-heading')).toBeInTheDocument()
  })

  it('renders optional headerAction when provided', () => {
    render(
      <OperationSectionCard
        title="Items list"
        headerAction={<button type="button">Add item</button>}
      >
        <div>List</div>
      </OperationSectionCard>,
    )

    expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument()
  })

  it('applies custom className and id correctly', () => {
    const { container } = render(
      <OperationSectionCard
        id="custom-card-id"
        className="custom-card-class"
        title="Custom Card"
      >
        <div>Content</div>
      </OperationSectionCard>,
    )

    const card = container.querySelector('#custom-card-id')
    expect(card).toBeInTheDocument()
    expect(card).toHaveClass('custom-card-class')
    expect(card).toHaveClass('operation-section-card')
  })
})
