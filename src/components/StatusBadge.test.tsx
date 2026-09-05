import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StatusBadge from './StatusBadge'

describe('StatusBadge', () => {
  it('renders correctly for IN_STOCK status', () => {
    const { container } = render(<StatusBadge status="IN_STOCK" />)
    expect(screen.getByText('In Stock')).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('status-badge', 'status-in-stock')
  })

  it('renders correctly for ACTIVE status', () => {
    const { container } = render(<StatusBadge status="ACTIVE" />)
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('status-badge', 'status-active')
  })

  it('renders correctly for DUE_SOON and RESERVED statuses', () => {
    const { container } = render(<StatusBadge status="DUE_SOON" />)
    expect(screen.getByText('Due Soon')).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('status-badge', 'status-due-soon')
  })

  it('renders correctly for SOLD and PAWNED statuses', () => {
    const { container: c1 } = render(<StatusBadge status="SOLD" />)
    expect(screen.getByText('Sold')).toBeInTheDocument()
    expect(c1.firstChild).toHaveClass('status-badge', 'status-sold')

    const { container: c2 } = render(<StatusBadge status="PAWNED" />)
    expect(screen.getByText('Pawned')).toBeInTheDocument()
    expect(c2.firstChild).toHaveClass('status-badge', 'status-pawned')
  })

  it('renders correctly for REPAIR and ARCHIVED statuses', () => {
    const { container: c1 } = render(<StatusBadge status="REPAIR" />)
    expect(screen.getByText('Repair')).toBeInTheDocument()
    expect(c1.firstChild).toHaveClass('status-badge', 'status-repair')

    const { container: c2 } = render(<StatusBadge status="ARCHIVED" />)
    expect(screen.getByText('Archived')).toBeInTheDocument()
    expect(c2.firstChild).toHaveClass('status-badge', 'status-archived')
  })

  it('renders special title mappings for FORFEITED status', () => {
    const { container } = render(<StatusBadge status="FORFEITED" />)
    expect(screen.getByText('Claimed')).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('status-badge', 'status-forfeited')
  })
})
