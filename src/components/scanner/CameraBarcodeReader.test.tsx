import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CameraBarcodeReader from './CameraBarcodeReader'

// Mock html5-qrcode
let mockScannerInstance: any = null
let startSuccessCallback: ((decodedText: string) => void) | null = null
let startErrorCallback: ((errorMessage: string) => void) | null = null
let startPromiseResolve: (() => void) | null = null
let startPromiseReject: ((reason: Error) => void) | null = null
let shouldDelayStart = false
let startShouldReject: Error | null = null

vi.mock('html5-qrcode', () => {
  class MockHtml5Qrcode {
    elementId: string
    config: any
    isScanning = false
    stopCalled = false
    clearCalled = false

    constructor(elementId: string, config: any) {
      this.elementId = elementId
      this.config = config
      mockScannerInstance = this
    }

    async start(
      _cameraConfig: any,
      _scanConfig: any,
      onSuccess: (decodedText: string) => void,
      onError: (errorMessage: string) => void,
    ) {
      startSuccessCallback = onSuccess
      startErrorCallback = onError

      if (startShouldReject) {
        throw startShouldReject
      }

      if (shouldDelayStart) {
        await new Promise<void>((resolve, reject) => {
          startPromiseResolve = resolve
          startPromiseReject = reject
        })
      }

      this.isScanning = true
    }

    async stop() {
      this.isScanning = false
      this.stopCalled = true
    }

    clear() {
      this.clearCalled = true
    }
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

describe('CameraBarcodeReader regression coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockScannerInstance = null
    startSuccessCallback = null
    startErrorCallback = null
    startPromiseResolve = null
    startPromiseReject = null
    shouldDelayStart = false
    startShouldReject = null
  })

  it('renders inactive trigger button with help text by default', () => {
    render(<CameraBarcodeReader onScan={vi.fn()} onError={vi.fn()} helpText="Scan on HTTPS only." />)

    const button = screen.getByRole('button', { name: /Scan with camera/i })
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Scan on HTTPS only.')).toBeInTheDocument()
    expect(document.querySelector('[data-scanner-reader]')).not.toHaveClass('active')
  })

  it('starts scanner on toggle and forwards successful decoded scan once', async () => {
    const user = userEvent.setup()
    const onScan = vi.fn()
    const onError = vi.fn()

    render(<CameraBarcodeReader onScan={onScan} onError={onError} />)

    const button = screen.getByRole('button', { name: /Scan with camera/i })
    await user.click(button)

    await waitFor(() => {
      expect(mockScannerInstance).not.toBeNull()
      expect(mockScannerInstance.isScanning).toBe(true)
    })

    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveTextContent('Stop camera')
    expect(document.querySelector('[data-scanner-reader]')).toHaveClass('active')

    // Simulate decoded scan frame
    expect(startSuccessCallback).not.toBeNull()
    act(() => {
      startSuccessCallback!('IMEI-354890123456789')
    })

    expect(onScan).toHaveBeenCalledTimes(1)
    expect(onScan).toHaveBeenCalledWith('IMEI-354890123456789')

    // Scanner turns inactive after successful scan
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-pressed', 'false')
      expect(button).toHaveTextContent('Scan with camera')
    })
  })

  it('demonstrates bug: repeated frames in the same video stream must NOT fire onScan duplicate times', async () => {
    const user = userEvent.setup()
    const onScan = vi.fn()
    const onError = vi.fn()

    render(<CameraBarcodeReader onScan={onScan} onError={onError} />)

    await user.click(screen.getByRole('button', { name: /Scan with camera/i }))

    await waitFor(() => {
      expect(startSuccessCallback).not.toBeNull()
    })

    // Simulate multiple video frames captured before React completes cleanup
    act(() => {
      startSuccessCallback!('CODE-128-ABC')
      startSuccessCallback!('CODE-128-ABC')
      startSuccessCallback!('CODE-128-ABC')
    })

    // Must be called exactly once, ignoring repeated frames
    expect(onScan).toHaveBeenCalledTimes(1)
    expect(onScan).toHaveBeenCalledWith('CODE-128-ABC')
  })

  it('allows deliberate later scans after previous scan completes', async () => {
    const user = userEvent.setup()
    const onScan = vi.fn()
    const onError = vi.fn()

    render(<CameraBarcodeReader onScan={onScan} onError={onError} />)

    // Scan 1
    await user.click(screen.getByRole('button', { name: /Scan with camera/i }))
    await waitFor(() => expect(startSuccessCallback).not.toBeNull())
    act(() => {
      startSuccessCallback!('SCAN-FIRST')
    })
    expect(onScan).toHaveBeenCalledWith('SCAN-FIRST')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Scan with camera/i })).toHaveAttribute('aria-pressed', 'false')
    })

    // Deliberate Scan 2
    await user.click(screen.getByRole('button', { name: /Scan with camera/i }))
    await waitFor(() => expect(startSuccessCallback).not.toBeNull())
    act(() => {
      startSuccessCallback!('SCAN-SECOND')
    })

    expect(onScan).toHaveBeenCalledTimes(2)
    expect(onScan).toHaveBeenLastCalledWith('SCAN-SECOND')
  })

  it('handles camera permission denied with error callback and enables retry', async () => {
    const user = userEvent.setup()
    const onScan = vi.fn()
    const onError = vi.fn()

    startShouldReject = new Error('NotAllowedError: Permission denied')

    render(<CameraBarcodeReader onScan={onScan} onError={onError} />)

    await user.click(screen.getByRole('button', { name: /Scan with camera/i }))

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('NotAllowedError: Permission denied')
    })

    // Active state reset to false, allowing retry
    const button = screen.getByRole('button', { name: /Scan with camera/i })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button).toHaveTextContent('Scan with camera')
  })

  it('handles no camera found error with fallback message', async () => {
    const user = userEvent.setup()
    const onScan = vi.fn()
    const onError = vi.fn()

    startShouldReject = new Error('') // Empty message triggers fallback

    render(<CameraBarcodeReader onScan={onScan} onError={onError} />)

    await user.click(screen.getByRole('button', { name: /Scan with camera/i }))

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Unable to start the camera. Check camera permission and try again.')
    })
  })

  it('supports autoStart mode mounting scanner automatically without trigger button', async () => {
    const onScan = vi.fn()
    const onError = vi.fn()

    render(<CameraBarcodeReader autoStart onScan={onScan} onError={onError} />)

    expect(screen.queryByRole('button', { name: /Scan with camera/i })).not.toBeInTheDocument()

    await waitFor(() => {
      expect(mockScannerInstance).not.toBeNull()
      expect(mockScannerInstance.isScanning).toBe(true)
    })
  })

  it('demonstrates bug: unmounting while scanner is starting up stops and clears scanner', async () => {
    shouldDelayStart = true
    const onScan = vi.fn()
    const onError = vi.fn()

    const { unmount } = render(<CameraBarcodeReader autoStart onScan={onScan} onError={onError} />)

    await waitFor(() => {
      expect(startPromiseResolve).not.toBeNull()
    })

    // Unmount before start resolves
    unmount()

    // Now start finishes
    startPromiseResolve!()

    await waitFor(() => {
      expect(mockScannerInstance.stopCalled).toBe(true)
      expect(mockScannerInstance.isScanning).toBe(false)
      expect(mockScannerInstance.clearCalled).toBe(true)
    })
  })

  it('ignores startup rejection from a disposed reader', async () => {
    shouldDelayStart = true
    const onError = vi.fn()
    const { unmount } = render(<CameraBarcodeReader autoStart onScan={vi.fn()} onError={onError} />)
    await waitFor(() => expect(startPromiseReject).not.toBeNull())
    unmount()
    await act(async () => { startPromiseReject!(new Error('Old permission request rejected')) })
    expect(onError).not.toHaveBeenCalled()
  })

  it('waits for pending startup cleanup before starting a replacement reader', async () => {
    shouldDelayStart = true
    const user = userEvent.setup()
    render(<CameraBarcodeReader onScan={vi.fn()} onError={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /Scan with camera/i }))
    await waitFor(() => expect(startPromiseResolve).not.toBeNull())
    const firstScanner = mockScannerInstance
    const finishFirstStart = startPromiseResolve!
    await user.click(screen.getByRole('button', { name: /Stop camera/i }))
    expect(firstScanner.clearCalled).toBe(false)
    shouldDelayStart = false
    await user.click(screen.getByRole('button', { name: /Scan with camera/i }))
    expect(mockScannerInstance).toBe(firstScanner)
    await act(async () => { finishFirstStart() })
    await waitFor(() => expect(mockScannerInstance).not.toBe(firstScanner))
    expect(firstScanner.isScanning).toBe(false)
    expect(firstScanner.clearCalled).toBe(true)
    expect(mockScannerInstance.isScanning).toBe(true)
  })

  it('cleans up active scanner when unmounting normally', async () => {
    const user = userEvent.setup()
    const onScan = vi.fn()
    const onError = vi.fn()

    const { unmount } = render(<CameraBarcodeReader onScan={onScan} onError={onError} />)

    await user.click(screen.getByRole('button', { name: /Scan with camera/i }))

    await waitFor(() => {
      expect(mockScannerInstance?.isScanning).toBe(true)
    })

    unmount()

    await waitFor(() => expect(mockScannerInstance.stopCalled).toBe(true))
  })
})
