/** Public game server. The home field starts here, and players can change it. */
export const DEFAULT_SERVER_URL = 'https://skulk.onrender.com'

/** How long to keep trying a cold server before giving up. A free Render instance can take a couple of minutes. */
export const SERVER_WAKE_MS = 3 * 60 * 1000

/** One /health try. Short enough that a hung socket does not eat the whole wait. */
export const HEALTH_ATTEMPT_MS = 8_000

/** Pause between /health tries, so a cold server is not hammered. */
export const HEALTH_BACKOFF_MS = 3_000

/** When the waking screen switches from the first message to the longer one. */
export const WAKE_PATIENCE_MS = 90_000

export const WAKE_MESSAGE = 'Waking the game server… this can take up to a minute'
export const WAKE_STILL_MESSAGE = 'Still waking up, hang on…'
export const WAKE_FAILED_MESSAGE = 'The game server didn’t wake up. It can take a minute after it’s been asleep.'

export function wakeStatusMessage(elapsedMs: number): string {
  return elapsedMs >= WAKE_PATIENCE_MS ? WAKE_STILL_MESSAGE : WAKE_MESSAGE
}

/** How long to keep retrying after a live round drops. A free-plan deploy often takes a few minutes. */
export const RECONNECT_MS = 5 * 60 * 1000

export function connectBudgetMs(rejoining: boolean): number {
  return rejoining ? RECONNECT_MS : SERVER_WAKE_MS
}

export function socketRetryDelayMs(attempt: number): number {
  const n = Math.max(0, Math.min(12, Math.floor(attempt)))
  return Math.min(4_000, 400 * 2 ** n)
}

export function stillWithinWake(startedAt: number, now: number): boolean {
  return stillWithinBudget(startedAt, now, SERVER_WAKE_MS)
}

export function stillWithinBudget(startedAt: number, now: number, budgetMs: number): boolean {
  return now - startedAt < budgetMs
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
