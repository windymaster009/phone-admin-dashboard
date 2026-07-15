import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import mongoose from 'mongoose'
import morgan from 'morgan'
import router from './routes.js'

const app = express()
const port = Number(process.env.PORT || 5000)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required')
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters')
}

app.set('trust proxy', 1)
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({
  origin(origin, callback) {
    const allowed = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
      .split(',')
      .map((value) => value.trim())
    if (!origin || allowed.includes(origin)) return callback(null, true)
    callback(new Error('Origin is not allowed by CORS'))
  },
  credentials: true,
}))
app.use(express.json({ limit: '5mb' }))
app.use(express.urlencoded({ extended: true, limit: '5mb' }))
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false }))

app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    service: 'phoneflow-api',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    time: new Date().toISOString(),
  })
})

app.use('/api', router)

if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(__dirname, '../dist')
  app.use(express.static(distPath))
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')))
}

app.use((error, _req, res, _next) => {
  console.error(error)

  if (error?.code === 11000) {
    const field = Object.keys(error.keyPattern || {})[0] || 'field'
    return res.status(409).json({ message: `${field} already exists` })
  }

  if (error?.name === 'ValidationError') {
    const message = Object.values(error.errors).map((item) => item.message).join(', ')
    return res.status(400).json({ message })
  }

  res.status(error.status || 500).json({
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : error.message || 'Something went wrong',
  })
})

await mongoose.connect(process.env.MONGO_URI)
console.log(`MongoDB connected: ${mongoose.connection.name}`)

const server = app.listen(port, () => {
  console.log(`PhoneFlow API running on http://localhost:${port}`)
})

async function shutdown(signal) {
  console.log(`${signal} received, shutting down...`)
  server.close(async () => {
    await mongoose.disconnect()
    process.exit(0)
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
