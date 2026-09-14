import test from 'node:test'
import assert from 'node:assert/strict'
import { sessionCookieIsSecure } from './deploymentMode.js'

test('production deployments require secure session cookies by default', () => {
  assert.equal(sessionCookieIsSecure({ NODE_ENV: 'production' }), true)
})

test('the explicit local LAN appliance mode permits HTTP session cookies', () => {
  assert.equal(sessionCookieIsSecure({
    NODE_ENV: 'production',
    PHONEFLOW_DEPLOYMENT_MODE: 'local-lan',
  }), false)
})

test('development deployments do not require secure session cookies', () => {
  assert.equal(sessionCookieIsSecure({ NODE_ENV: 'development' }), false)
})

test('unknown deployment modes cannot disable production cookie security', () => {
  assert.equal(sessionCookieIsSecure({
    NODE_ENV: 'production',
    PHONEFLOW_DEPLOYMENT_MODE: 'something-else',
  }), true)
})
