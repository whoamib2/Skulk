/** Android package that owns https://skulk.onrender.com App Links. */
export const SKULK_ANDROID_PACKAGE = 'app.skulk.game'

export const SKULK_APP_LINK_HOST = 'skulk.onrender.com'

export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${SKULK_ANDROID_PACKAGE}`

/** Round code from an invite URL, including `https://skulk.onrender.com/?join=CODE`. */
export function joinCodeFromUrl(raw: string | null | undefined): string {
  if (!raw) return ''
  try {
    return normalizeJoinCode(new URL(raw).searchParams.get('join'))
  } catch {
    return ''
  }
}

export function normalizeJoinCode(raw: string | null | undefined): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

/** Origin of an https invite, so the app joins the server that issued the link. */
export function originOfAppLink(raw: string | null | undefined): string {
  if (!raw) return ''
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    return `${url.protocol}//${url.host}`
  } catch {
    return ''
  }
}

/**
 * Chrome intent that opens the Skulk app on this invite.
 * If the app is not installed, Android Chrome follows the Play Store fallback.
 */
export function openInAppIntent(code = ''): string {
  const clean = normalizeJoinCode(code)
  const path = clean ? `/?join=${clean}` : '/'
  const fallback = encodeURIComponent(PLAY_STORE_URL)
  return `intent://${SKULK_APP_LINK_HOST}${path}#Intent;scheme=https;package=${SKULK_ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`
}

/** A saved round should stay put when this page is an invite to a different code. */
export function shouldResumeSavedRound(href: string, savedCode: string, savedName: string): boolean {
  if (joinCodeFromUrl(href)) return false
  return Boolean(savedCode && savedName)
}
