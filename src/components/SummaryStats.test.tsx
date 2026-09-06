import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AlertTriangle, Banknote, Clock, DollarSign, ShieldCheck, Smartphone } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import SummaryStats from './SummaryStats'

describe('SummaryStats', () => {
  it('renders a labelled collection of reusable statistic cards with accessible semantics', () => {
    render(
      <SummaryStats
        label="Loan summary"
        items={[
          {
            label: 'Total lent',
            value: '$120.00',
            secondaryValue: '៛480,000',
            detail: '2 loans',
            icon: Banknote,
            tone: 'violet',
          },
          {
            label: 'Due soon',
            value: '1',
            detail: 'needs follow-up',
            icon: Clock,
            tone: 'orange',
          },
        ]}
      />,
    )

    const group = screen.getByRole('region', { name: 'Loan summary' })
    expect(group).toBeInTheDocument()
    const cards = screen.getAllByRole('article')
    expect(cards).toHaveLength(2)
    expect(cards[0]).toHaveAttribute('data-content-density', 'extended')
    expect(cards[1]).toHaveAttribute('data-content-density', 'brief')
    expect(screen.getByText('Total lent')).toBeInTheDocument()
    expect(screen.getByText('$120.00')).toBeInTheDocument()
    expect(screen.getByText('៛480,000')).toBeInTheDocument()
    expect(screen.getByText('needs follow-up')).toBeInTheDocument()

    // Decorative icons marked aria-hidden
    const icons = group.querySelectorAll('.summary-stat-icon')
    expect(icons.length).toBe(2)
    icons.forEach((icon) => expect(icon).toHaveAttribute('aria-hidden', 'true'))
  })

  it('renders short numeric values with default sizing', () => {
    render(
      <SummaryStats
        label="Count stats"
        items={[
          { label: 'Zero count', value: 0, icon: Clock },
          { label: 'Short count', value: 98, icon: Clock },
          { label: 'Medium integer', value: '12,500', icon: Banknote },
        ]}
      />,
    )

    expect(screen.getByText('0')).toHaveAttribute('data-value-size', 'default')
    expect(screen.getByText('0')).toHaveAttribute('title', '0')
    expect(screen.getByText('98')).toHaveAttribute('data-value-size', 'default')
    expect(screen.getByText('12,500')).toHaveAttribute('data-value-size', 'default')
  })

  it('renders long USD and KHR currency values with appropriate responsive sizes', () => {
    render(
      <SummaryStats
        label="Currency totals"
        items={[
          { label: 'USD total', value: '$125,000.50', icon: DollarSign },
          { label: 'Huge USD', value: '$12,345,678.90', icon: DollarSign },
          { label: 'KHR total', value: '៛50,000,000', icon: Banknote },
        ]}
      />,
    )

    // $125,000.50 (11 chars) -> compact
    expect(screen.getByText('$125,000.50')).toHaveAttribute('data-value-size', 'compact')
    expect(screen.getByText('$125,000.50')).toHaveAttribute('title', '$125,000.50')

    // $12,345,678.90 (14 chars) -> tiny
    expect(screen.getByText('$12,345,678.90')).toHaveAttribute('data-value-size', 'tiny')
    expect(screen.getByText('$12,345,678.90')).toHaveAttribute('title', '$12,345,678.90')

    // ៛50,000,000 (11 chars) -> compact
    expect(screen.getByText('៛50,000,000')).toHaveAttribute('data-value-size', 'compact')
    expect(screen.getByText('៛50,000,000')).toHaveAttribute('title', '៛50,000,000')
  })

  it('handles negative currency values with valueTone and visible negative sign', () => {
    render(
      <SummaryStats
        label="Financial summary"
        items={[
          {
            label: 'Net loss',
            value: '-$1,250,000.00',
            valueTone: 'negative',
            icon: DollarSign,
          },
          {
            label: 'Caution alert',
            value: '3 contracts',
            valueTone: 'warning',
            icon: AlertTriangle,
          },
        ]}
      />,
    )

    const negativeVal = screen.getByText('-$1,250,000.00')
    expect(negativeVal).toHaveAttribute('data-value-size', 'tiny')
    expect(negativeVal).toHaveClass('value-tone-negative')

    const warningVal = screen.getByText('3 contracts')
    expect(warningVal).toHaveClass('value-tone-warning')
  })

  it('supports complex ReactNode values using valueText for sizing and title', () => {
    render(
      <SummaryStats
        label="Dual currency overview"
        items={[
          {
            label: 'Pawn Outstanding',
            value: (
              <span className="dual-currency">
                <strong>$125,000.50</strong>
                <small>៛500,000,000</small>
              </span>
            ),
            valueText: '$125,000.50 / ៛500,000,000',
            icon: Banknote,
          },
        ]}
      />,
    )

    expect(screen.getByText('$125,000.50')).toBeInTheDocument()
    expect(screen.getByText('៛500,000,000')).toBeInTheDocument()
    const containerValue = screen.getByTitle('$125,000.50 / ៛500,000,000')
    expect(containerValue).toBeInTheDocument()
    expect(containerValue).toHaveAttribute('data-value-size', 'tiny')
  })

  it('supports explicit valueSize override', () => {
    render(
      <SummaryStats
        label="Explicit size"
        items={[
          {
            label: 'Custom size',
            value: '42',
            valueSize: 'compact',
            icon: Clock,
          },
        ]}
      />,
    )

    expect(screen.getByText('42')).toHaveAttribute('data-value-size', 'compact')
  })

  it('applies controlled layout variants correctly', () => {
    const { rerender } = render(
      <SummaryStats
        label="Variant test"
        variant="compact"
        items={[{ label: 'Test', value: '10', icon: Clock }]}
      />,
    )
    expect(screen.getByRole('region', { name: 'Variant test' })).toHaveClass('summary-stats-compact')

    rerender(
      <SummaryStats
        label="Variant test"
        variant="standard"
        items={[{ label: 'Test', value: '10', icon: Clock }]}
      />,
    )
    expect(screen.getByRole('region', { name: 'Variant test' })).toHaveClass('summary-stats-standard')

    rerender(
      <SummaryStats
        label="Variant test"
        variant="detailed"
        items={[{ label: 'Test', value: '10', icon: Clock }]}
      />,
    )
    expect(screen.getByRole('region', { name: 'Variant test' })).toHaveClass('summary-stats-detailed')

    // 'stacked' normalizes to 'detailed'
    rerender(
      <SummaryStats
        label="Variant test"
        variant="stacked"
        items={[{ label: 'Test', value: '10', icon: Clock }]}
      />,
    )
    expect(screen.getByRole('region', { name: 'Variant test' })).toHaveClass('summary-stats-detailed')
  })

  it('renders interactive button cards when onClick is provided', async () => {
    const handleClick = vi.fn()
    const user = userEvent.setup()

    render(
      <SummaryStats
        label="Interactive categories"
        variant="compact"
        items={[
          {
            label: 'Phones',
            value: 45,
            icon: Smartphone,
            active: true,
            onClick: handleClick,
            ariaLabel: 'Filter by Phones',
          },
          {
            label: 'Security status',
            value: 'Enabled',
            icon: ShieldCheck,
            active: false,
          },
        ]}
      />,
    )

    const button = screen.getByRole('button', { name: 'Filter by Phones' })
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveClass('is-active')

    await user.click(button)
    expect(handleClick).toHaveBeenCalledTimes(1)

    // Non-clickable card retains article semantics
    expect(screen.getByRole('article')).toBeInTheDocument()
  })

  it('sets custom columns CSS variable when columns prop is passed', () => {
    render(
      <SummaryStats
        label="Custom columns"
        columns={5}
        items={[{ label: 'Col test', value: '5', icon: Clock }]}
      />,
    )

    const region = screen.getByRole('region', { name: 'Custom columns' })
    expect(region).toHaveStyle({ '--summary-columns': '5' })
  })
})
