import mongoose from 'mongoose'
import { EventEmitter } from 'node:events'

const scanNotifier = new EventEmitter()
scanNotifier.setMaxListeners(0)

const MAX_LONG_POLL_SECONDS = 30
const RELAY_IDLE_MS = 60_000
const ACTIVATION_WAIT_SECONDS = 12
const relaySessions = new Map()

function scanChannel(userId, signal = 'activity') {
  return `user:${String(userId)}:${signal}`
}

function createScanWait(userId, seconds, res, signal = 'activity') {
  const channel = scanChannel(userId, signal)
  let settled = false
  let resolveWait
  let timer
  const promise = new Promise((resolve) => { resolveWait = resolve })
  const finish = () => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    scanNotifier.removeListener(channel, finish)
    if (typeof res?.removeListener === 'function') res.removeListener('close', finish)
    resolveWait()
  }
  timer = setTimeout(finish, Math.max(1, seconds * 1000))
  scanNotifier.once(channel, finish)
  if (typeof res?.once === 'function') res.once('close', finish)
  return { promise, cancel: finish }
}

function userKey(userId) {
  return String(userId)
}

function activeRelay(userId) {
  const key = userKey(userId)
  const relay = relaySessions.get(key)
  if (!relay) return null
  if (relay.expiresAt <= Date.now()) {
    relaySessions.delete(key)
    return null
  }
  return relay
}

function relayPayload(relay) {
  return relay ? {
    active: true,
    mode: relay.mode,
    expiresAt: new Date(relay.expiresAt).toISOString(),
  } : { active: false }
}

function markRelayReady(userId) {
  const relay = activeRelay(userId)
  if (!relay) return null
  if (!relay.ready) {
    relay.ready = true
    scanNotifier.emit(scanChannel(userId, 'ready'))
  }
  return relay
}

function touchRelay(userId) {
  const relay = activeRelay(userId)
  if (!relay) return null
  relay.expiresAt = Date.now() + RELAY_IDLE_MS
  return relay
}

const scanEventSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sourceSession: { type: String, required: true },
  code: { type: String, required: true, maxlength: 256 },
  mode: { type: String, enum: ['lookup', 'input'], default: 'lookup' },
  createdAt: { type: Date, default: Date.now, expires: 3600 },
}, { versionKey: false })
scanEventSchema.index({ user: 1, _id: 1 })
export const ScanEvent = mongoose.model('ScanEvent', scanEventSchema)

export async function activateScanRelay(req, res) {
  const mode = req.body?.mode === 'input' ? 'input' : 'lookup'
  const key = userKey(req.user._id)
  const relay = {
    mode,
    ready: false,
    sourceSession: req.authSession.sessionId,
    expiresAt: Date.now() + RELAY_IDLE_MS,
  }
  relaySessions.set(key, relay)

  // Register before waking a desktop listener so its ready signal cannot race us.
  const waiter = createScanWait(req.user._id, ACTIVATION_WAIT_SECONDS, res, 'ready')
  scanNotifier.emit(scanChannel(req.user._id))
  try {
    if (!relay.ready) await waiter.promise
  } finally {
    waiter.cancel()
  }
  if (res.destroyed || res.writableEnded) return

  const current = activeRelay(req.user._id)
  if (current !== relay || !relay.ready) {
    if (current === relay) relaySessions.delete(key)
    return res.status(409).json({
      message: 'No desktop is listening. Open PhoneFlow on the computer, then try again.',
      active: false,
    })
  }
  res.json({ ...relayPayload(relay), ready: true, idleTimeoutSeconds: RELAY_IDLE_MS / 1000 })
}

export async function publishScan(req, code, mode = 'lookup') {
  const relay = touchRelay(req.user._id)
  if (!relay) {
    const error = new Error('Scanner session expired. Tap Product or Gun scan again.')
    error.status = 409
    throw error
  }
  await ScanEvent.create({
    user: req.user._id,
    sourceSession: req.authSession.sessionId,
    code,
    mode: mode === 'input' ? 'input' : 'lookup',
  })
  scanNotifier.emit(scanChannel(req.user._id))
}

async function findScans(filter, after) {
  const query = { ...filter }
  if (after !== '0') query._id = { $gt: new mongoose.Types.ObjectId(after) }
  return ScanEvent.find(query).sort({ _id: 1 }).limit(50).select('_id code mode').lean()
}

async function currentCursor(filter) {
  const latest = await ScanEvent.findOne(filter).sort({ _id: -1 }).select('_id').lean()
  return latest?._id.toString() || '0'
}

export async function readScans(req, res) {
  const after = req.query.after
  if (after !== undefined && after !== '0' && !/^[a-f0-9]{24}$/i.test(String(after))) {
    return res.status(400).json({ message: 'Invalid scan cursor' })
  }
  const filter = {
    user: req.user._id,
    sourceSession: { $ne: req.authSession.sessionId },
    createdAt: { $gt: new Date(Date.now() - 3600_000) },
  }
  const requestedWait = Number(req.query.wait)
  const waitSeconds = Number.isFinite(requestedWait)
    ? Math.min(MAX_LONG_POLL_SECONDS, Math.max(0, requestedWait))
    : 0
  res.setHeader('Cache-Control', 'no-store')

  let relay = activeRelay(req.user._id)
  if (!relay && waitSeconds > 0) {
    const waiter = createScanWait(req.user._id, waitSeconds, res)
    try {
      // The dormant desktop keeps one quiet request open until a phone activates scanning.
      if (!activeRelay(req.user._id)) await waiter.promise
    } finally {
      waiter.cancel()
    }
    if (res.destroyed || res.writableEnded) return
    relay = activeRelay(req.user._id)
  }

  if (!relay) {
    const cursor = after === undefined ? await currentCursor(filter) : after
    return res.json({ events: [], cursor, active: false })
  }

  relay = markRelayReady(req.user._id)
  // Opening or re-opening a subscription must not replay scans from an older session.
  if (after === undefined) {
    return res.json({ events: [], cursor: await currentCursor(filter), ...relayPayload(relay) })
  }

  const remainingSeconds = Math.max(0, (relay.expiresAt - Date.now()) / 1000)
  const activeWaitSeconds = Math.min(waitSeconds, remainingSeconds)
  const waiter = activeWaitSeconds > 0 ? createScanWait(req.user._id, activeWaitSeconds, res) : null
  let events
  try {
    events = await findScans(filter, after)
    if (!events.length && waiter) {
      await waiter.promise
      if (res.destroyed || res.writableEnded) return
      events = await findScans(filter, after)
    }
  } finally {
    waiter?.cancel()
  }
  relay = activeRelay(req.user._id)
  res.json({ events, cursor: events.at(-1)?._id.toString() || after, ...relayPayload(relay) })
}

export function resetScanRelaysForTests() {
  relaySessions.clear()
}
