import { isNativeApp } from '@/lib/native'
import { emptyStats, type PlayerStats } from '@shared/stats'

const STATS_KEY = 'skulk-stats'
const SEEN_KEY = 'skulk-stat-seen'
const PROFILE_KEY = 'skulk-profile'
const BLOCKS_KEY = 'skulk-blocks'

export interface StoredProfile {
  username: string
  email: string
  emailUpdates: boolean
  language: 'en'
}

export interface BlockedPlayer {
  id: string
  name: string
}

export const emptyProfile = (): StoredProfile => ({
  username: '',
  email: '',
  emailUpdates: false,
  language: 'en',
})

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  localStorage.setItem(key, value)
  void mirror(key, value)
}

async function mirror(key: string, value: string): Promise<void> {
  if (!isNativeApp()) return
  const { Preferences } = await import('@capacitor/preferences')
  await Preferences.set({ key, value })
}

/** On a phone, Preferences is the copy that survives a WebView wipe. localStorage stays the copy the UI reads. */
export async function hydrateDeviceStore(): Promise<void> {
  if (!isNativeApp()) return
  const { Preferences } = await import('@capacitor/preferences')
  for (const key of [STATS_KEY, SEEN_KEY, PROFILE_KEY, BLOCKS_KEY]) {
    const { value } = await Preferences.get({ key })
    if (value != null) localStorage.setItem(key, value)
  }
}

export function loadStats(): PlayerStats {
  const raw = read(STATS_KEY)
  if (!raw) return emptyStats()
  try {
    const parsed = JSON.parse(raw) as Partial<PlayerStats>
    return {
      roundsPlayed: numberOr(parsed.roundsPlayed),
      roundsWon: numberOr(parsed.roundsWon),
      neverCaught: numberOr(parsed.neverCaught),
      longestRunSec: numberOr(parsed.longestRunSec),
      distanceM: numberOr(parsed.distanceM),
    }
  } catch {
    return emptyStats()
  }
}

export function saveStats(stats: PlayerStats): void {
  write(STATS_KEY, JSON.stringify(stats))
}

export function loadSeenRounds(): string[] {
  const raw = read(SEEN_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function saveSeenRounds(keys: string[]): void {
  write(SEEN_KEY, JSON.stringify(keys.slice(-40)))
}

export function loadProfile(): StoredProfile {
  const raw = read(PROFILE_KEY)
  if (!raw) return emptyProfile()
  try {
    const parsed = JSON.parse(raw) as Partial<StoredProfile>
    return {
      username: typeof parsed.username === 'string' ? parsed.username : '',
      email: typeof parsed.email === 'string' ? parsed.email : '',
      emailUpdates: parsed.emailUpdates === true,
      language: 'en',
    }
  } catch {
    return emptyProfile()
  }
}

export function saveProfile(profile: StoredProfile): void {
  write(PROFILE_KEY, JSON.stringify({ ...profile, language: 'en' as const }))
}

export function loadBlocks(): BlockedPlayer[] {
  const raw = read(BLOCKS_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is BlockedPlayer => {
      return Boolean(item) && typeof item.id === 'string' && typeof item.name === 'string'
    })
  } catch {
    return []
  }
}

export function saveBlocks(blocks: BlockedPlayer[]): void {
  write(BLOCKS_KEY, JSON.stringify(blocks))
}

export function blockPlayer(player: BlockedPlayer): BlockedPlayer[] {
  const next = loadBlocks().filter((item) => item.id !== player.id)
  next.push(player)
  saveBlocks(next)
  return next
}

export function unblockPlayer(id: string): BlockedPlayer[] {
  const next = loadBlocks().filter((item) => item.id !== id)
  saveBlocks(next)
  return next
}

function numberOr(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
