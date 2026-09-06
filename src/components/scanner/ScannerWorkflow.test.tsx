import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ScannerWorkflow from './ScannerWorkflow'

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
})
