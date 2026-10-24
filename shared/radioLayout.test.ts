import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const match = readFileSync(new URL('../src/components/Match.tsx', import.meta.url), 'utf8')
const mapShell = readFileSync(new URL('../src/components/ExpandableMap.tsx', import.meta.url), 'utf8')
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

  it('keeps a compact timer on the map, including when the map fills the screen', () => {
    expect(match).toContain('<MapTimer')
    expect(match).toContain('hud={')
    const timerAt = mapShell.indexOf('data-map-timer')
    const closeAt = mapShell.indexOf('aria-label="Close map"')
    expect(timerAt).toBeGreaterThan(-1)
    expect(closeAt).toBeGreaterThan(timerAt)
    expect(mapShell).toMatch(/data-map-timer[\s\S]*safe-area-inset-top/)
    expect(mapShell).toMatch(/pointer-events-none absolute top-3 left-3/)
  })
})
