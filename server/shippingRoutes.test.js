import test from 'node:test'
import assert from 'node:assert/strict'
import { shipmentTransitions } from './shippingRoutes.js'

test('shipment follows preparing to ready to shipped to delivered', () => {
  assert.deepEqual(shipmentTransitions.PREPARING, ['READY_TO_SHIP'])
  assert.deepEqual(shipmentTransitions.READY_TO_SHIP, ['SHIPPED'])
  assert.deepEqual(shipmentTransitions.SHIPPED, ['DELIVERED'])
  assert.equal(shipmentTransitions.DELIVERED, undefined)
})
