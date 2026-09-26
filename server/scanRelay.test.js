import assert from 'node:assert/strict'
import test from 'node:test'
import mongoose from 'mongoose'
import { ScanEvent, publishScan, readScans } from './scanRelay.js'
import router from './routes.js'
import { requireAuth } from './auth.js'
import { InventoryItem, Pawn } from './models.js'

const user = new mongoose.Types.ObjectId()
const req = (query = {}) => ({ user: { _id: user }, authSession: { sessionId: 'desktop-session' }, query })
function response() {
  return { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v }, status(v) { this.statusCode = v; return this }, json(v) { this.body = v; return this } }
}
function queryResult(value, inspect = () => {}) {
  return { sort(v) { inspect('sort', v); return this }, select() { return this }, limit(v) { inspect('limit', v); return this }, lean: async () => value }
}

test('initial subscription skips old events and scopes results to this user and other sessions', async (t) => {
  const id = new mongoose.Types.ObjectId()
  t.mock.method(ScanEvent, 'findOne', (filter) => {
    assert.equal(filter.user, user)
    assert.deepEqual(filter.sourceSession, { $ne: 'desktop-session' })
    assert.ok(filter.createdAt.$gt instanceof Date)
    return queryResult({ _id: id })
  })
  const res = response()
  await readScans(req(), res)
  assert.deepEqual(res.body, { events: [], cursor: String(id) })
  assert.equal(res.headers['Cache-Control'], 'no-store')
})

test('poll returns ordered scans after cursor without leaking another account', async (t) => {
  const before = new mongoose.Types.ObjectId()
  const after = new mongoose.Types.ObjectId()
  const events = [{ _id: after, code: 'SKU-1' }]
  t.mock.method(ScanEvent, 'find', (filter) => {
    assert.equal(filter.user, user)
    assert.deepEqual(filter.sourceSession, { $ne: 'desktop-session' })
    assert.equal(String(filter._id.$gt), String(before))
    return queryResult(events, (key, value) => {
      if (key === 'sort') assert.deepEqual(value, { _id: 1 })
      if (key === 'limit') assert.equal(value, 50)
    })
  })
  const res = response()
  await readScans(req({ after: String(before) }), res)
  assert.deepEqual(res.body, { events, cursor: String(after) })
})

test('invalid cursors are rejected before querying', async (t) => {
  const find = t.mock.method(ScanEvent, 'find')
  const res = response()
  await readScans(req({ after: 'not-an-id' }), res)
  assert.equal(res.statusCode, 400)
  assert.equal(find.mock.callCount(), 0)
})

test('publication uses authenticated identity, not client supplied user or session', async (t) => {
  const create = t.mock.method(ScanEvent, 'create', async () => ({}))
  await publishScan({ ...req(), body: { user: 'other-user' } }, 'SKU-1')
  assert.deepEqual(create.mock.calls[0].arguments[0], { user, sourceSession: 'desktop-session', code: 'SKU-1' })
})

test('only POST publishes successful scans; GET lookups do not echo them', async (t) => {
  const item = { _id: new mongoose.Types.ObjectId(), sku: 'SKU-1' }
  t.mock.method(InventoryItem, 'findOne', async () => item)
  t.mock.method(Pawn, 'findOne', () => ({ ...queryResult(null), populate() { return this } }))
  const create = t.mock.method(ScanEvent, 'create', async () => ({}))
  for (const method of ['get', 'post']) {
    const route = router.stack.find((layer) => layer.route?.path === '/inventory/scan/:code' && layer.route.methods[method]).route
    assert.equal(route.stack[0].handle, requireAuth)
    const res = response()
    await new Promise((resolve, reject) => {
      res.json = (body) => { res.body = body; resolve() }
      route.stack.at(-1).handle({ ...req(), method: method.toUpperCase(), params: { code: 'SKU-1' } }, res, reject)
    })
    assert.equal(res.body.item, item)
    assert.equal(res.body.desktopShared, method === 'post' ? true : undefined)
  }
  assert.equal(create.mock.callCount(), 1)
})

test('phone lookup still succeeds when desktop publication fails', async (t) => {
  t.mock.method(InventoryItem, 'findOne', async () => ({ _id: new mongoose.Types.ObjectId() }))
  t.mock.method(Pawn, 'findOne', () => ({ ...queryResult(null), populate() { return this } }))
  t.mock.method(ScanEvent, 'create', async () => { throw new Error('offline') })
  t.mock.method(console, 'error', () => {})
  const route = router.stack.find((layer) => layer.route?.path === '/inventory/scan/:code' && layer.route.methods.post).route
  const res = response()
  await new Promise((resolve, reject) => {
    res.json = (body) => { res.body = body; resolve() }
    route.stack.at(-1).handle({ ...req(), method: 'POST', params: { code: 'SKU-1' } }, res, reject)
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.desktopShared, false)
  assert.ok(res.body.item)
})
