import { createHmac } from 'node:crypto'

const SANDBOX_BASE_URL = 'https://checkout-sandbox.payway.com.kh'
const PRODUCTION_BASE_URL = 'https://checkout.payway.com.kh'
const EXCHANGE_RATE_PATH = '/api/payment-gateway/v1/exchange-rate'
const GENERATE_QR_PATH = '/api/payment-gateway/v1/payments/generate-qr'
const CHECK_TRANSACTION_PATH = '/api/payment-gateway/v1/payments/check-transaction-2'
const CLOSE_TRANSACTION_PATH = '/api/payment-gateway/v1/payments/close-transaction'

function clean(value) {
  return typeof value === 'string' ? value.trim() : value
}

function encodeBase64(value) {
  return Buffer.from(String(value), 'utf8').toString('base64')
}

function requestTime(date = new Date()) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
    String(date.getUTCHours()).padStart(2, '0'),
    String(date.getUTCMinutes()).padStart(2, '0'),
    String(date.getUTCSeconds()).padStart(2, '0'),
  ].join('')
}

function baseUrl() {
  const explicit = clean(process.env.PAYWAY_BASE_URL)
  if (explicit) return explicit.replace(/\/+$/, '')
  return process.env.PAYWAY_ENV === 'production' ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL
}

export function paywayConfiguration() {
  const merchantId = clean(process.env.PAYWAY_MERCHANT_ID)
  const apiKey = clean(process.env.PAYWAY_API_KEY)
  return {
    enabled: String(process.env.PAYWAY_ENABLED || '').toLowerCase() === 'true',
    configured: Boolean(merchantId && apiKey),
    environment: process.env.PAYWAY_ENV === 'production' ? 'production' : 'sandbox',
    merchantId,
    apiKey,
    baseUrl: baseUrl(),
    qrTemplate: clean(process.env.PAYWAY_QR_TEMPLATE) || 'template3_color',
    paymentOption: 'abapay_khqr',
    qrLifetimeMinutes: Math.min(172800, Math.max(3, Number(process.env.PAYWAY_QR_LIFETIME_MINUTES) || 6)),
    callbackUrl: clean(process.env.PAYWAY_CALLBACK_URL),
    exchangeRateSide: process.env.PAYWAY_USD_KHR_RATE_SIDE === 'sell' ? 'sell' : 'buy',
  }
}

function requireConfiguration() {
  const config = paywayConfiguration()
  if (!config.enabled) throw new Error('ABA PayWay is disabled')
  if (!config.configured) throw new Error('ABA PayWay merchant ID and API key are not configured')
  return config
}

function sign(values, apiKey) {
  return createHmac('sha512', apiKey).update(values.map((value) => value ?? '').join('')).digest('base64')
}

async function post(path, body, config) {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(process.env.PAYWAY_REQUEST_TIMEOUT_MS) || 10000),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`ABA PayWay returned HTTP ${response.status}`)
  return payload
}

function successfulStatus(payload) {
  const code = String(payload?.status?.code ?? '')
  return code === '0' || code === '00'
}

export async function fetchPaywayExchangeRates() {
  const config = requireConfiguration()
  const reqTime = requestTime()
  const body = {
    req_time: reqTime,
    merchant_id: config.merchantId,
    hash: sign([reqTime, config.merchantId], config.apiKey),
  }
  const payload = await post(EXCHANGE_RATE_PATH, body, config)
  if (!successfulStatus(payload)) {
    throw new Error(`ABA PayWay exchange-rate error ${payload?.status?.code || 'unknown'}: ${payload?.status?.message || 'Unknown error'}`)
  }
  return payload
}

export function usdKhrFromPayway(payload, side = paywayConfiguration().exchangeRateSide) {
  const rates = payload?.exchange_rates || {}
  const usd = rates.usd || rates.USD || payload?.usd || payload?.USD
  const buy = Number(usd?.buy)
  const sell = Number(usd?.sell)
  const selected = side === 'sell' ? sell : buy
  if (!Number.isFinite(selected) || selected <= 0) {
    throw new Error('ABA PayWay response did not include a valid USD/KHR rate')
  }
  return {
    usdKhr: selected,
    buy: Number.isFinite(buy) ? buy : undefined,
    sell: Number.isFinite(sell) ? sell : undefined,
    side,
  }
}

export async function generateKhqr({
  transactionId,
  amount,
  currency = 'USD',
  customer = {},
  items = [],
  callbackUrl,
  returnParams,
}) {
  const config = requireConfiguration()
  const normalizedCurrency = String(currency).toUpperCase()
  const normalizedAmount = Number(amount)
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(String(transactionId || ''))) {
    throw new Error('PayWay transaction ID must be 1-20 letters, numbers, underscores, or hyphens')
  }
  if (!['USD', 'KHR'].includes(normalizedCurrency)) throw new Error('KHQR currency must be USD or KHR')
  if (!Number.isFinite(normalizedAmount) || normalizedAmount < (normalizedCurrency === 'KHR' ? 100 : 0.01)) {
    throw new Error(normalizedCurrency === 'KHR' ? 'KHQR amount must be at least 100 KHR' : 'KHQR amount must be at least 0.01 USD')
  }
  if (normalizedCurrency === 'KHR' && !Number.isInteger(normalizedAmount)) {
    throw new Error('KHR KHQR amounts cannot contain decimal places')
  }

  const reqTime = requestTime()
  const encodedItems = items.length
    ? encodeBase64(JSON.stringify(items.slice(0, 10).map((item) => ({
      name: String(item.name || '').slice(0, 100),
      quantity: Math.max(1, Number(item.quantity) || 1),
      price: Number(item.price) || 0,
    }))))
    : ''
  if (encodedItems.length > 500) throw new Error('PayWay item data exceeds the 500-character encoded limit')
  const encodedCallback = callbackUrl || config.callbackUrl
    ? encodeBase64(callbackUrl || config.callbackUrl)
    : ''
  const encodedReturnParams = returnParams ? encodeBase64(JSON.stringify(returnParams)) : ''
  const lifetime = config.qrLifetimeMinutes
  const fields = {
    req_time: reqTime,
    merchant_id: config.merchantId,
    tran_id: String(transactionId),
    amount: normalizedAmount,
    items: encodedItems,
    first_name: clean(customer.firstName) || '',
    last_name: clean(customer.lastName) || '',
    email: clean(customer.email) || '',
    phone: clean(customer.phone) || '',
    purchase_type: 'purchase',
    payment_option: config.paymentOption,
    callback_url: encodedCallback,
    return_deeplink: null,
    currency: normalizedCurrency,
    custom_fields: null,
    return_params: encodedReturnParams || null,
    payout: null,
    lifetime,
    qr_image_template: config.qrTemplate,
  }
  const hashOrder = [
    fields.req_time,
    fields.merchant_id,
    fields.tran_id,
    fields.amount,
    fields.items,
    fields.first_name,
    fields.last_name,
    fields.email,
    fields.phone,
    fields.purchase_type,
    fields.payment_option,
    fields.callback_url,
    fields.return_deeplink,
    fields.currency,
    fields.custom_fields,
    fields.return_params,
    fields.payout,
    fields.lifetime,
    fields.qr_image_template,
  ]
  const payload = await post(GENERATE_QR_PATH, { ...fields, hash: sign(hashOrder, config.apiKey) }, config)
  if (!successfulStatus(payload)) {
    throw new Error(`ABA PayWay KHQR error ${payload?.status?.code || 'unknown'}: ${payload?.status?.message || 'Unknown error'}`)
  }
  return payload
}

function transactionRequest(transactionId) {
  const config = requireConfiguration()
  const normalizedId = String(transactionId || '')
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(normalizedId)) {
    throw new Error('PayWay transaction ID must be 1-20 letters, numbers, underscores, or hyphens')
  }
  const reqTime = requestTime()
  return {
    config,
    body: {
      req_time: reqTime,
      merchant_id: config.merchantId,
      tran_id: normalizedId,
      hash: sign([reqTime, config.merchantId, normalizedId], config.apiKey),
    },
  }
}

export async function checkPaywayTransaction(transactionId) {
  const { config, body } = transactionRequest(transactionId)
  return post(CHECK_TRANSACTION_PATH, body, config)
}

export async function closePaywayTransaction(transactionId) {
  const { config, body } = transactionRequest(transactionId)
  const payload = await post(CLOSE_TRANSACTION_PATH, body, config)
  if (!successfulStatus(payload)) {
    throw new Error(`ABA PayWay close-transaction error ${payload?.status?.code || 'unknown'}: ${payload?.status?.message || 'Unknown error'}`)
  }
  return payload
}

export const PAYWAY_ENDPOINTS = Object.freeze({
  sandbox: SANDBOX_BASE_URL,
  production: PRODUCTION_BASE_URL,
  exchangeRate: EXCHANGE_RATE_PATH,
  generateQr: GENERATE_QR_PATH,
  checkTransaction: CHECK_TRANSACTION_PATH,
  closeTransaction: CLOSE_TRANSACTION_PATH,
})
