const BANNED = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'cunt',
  'nigger',
  'nigga',
  'faggot',
  'retard',
]

export function containsBanned(text: string): boolean {
  const lower = text.toLowerCase()
  return BANNED.some((word) => lower.includes(word))
}

export function starBanned(text: string): string {
  let out = text
  for (const word of BANNED) {
    out = out.replace(new RegExp(word, 'ig'), (match) => '*'.repeat(match.length))
  }
  return out
}

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.trim().replace(/\s+/g, ' ')
  if (name.length < 2 || name.length > 16) return null
  if (!/^[\p{L}\p{N} .'-]+$/u.test(name)) return null
  if (containsBanned(name)) return null
  return name
}

export function cleanRadio(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = starBanned(raw.trim().replace(/\s+/g, ' '))
  if (!text) return null
  return text.slice(0, 180)
}
