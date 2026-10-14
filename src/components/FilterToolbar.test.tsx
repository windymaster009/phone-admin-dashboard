import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import FilterToolbar from './FilterToolbar'
import FilterSelect from './FilterSelect'

describe('FilterToolbar', () => {
  it('wraps filter selects with one shared animated chevron without changing their behavior', async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    const onStatusChange = vi.fn()

    render(
      <FilterToolbar
        search=""
        onSearchChange={onSearchChange}
        searchLabel="Search records"
        placeholder="Search records"
      >
        <FilterSelect
          aria-label="Filter status"
          defaultValue="ALL"
          onChange={(event) => onStatusChange(event.target.value)}
        >
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
        </FilterSelect>
      </FilterToolbar>,
    )

    const select = screen.getByRole('combobox', { name: 'Filter status' })
    const shell = select.closest('.filter-select-shell')

    expect(shell).not.toBeNull()
    expect(shell?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')

    await user.selectOptions(select, 'ACTIVE')
    expect(onStatusChange).toHaveBeenCalledWith('ACTIVE')

    await user.type(screen.getByRole('textbox', { name: 'Search records' }), 'pawn')
    expect(onSearchChange).toHaveBeenLastCalledWith('n')
  })
})
