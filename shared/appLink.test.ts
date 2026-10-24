import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  PLAY_STORE_URL,
  SKULK_ANDROID_PACKAGE,
  joinCodeFromUrl,
  openInAppIntent,
  originOfAppLink,
  shouldResumeSavedRound,
} from './appLink.ts'

describe('join links', () => {
  it('reads a round code from an invite URL', () => {
    expect(joinCodeFromUrl('https://skulk.onrender.com/?join=ab12cd')).toBe('AB12CD')
    expect(joinCodeFromUrl('https://skulk.onrender.com/?join=ab-12%20cd')).toBe('AB12CD')
    expect(joinCodeFromUrl('https://skulk.onrender.com/privacy?join=zzzzzz')).toBe('ZZZZZZ')
    expect(joinCodeFromUrl('https://skulk.onrender.com/?join=ABCDEFGH')).toBe('ABCDEF')
    expect(joinCodeFromUrl('https://skulk.onrender.com/')).toBe('')
    expect(joinCodeFromUrl('')).toBe('')
    expect(joinCodeFromUrl('not a url')).toBe('')
  })

  it('keeps a saved round only when this page is not an invite', () => {
    expect(shouldResumeSavedRound('https://skulk.onrender.com/?join=AB12CD', 'OLD111', 'Ada')).toBe(false)
    expect(shouldResumeSavedRound('https://skulk.onrender.com/', 'OLD111', 'Ada')).toBe(true)
    expect(shouldResumeSavedRound('https://skulk.onrender.com/', '', 'Ada')).toBe(false)
  })

  it('builds an Android intent with a Play Store fallback', () => {
    const intent = openInAppIntent('ab12cd')
    expect(intent).toBe(
      `intent://skulk.onrender.com/?join=AB12CD#Intent;scheme=https;package=${SKULK_ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_URL)};end`,
    )
    expect(openInAppIntent('')).toContain('intent://skulk.onrender.com/#Intent;scheme=https;')
    expect(originOfAppLink('https://skulk.onrender.com/?join=AB12CD')).toBe('https://skulk.onrender.com')
  })

  it('claims https://skulk.onrender.com in the Android manifest', () => {
    const manifest = readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8')
    expect(manifest).toContain('android:autoVerify="true"')
    expect(manifest).toContain('android.intent.action.VIEW')
    expect(manifest).toContain('android.intent.category.DEFAULT')
    expect(manifest).toContain('android.intent.category.BROWSABLE')
    expect(manifest).toContain('android:scheme="https"')
    expect(manifest).toContain('android:host="skulk.onrender.com"')
    expect(manifest).toContain('android:pathPrefix="/"')
  })

  it('handles a cold start and a link that arrives while the app is open', () => {
    const links = readFileSync(new URL('../src/lib/appLinks.ts', import.meta.url), 'utf8')
    expect(links).toContain('getLaunchUrl')
    expect(links).toContain("addListener('appUrlOpen'")
    const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
    expect(app).toContain('watchJoinLinks')
  })
})
