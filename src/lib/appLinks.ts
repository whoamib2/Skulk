import { App } from '@capacitor/app'
import { joinCodeFromUrl, originOfAppLink } from '@shared/appLink'
import { isNativeApp } from '@/lib/native'

const LAUNCH_URL_MS = 1500

let launchUrlPromise: Promise<string> | null = null

function realLaunchUrl(): Promise<string> {
  if (!isNativeApp()) {
    return Promise.resolve(typeof location !== 'undefined' ? location.href : '')
  }
  if (!launchUrlPromise) {
    launchUrlPromise = App.getLaunchUrl()
      .then((result) => result?.url ?? '')
      .catch(() => '')
  }
  return launchUrlPromise
}

/** URL that opened the app. Resolves with '' if the phone does not answer in time. */
export function readLaunchUrl(): Promise<string> {
  if (!isNativeApp()) return realLaunchUrl()
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(''), LAUNCH_URL_MS)
    void realLaunchUrl().then((url) => {
      window.clearTimeout(timer)
      resolve(url)
    })
  })
}

/**
 * Cold start uses getLaunchUrl. A link that arrives while the app is open
 * uses appUrlOpen. Both carry the https invite, including `/?join=`.
 */
export function watchJoinLinks(
  onLink: (link: { code: string; origin: string }) => void,
  onReady: () => void,
): () => void {
  if (!isNativeApp()) {
    onReady()
    return () => {}
  }
  let alive = true
  const accept = (url: string | null | undefined) => {
    if (!alive) return
    const code = joinCodeFromUrl(url)
    if (code) onLink({ code, origin: originOfAppLink(url) })
    onReady()
  }
  const timer = window.setTimeout(() => {
    if (alive) onReady()
  }, LAUNCH_URL_MS)
  void realLaunchUrl().then((url) => {
    window.clearTimeout(timer)
    accept(url)
  }).catch(() => {
    if (alive) onReady()
  })
  const pending = App.addListener('appUrlOpen', (event) => accept(event.url))
  return () => {
    alive = false
    window.clearTimeout(timer)
    void pending.then((handle) => handle.remove())
  }
}
