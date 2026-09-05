import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import NotFoundView from './NotFoundView'

describe('NotFoundView', () => {
  it('renders 404 heading and explanatory message', () => {
    render(<NotFoundView onGoHome={vi.fn()} />)

    expect(screen.getByRole('heading', { level: 2, name: 'Page Not Found' })).toBeInTheDocument()
    expect(
      screen.getByText(/The page you are looking for does not exist, may have been moved/i),
    ).toBeInTheDocument()
  })

  it('triggers onGoHome callback when Back to Dashboard button is clicked', async () => {
    const onGoHome = vi.fn()
    const user = userEvent.setup()

    render(<NotFoundView onGoHome={onGoHome} />)

    const button = screen.getByRole('button', { name: /Back to Dashboard/i })
    await user.click(button)

    expect(onGoHome).toHaveBeenCalledTimes(1)
  })
})
