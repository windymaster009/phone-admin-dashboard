export const LOCAL_LAN_DEPLOYMENT_MODE = 'local-lan'

export function sessionCookieIsSecure(environment = process.env) {
  const deploymentMode = String(environment.PHONEFLOW_DEPLOYMENT_MODE || '').trim().toLowerCase()
  return environment.NODE_ENV === 'production' && deploymentMode !== LOCAL_LAN_DEPLOYMENT_MODE
}
