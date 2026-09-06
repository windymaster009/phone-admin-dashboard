import { render, screen } from '@testing-library/react'
import { Banknote, Clock } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import SummaryStats from './SummaryStats'

describe('SummaryStats', () => {
  it('renders a labelled collection of reusable statistic cards', () => {
    render(<SummaryStats
      label="Loan summary"
      items={[
        { label: 'Total lent', value: '$120.00', secondaryValue: '៛480,000', detail: '2 loans', icon: Banknote, tone: 'violet' },
        { label: 'Due soon', value: '1', detail: 'needs follow-up', icon: Clock, tone: 'orange' },
      ]}
    />)

    expect(screen.getByRole('region', { name: 'Loan summary' })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(screen.getByText('Total lent')).toBeInTheDocument()
    expect(screen.getByText('$120.00')).toBeInTheDocument()
    expect(screen.getByText('៛480,000')).toBeInTheDocument()
    expect(screen.getByText('needs follow-up')).toBeInTheDocument()
  })

  it('marks long values for compact rendering without changing their content', () => {
    render(<SummaryStats
      label="Large totals"
      items={[{ label: 'Stock value', value: '$12,345,678.90', icon: Banknote }]}
    />)

    expect(screen.getByText('$12,345,678.90')).toHaveAttribute('data-value-size', 'tiny')
    expect(screen.getByText('$12,345,678.90')).toHaveAttribute('title', '$12,345,678.90')
  })
})
