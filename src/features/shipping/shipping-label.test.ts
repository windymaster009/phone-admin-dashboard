import { describe, expect, it } from 'vitest'
import { shippingLabelBarcodeValue, type ShippingLabelData } from './shipping-label'

function label(overrides: Partial<ShippingLabelData> = {}): ShippingLabelData {
  return {
    shipmentNo: 'SHP-20261020-ABC123',
    recipientName: 'Dara',
    recipientPhone: '012 345 678',
    address: 'Phnom Penh',
    shippingDate: '2026-10-20',
    items: [{ name: 'iPhone 15 Pro Max', quantity: 1 }],
    ...overrides,
  }
}

describe('shipping label', () => {
  it('uses courier tracking number when one exists', () => {
    expect(shippingLabelBarcodeValue(label({ trackingNumber: 'JT123456789KH' }))).toBe('JT123456789KH')
  })

  it('falls back to the PhoneFlow shipment number', () => {
    expect(shippingLabelBarcodeValue(label())).toBe('SHP-20261020-ABC123')
  })
})
