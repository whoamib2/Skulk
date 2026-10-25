import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { defaultSettings, planRoles, practiceSettings } from './rules.ts'
import {
  FREE_PLAYER_CAP,
  FREE_RADIUS_M,
  PRO_PLAYER_CAP,
  PRO_PLAYER_MESSAGE,
  PRO_PRODUCT_ID,
  PRO_SETTINGS_MESSAGE,
  isFreeSettings,
  isProLimitMessage,
  resolveHostPro,
} from './pro.ts'

describe('Skulk Pro limits', () => {
  it('keeps the classic round inside the free rules', () => {
    const settings = defaultSettings()
    expect(isFreeSettings(settings)).toBe(true)
    expect(isFreeSettings({ ...settings, zoneLat: 1, zoneLng: 2, spectator: 'live' })).toBe(true)
    expect(isFreeSettings({ ...settings, durationSec: 60 })).toBe(false)
    expect(isFreeSettings({ ...settings, headStartSec: 15 })).toBe(false)
    expect(isFreeSettings({ ...settings, pingIntervalSec: 20 })).toBe(false)
    expect(isFreeSettings({ ...settings, zoneEnabled: false })).toBe(false)
    expect(isFreeSettings({ ...settings, zoneRadiusM: 1500 })).toBe(false)
    expect(isFreeSettings({ ...settings, shrinkEnabled: true })).toBe(false)
    expect(isFreeSettings(practiceSettings(settings))).toBe(false)
  })

  it('caps a round at 30 players', () => {
    expect(PRO_PLAYER_CAP).toBe(30)
    expect(FREE_PLAYER_CAP).toBe(6)
    const over = planRoles(Array.from({ length: PRO_PLAYER_CAP + 1 }, () => 'random' as const))
    expect(over.ok).toBe(false)
    expect(over.reason).toBe(`${PRO_PLAYER_CAP} players is the limit.`)
    expect(planRoles(Array.from({ length: FREE_PLAYER_CAP }, () => 'random' as const)).ok).toBe(true)
  })

  it('trusts a purchase token until Play verification is turned on, and ignores a dev unlock otherwise', () => {
    const token = { productId: PRO_PRODUCT_ID, purchaseToken: 'play-token', devUnlock: false }
    const dev = { productId: PRO_PRODUCT_ID, purchaseToken: null, devUnlock: true }
    expect(resolveHostPro(null, {})).toBe(false)
    expect(resolveHostPro(dev, {})).toBe(false)
    expect(resolveHostPro(dev, { SKULK_PRO_DEV: '1' })).toBe(true)
    expect(resolveHostPro(token, {})).toBe(true)
    expect(resolveHostPro(token, { SKULK_PLAY_VERIFY: '1' })).toBe(false)
    expect(resolveHostPro({ productId: 'other', purchaseToken: 'play-token', devUnlock: false }, {})).toBe(false)
    expect(resolveHostPro({ productId: PRO_PRODUCT_ID, purchaseToken: '   ', devUnlock: false }, {})).toBe(false)
  })

  it('names the product and the messages the lobby can turn into an upsell', () => {
    expect(PRO_PRODUCT_ID).toBe('skulk_pro')
    expect(FREE_RADIUS_M).toBe(400)
    expect(isProLimitMessage(PRO_SETTINGS_MESSAGE)).toBe(true)
    expect(isProLimitMessage(PRO_PLAYER_MESSAGE)).toBe(true)
    expect(isProLimitMessage('This round is full.')).toBe(false)
    const source = readFileSync(new URL('./pro.ts', import.meta.url), 'utf8')
    expect(source).toContain('TODO(play-billing)')
    expect(source).toContain('purchases.products.get')
    const manifest = readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8')
    expect(manifest).toContain('com.android.vending.BILLING')
    const settings = readFileSync(new URL('../src/components/SettingsScreen.tsx', import.meta.url), 'utf8')
    expect(settings).toContain('data-pro-card')
    expect(settings).toContain('proRestore')
    expect(settings).toContain('proGo')
    const copy = readFileSync(new URL('../src/lib/copy.ts', import.meta.url), 'utf8')
    expect(copy).toContain("proGo: 'Go Pro'")
    expect(copy).toContain("proRestore: 'Restore purchase'")
    expect(copy).toContain("proPerkPlayers: 'Up to 30 players. A free round fits 6.'")
    const lobby = readFileSync(new URL('../src/components/Lobby.tsx', import.meta.url), 'utf8')
    expect(lobby).toContain('data-upsell')
    expect(lobby).toContain('view.you.isHost && !view.practice && !pro.owned')
  })
})
