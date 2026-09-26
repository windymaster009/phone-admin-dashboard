import test from 'node:test'
import assert from 'node:assert/strict'
import { helmetOptions, isLocalLanDeployment, sessionCookieIsSecure } from './deploymentMode.js'

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

test('local LAN mode disables HTTPS-only response policies', () => {
  const environment = { NODE_ENV: 'production', PHONEFLOW_DEPLOYMENT_MODE: 'LOCAL-LAN' }
  assert.equal(isLocalLanDeployment(environment), true)
  const options = helmetOptions(environment)
  assert.equal(options.strictTransportSecurity, false)
  assert.equal(options.contentSecurityPolicy.directives.upgradeInsecureRequests, null)
})

test('normal production mode keeps Helmet HTTPS policies enabled', () => {
  const options = helmetOptions({ NODE_ENV: 'production' })
  assert.equal(options.strictTransportSecurity, undefined)
  assert.equal('upgradeInsecureRequests' in options.contentSecurityPolicy.directives, false)
})
