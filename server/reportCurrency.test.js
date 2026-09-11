import assert from 'node:assert/strict'
import test from 'node:test'
import {
  USD_KHR_FALLBACK_DEFAULT,
  fallbackExchangeRate,
  isValidKhrRate,
  resolveKhrExchangeRate,
  convertToUsd,
  roundMoney,
} from './reportCurrency.js'

test('fallbackExchangeRate returns 4100 by default', () => {
  const previous = process.env.USD_KHR_FALLBACK_RATE
  delete process.env.USD_KHR_FALLBACK_RATE
  try {
    assert.equal(fallbackExchangeRate(), 4100)
  } finally {
    process.env.USD_KHR_FALLBACK_RATE = previous
  }
})

test('fallbackExchangeRate respects valid positive environment variable', () => {
  const previous = process.env.USD_KHR_FALLBACK_RATE
  process.env.USD_KHR_FALLBACK_RATE = '4150'
  try {
    assert.equal(fallbackExchangeRate(), 4150)
  } finally {
    process.env.USD_KHR_FALLBACK_RATE = previous
  }
})

test('fallbackExchangeRate ignores invalid, zero, or negative environment variable', () => {
  const previous = process.env.USD_KHR_FALLBACK_RATE
  try {
    process.env.USD_KHR_FALLBACK_RATE = 'invalid'
    assert.equal(fallbackExchangeRate(), 4100)
    process.env.USD_KHR_FALLBACK_RATE = '-500'
    assert.equal(fallbackExchangeRate(), 4100)
    process.env.USD_KHR_FALLBACK_RATE = '0'
    assert.equal(fallbackExchangeRate(), 4100)
  } finally {
    process.env.USD_KHR_FALLBACK_RATE = previous
  }
})

test('isValidKhrRate validates exchange rates in acceptable range [1000, 10000]', () => {
  assert.equal(isValidKhrRate(4100), true)
  assert.equal(isValidKhrRate(4000), true)
  assert.equal(isValidKhrRate(1000), true)
  assert.equal(isValidKhrRate(10000), true)
  assert.equal(isValidKhrRate('4200'), true)

  // Invalid rates
  assert.equal(isValidKhrRate(1), false)
  assert.equal(isValidKhrRate(0), false)
  assert.equal(isValidKhrRate(-4100), false)
  assert.equal(isValidKhrRate(999), false)
  assert.equal(isValidKhrRate(10001), false)
  assert.equal(isValidKhrRate(null), false)
  assert.equal(isValidKhrRate(undefined), false)
  assert.equal(isValidKhrRate(NaN), false)
})

test('resolveKhrExchangeRate returns stored rate when valid', () => {
  const result = resolveKhrExchangeRate(4200)
  assert.equal(result.rate, 4200)
  assert.equal(result.isFallback, false)
})

test('resolveKhrExchangeRate falls back when rate is missing or invalid', () => {
  const previous = process.env.USD_KHR_FALLBACK_RATE
  delete process.env.USD_KHR_FALLBACK_RATE
  try {
    const resNull = resolveKhrExchangeRate(null)
    assert.equal(resNull.rate, 4100)
    assert.equal(resNull.isFallback, true)

    const resOne = resolveKhrExchangeRate(1)
    assert.equal(resOne.rate, 4100)
    assert.equal(resOne.isFallback, true)

    const resZero = resolveKhrExchangeRate(0)
    assert.equal(resZero.rate, 4100)
    assert.equal(resZero.isFallback, true)
  } finally {
    process.env.USD_KHR_FALLBACK_RATE = previous
  }
})

test('fallbackExchangeRate rejects out-of-range environment values', () => {
  const previous = process.env.USD_KHR_FALLBACK_RATE
  try {
    for (const invalidRate of ['1', '999', '10001']) {
      process.env.USD_KHR_FALLBACK_RATE = invalidRate
      assert.equal(fallbackExchangeRate(), USD_KHR_FALLBACK_DEFAULT)
    }
    process.env.USD_KHR_FALLBACK_RATE = '4200'
    assert.equal(fallbackExchangeRate(), 4200)
  } finally {
    if (previous === undefined) delete process.env.USD_KHR_FALLBACK_RATE
    else process.env.USD_KHR_FALLBACK_RATE = previous
  }
})

test('convertToUsd preserves USD amounts directly without conversion', () => {
  const result = convertToUsd(150.75, 'USD', 1)
  assert.equal(result.amountUsd, 150.75)
  assert.equal(result.isFallback, false)
  assert.equal(result.rate, 1)
})

test('convertToUsd converts KHR with stored rate to 2 decimals', () => {
  // 410,000 KHR / 4,100 = 100.00 USD
  const result = convertToUsd(410000, 'KHR', 4100)
  assert.equal(result.amountUsd, 100)
  assert.equal(result.isFallback, false)
  assert.equal(result.rate, 4100)

  // 100,000 KHR / 4,120 = 24.27 USD
  const result2 = convertToUsd(100000, 'KHR', 4120)
  assert.equal(result2.amountUsd, 24.27)
  assert.equal(result2.isFallback, false)
})

test('convertToUsd never divides KHR amount by 1', () => {
  const previous = process.env.USD_KHR_FALLBACK_RATE
  delete process.env.USD_KHR_FALLBACK_RATE
  try {
    // When exchangeRate is 1 or invalid on a KHR record
    const result = convertToUsd(410000, 'KHR', 1)
    assert.equal(result.amountUsd, 100)
    assert.equal(result.isFallback, true)
    assert.equal(result.rate, 4100)
  } finally {
    process.env.USD_KHR_FALLBACK_RATE = previous
  }
})

test('roundMoney rounds to two decimal places reliably', () => {
  assert.equal(roundMoney(10.004), 10)
  assert.equal(roundMoney(10.005), 10.01)
  assert.equal(roundMoney(0), 0)
  assert.equal(roundMoney(null), 0)
})
