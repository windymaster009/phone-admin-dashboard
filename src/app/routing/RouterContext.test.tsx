import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { RouterProvider, useRouter } from './RouterContext'

function TestConsumer() {
  const { currentPath, canonicalPath, routeKey, isUnknownRoute, navigate } = useRouter()
  return (
    <div>
      <span data-testid="current-path">{currentPath}</span>
      <span data-testid="canonical-path">{canonicalPath}</span>
      <span data-testid="route-key">{routeKey}</span>
      <span data-testid="is-unknown">{isUnknownRoute ? 'yes' : 'no'}</span>
      <button type="button" onClick={() => navigate('/stock')}>Go to Stock</button>
      <button type="button" onClick={() => navigate('/stock?openItem=abc-123')}>Open Stock Item</button>
      <button type="button" onClick={() => navigate('/non-existent-route')}>Go to Missing</button>
      <button type="button" onClick={() => navigate('pawn')}>Go to Pawn via Key</button>
      <button type="button" onClick={() => navigate('/settings', { replace: true })}>Replace with Settings</button>
    </div>
  )
}

describe('RouterContext & RouterProvider', () => {
  it('throws error when useRouter is used outside of RouterProvider', () => {
    expect(() => renderHook(() => useRouter())).toThrow(
      'useRouter must be used within a RouterProvider',
    )
  })

  it('provides default route state matching initial window location', () => {
    window.history.replaceState(null, '', '/dashboard')

    render(
      <RouterProvider>
        <TestConsumer />
      </RouterProvider>,
    )

    expect(screen.getByTestId('current-path')).toHaveTextContent('/dashboard')
    expect(screen.getByTestId('canonical-path')).toHaveTextContent('/dashboard')
    expect(screen.getByTestId('route-key')).toHaveTextContent('dashboard')
    expect(screen.getByTestId('is-unknown')).toHaveTextContent('no')
  })

  it('navigates to path and updates route key and history', async () => {
    window.history.replaceState(null, '', '/dashboard')
    const user = userEvent.setup()

    render(
      <RouterProvider>
        <TestConsumer />
      </RouterProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Go to Stock' }))

    expect(screen.getByTestId('current-path')).toHaveTextContent('/stock')
    expect(screen.getByTestId('route-key')).toHaveTextContent('inventory')
    expect(screen.getByTestId('is-unknown')).toHaveTextContent('no')
    expect(window.location.pathname).toBe('/stock')
  })

  it('supports navigating by route key', async () => {
    window.history.replaceState(null, '', '/dashboard')
    const user = userEvent.setup()

    render(
      <RouterProvider>
        <TestConsumer />
      </RouterProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Go to Pawn via Key' }))

    expect(screen.getByTestId('current-path')).toHaveTextContent('/pawn-management')
    expect(screen.getByTestId('route-key')).toHaveTextContent('pawn')
  })

  it('keeps search parameters in history without treating them as part of the route', async () => {
    window.history.replaceState(null, '', '/dashboard')
    const user = userEvent.setup()
    render(<RouterProvider><TestConsumer /></RouterProvider>)

    await user.click(screen.getByRole('button', { name: 'Open Stock Item' }))

    expect(screen.getByTestId('current-path')).toHaveTextContent('/stock')
    expect(screen.getByTestId('route-key')).toHaveTextContent('inventory')
    expect(window.location.search).toBe('?openItem=abc-123')
  })

  it('supports replace navigation option', async () => {
    window.history.replaceState(null, '', '/dashboard')
    const user = userEvent.setup()

    render(
      <RouterProvider>
        <TestConsumer />
      </RouterProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Replace with Settings' }))

    expect(screen.getByTestId('current-path')).toHaveTextContent('/settings')
    expect(window.location.pathname).toBe('/settings')
  })

  it('identifies unknown routes and marks isUnknownRoute as true', async () => {
    window.history.replaceState(null, '', '/dashboard')
    const user = userEvent.setup()

    render(
      <RouterProvider>
        <TestConsumer />
      </RouterProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Go to Missing' }))

    expect(screen.getByTestId('current-path')).toHaveTextContent('/non-existent-route')
    expect(screen.getByTestId('route-key')).toHaveTextContent('not-found')
    expect(screen.getByTestId('is-unknown')).toHaveTextContent('yes')
  })

  it('syncs current path on browser popstate events', () => {
    window.history.replaceState(null, '', '/dashboard')

    render(
      <RouterProvider>
        <TestConsumer />
      </RouterProvider>,
    )

    expect(screen.getByTestId('current-path')).toHaveTextContent('/dashboard')

    act(() => {
      window.history.pushState(null, '', '/customers')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(screen.getByTestId('current-path')).toHaveTextContent('/customers')
    expect(screen.getByTestId('route-key')).toHaveTextContent('customers')
  })
})
