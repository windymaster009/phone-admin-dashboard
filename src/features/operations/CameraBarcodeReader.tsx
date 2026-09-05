import { useEffect, useState } from 'react'
import { Camera } from 'lucide-react'

export default function CameraBarcodeReader({ onScan, onError, readerId = 'phoneflow-barcode-reader', autoStart = false }: { onScan: (code: string) => void; onError: (message: string) => void; readerId?: string; autoStart?: boolean }) {
  const [active, setActive] = useState(autoStart)

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
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 280, height: 130 } },
        (decodedText) => {
          if (disposed) return
          setActive(false)
          onScan(decodedText)
        },
        () => undefined,
      )
    }

    void startCamera().catch((reason: Error) => {
      setActive(false)
      onError(reason.message || 'Unable to start the camera. Check camera permission and try again.')
    })

    return () => {
      disposed = true
      if (scanner?.isScanning) void scanner.stop().finally(() => scanner?.clear())
      else scanner?.clear()
    }
  }, [active, onError, onScan, readerId])

  return (
    <div className={`camera-scanner ${autoStart ? 'automatic' : ''}`}>
      <div id={readerId} className={active ? 'active' : ''} />
      {!autoStart && <button type="button" className="secondary-button" onClick={() => setActive((value) => !value)}>
        <Camera size={17} /> {active ? 'Stop camera' : 'Scan with camera'}
      </button>}
      {!autoStart && <small>Camera scanning requires permission and works on localhost or HTTPS.</small>}
    </div>
  )
}

