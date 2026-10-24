/** Public game server. The home field starts here, and players can change it. */
export const DEFAULT_SERVER_URL = 'https://skulk.onrender.com'

/** How long to keep trying a cold server before giving up. Render’s free plan can take about a minute to wake. */
export const SERVER_WAKE_MS = 90_000

export function socketRetryDelayMs(attempt: number): number {
  const n = Math.max(0, Math.min(12, Math.floor(attempt)))
  return Math.min(4_000, 400 * 2 ** n)
}

export function stillWithinWake(startedAt: number, now: number): boolean {
  return now - startedAt < SERVER_WAKE_MS
}

export function healthUrlFor(wsUrl: string): string | null {
  try {
    const url = new URL(wsUrl)
    if (url.protocol !== 'wss:' && url.protocol !== 'ws:') return null
    const proto = url.protocol === 'wss:' ? 'https:' : 'http:'
    return `${proto}//${url.host}/health`
  } catch {
    return null
  }
}

/** Link a friend can open. The phone app must not use the WebView’s localhost origin. */
export function publicJoinUrl(serverRaw: string, code: string, native: boolean, pageOrigin = ''): string {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
  return `${publicOrigin(serverRaw, native, pageOrigin)}/?join=${clean}`
}

/** Privacy policy. On a phone this is the public server, not the WebView origin. */
export function privacyPageUrl(serverRaw: string, native: boolean, pageOrigin = ''): string {
  return `${publicOrigin(serverRaw, native, pageOrigin)}/privacy`
}

/** Terms of use. Same origin rules as the privacy policy. */
export function termsPageUrl(serverRaw: string, native: boolean, pageOrigin = ''): string {
  return `${publicOrigin(serverRaw, native, pageOrigin)}/terms`
}

function publicOrigin(serverRaw: string, native: boolean, pageOrigin: string): string {
  const trimmed = serverRaw.trim()
  if (!trimmed) return !native && pageOrigin ? originOf(pageOrigin) : DEFAULT_SERVER_URL
  const ws = resolveWsUrl(trimmed, true)
  if (!ws) return !native && pageOrigin ? originOf(pageOrigin) : DEFAULT_SERVER_URL
  const url = new URL(ws)
  const proto = url.protocol === 'wss:' ? 'https:' : 'http:'
  return `${proto}//${url.host}`
}

function originOf(pageOrigin: string): string {
  try {
    return new URL(pageOrigin).origin
  } catch {
    return DEFAULT_SERVER_URL
  }
}

/** Turn a typed server address into a WebSocket URL. Empty means this site, except on a phone app. */
export function resolveWsUrl(raw: string, native: boolean, pageOrigin = ''): string | null {
  const trimmed = raw.trim()
  if (!trimmed) {
    if (native || !pageOrigin) return null
    const page = new URL(pageOrigin)
    const proto = page.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${page.host}/ws`
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `ws://${trimmed}`
  const httpish = withScheme.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:')
  let parsed: URL
  try {
    parsed = new URL(httpish)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (!parsed.hostname) return null
  const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
  const path = parsed.pathname === '/' || parsed.pathname === '' ? '/ws' : parsed.pathname.replace(/\/$/, '')
  return `${wsProto}//${parsed.host}${path}${parsed.search}`
}

export function serverUrlProblem(raw: string, native: boolean): string | null {
  const trimmed = raw.trim()
  if (!trimmed) {
    return native ? 'Add a server address to host or join a round.' : null
  }
  if (!resolveWsUrl(trimmed, native)) return 'Use an address like https://example.com or 192.168.1.20:43123.'
  return null
}
