import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import LoadingState from './LoadingState'

describe('LoadingState', () => {
  it('renders loading status with label and accessible attributes', () => {
    render(<LoadingState label="Loading stock items" />)

    const statusElement = screen.getByRole('status')
    expect(statusElement).toBeInTheDocument()
    expect(statusElement).toHaveAttribute('aria-live', 'polite')
    expect(statusElement).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Loading stock items')).toBeInTheDocument()
  })

  it('renders optional detail text when provided', () => {
    render(<LoadingState label="Refreshing records" detail="Checking for overdue pawns..." />)

    expect(screen.getByText('Refreshing records')).toBeInTheDocument()
    expect(screen.getByText('Checking for overdue pawns...')).toBeInTheDocument()
  })

  it('applies compact styling when compact is true', () => {
    const { container } = render(<LoadingState label="Compact loader" compact />)
    expect(container.firstChild).toHaveClass('loading-state-compact')
  })

  it('applies custom className when provided', () => {
    const { container } = render(<LoadingState label="Custom loader" className="custom-loader-cls" />)
    expect(container.firstChild).toHaveClass('custom-loader-cls')
  })
})
