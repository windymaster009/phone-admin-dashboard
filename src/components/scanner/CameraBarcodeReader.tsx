import { useEffect, useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import './scanner-workflow.css'

type CameraBarcodeReaderProps = {
  onScan: (code: string) => void
  onError: (message: string) => void
  readerId?: string
  autoStart?: boolean
  helpText?: string
}

export default function CameraBarcodeReader({
  onScan,
  onError,
  readerId = 'phoneflow-barcode-reader',
  autoStart = false,
  helpText = 'Camera scanning requires permission and works on localhost or HTTPS.',
}: CameraBarcodeReaderProps) {
  const [active, setActive] = useState(autoStart)
  const onScanRef = useRef(onScan)
  const onErrorRef = useRef(onError)

  useEffect(() => { onScanRef.current = onScan }, [onScan])
  useEffect(() => { onErrorRef.current = onError }, [onError])

  useEffect(() => {
    if (!active) return
    let scanner: import('html5-qrcode').Html5Qrcode | null = null
    let disposed = false

    async function startCamera() {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
      if (disposed) return
      scanner = new Html5Qrcode(readerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
        ],
        verbose: false,
      })
      const scanWidth = Math.min(280, Math.max(180, window.innerWidth - 96))
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: scanWidth, height: Math.round(scanWidth * 0.46) } },
        (decodedText) => {
          if (disposed) return
          setActive(false)
          onScanRef.current(decodedText)
        },
        () => undefined,
      )
    }

    void startCamera().catch((reason: Error) => {
      setActive(false)
      onErrorRef.current(reason.message || 'Unable to start the camera. Check camera permission and try again.')
    })

    return () => {
      disposed = true
      if (scanner?.isScanning) void scanner.stop().finally(() => scanner?.clear())
      else scanner?.clear()
    }
  }, [active, readerId])

  return (
    <div className={`camera-scanner${autoStart ? ' automatic' : ''}`}>
      <div id={readerId} data-scanner-reader className={active ? 'active' : ''} />
      {!autoStart && <button type="button" className="secondary-button" aria-pressed={active} onClick={() => setActive((value) => !value)}>
        <Camera size={17} aria-hidden="true" /> {active ? 'Stop camera' : 'Scan with camera'}
      </button>}
      {!autoStart && <small>{helpText}</small>}
    </div>
  )
}
