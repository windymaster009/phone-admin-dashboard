import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AutoCalculateToggle from './AutoCalculateToggle'

describe('AutoCalculateToggle', () => {
  it('renders its checked state as an accessible switch', () => {
    render(<AutoCalculateToggle checked onChange={vi.fn()} />)

    const toggle = screen.getByRole('switch', { name: 'Auto calculate' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(toggle).toHaveClass('active')
    expect(screen.getByText('On')).toBeInTheDocument()
  })

  it('requests the opposite state when activated', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<AutoCalculateToggle checked={false} onChange={onChange} />)

    await user.click(screen.getByRole('switch', { name: 'Auto calculate' }))

    expect(onChange).toHaveBeenCalledWith(true)
  })
})
