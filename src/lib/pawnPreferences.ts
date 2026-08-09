const PAWN_AUTO_CALCULATE_COOKIE = 'phoneflow_pawn_auto_calculate'
export const PAWN_AUTO_CALCULATE_EVENT = 'phoneflow:pawn-auto-calculate'

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export function getPawnAutoCalculatePreference() {
  if (typeof document === 'undefined') return true

  try {
    const value = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(`${PAWN_AUTO_CALCULATE_COOKIE}=`))
      ?.split('=')[1]

    if (value === 'off') return false
    if (value === 'on') return true
  } catch {
    // Browser privacy settings can make cookies unavailable.
  }

  return true
}

export function savePawnAutoCalculatePreference(enabled: boolean) {
  if (typeof document === 'undefined') return

  try {
    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${PAWN_AUTO_CALCULATE_COOKIE}=${enabled ? 'on' : 'off'}; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax${secure}`
  } catch {
    // Keep the in-memory preference working if cookies are unavailable.
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PAWN_AUTO_CALCULATE_EVENT, { detail: enabled }))
  }
}
