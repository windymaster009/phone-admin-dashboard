import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import SegmentedControl, { type SegmentedControlOption } from './SegmentedControl'

describe('SegmentedControl', () => {
  const options: SegmentedControlOption<'EXISTING' | 'NEW' | 'OTHER'>[] = [
    { value: 'EXISTING', label: 'Existing customer', id: 'tab-existing' },
    { value: 'NEW', label: 'New customer', id: 'tab-new' },
    { value: 'OTHER', label: 'Other', id: 'tab-other' },
  ]

  it('renders tablist and tabs with correct accessible roles and aria-selected', () => {
    render(
      <SegmentedControl
        label="Customer type"
        value="EXISTING"
        options={options}
        onChange={vi.fn()}
        ariaControls="customer-panel"
      />,
    )

    const tablist = screen.getByRole('tablist', { name: 'Customer type' })
    expect(tablist).toBeInTheDocument()

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)

    const existingTab = screen.getByRole('tab', { name: 'Existing customer' })
    expect(existingTab).toHaveAttribute('aria-selected', 'true')
    expect(existingTab).toHaveAttribute('aria-controls', 'customer-panel')
    expect(existingTab).toHaveAttribute('tabIndex', '0')
    expect(existingTab).toHaveClass('active')

    const newTab = screen.getByRole('tab', { name: 'New customer' })
    expect(newTab).toHaveAttribute('aria-selected', 'false')
    expect(newTab).toHaveAttribute('tabIndex', '-1')
    expect(newTab).not.toHaveClass('active')
  })

  it('calls onChange when an unselected tab is clicked', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()

    render(
      <SegmentedControl
        label="Customer type"
        value="EXISTING"
        options={options}
        onChange={handleChange}
      />,
    )

    const newTab = screen.getByRole('tab', { name: 'New customer' })
    await user.click(newTab)

    expect(handleChange).toHaveBeenCalledWith('NEW')
  })

  it('does not call onChange when clicking the already selected tab', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()

    render(
      <SegmentedControl
        label="Customer type"
        value="EXISTING"
        options={options}
        onChange={handleChange}
      />,
    )

    const existingTab = screen.getByRole('tab', { name: 'Existing customer' })
    await user.click(existingTab)

    expect(handleChange).not.toHaveBeenCalled()
  })

  it('navigates with keyboard arrows and wraps correctly with controlled state', async () => {
    const user = userEvent.setup()

    function ControlledHarness() {
      const [current, setCurrent] = useState<'EXISTING' | 'NEW' | 'OTHER'>('EXISTING')
      return (
        <SegmentedControl
          label="Customer type"
          value={current}
          options={options}
          onChange={setCurrent}
        />
      )
    }

    render(<ControlledHarness />)

    const existingTab = screen.getByRole('tab', { name: 'Existing customer' })
    existingTab.focus()

    // ArrowRight moves from EXISTING (0) -> NEW (1)
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'New customer' })).toHaveAttribute('aria-selected', 'true')

    // ArrowRight moves from NEW (1) -> OTHER (2)
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Other' })).toHaveAttribute('aria-selected', 'true')

    // ArrowRight wraps from OTHER (2) -> EXISTING (0)
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Existing customer' })).toHaveAttribute('aria-selected', 'true')

    // ArrowLeft wraps backwards from EXISTING (0) -> OTHER (2)
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Other' })).toHaveAttribute('aria-selected', 'true')

    // Home goes to first (EXISTING)
    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'Existing customer' })).toHaveAttribute('aria-selected', 'true')

    // End goes to last (OTHER)
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Other' })).toHaveAttribute('aria-selected', 'true')
  })

  it('skips disabled options during keyboard navigation and disables click', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()

    const optionsWithDisabled: SegmentedControlOption[] = [
      { value: 'A', label: 'Option A' },
      { value: 'B', label: 'Option B', disabled: true },
      { value: 'C', label: 'Option C' },
    ]

    render(
      <SegmentedControl
        label="Choice"
        value="A"
        options={optionsWithDisabled}
        onChange={handleChange}
      />,
    )

    const optB = screen.getByRole('tab', { name: 'Option B' })
    expect(optB).toBeDisabled()

    await user.click(optB)
    expect(handleChange).not.toHaveBeenCalled()

    // Focus Option A and press ArrowRight - should skip B to C
    const optA = screen.getByRole('tab', { name: 'Option A' })
    optA.focus()
    await user.keyboard('{ArrowRight}')
    expect(handleChange).toHaveBeenCalledWith('C')
  })
})
