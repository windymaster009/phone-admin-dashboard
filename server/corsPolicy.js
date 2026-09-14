function configuredOrigins(value) {
  return String(value || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

export function corsOriginIsAllowed({
  origin,
  requestOrigin,
  clientOrigin = process.env.CLIENT_ORIGIN,
  nodeEnv = process.env.NODE_ENV,
}) {
  if (!origin) return true
  if (origin === requestOrigin) return true
  if (configuredOrigins(clientOrigin).includes(origin)) return true

  if (nodeEnv !== 'production') {
    const localDevelopmentOrigin = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin)
    const privateLanDevelopmentOrigin = /^https?:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)[^/]+(?::\d+)?$/.test(origin)
    return localDevelopmentOrigin || privateLanDevelopmentOrigin
  }

  return false
}
