import { describe, expect, it } from 'vitest'
import { privacyDocument } from './privacy.ts'

describe('privacy policy', () => {
  it('says location is only for a round, with no accounts and no ads', () => {
    const html = privacyDocument()
    expect(html).toContain('<title>Privacy · Skulk</title>')
    expect(html).toMatch(/only while you are in a round/)
    expect(html).toMatch(/shared with the other players in the same round/)
    expect(html).toMatch(/no account/i)
    expect(html).toMatch(/no ads/i)
    expect(html).not.toMatch(/keystore|password/i)
  })
})
