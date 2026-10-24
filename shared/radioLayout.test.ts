import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const match = readFileSync(new URL('../src/components/Match.tsx', import.meta.url), 'utf8')
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
})
