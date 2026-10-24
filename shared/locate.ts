export type LocateProblem = 'denied' | 'off' | 'timeout' | 'unavailable'

export function locateProblemMessage(problem: LocateProblem): string {
  if (problem === 'denied') {
    return 'Location permission was denied. Allow location for Skulk in Settings, then try Find me again.'
  }
  if (problem === 'off') {
    return 'Location is turned off. Turn it on and try Find me again.'
  }
  if (problem === 'timeout') {
    return 'Couldn’t get a GPS fix in time. Try Find me again.'
  }
  return 'This phone couldn’t share a location. Try Find me again.'
}

/** Shown when the lobby keeps the default circle because the phone did not provide a fix. */
export function lobbyFallbackMessage(problem: LocateProblem): string {
  if (problem === 'denied') {
    return 'Location permission was denied, so the circle stays on the default map. Allow location for Skulk, then tap Find me.'
  }
  if (problem === 'off') {
    return 'Location is turned off, so the circle stays on the default map. Turn it on, then tap Find me.'
  }
  if (problem === 'timeout') {
    return 'Couldn’t get a GPS fix in time, so the circle stays on the default map. Tap Find me to try again.'
  }
  return 'This phone couldn’t share a location, so the circle stays on the default map. Tap Find me to try again.'
}

export function classifyLocateFailure(input: { code?: number | string | null; message?: string | null }): LocateProblem {
  const message = (input.message ?? '').toLowerCase()
  const code = String(input.code ?? '').toLowerCase()
  // Browser GeolocationPositionError uses 1/2/3. Capacitor uses OS-PLUG-GLOC-00xx.
  if (code === '1' || code === 'permission_denied' || code.includes('0003') || code.includes('0008')) return 'denied'
  if (code === '3' || code === 'timeout' || code.includes('0010')) return 'timeout'
  if (code.includes('0007') || code.includes('0009') || code.includes('0016') || code.includes('0017')) return 'off'
  if (message.includes('permission') && message.includes('denied')) return 'denied'
  if (message.includes('denied') && !message.includes('enable location')) return 'denied'
  if (
    message.includes('not enabled')
    || message.includes('turned off')
    || message.includes('disabled')
    || message.includes('enable location')
    || message.includes('location settings')
    || message.includes('location services')
  ) return 'off'
  if (message.includes('timeout') || message.includes('timed out') || message.includes('in time')) return 'timeout'
  return 'unavailable'
}
