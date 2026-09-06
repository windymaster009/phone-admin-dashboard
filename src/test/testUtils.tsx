import type { ReactElement } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import type { SessionUser, ShopProfile } from '../lib/api'
import type { InventoryItem, Pawn, Trade } from '../types/domain'

export const mockShop: ShopProfile = {
  name: 'PhoneFlow Test Shop',
  subtitle: 'Test Management',
  phone: '012-345-678',
  email: 'test@phoneflow.local',
  address: 'Phnom Penh, Cambodia',
  taxId: 'TAX-12345',
  logoUrl: '',
  receiptFooter: 'Thank you for choosing PhoneFlow.',
}

export const mockOwnerUser: SessionUser = {
  id: 'user-owner-1',
  name: 'Sophea Owner',
  email: 'owner@phoneflow.local',
  role: 'OWNER',
  active: true,
}

export const mockManagerUser: SessionUser = {
  id: 'user-manager-1',
  name: 'Dara Manager',
  email: 'manager@phoneflow.local',
  role: 'MANAGER',
  active: true,
}

export const mockCashierUser: SessionUser = {
  id: 'user-cashier-1',
  name: 'Vanna Cashier',
  email: 'cashier@phoneflow.local',
  role: 'CASHIER',
  active: true,
}

export const mockStockUser: SessionUser = {
  id: 'user-stock-1',
  name: 'Bona Stock',
  email: 'stock@phoneflow.local',
  role: 'STOCK',
  active: true,
}

export const mockInventoryItem: InventoryItem = {
  _id: 'inv-item-1',
  name: 'iPhone 15 Pro Max',
  sku: 'IPH-15PM-256',
  barcode: '8806091234567',
  category: 'PHONE',
  brand: 'Apple',
  model: 'iPhone 15 Pro Max',
  condition: 'EXCELLENT',
  quantity: 5,
  reorderLevel: 2,
  buyPrice: 950,
  sellPrice: 1150,
  minimumSellPrice: 1100,
  pricingCurrency: 'USD',
  pricingExchangeRate: 4100,
  khrSellPrice: 4715000,
  khrMinimumSellPrice: 4510000,
  status: 'IN_STOCK',
  imei1: '356789012345678',
}

export const mockPawnRecord: Pawn = {
  _id: 'pawn-rec-1',
  pawnNo: 'PW-2026-0001',
  customer: {
    _id: 'cust-1',
    name: 'Chan Dara',
    phone: '012-999-888',
    nationalIdNumber: '012345678',
  },
  itemSnapshot: {
    name: 'Samsung Galaxy S24 Ultra',
    brand: 'Samsung',
    model: 'S24 Ultra',
    imei: '354321098765432',
    condition: 'GOOD',
  },
  estimatedValue: 1000,
  pawnPercentage: 60,
  principal: 600,
  currency: 'USD',
  interestRate: 3.5,
  startDate: '2026-08-01',
  dueDate: '2026-09-01',
  createdAt: '2026-08-01T00:00:00.000Z',
  status: 'ACTIVE',
  identificationVerified: true,
  notes: 'Minor scratch on edge',
}

export const mockTradeRecord: Trade = {
  _id: 'trade-rec-1',
  tradeNo: 'TR-2026-0001',
  type: 'SELL',
  customer: {
    _id: 'cust-1',
    name: 'Sokha Meng',
    phone: '098-765-432',
  },
  items: [
    {
      name: 'iPhone 15 Pro Max',
      quantity: 1,
      unitPrice: 1150,
    },
  ],
  subtotal: 1150,
  discount: 0,
  total: 1150,
  amountPaid: 1150,
  balance: 0,
  currency: 'USD',
  paymentMethod: 'CASH',
  status: 'COMPLETED',
  createdAt: '2026-08-15T00:00:00.000Z',
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, options)
}
