import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RecordListRow from './RecordListRow'

describe('RecordListRow', () => {
  it('shows a repair record and opens it from the shared row', () => {
    const onOpen = vi.fn()
    render(<RecordListRow icon={<span>icon</span>} tone="repair" title="Vivo Y02s" meta="RP-123 · Sela · 20 Oct 2026" detail="Screen repair" badge={<span>In Progress</span>} ariaLabel="Open Vivo Y02s repair RP-123" onOpen={onOpen} />)

    const row = screen.getByRole('button', { name: 'Open Vivo Y02s repair RP-123' })
    expect(row).toHaveClass('record-list-row')
    expect(screen.getByText('Screen repair')).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    fireEvent.click(row)
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('keeps transaction amount direction styling', () => {
    render(<RecordListRow icon={<span>icon</span>} tone="purchase" title="Charger x1" meta="BY-123" badge={<span>Purchase</span>} amount="-$5" amountTone="out" ariaLabel="View BY-123" onOpen={() => {}} />)

    expect(screen.getByText('-$5')).toHaveClass('record-list-row-amount', 'money-out')
  })
})
