import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import SerializedDeviceFields, { type SerializedDeviceValues } from './SerializedDeviceFields'

describe('SerializedDeviceFields', () => {
  const initialValues: SerializedDeviceValues = {
    imei: '860123456789012',
    brand: 'Apple',
    model: 'iPhone 13 Pro',
    storage: '128',
    ram: '6',
    color: 'Sierra Blue',
  }

  it('renders all controlled fields with initial values', () => {
    render(
      <SerializedDeviceFields
        values={initialValues}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Product identity')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('15-digit IMEI')).toHaveValue('860123456789012')
    expect(screen.getByPlaceholderText('Apple')).toHaveValue('Apple')
    expect(screen.getByPlaceholderText('iPhone 13 Pro')).toHaveValue('iPhone 13 Pro')
    expect(screen.getByPlaceholderText('128')).toHaveValue(128)
    expect(screen.getByPlaceholderText('6')).toHaveValue(6)
    expect(screen.getByPlaceholderText('Blue')).toHaveValue('Sierra Blue')
  })

  it('fires onChange for brand, model, storage, ram, color, and sanitizes imei to digits only', () => {
    const handleChange = vi.fn()

    render(
      <SerializedDeviceFields
        values={{ imei: '', brand: '', model: '', storage: '', color: '' }}
        onChange={handleChange}
      />,
    )

    // Non-digits in IMEI are stripped and truncated to 15 digits
    const imeiInput = screen.getByPlaceholderText('15-digit IMEI')
    fireEvent.change(imeiInput, { target: { value: '860123456789012999xyz' } })
    expect(handleChange).toHaveBeenCalledWith('imei', '860123456789012')

    // Brand
    const brandInput = screen.getByPlaceholderText('Apple')
    fireEvent.change(brandInput, { target: { value: 'Samsung' } })
    expect(handleChange).toHaveBeenCalledWith('brand', 'Samsung')

    // Model
    const modelInput = screen.getByPlaceholderText('iPhone 13 Pro')
    fireEvent.change(modelInput, { target: { value: 'Galaxy S24 Ultra' } })
    expect(handleChange).toHaveBeenCalledWith('model', 'Galaxy S24 Ultra')

    // Storage
    const storageInput = screen.getByPlaceholderText('128')
    fireEvent.change(storageInput, { target: { value: '256' } })
    expect(handleChange).toHaveBeenCalledWith('storage', '256')

    // RAM
    const ramInput = screen.getByPlaceholderText('6')
    fireEvent.change(ramInput, { target: { value: '12' } })
    expect(handleChange).toHaveBeenCalledWith('ram', '12')

    // Color
    const colorInput = screen.getByPlaceholderText('Blue')
    fireEvent.change(colorInput, { target: { value: 'Titanium Gray' } })
    expect(handleChange).toHaveBeenCalledWith('color', 'Titanium Gray')
  })

  it('renders scanner button and invokes onScan when clicked', async () => {
    const user = userEvent.setup()
    const handleScan = vi.fn()

    render(
      <SerializedDeviceFields
        values={initialValues}
        onChange={vi.fn()}
        onScan={handleScan}
      />,
    )

    const scanBtn = screen.getByRole('button', { name: /scan imei/i })
    expect(scanBtn).toBeInTheDocument()

    await user.click(scanBtn)
    expect(handleScan).toHaveBeenCalledTimes(1)
  })

  it('displays validation errors when provided', () => {
    render(
      <SerializedDeviceFields
        values={{ imei: '', brand: '', model: '', storage: '', color: '' }}
        onChange={vi.fn()}
        errors={{
          imei: 'IMEI must be 15 digits',
          brand: 'Brand is required',
          model: 'Model is required',
        }}
      />,
    )

    expect(screen.getByText('IMEI must be 15 digits')).toBeInTheDocument()
    expect(screen.getByText('Brand is required')).toBeInTheDocument()
    expect(screen.getByText('Model is required')).toBeInTheDocument()
  })

  it('renders input names when includeNames is true for native FormData compatibility', () => {
    render(
      <SerializedDeviceFields
        values={initialValues}
        onChange={vi.fn()}
        includeNames
      />,
    )

    expect(screen.getByPlaceholderText('15-digit IMEI')).toHaveAttribute('name', 'imei')
    expect(screen.getByPlaceholderText('Apple')).toHaveAttribute('name', 'brand')
    expect(screen.getByPlaceholderText('iPhone 13 Pro')).toHaveAttribute('name', 'model')
    expect(screen.getByPlaceholderText('128')).toHaveAttribute('name', 'storage')
    expect(screen.getByPlaceholderText('6')).toHaveAttribute('name', 'ram')
    expect(screen.getByPlaceholderText('Blue')).toHaveAttribute('name', 'color')
  })

  it('renders children elements correctly', () => {
    render(
      <SerializedDeviceFields
        values={initialValues}
        onChange={vi.fn()}
      >
        <div data-testid="trailing-fields">Custom pricing field</div>
      </SerializedDeviceFields>,
    )

    expect(screen.getByTestId('trailing-fields')).toBeInTheDocument()
  })

  it('disables all inputs when disabled is true', () => {
    render(
      <SerializedDeviceFields
        values={initialValues}
        onChange={vi.fn()}
        disabled
        onScan={vi.fn()}
      />,
    )

    expect(screen.getByPlaceholderText('15-digit IMEI')).toBeDisabled()
    expect(screen.getByPlaceholderText('Apple')).toBeDisabled()
    expect(screen.getByPlaceholderText('iPhone 13 Pro')).toBeDisabled()
    expect(screen.getByPlaceholderText('128')).toBeDisabled()
    expect(screen.getByPlaceholderText('6')).toBeDisabled()
    expect(screen.getByPlaceholderText('Blue')).toBeDisabled()
    expect(screen.getByRole('button', { name: /scan imei/i })).toBeDisabled()
  })
})
