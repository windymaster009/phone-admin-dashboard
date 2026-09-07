import type { ReactNode } from 'react'
import ScannerTriggerButton from './scanner/ScannerTriggerButton'

export type SerializedDeviceValues = {
  imei: string
  brand: string
  model: string
  storage: string
  ram?: string
  color: string
}

export type SerializedDeviceErrors = Partial<Record<keyof SerializedDeviceValues, string>>

export type SerializedDeviceFieldsProps = {
  values: SerializedDeviceValues
  onChange: (field: keyof SerializedDeviceValues, value: string) => void
  errors?: SerializedDeviceErrors
  onScan?: () => void
  disabled?: boolean
  imeiRef?: (node: HTMLInputElement | null) => void
  includeNames?: boolean
  showGroupHeading?: boolean
  asContainer?: boolean
  children?: ReactNode
  className?: string
}

export default function SerializedDeviceFields({
  values,
  onChange,
  errors,
  onScan,
  disabled = false,
  imeiRef,
  includeNames = false,
  showGroupHeading = true,
  asContainer = true,
  children,
  className = '',
}: SerializedDeviceFieldsProps) {
  const handleImeiChange = (val: string) => {
    const cleaned = val.replace(/\D/g, '').slice(0, 15)
    onChange('imei', cleaned)
  }

  const fieldsContent = (
    <>
      {showGroupHeading && (
        <div className="device-group-label">
          <span>Product identity</span>
          <small>Required identification information</small>
        </div>
      )}

      {/* IMEI Field */}
      <label className={`device-imei-field ${errors?.imei ? 'field-invalid' : ''}`.trim()}>
        <span>IMEI</span>
        <div>
          <input
            ref={imeiRef}
            name={includeNames ? 'imei' : undefined}
            required
            disabled={disabled}
            inputMode="numeric"
            pattern="[0-9]{15}"
            maxLength={15}
            value={values.imei}
            onChange={(e) => handleImeiChange(e.target.value)}
            placeholder="15-digit IMEI"
          />
          {onScan && (
            <ScannerTriggerButton
              label="Scan IMEI"
              iconSize={16}
              onClick={onScan}
              disabled={disabled}
            />
          )}
        </div>
        <small>
          {errors?.imei ? errors.imei : 'Scan with a handheld scanner or this device camera.'}
        </small>
      </label>

      {/* Brand Field */}
      <label className={errors?.brand ? 'field-invalid' : ''}>
        Brand
        <input
          name={includeNames ? 'brand' : undefined}
          required
          disabled={disabled}
          value={values.brand}
          onChange={(e) => onChange('brand', e.target.value)}
          placeholder="Apple"
        />
        {errors?.brand && <small>{errors.brand}</small>}
      </label>

      {/* Model Field */}
      <label className={errors?.model ? 'field-invalid' : ''}>
        Model
        <input
          name={includeNames ? 'model' : undefined}
          required
          disabled={disabled}
          value={values.model}
          onChange={(e) => onChange('model', e.target.value)}
          placeholder="iPhone 13 Pro"
        />
        {errors?.model && <small>{errors.model}</small>}
      </label>

      {/* Storage Field */}
      <label className={errors?.storage ? 'field-invalid' : ''}>
        Storage
        <div className="device-unit-input">
          <input
            name={includeNames ? 'storage' : undefined}
            required
            disabled={disabled}
            type="number"
            min="1"
            step="1"
            value={values.storage}
            onChange={(e) => onChange('storage', e.target.value)}
            placeholder="128"
          />
          <span>GB</span>
        </div>
        {errors?.storage && <small>{errors.storage}</small>}
      </label>

      {/* RAM Field (Optional) */}
      <label className={errors?.ram ? 'field-invalid' : ''}>
        RAM <small className="optional-marker">Optional</small>
        <div className="device-unit-input">
          <input
            name={includeNames ? 'ram' : undefined}
            disabled={disabled}
            type="number"
            min="1"
            step="1"
            value={values.ram || ''}
            onChange={(e) => onChange('ram', e.target.value)}
            placeholder="6"
          />
          <span>GB</span>
        </div>
        {errors?.ram && <small>{errors.ram}</small>}
      </label>

      {/* Color Field */}
      <label className={errors?.color ? 'field-invalid' : ''}>
        Color
        <input
          name={includeNames ? 'color' : undefined}
          required
          disabled={disabled}
          value={values.color}
          onChange={(e) => onChange('color', e.target.value)}
          placeholder="Blue"
        />
        {errors?.color && <small>{errors.color}</small>}
      </label>

      {children}
    </>
  )

  if (!asContainer) {
    return fieldsContent
  }

  return (
    <div className={`serialized-device-fields device-fields-grid ${className}`.trim()}>
      {fieldsContent}
    </div>
  )
}
