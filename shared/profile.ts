import { containsBanned } from './words.ts'

/** Letters, numbers, and underscore. Stored without the @. */
export function cleanUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const handle = raw.trim().replace(/^@+/, '').toLowerCase()
  if (!/^[a-z][a-z0-9_]{1,19}$/.test(handle)) return null
  if (containsBanned(handle)) return null
  return handle
}

/** Empty is allowed. Anything else has to look like an email and stays on the device. */
export function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const email = raw.trim()
  if (!email) return ''
  if (email.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

export function showUsername(handle: string): string {
  return handle ? `@${handle}` : ''
}
