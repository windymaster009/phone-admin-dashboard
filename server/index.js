import 'dotenv/config'
import { randomUUID } from 'node:crypto'
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

function positiveEnvNumber(name, fallback) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function isTransientDatabaseError(error) {
  const transientNames = new Set([
    'MongoNetworkError',
    'MongoNetworkTimeoutError',
    'MongoServerSelectionError',
    'MongooseServerSelectionError',
  ])
  const transientCodes = new Set([6, 7, 89, 91, 189, 262, 9001])
  return transientNames.has(error?.name)
    || transientCodes.has(Number(error?.code))
    || error?.hasErrorLabel?.('RetryableWriteError')
    || /socket|timed?\s*out|connection (?:closed|reset)|server selection/i.test(error?.message || '')
}

function validateEnv() {
  const mongoUri = process.env.MONGO_URI || ''
  const jwtSecret = process.env.JWT_SECRET || ''

  if (!mongoUri) throw new Error('MONGO_URI is required in .env')
  if (mongoUri.includes('<db_password>')) {
    throw new Error('MONGO_URI still contains <db_password>. Replace it with the password for the MongoDB user named windy.')
  }
  if (mongoUri.includes('<') || mongoUri.includes('>') || mongoUri.includes('YOUR_')) {
    throw new Error(
      'MONGO_URI still contains placeholder values. Replace <username>, <password>, and <cluster-host> in .env with your real MongoDB connection string.',
    )
  }
  if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
    throw new Error('MONGO_URI must start with mongodb:// or mongodb+srv://')
  }
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in .env')
  }
}

try {
  validateEnv()
} catch (error) {
  console.error(`Configuration error: ${error.message}`)
  process.exit(1)
}

app.set('trust proxy', 1)
app.use((req, res, next) => {
  const suppliedId = String(req.get('x-request-id') || '')
  req.id = /^[a-zA-Z0-9_-]{8,80}$/.test(suppliedId) ? suppliedId : randomUUID()
  res.setHeader('X-Request-ID', req.id)
  next()
})
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
morgan.token('request-id', (req) => req.id)
app.use(morgan(process.env.NODE_ENV === 'production'
  ? ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" request=:request-id'
  : ':method :url :status :response-time ms request=:request-id'))
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
  const req = _req
  console.error(`[request ${req.id || 'unknown'}]`, error)

  if (res.headersSent) return _next(error)

  if (error?.code === 11000) {
    const field = Object.keys(error.keyPattern || {})[0] || 'field'
    return res.status(409).json({ message: `${field} already exists` })
  }

  if (error?.name === 'ValidationError') {
    const message = Object.values(error.errors).map((item) => item.message).join(', ')
    return res.status(400).json({ message })
  }

  if (isTransientDatabaseError(error)) {
    return res.status(503).json({
      message: 'The database response timed out. Check whether the change was saved before trying again.',
      requestId: req.id,
      retryable: true,
    })
  }

  res.status(error.status || 500).json({
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : error.message || 'Something went wrong',
    requestId: req.id,
  })
})

try {
  console.log('Connecting to MongoDB...')
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: positiveEnvNumber('MONGO_SERVER_SELECTION_TIMEOUT_MS', 30000),
    connectTimeoutMS: positiveEnvNumber('MONGO_CONNECT_TIMEOUT_MS', 30000),
    socketTimeoutMS: positiveEnvNumber('MONGO_SOCKET_TIMEOUT_MS', 60000),
    maxPoolSize: positiveEnvNumber('MONGO_MAX_POOL_SIZE', 10),
    minPoolSize: 1,
    heartbeatFrequencyMS: 10000,
  })
  console.log(`MongoDB connected: ${mongoose.connection.name}`)
} catch (error) {
  console.error(`MongoDB connection failed: ${error.message}`)
  console.error('Check the database password, Atlas Network Access IP allowlist, and that the cluster is running.')
  process.exit(1)
}

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
