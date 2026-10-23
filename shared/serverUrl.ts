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
