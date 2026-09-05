import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ErrorBoundary from './ErrorBoundary'

function Bomb({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error('Explosion in component!')
  }
  return <div>Component is fine</div>
}

describe('ErrorBoundary', () => {
  it('renders children normally when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Safe content</div>
      </ErrorBoundary>,
    )

    expect(screen.getByText('Safe content')).toBeInTheDocument()
  })

  it('catches render error and displays accessible alert with default message', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(
      <ErrorBoundary boundaryName="TestFeature">
        <Bomb />
      </ErrorBoundary>,
    )

    const alertElement = screen.getByRole('alert')
    expect(alertElement).toBeInTheDocument()
    expect(alertElement).toHaveAttribute('data-boundary', 'TestFeature')
    expect(screen.getByRole('heading', { level: 2, name: 'Something went wrong' })).toBeInTheDocument()
    expect(
      screen.getByText('An unexpected problem occurred while rendering this section.'),
    ).toBeInTheDocument()

    consoleSpy.mockRestore()
  })

  it('renders custom title and message when provided via props', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(
      <ErrorBoundary
        fallbackTitle="Custom Error Title"
        fallbackMessage="Custom failure details."
      >
        <Bomb />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Custom Error Title' })).toBeInTheDocument()
    expect(screen.getByText('Custom failure details.')).toBeInTheDocument()

    consoleSpy.mockRestore()
  })

  it('calls onReset and attempts re-rendering when Try again button is clicked', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const onReset = vi.fn()
    const user = userEvent.setup()

    let shouldThrow = true
    const { rerender } = render(
      <ErrorBoundary onReset={onReset}>
        <Bomb shouldThrow={shouldThrow} />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()

    shouldThrow = false
    rerender(
      <ErrorBoundary onReset={onReset}>
        <Bomb shouldThrow={shouldThrow} />
      </ErrorBoundary>,
    )

    const retryBtn = screen.getByRole('button', { name: /Try rendering this component again/i })
    await user.click(retryBtn)

    expect(onReset).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Component is fine')).toBeInTheDocument()

    consoleSpy.mockRestore()
  })

  it('handles chunk load errors by displaying network reload message', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    function ChunkBomb(): React.ReactNode {
      const err = new Error('Loading chunk 123 failed')
      err.name = 'ChunkLoadError'
      throw err
    }

    render(
      <ErrorBoundary>
        <ChunkBomb />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Failed to load component' })).toBeInTheDocument()
    expect(
      screen.getByText(/A network interruption or updated version prevented this feature from loading/i),
    ).toBeInTheDocument()

    consoleSpy.mockRestore()
  })
})
