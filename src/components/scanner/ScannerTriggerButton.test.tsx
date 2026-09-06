import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArrowUpRight } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import ScannerTriggerButton, { openProductScanner, PRODUCT_SCANNER_EVENT } from './ScannerTriggerButton'

describe('ScannerTriggerButton', () => {
  it('renders and activates the shared toolbar trigger', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<ScannerTriggerButton label="Scan product" className="custom-trigger" onClick={onClick} />)

    const button = screen.getByRole('button', { name: 'Scan product' })
    expect(button).toHaveClass('secondary-button', 'custom-trigger')
    await user.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('supports the dashboard quick-action layout', () => {
    render(<ScannerTriggerButton label="Scan product" description="Find stock and start a sale" variant="quick-action" trailing={<ArrowUpRight data-testid="trailing-icon" />} />)

    expect(screen.getByText('Find stock and start a sale')).toBeInTheDocument()
    expect(screen.getByTestId('trailing-icon')).toBeInTheDocument()
  })

  it('opens the shared product scanner event', () => {
    const listener = vi.fn()
    window.addEventListener(PRODUCT_SCANNER_EVENT, listener)
    openProductScanner()
    expect(listener).toHaveBeenCalledOnce()
    window.removeEventListener(PRODUCT_SCANNER_EVENT, listener)
  })
})
