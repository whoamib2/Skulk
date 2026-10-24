import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const match = readFileSync(new URL('../src/components/Match.tsx', import.meta.url), 'utf8')
const mapShell = readFileSync(new URL('../src/components/ExpandableMap.tsx', import.meta.url), 'utf8')
const hud = readFileSync(new URL('./mapHud.ts', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

describe('radio layout', () => {
  it('starts the message feed below the status card instead of padding under it', () => {
    const radioAt = match.indexOf('data-screen="radio"')
    const feedAt = match.indexOf('data-radio-feed')
    expect(radioAt).toBeGreaterThan(-1)
    expect(feedAt).toBeGreaterThan(radioAt)
    const radio = match.slice(radioAt, feedAt)
    expect(radio).toContain('{status}')
    expect(radio).not.toContain('pt-24')
    expect(match).toContain('data-round-status')
    expect(css).toMatch(/\.screen-safe\s*\{[^}]*safe-area-inset-top/)
    expect(css).toMatch(/\.screen-safe-x\s*\{[^}]*safe-area-inset-left/)
    expect(css).toMatch(/safe-area-inset-right/)
  })

  it('keeps a slim HUD on the map, including when the map fills the screen', () => {
    expect(match).toContain('<MapHud')
    expect(hud).toContain('Circle closes')
    expect(match).toContain('data-map-toast')
    expect(match).toContain("setTab('radio')")
    expect(match).toContain('hud={')
    const hudAt = mapShell.indexOf('data-map-hud')
    const closeAt = mapShell.indexOf('aria-label="Close map"')
    expect(hudAt).toBeGreaterThan(-1)
    expect(closeAt).toBeGreaterThan(hudAt)
    expect(mapShell).toMatch(/data-map-hud[\s\S]*safe-area-inset-top/)
    expect(mapShell).toMatch(/pointer-events-none absolute top-3 left-3 right-\[8\.5rem\]/)
  })
})
