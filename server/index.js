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
import { requireAuth } from './auth.js'
import backupRouter from './backupRoutes.js'
import { startBackupScheduler, stopBackupScheduler } from './backupService.js'
import loanDashboardRouter from './loanDashboardRoutes.js'
import loanRouter from './loanRoutes.js'
import receiptRouter from './receiptRoutes.js'
import router from './routes.js'

const app = express()
const port = Number(process.env.PORT || 5000)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

function trustProxySetting() {
  const value = String(process.env.TRUST_PROXY || '').trim()
  if (!value || value.toLowerCase() === 'false') return false
  if (value.toLowerCase() === 'true') return true
  if (/^\d+$/.test(value)) return Number(value)
  return value.split(',').map((entry) => entry.trim()).filter(Boolean)
}

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
  const bootstrapToken = String(process.env.AUTH_BOOTSTRAP_TOKEN || '')
  const trustProxy = String(process.env.TRUST_PROXY || '').trim().toLowerCase()

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
  if (process.env.NODE_ENV === 'production' && bootstrapToken
    && (bootstrapToken.length < 32 || bootstrapToken.includes('GENERATE_'))) {
    throw new Error('AUTH_BOOTSTRAP_TOKEN must be a random secret of at least 32 characters in production')
  }
  if (trustProxy === 'true') {
    throw new Error('TRUST_PROXY=true trusts arbitrary forwarding headers. Use a proxy hop count or trusted proxy address instead.')
  }

  if (String(process.env.PAYWAY_ENABLED || '').toLowerCase() === 'true') {
    const environment = process.env.PAYWAY_ENV === 'production' ? 'production' : 'sandbox'
    const expectedBaseUrl = environment === 'production'
      ? 'https://checkout.payway.com.kh'
      : 'https://checkout-sandbox.payway.com.kh'
    const configuredBaseUrl = String(process.env.PAYWAY_BASE_URL || expectedBaseUrl).replace(/\/+$/, '')
    if (!process.env.PAYWAY_MERCHANT_ID || process.env.PAYWAY_MERCHANT_ID.includes('YOUR_')) {
      throw new Error('PAYWAY_MERCHANT_ID is required when ABA PayWay is enabled')
    }
    if (!process.env.PAYWAY_API_KEY || process.env.PAYWAY_API_KEY.includes('YOUR_')) {
      throw new Error('PAYWAY_API_KEY is required when ABA PayWay is enabled')
    }
    if (configuredBaseUrl !== expectedBaseUrl) {
      throw new Error(`PAYWAY_BASE_URL must be ${expectedBaseUrl} for the ${environment} environment`)
    }
    if ((process.env.PAYWAY_QR_TEMPLATE || 'template3_color') !== 'template3_color') {
      throw new Error('PAYWAY_QR_TEMPLATE must remain template3_color for this KHQR integration')
    }
    if (process.env.PAYWAY_CALLBACK_URL && !process.env.PAYWAY_CALLBACK_URL.startsWith('https://')) {
      throw new Error('PAYWAY_CALLBACK_URL must use HTTPS')
    }
  }
}

try {
  validateEnv()
} catch (error) {
  console.error(`Configuration error: ${error.message}`)
  process.exit(1)
}

app.set('trust proxy', trustProxySetting())
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
    const error = new Error('Origin is not allowed by CORS')
    error.status = 403
    callback(error)
  },
  credentials: true,
}))
app.use(express.json({ limit: '8mb' }))
app.use(express.urlencoded({ extended: true, limit: '8mb' }))
app.use('/uploads', requireAuth, express.static(path.resolve(__dirname, '../uploads'), {
  dotfiles: 'deny',
  index: false,
  maxAge: '1h',
}))
morgan.token('request-id', (req) => req.id)
app.use(morgan(process.env.NODE_ENV === 'production'
  ? ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" request=:request-id'
  : ':method :url :status :response-time ms request=:request-id'))
const signInLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many sign-in attempts. Wait 15 minutes and try again.' },
})
app.use('/api/auth/login', signInLimiter)
app.use('/api/auth/bootstrap', signInLimiter)

app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    service: 'phoneflow-api',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    time: new Date().toISOString(),
  })
})

app.use('/api/backups', backupRouter)
app.use('/api/loan-dashboard', loanDashboardRouter)
app.use('/api/loans', loanRouter)
app.use('/api/receipts', receiptRouter)
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

try {
  await startBackupScheduler()
} catch (error) {
  console.error(`Backup scheduler failed to start: ${error.message}`)
}

const server = app.listen(port, () => {
  console.log(`PhoneFlow API running on http://localhost:${port}`)
})

async function shutdown(signal) {
  console.log(`${signal} received, shutting down...`)
  stopBackupScheduler()
  server.close(async () => {
    await mongoose.disconnect()
    process.exit(0)
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
