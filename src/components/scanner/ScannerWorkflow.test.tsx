import { useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ScannerWorkflow from './ScannerWorkflow'

let scanCallback: ((code: string) => void) | null = null

vi.mock('html5-qrcode', () => {
  class MockHtml5Qrcode {
    isScanning = true
    async start(
      _cameraConfig: any,
      _scanConfig: any,
      onSuccess: (decodedText: string) => void,
    ) {
      scanCallback = onSuccess
    }
    async stop() {
      this.isScanning = false
    }
    clear() {}
  }

  return {
    Html5Qrcode: MockHtml5Qrcode,
    Html5QrcodeSupportedFormats: {
      CODE_128: 1,
      CODE_39: 2,
      QR_CODE: 3,
      DATA_MATRIX: 4,
    },
  }
})

function ScannerHarness({ onSubmit = vi.fn() }: { onSubmit?: (code: string) => void }) {
  const [code, setCode] = useState('')
  return <ScannerWorkflow
    code={code}
    onCodeChange={setCode}
    onSubmit={onSubmit}
    onCameraError={vi.fn()}
    introDescription="Scan the label or use this device."
    methodTitle="Product barcode"
    methodDescription="Keep the field selected while scanning."
    inputLabel="Product code"
    placeholder="Scan or enter product code"
    submitLabel="Find product"
    helpText="Works with product barcodes."
    readerId="scanner-test-reader"
  />
}

describe('ScannerWorkflow', () => {
  beforeEach(() => {
    scanCallback = null
  })
  it('shares the manual lookup flow and submits a normalized code', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ScannerHarness onSubmit={onSubmit} />)

    const submitButton = screen.getByRole('button', { name: 'Find product' })
    expect(submitButton).toBeDisabled()

    await user.type(screen.getByRole('textbox', { name: 'Product code' }), '  SKU-100  ')
    await user.click(submitButton)

    expect(onSubmit).toHaveBeenCalledWith('SKU-100')
  })

  it('provides the same accessible camera control for every scanner', async () => {
    const user = userEvent.setup()
    render(<ScannerHarness />)

    const cameraButton = screen.getByRole('button', { name: 'Scan with camera' })
    expect(cameraButton).toHaveAttribute('aria-pressed', 'false')

    await user.click(cameraButton)

    expect(screen.getByRole('button', { name: 'Stop camera' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelector('[data-scanner-reader]')).toHaveClass('active')
  })

  it('submits on Enter key and blocks whitespace-only submission', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ScannerHarness onSubmit={onSubmit} />)

    const input = screen.getByRole('textbox', { name: 'Product code' })
    await user.type(input, '   ')
    expect(screen.getByRole('button', { name: 'Find product' })).toBeDisabled()

    await user.type(input, 'IMEI-998877{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('IMEI-998877')
  })

  it('disables input and displays busy label when busy is true', () => {
    const onCodeChange = vi.fn()
    const onSubmit = vi.fn()

    render(
      <ScannerWorkflow
        code="SKU-BUSY"
        onCodeChange={onCodeChange}
        onSubmit={onSubmit}
        onCameraError={vi.fn()}
        busy
        busyLabel="Locating device..."
        introTitle="Look up inventory"
        introDescription="Search by IMEI or SKU."
        methodTitle="Barcode scan"
        methodDescription="Keep input focused."
        inputLabel="IMEI or SKU"
        placeholder="Enter identifier"
        submitLabel="Look up"
        helpText="Press enter to search."
      />,
    )

    const input = screen.getByRole('textbox', { name: 'IMEI or SKU' })
    expect(input).toBeDisabled()

    const submitBtn = screen.getByRole('button', { name: 'Locating device...' })
    expect(submitBtn).toBeDisabled()
  })

  it('routes camera scan to onScan when provided, and forwards camera error', async () => {
    const user = userEvent.setup()
    const onCodeChange = vi.fn()
    const onSubmit = vi.fn()
    const onScan = vi.fn()
    const onCameraError = vi.fn()

    render(
      <ScannerWorkflow
        code=""
        onCodeChange={onCodeChange}
        onSubmit={onSubmit}
        onScan={onScan}
        onCameraError={onCameraError}
        introDescription="Scan barcode."
        methodTitle="Hardware"
        methodDescription="Barcode"
        inputLabel="Code"
        placeholder="Scan code"
        submitLabel="Search"
        helpText="Help"
        inputId="test-scanner-input"
        className="custom-scanner-workflow"
        cameraHelpText="Local or HTTPS only."
      />,
    )

    expect(document.querySelector('.custom-scanner-workflow')).toBeInTheDocument()
    expect(screen.getByText('Local or HTTPS only.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Code' })).toHaveAttribute('id', 'test-scanner-input')

    // Start camera
    await user.click(screen.getByRole('button', { name: 'Scan with camera' }))
    expect(scanCallback).toBeTruthy()

    // Trigger scan
    act(() => {
      scanCallback!('SCANNED-ITEM-123')
    })

    expect(onScan).toHaveBeenCalledWith('SCANNED-ITEM-123')
    expect(onCodeChange).toHaveBeenCalledWith('SCANNED-ITEM-123')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('falls back to onSubmit when onScan is omitted during camera scan', async () => {
    const user = userEvent.setup()
    const onCodeChange = vi.fn()
    const onSubmit = vi.fn()

    render(
      <ScannerWorkflow
        code=""
        onCodeChange={onCodeChange}
        onSubmit={onSubmit}
        onCameraError={vi.fn()}
        introDescription="Scan barcode."
        methodTitle="Hardware"
        methodDescription="Barcode"
        inputLabel="Code"
        placeholder="Scan code"
        submitLabel="Search"
        helpText="Help"
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Scan with camera' }))
    expect(scanCallback).toBeTruthy()

    act(() => {
      scanCallback!('SCANNED-FALLBACK-456')
    })

    expect(onSubmit).toHaveBeenCalledWith('SCANNED-FALLBACK-456')
    expect(onCodeChange).toHaveBeenCalledWith('SCANNED-FALLBACK-456')
  })
})
