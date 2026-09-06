import type { FormEvent } from 'react'
import { Barcode } from 'lucide-react'
import CameraBarcodeReader from './CameraBarcodeReader'
import './scanner-workflow.css'

type ScannerWorkflowProps = {
  code: string
  onCodeChange: (code: string) => void
  onSubmit: (code: string) => void
  onCameraError: (message: string) => void
  onScan?: (code: string) => void
  busy?: boolean
  introTitle?: string
  introDescription: string
  methodTitle: string
  methodDescription: string
  inputLabel: string
  inputId?: string
  placeholder: string
  submitLabel: string
  busyLabel?: string
  helpText: string
  cameraHelpText?: string
  readerId?: string
  className?: string
}

export default function ScannerWorkflow({
  code,
  onCodeChange,
  onSubmit,
  onCameraError,
  onScan,
  busy = false,
  introTitle = 'How would you like to scan?',
  introDescription,
  methodTitle,
  methodDescription,
  inputLabel,
  inputId,
  placeholder,
  submitLabel,
  busyLabel = 'Finding...',
  helpText,
  cameraHelpText,
  readerId,
  className = '',
}: ScannerWorkflowProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedCode = code.trim()
    if (!busy && normalizedCode) onSubmit(normalizedCode)
  }
  const useCameraResult = (value: string) => {
    const normalizedCode = value.trim()
    onCodeChange(normalizedCode)
    ;(onScan || onSubmit)(normalizedCode)
  }

  return (
    <div className={`scanner-workflow ${className}`.trim()}>
      <div className="scanner-intro"><h3>{introTitle}</h3><p>{introDescription}</p></div>
      <form className="scanner-code-form" onSubmit={submit}>
        <div className="scanner-method-heading"><span><Barcode size={18} aria-hidden="true" /></span><div><strong>{methodTitle}</strong><small>{methodDescription}</small></div></div>
        <div className="scanner-input-row">
          <input id={inputId} aria-label={inputLabel} autoFocus data-modal-initial-focus value={code} onChange={(event) => onCodeChange(event.target.value)} placeholder={placeholder} autoComplete="off" disabled={busy} />
          <button type="submit" className="primary-button" disabled={busy || !code.trim()}>{busy ? busyLabel : submitLabel}</button>
        </div>
        <small>{helpText}</small>
      </form>
      <div className="scanner-divider"><span>or use this device</span></div>
      <CameraBarcodeReader readerId={readerId} onScan={useCameraResult} onError={onCameraError} helpText={cameraHelpText} />
    </div>
  )
}
