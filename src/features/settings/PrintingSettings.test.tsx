import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PrintingSettings from './PrintingSettings'

describe('PrintingSettings component', () => {
  let mockDoc: Document
  let mockWindow: {
    document: typeof mockDoc
    print: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    focus: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    mockDoc = document.implementation.createHTMLDocument()
    vi.spyOn(mockDoc, 'write')
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 400 } as DOMRect)
    mockWindow = {
      document: mockDoc,
      print: vi.fn(),
      close: vi.fn(),
      focus: vi.fn(),
    }
    vi.spyOn(window, 'open').mockReturnValue(mockWindow as unknown as Window)
  })

  it('renders printing card heading, entries, format toggle, and browser explanation', () => {
    render(<PrintingSettings />)

    expect(screen.getByRole('heading', { level: 3, name: 'Printing' })).toBeInTheDocument()
    expect(screen.getByText('Barcode labels')).toBeInTheDocument()
    expect(screen.getByText(/60 × 40 mm/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Test label/i })).toBeInTheDocument()

    expect(screen.getByText('Receipts')).toBeInTheDocument()
    expect(screen.getAllByText('Printer: select in print dialog')).toHaveLength(2)
    expect(screen.getByRole('radiogroup', { name: /Receipt format/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '80 mm thermal' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'A4' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Test receipt/i })).toBeInTheDocument()

    expect(
      screen.getByText('Choose your printer in the browser’s print dialog.')
    ).toBeInTheDocument()
  })

  it('opens a sample label window without claiming physical print success', async () => {
    const user = userEvent.setup()
    render(<PrintingSettings />)

    const testLabelBtn = screen.getByRole('button', { name: /Test label/i })
    await user.click(testLabelBtn)

    expect(window.open).toHaveBeenCalledWith('', 'phoneflow-label', 'width=520,height=640')
    expect(mockDoc.write).toHaveBeenCalledWith(
      expect.stringContaining('TEST LABEL — SAMPLE DEVICE')
    )
    expect(mockDoc.write).toHaveBeenCalledWith(
      expect.stringContaining('SAMPLE BRAND TEST 60x40')
    )
    expect(mockDoc.write).toHaveBeenCalledWith(
      expect.stringContaining('TEST-0000')
    )

    const statusNotice = screen.getByRole('status')
    expect(statusNotice).toHaveTextContent(/Print window opened/i)
    expect(statusNotice).toHaveTextContent(/Choose your printer in the browser’s print dialog/i)
  })

  it('displays a clear error inside the card when label popup is blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    vi.spyOn(window, 'alert').mockImplementation(() => {})

    const user = userEvent.setup()
    render(<PrintingSettings />)

    const testLabelBtn = screen.getByRole('button', { name: /Test label/i })
    await user.click(testLabelBtn)

    const errorAlert = screen.getByRole('alert')
    expect(errorAlert).toHaveTextContent(/browser blocked the print window/i)
    expect(errorAlert).toHaveTextContent(/Allow pop-ups/i)
  })

  it('prints test receipt marked TEST RECEIPT — NOT A TRANSACTION in 80mm thermal layout', async () => {
    const user = userEvent.setup()
    render(<PrintingSettings />)

    const thermalRadio = screen.getByRole('radio', { name: '80 mm thermal' })
    expect(thermalRadio).toHaveAttribute('aria-checked', 'true')

    const testReceiptBtn = screen.getByRole('button', { name: /Test receipt/i })
    await user.click(testReceiptBtn)

    expect(window.open).toHaveBeenCalledWith('', '_blank', 'width=980,height=760')
    expect(mockDoc.write).toHaveBeenCalledWith(
      expect.stringContaining('TEST RECEIPT — NOT A TRANSACTION')
    )
    expect(mockDoc.getElementById('receipt-page-size')?.textContent).toBe('@page{size:80mm 108mm;margin:0}')
    expect(mockWindow.print).toHaveBeenCalledTimes(1)
    expect(mockDoc.querySelector('script')).toBeNull()

    const statusNotice = screen.getByRole('status')
    expect(statusNotice).toHaveTextContent(/Print window opened/i)
  })

  it('prints test receipt in A4 layout when A4 format is selected', async () => {
    const user = userEvent.setup()
    render(<PrintingSettings />)

    const a4Radio = screen.getByRole('radio', { name: 'A4' })
    await user.click(a4Radio)
    expect(a4Radio).toHaveAttribute('aria-checked', 'true')

    const testReceiptBtn = screen.getByRole('button', { name: /Test receipt/i })
    await user.click(testReceiptBtn)

    expect(window.open).toHaveBeenCalledWith('', '_blank', 'width=980,height=760')
    expect(mockDoc.write).toHaveBeenCalledWith(
      expect.stringContaining('@page{size:A4;margin:0}')
    )
    expect(mockDoc.write).toHaveBeenCalledWith(
      expect.stringContaining('TEST RECEIPT — NOT A TRANSACTION')
    )
  })

  it('displays a clear error inside the card when receipt popup is blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)

    const user = userEvent.setup()
    render(<PrintingSettings />)

    const testReceiptBtn = screen.getByRole('button', { name: /Test receipt/i })
    await user.click(testReceiptBtn)

    const errorAlert = screen.getByRole('alert')
    expect(errorAlert).toHaveTextContent(/browser blocked the print window/i)
    expect(errorAlert).toHaveTextContent(/Allow pop-ups/i)
  })

  it('does NOT call any backend receipt-generation or receipt-write APIs', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const user = userEvent.setup()
    render(<PrintingSettings />)

    await user.click(screen.getByRole('button', { name: /Test label/i }))
    await user.click(screen.getByRole('button', { name: /Test receipt/i }))

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('blocks repeated clicks and format changes while preparing, then cancels on unmount', async () => {
    Object.defineProperty(mockDoc, 'fonts', { value: { ready: new Promise(() => {}) } })
    const { unmount } = render(<PrintingSettings />)
    const button = screen.getByRole('button', { name: /Test receipt/i })
    act(() => { button.click(); button.click() })
    expect(window.open).toHaveBeenCalledTimes(1)
    expect(button).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'A4' })).toBeDisabled()
    unmount()
    await waitFor(() => { expect(mockWindow.close).toHaveBeenCalledOnce() })
    expect(mockWindow.print).not.toHaveBeenCalled()
  })
})
