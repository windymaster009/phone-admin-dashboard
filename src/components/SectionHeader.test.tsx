import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SectionHeader from './SectionHeader'

describe('SectionHeader', () => {
  it('renders required title as an h2 heading', () => {
    render(<SectionHeader title="Inventory Management" />)

    const heading = screen.getByRole('heading', { level: 2, name: 'Inventory Management' })
    expect(heading).toBeInTheDocument()
  })

  it('renders optional eyebrow, description, and action button', () => {
    render(
      <SectionHeader
        eyebrow="Operations"
        title="Active Pawns"
        description="List of all pawn agreements in active status."
        action={<button type="button">New Agreement</button>}
      />,
    )

    expect(screen.getByText('Operations')).toBeInTheDocument()
    expect(screen.getByText('List of all pawn agreements in active status.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New Agreement' })).toBeInTheDocument()
  })

  it('applies custom className when provided', () => {
    const { container } = render(<SectionHeader title="Test" className="custom-section-cls" />)
    expect(container.firstChild).toHaveClass('custom-section-cls')
  })
})
