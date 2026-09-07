import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import KeyValueSummary, { type KeyValueSummaryItem } from './KeyValueSummary'

describe('KeyValueSummary', () => {
  const sampleItems: KeyValueSummaryItem[] = [
    { id: 'customer', label: 'Customer', value: 'Sokha Chandravuthy', tone: 'default' },
    { id: 'phone', label: 'Phone', value: '012 345 678', tone: 'default' },
    { id: 'id-num', label: 'National ID', value: '0987654321', tone: 'success', supportingText: 'Verified' },
    { id: 'missing-field', label: 'Alternative Contact', value: 'Not provided', tone: 'muted' },
  ]

  it('renders all items with their labels, values, and supporting text', () => {
    render(<KeyValueSummary items={sampleItems} />)

    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(4)

    expect(screen.getByText('Customer')).toBeInTheDocument()
    expect(screen.getByText('Sokha Chandravuthy')).toBeInTheDocument()

    expect(screen.getByText('National ID')).toBeInTheDocument()
    expect(screen.getByText('0987654321')).toBeInTheDocument()
    expect(screen.getByText('Verified')).toBeInTheDocument()
  })

  it('applies correct semantic tone classes', () => {
    render(<KeyValueSummary items={sampleItems} />)

    const successItem = screen.getByText('0987654321')
    expect(successItem).toHaveClass('verified')
    expect(successItem).toHaveClass('tone-success')

    const mutedItem = screen.getByText('Not provided')
    expect(mutedItem).toHaveClass('optional')
    expect(mutedItem).toHaveClass('tone-muted')
  })

  it('ensures large money amounts and long text are present in the DOM without truncation', () => {
    const longName = 'Sokha Chandravuthy International Import Export & Trading Representative'
    const largeKhr = '999,999,999 ៛'
    const largeUsd = '$1,250,000.00'

    const extremeItems: KeyValueSummaryItem[] = [
      { id: 'owner', label: 'Collateral Owner', value: longName },
      { id: 'khr-val', label: 'Total Valuation', value: largeKhr },
      { id: 'usd-val', label: 'USD Equivalent', value: largeUsd },
    ]

    render(<KeyValueSummary items={extremeItems} />)

    // Complete values must be in DOM, untruncated
    expect(screen.getByText(longName)).toBeInTheDocument()
    expect(screen.getByText(largeKhr)).toBeInTheDocument()
    expect(screen.getByText(largeUsd)).toBeInTheDocument()
  })

  it('applies column class and custom className', () => {
    const { container } = render(
      <KeyValueSummary
        items={sampleItems}
        columns={3}
        className="pawn-customer-summary"
      />,
    )

    const summary = container.querySelector('.key-value-summary')
    expect(summary).toHaveClass('columns-3')
    expect(summary).toHaveClass('pawn-customer-summary')
  })
})
