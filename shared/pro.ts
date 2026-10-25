import type { Settings } from './types.ts'

/** Non-consumable product Ben creates in Play Console. The price is set there, not here. */
export const PRO_PRODUCT_ID = 'skulk_pro'

/** Players in a free round, including the host and practice players. */
export const FREE_PLAYER_CAP = 6
/** Players in a Pro round, including the host. */
export const PRO_PLAYER_CAP = 30

/** 15, 30, and 45 minutes. The classic 45-minute round stays free. */
export const FREE_DURATIONS_SEC = [15 * 60, 30 * 60, 45 * 60] as const
/** None, 1 minute, or 3 minutes. */
export const FREE_HEADS_SEC = [0, 60, 180] as const
/** Hunters get one snapshot every 5 minutes. */
export const FREE_PING_SEC = 5 * 60
/** The free circle stays on, at the classic size. Moving its center is always free. */
export const FREE_RADIUS_M = 400

export const PRO_SETTINGS_MESSAGE = 'That option is part of Skulk Pro.'
export const PRO_PLAYER_MESSAGE = `Free rounds hold ${FREE_PLAYER_CAP} players. Skulk Pro holds ${PRO_PLAYER_CAP}.`

export interface ProClaim {
  productId: string
  purchaseToken: string | null
  devUnlock: boolean
}

export interface ProEnv {
  SKULK_PRO_DEV?: string
  SKULK_PLAY_VERIFY?: string
}

export function isProLimitMessage(message: string): boolean {
  return message === PRO_SETTINGS_MESSAGE || message === PRO_PLAYER_MESSAGE
}

/** Gameplay limits only. The circle's center and the after-tag view are not part of Pro. */
export function isFreeSettings(settings: Settings): boolean {
  return (
    (FREE_DURATIONS_SEC as readonly number[]).includes(settings.durationSec)
    && (FREE_HEADS_SEC as readonly number[]).includes(settings.headStartSec)
    && settings.pingIntervalSec === FREE_PING_SEC
    && settings.zoneEnabled === true
    && settings.zoneRadiusM === FREE_RADIUS_M
    && settings.shrinkEnabled === false
  )
}

export function durationIsPro(sec: number): boolean {
  return !(FREE_DURATIONS_SEC as readonly number[]).includes(sec)
}

export function headIsPro(sec: number): boolean {
  return !(FREE_HEADS_SEC as readonly number[]).includes(sec)
}

export function pingIsPro(sec: number): boolean {
  return sec !== FREE_PING_SEC
}

export function radiusIsPro(meters: number): boolean {
  return meters !== FREE_RADIUS_M
}

/**
 * Whether this claim unlocks host options.
 * A dev unlock is ignored unless SKULK_PRO_DEV=1, so a debug build cannot grant
 * Pro on the public server by itself. A purchase token is accepted until
 * SKULK_PLAY_VERIFY=1 turns on the Play Developer API hook.
 */
export function resolveHostPro(claim: ProClaim | null | undefined, env: ProEnv): boolean {
  if (!claim) return false
  if (claim.devUnlock === true && env.SKULK_PRO_DEV === '1') return true
  if (claim.productId !== PRO_PRODUCT_ID) return false
  const token = typeof claim.purchaseToken === 'string' ? claim.purchaseToken.trim() : ''
  if (!token) return false
  return verifyPlayPurchase(token, env)
}

/**
 * TODO(play-billing): verify `token` with the Google Play Developer API
 * purchases.products.get for package app.skulk.game and product skulk_pro.
 * Accept only when purchaseState is purchased. That call needs a Play service
 * account, which is not configured yet.
 *
 * Until the call exists, a non-empty token is trusted so the client can ship.
 * Set SKULK_PLAY_VERIFY=1 to refuse every token instead of trusting them. Do not
 * set that flag until this function actually calls Google.
 */
export function verifyPlayPurchase(token: string, env: ProEnv): boolean {
  if (env.SKULK_PLAY_VERIFY === '1') return false
  return token.length > 0
}
