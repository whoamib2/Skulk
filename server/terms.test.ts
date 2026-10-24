import { describe, expect, it } from 'vitest'
import { termsDocument } from './terms.ts'

describe('terms of use', () => {
  it('keeps hosting free and points at the privacy policy', () => {
    const html = termsDocument()
    expect(html).toContain('<title>Terms · Skulk</title>')
    expect(html).toMatch(/Hosting a round is free/)
    expect(html).toMatch(/does not sell a hosting unlock/)
    expect(html).toContain('href="/privacy"')
    expect(html).not.toMatch(/Scram|Unlock hosting/i)
  })
})
