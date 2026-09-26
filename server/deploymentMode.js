export const LOCAL_LAN_DEPLOYMENT_MODE = 'local-lan'

export function isLocalLanDeployment(environment = process.env) {
  return String(environment.PHONEFLOW_DEPLOYMENT_MODE || '').trim().toLowerCase() === LOCAL_LAN_DEPLOYMENT_MODE
}

export function sessionCookieIsSecure(environment = process.env) {
  return environment.NODE_ENV === 'production' && !isLocalLanDeployment(environment)
}

export function helmetOptions(environment = process.env) {
  const localLan = isLocalLanDeployment(environment)
  return {
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    strictTransportSecurity: localLan ? false : undefined,
    contentSecurityPolicy: {
      directives: {
        imgSrc: ["'self'", 'data:', 'https://ik.imagekit.io'],
        // HTTP appliance deployments have no TLS endpoint to upgrade to.
        ...(localLan ? { upgradeInsecureRequests: null } : {}),
      },
    },
  }
}
