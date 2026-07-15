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

try {
  console.log('Connecting to MongoDB...')
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 10000,
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
