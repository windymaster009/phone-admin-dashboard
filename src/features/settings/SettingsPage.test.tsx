import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsPage from './SettingsPage'
import { mockOwnerUser, mockManagerUser } from '../../test/testUtils'
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

    const valuationCard = screen.getByText('Saved valuations').closest('.settings-card')!
    expect(valuationCard).toHaveTextContent('1')
    const clearButton = screen.getByRole('button', { name: /Clear records/i })
    expect(clearButton).toBeEnabled()

    await user.click(clearButton)
    expect(valuationCard).toHaveTextContent('0')
    expect(clearButton).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Saved valuations cleared successfully.')
  })

  it('renders Activity log retention section for OWNER and purges expired records on confirmation', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/settings/purge-expired-activity') && init?.method === 'POST') {
        return new Response(JSON.stringify({
          success: true,
          deletedCount: 14,
          message: 'Purged 14 expired activity records.',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('{}', { status: 200 })
    })

    render(
      <SettingsPage
        user={mockOwnerUser}
        onLogout={vi.fn()}
        fontSize="default"
        onFontSizeChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Activity log retention')).toBeInTheDocument()
    expect(screen.getByText('90 days')).toBeInTheDocument()
    expect(screen.getByText('180 days')).toBeInTheDocument()

    const purgeButton = screen.getByRole('button', { name: /Purge expired records/i })
    expect(purgeButton).toBeInTheDocument()

    await user.click(purgeButton)
    expect(window.confirm).toHaveBeenCalled()
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/settings/purge-expired-activity'),
      expect.objectContaining({ method: 'POST' })
    )
    expect(screen.getByRole('status')).toHaveTextContent('Purged 14 expired activity records.')
  })

  it('does not render Activity log retention section for non-OWNER roles', () => {
    render(
      <SettingsPage
        user={mockManagerUser}
        onLogout={vi.fn()}
        fontSize="default"
        onFontSizeChange={vi.fn()}
      />,
    )

    expect(screen.queryByText('Activity log retention')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Purge expired records/i })).not.toBeInTheDocument()
  })

  it('renders Printing section with test actions for both roles', () => {
    render(
      <SettingsPage
        user={mockManagerUser}
        onLogout={vi.fn()}
        fontSize="default"
        onFontSizeChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { level: 3, name: 'Printing' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Test label/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Test receipt/i })).toBeInTheDocument()
    expect(screen.getByText('Choose your printer in the browser’s print dialog.')).toBeInTheDocument()
  })
})
