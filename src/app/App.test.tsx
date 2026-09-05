import { render, screen, waitFor } from '@testing-library/react'
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
})
