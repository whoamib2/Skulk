import { HEALTH_ATTEMPT_MS, healthUrlFor, resolveWsUrl } from '@shared/serverUrl'
import { isNativeApp } from '@/lib/native'
import { loadServer } from '@/lib/session'

/** One /health request. A finished response means the process answered; a timeout or network error does not. */
export function pingHealth(url: string, timeoutMs = HEALTH_ATTEMPT_MS, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false)
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onAbort)
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs)
  return fetch(url, { cache: 'no-store', mode: 'no-cors', signal: ctrl.signal })
    .then(() => !signal?.aborted)
    .catch(() => false)
    .finally(() => {
      window.clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    })
}

/** Start a cold server without waiting. Safe to call on launch and whenever the app comes forward. */
export function warmGameServer(): void {
  const ws = resolveWsUrl(loadServer(), isNativeApp(), location.origin)
  const health = ws ? healthUrlFor(ws) : null
  if (!health) return
  void pingHealth(health)
}
