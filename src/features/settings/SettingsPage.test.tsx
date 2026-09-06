import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsPage from './SettingsPage'
import { mockOwnerUser } from '../../test/testUtils'
import { setStoredValuations } from '../../lib/storage'
import type { AppFontSize } from '../../app/types'

describe('SettingsPage component', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('renders account profile with user details', () => {
    render(
      <SettingsPage
        user={mockOwnerUser}
        onLogout={vi.fn()}
        fontSize="default"
        onFontSizeChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Account profile')).toBeInTheDocument()
    expect(screen.getByText(mockOwnerUser.name)).toBeInTheDocument()
    expect(screen.getByText(mockOwnerUser.email)).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Full access')).toBeInTheDocument()
  })

  it('calls onLogout when logout button is clicked', async () => {
    const handleLogout = vi.fn()
    const user = userEvent.setup()

    render(
      <SettingsPage
        user={mockOwnerUser}
        onLogout={handleLogout}
        fontSize="default"
        onFontSizeChange={vi.fn()}
      />,
    )

    const logoutButton = screen.getByRole('button', { name: /Log out/i })
    await user.click(logoutButton)
    expect(handleLogout).toHaveBeenCalledTimes(1)
  })

  it('allows changing display size and triggers onFontSizeChange', async () => {
    const handleFontSizeChange = vi.fn()
    const user = userEvent.setup()

    render(
      <SettingsPage
        user={mockOwnerUser}
        onLogout={vi.fn()}
        fontSize="default"
        onFontSizeChange={handleFontSizeChange}
      />,
    )

    const comfortableOption = screen.getByRole('radio', { name: /Comfortable/i })
    expect(comfortableOption).toHaveAttribute('aria-checked', 'false')

    await user.click(comfortableOption)
    expect(handleFontSizeChange).toHaveBeenCalledWith('comfortable')
  })

  it('clears stored valuations when clear button is clicked', async () => {
    setStoredValuations([{ id: 'val-1', model: 'iPhone 15' }] as unknown as any)
    const user = userEvent.setup()

    render(
      <SettingsPage
        user={mockOwnerUser}
        onLogout={vi.fn()}
        fontSize="default"
        onFontSizeChange={vi.fn()}
      />,
    )

    expect(screen.getByText('1')).toBeInTheDocument()
    const clearButton = screen.getByRole('button', { name: /Clear records/i })
    expect(clearButton).toBeEnabled()

    await user.click(clearButton)
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(clearButton).toBeDisabled()
  })
})
