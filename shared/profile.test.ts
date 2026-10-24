import { describe, expect, it } from 'vitest'
import { cleanEmail, cleanUsername, showUsername } from './profile.ts'

describe('cleanUsername', () => {
  it('accepts a handle and strips a leading @', () => {
    expect(cleanUsername('@Gord_1')).toBe('gord_1')
    expect(showUsername('gord_1')).toBe('@gord_1')
  })

  it('rejects spaces, one letter, and a leading number', () => {
    expect(cleanUsername('a')).toBeNull()
    expect(cleanUsername('go rd')).toBeNull()
    expect(cleanUsername('1gord')).toBeNull()
    expect(cleanUsername('')).toBeNull()
  })
})

describe('cleanEmail', () => {
  it('allows a blank email and a normal address', () => {
    expect(cleanEmail('')).toBe('')
    expect(cleanEmail('  benspader@gmail.com ')).toBe('benspader@gmail.com')
  })

  it('rejects a sentence', () => {
    expect(cleanEmail('not an email')).toBeNull()
  })
})
