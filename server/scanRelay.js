import mongoose from 'mongoose'

const scanEventSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sourceSession: { type: String, required: true },
  code: { type: String, required: true, maxlength: 256 },
  mode: { type: String, enum: ['lookup', 'input'], default: 'lookup' },
  createdAt: { type: Date, default: Date.now, expires: 3600 },
}, { versionKey: false })
scanEventSchema.index({ user: 1, _id: 1 })
export const ScanEvent = mongoose.model('ScanEvent', scanEventSchema)

export async function publishScan(req, code, mode = 'lookup') {
  await ScanEvent.create({
    user: req.user._id,
    sourceSession: req.authSession.sessionId,
    code,
    mode: mode === 'input' ? 'input' : 'lookup',
  })
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
  res.setHeader('Cache-Control', 'no-store')
  // Start at the current position; opening a dashboard must not replay old scans.
  if (after === undefined) {
    const latest = await ScanEvent.findOne(filter).sort({ _id: -1 }).select('_id').lean()
    return res.json({ events: [], cursor: latest?._id.toString() || '0' })
  }
  if (after !== '0') filter._id = { $gt: new mongoose.Types.ObjectId(after) }
  const events = await ScanEvent.find(filter).sort({ _id: 1 }).limit(50).select('_id code mode').lean()
  res.json({ events, cursor: events.at(-1)?._id.toString() || after })
}
