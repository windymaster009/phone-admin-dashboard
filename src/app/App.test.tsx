import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { RouterProvider } from './routing'
import {
  mockCashierUser,
  mockOwnerUser,
  mockShop,
} from '../test/testUtils'

describe('App component composition and navigation', () => {
  beforeEach(() => {
    // Deterministic mock for fetch for loan summaries, backups, etc.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({}),
      text: async () => '',
    } as Response)
  })

  function renderApp(
    user = mockOwnerUser,
    path = '/dashboard',
    theme: 'dark' | 'light' = 'dark',
    onToggleTheme = vi.fn(),
    onLogout = vi.fn(),
  ) {
    window.history.replaceState(null, '', path)
    return render(
      <RouterProvider>
        <App
          user={user}
          shop={mockShop}
          onLogout={onLogout}
          theme={theme}
          onToggleTheme={onToggleTheme}
          fontSize="default"
          onFontSizeChange={vi.fn()}
          onWorkspaceReady={vi.fn()}
        />
      </RouterProvider>,
    )
  }

  it('renders sidebar brand, navigation items, and shop information', () => {
    renderApp()

    expect(screen.getByText(mockShop.name)).toBeInTheDocument()
    expect(screen.getByText(mockShop.subtitle)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Dashboard/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Stock Information/i })).toBeInTheDocument()
  })

  it('displays role-permitted navigation items for OWNER and hides restricted items for CASHIER', () => {
    const { unmount } = renderApp(mockOwnerUser)
    expect(screen.getByRole('button', { name: /Security/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Refunds/i })).toBeInTheDocument()
    unmount()

    renderApp(mockCashierUser)
    expect(screen.queryByRole('button', { name: /Security/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Refunds/i })).not.toBeInTheDocument()
  })

  it('navigates to stock page when Stock Information nav button is clicked', async () => {
    const user = userEvent.setup()
    renderApp(mockOwnerUser, '/dashboard')

    const stockBtn = screen.getByRole('button', { name: /Stock Information/i })
    await user.click(stockBtn)

    await waitFor(() => {
      expect(window.location.pathname).toBe('/stock')
    })
  })

  it('renders NotFoundView when current route is invalid', () => {
    renderApp(mockOwnerUser, '/unknown-route-that-does-not-exist')

    expect(screen.getByRole('heading', { level: 2, name: /Page Not Found/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Back to Dashboard/i })).toBeInTheDocument()
  })

  it('triggers onToggleTheme when the theme button is clicked', async () => {
    const onToggleTheme = vi.fn()
    const user = userEvent.setup()

    renderApp(mockOwnerUser, '/dashboard', 'dark', onToggleTheme)

    const themeToggleBtn = screen.getByLabelText(/Switch to light mode/i)
    await user.click(themeToggleBtn)

    expect(onToggleTheme).toHaveBeenCalledTimes(1)
  })

  it('opens profile dropdown and allows logging out', async () => {
    const onLogout = vi.fn()
    const user = userEvent.setup()

    renderApp(mockOwnerUser, '/dashboard', 'dark', vi.fn(), onLogout)

    const profileTrigger = screen.getByRole('button', { name: /Sophea/i })
    await user.click(profileTrigger)

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByText(mockOwnerUser.email)).toBeInTheDocument()

    const logoutBtn = screen.getByRole('menuitem', { name: /Log out/i })
    await user.click(logoutBtn)

    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('closes profile dropdown on Escape key and outside click', async () => {
    const user = userEvent.setup()
    renderApp(mockOwnerUser, '/dashboard')

    const profileTrigger = screen.getByRole('button', { name: /Sophea/i })
    await user.click(profileTrigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    // Press Escape
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    // Open again and click outside
    await user.click(profileTrigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('toggles notification dropdown when bell icon is clicked', async () => {
    const user = userEvent.setup()
    renderApp(mockOwnerUser, '/dashboard')

    const bellBtn = screen.getByRole('button', { name: /Notifications/i })
    expect(bellBtn).toHaveAttribute('aria-expanded', 'false')

    await user.click(bellBtn)
    expect(bellBtn).toHaveAttribute('aria-expanded', 'true')

    await user.click(bellBtn)
    expect(bellBtn).toHaveAttribute('aria-expanded', 'false')
  })

  it('handles mobile drawer open, close on Escape, and close on overlay click', async () => {
    const originalMatchMedia = window.matchMedia
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('max-width: 900px'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    try {
      const user = userEvent.setup()
      const { container } = renderApp(mockOwnerUser, '/dashboard')

      const openBtn = screen.getByRole('button', { name: /Open navigation menu/i })
      await user.click(openBtn)

      const sidebar = container.querySelector('#primary-sidebar')
      expect(sidebar).toHaveClass('mobile-open')

      // Escape closes drawer
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(sidebar).not.toHaveClass('mobile-open')

      // Open and click overlay to close
      await user.click(openBtn)
      expect(sidebar).toHaveClass('mobile-open')

      const overlay = container.querySelector('.mobile-overlay')!
      fireEvent.click(overlay)
      expect(sidebar).not.toHaveClass('mobile-open')
    } finally {
      window.matchMedia = originalMatchMedia
    }
  })

  it('polls overdue loans count and displays badge', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/loans/summary')) {
        return new Response(JSON.stringify({ summary: { counts: { overdue: 7 } } }), { status: 200 })
      }
      return new Response(JSON.stringify({}), { status: 200 })
    })

    renderApp(mockOwnerUser, '/dashboard')

    await waitFor(() => {
      expect(screen.getByText('7 overdue')).toBeInTheDocument()
    })
  })

  it('automatically redirects non-canonical alias paths to canonical paths', async () => {
    renderApp(mockOwnerUser, '/admin')

    await waitFor(() => {
      expect(window.location.pathname).toBe('/dashboard')
    })
  })

  it('closes mobile drawer via mobile-close button', async () => {
    const originalMatchMedia = window.matchMedia
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('max-width: 900px'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    try {
      const user = userEvent.setup()
      const { container } = renderApp(mockOwnerUser, '/dashboard')

      const openBtn = screen.getByRole('button', { name: /Open navigation menu/i })
      await user.click(openBtn)

      const sidebar = container.querySelector('#primary-sidebar')
      expect(sidebar).toHaveClass('mobile-open')

      const closeBtn = screen.getByRole('button', { name: /Close navigation menu/i })
      await user.click(closeBtn)

      expect(sidebar).not.toHaveClass('mobile-open')
    } finally {
      window.matchMedia = originalMatchMedia
    }
  })

  it('navigates to settings when Account Settings is clicked in profile menu', async () => {
    const user = userEvent.setup()
    renderApp(mockOwnerUser, '/dashboard')

    const profileTrigger = screen.getByRole('button', { name: /Sophea/i })
    await user.click(profileTrigger)

    const settingsBtn = screen.getByRole('menuitem', { name: /Account settings/i })
    await user.click(settingsBtn)

    await waitFor(() => {
      expect(window.location.pathname).toBe('/settings')
    })
  })

  it('renders views for different routes like settings, services, receipts, and pawn', async () => {
    const { unmount: unmount1 } = renderApp(mockOwnerUser, '/settings')
    await waitFor(() => {
      expect(window.location.pathname).toBe('/settings')
    })
    unmount1()

    const { unmount: unmount2 } = renderApp(mockOwnerUser, '/services')
    await waitFor(() => {
      expect(window.location.pathname).toBe('/services')
    })
    unmount2()

    const { unmount: unmount3 } = renderApp(mockOwnerUser, '/receipts')
    await waitFor(() => {
      expect(window.location.pathname).toBe('/receipts')
    })
    unmount3()

    renderApp(mockOwnerUser, '/pawn-management')
    await waitFor(() => {
      expect(window.location.pathname).toBe('/pawn-management')
    })
  })
})
