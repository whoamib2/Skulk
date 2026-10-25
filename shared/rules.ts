import { distanceMeters } from './geo.ts'
import { zonePhrase } from './format.ts'
import { PRO_PLAYER_CAP } from './pro.ts'
import type { RoleChoice, Settings, Side, ViewMarker } from './types.ts'

export const TAG_RADIUS_M = 15
export const OOB_GRACE_MS = 30_000
export const OPENING_PING_DELAY_MS = 1000
/** How often a moving player is broadcast. Phase changes and other events are not held this long. */
export const MOVEMENT_BROADCAST_MS = 1000
export const MIN_RADIUS_M = 80
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const DEFAULT_CENTER = { lat: 40.6602, lng: -73.969 }

export function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

export function makeCode(rand: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)]
  return code
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function defaultSettings(partial?: Partial<Settings>): Settings {
  return clampSettings({
    durationSec: 45 * 60,
    headStartSec: 3 * 60,
    pingIntervalSec: 5 * 60,
    zoneEnabled: true,
    zoneLat: DEFAULT_CENTER.lat,
    zoneLng: DEFAULT_CENTER.lng,
    zoneRadiusM: 400,
    shrinkEnabled: false,
    shrinkEverySec: 5 * 60,
    shrinkRatio: 0.75,
    spectator: 'delayed',
    spectatorDelaySec: 60,
    ...partial,
  })
}

export function practiceSettings(base: Settings): Settings {
  return clampSettings({
    ...base,
    durationSec: 90,
    headStartSec: 20,
    pingIntervalSec: 30,
    zoneRadiusM: 220,
    shrinkEnabled: false,
    spectator: 'delayed',
  })
}

export function clampSettings(input: Settings): Settings {
  const durationSec = clamp(Math.round(input.durationSec), 60, 3 * 3600)
  let headStartSec = clamp(Math.round(input.headStartSec), 0, 15 * 60)
  if (headStartSec > durationSec - 15) headStartSec = Math.max(0, durationSec - 15)
  let pingIntervalSec = Math.round(input.pingIntervalSec)
  if (pingIntervalSec !== 0) pingIntervalSec = clamp(pingIntervalSec, 20, 30 * 60)
  const spectator = input.spectator === 'live' || input.spectator === 'off' ? input.spectator : 'delayed'
  return {
    durationSec,
    headStartSec,
    pingIntervalSec,
    zoneEnabled: Boolean(input.zoneEnabled),
    zoneLat: clamp(input.zoneLat, -85, 85),
    zoneLng: clamp(input.zoneLng, -180, 180),
    zoneRadiusM: clamp(Math.round(input.zoneRadiusM), 150, 3000),
    shrinkEnabled: Boolean(input.shrinkEnabled),
    shrinkEverySec: clamp(Math.round(input.shrinkEverySec), 30, 20 * 60),
    shrinkRatio: 0.75,
    spectator,
    spectatorDelaySec: 60,
  }
}

export interface RolePlan {
  ok: boolean
  reason: string | null
  warning: string | null
  roles: Array<Side | null>
}

export function planRoles(preferred: RoleChoice[]): RolePlan {
  const n = preferred.length
  const none = preferred.map((role) => (role === 'random' ? null : role))
  if (n < 3) {
    return { ok: false, reason: 'Need at least 3 players.', warning: null, roles: none }
  }
  if (n > PRO_PLAYER_CAP) {
    return { ok: false, reason: `${PRO_PLAYER_CAP} players is the limit.`, warning: null, roles: none }
  }

  const minH = Math.max(1, Math.ceil(n / 10))
  const maxH = Math.floor(n / 2)
  const lockedH: number[] = []
  const lockedR: number[] = []
  const randoms: number[] = []
  preferred.forEach((role, index) => {
    if (role === 'hunter') lockedH.push(index)
    else if (role === 'runner') lockedR.push(index)
    else randoms.push(index)
  })

  const minAssignable = Math.max(minH, lockedH.length)
  const maxAssignable = Math.min(maxH, lockedH.length + randoms.length)
  if (minAssignable > maxAssignable) {
    const reason = lockedH.length > maxH
      ? 'Too many hunters. Someone has to run, or pick Random.'
      : 'Not enough hunters. Keep at least one hunter for every 10 players.'
    return { ok: false, reason, warning: null, roles: none }
  }

  const target = maxAssignable
  const roles: Array<Side | null> = preferred.map((role) => (role === 'random' ? null : role))
  let need = target - lockedH.length
  for (const index of randoms) {
    if (need > 0) {
      roles[index] = 'hunter'
      need -= 1
    } else {
      roles[index] = 'runner'
    }
  }
  const runners = n - target
  const warning = target * 2 < runners
    ? 'Runners heavily outnumber hunters. You can still start.'
    : null
  return { ok: true, reason: null, warning, roles }
}

export function sampleAt<T extends { t: number }>(history: T[], at: number): T | null {
  let best: T | null = null
  for (const sample of history) {
    if (sample.t <= at) best = sample
    else break
  }
  return best
}

export interface MarkerPerson {
  id: string
  name: string
  side: Side
  caught: boolean
  lat: number | null
  lng: number | null
  history: { t: number; lat: number; lng: number }[]
  outSince: number | null
}

/**
 * What one phone is allowed to plot.
 * Hunters get runner snapshots, not a live trail.
 * Runners still in the round never see hunters.
 * A runner outside the circle past the grace period is the exception.
 * Tagged players watch on a delay, live, or not at all.
 */
export function markersFor(input: {
  phase: 'lobby' | 'headstart' | 'hunt' | 'ended'
  now: number
  viewerId: string
  viewerSide: Side | null
  viewerCaught: boolean
  self: { lat: number | null; lng: number | null }
  others: MarkerPerson[]
  pings: { playerId: string; lat: number; lng: number; at: number }[]
  zoneEnabled: boolean
  spectator: Settings['spectator']
  spectatorDelaySec: number
}): ViewMarker[] {
  const { phase, now, viewerSide, viewerCaught } = input
  if (phase === 'lobby' || phase === 'ended') return []

  const markers: ViewMarker[] = []
  if (input.self.lat != null && input.self.lng != null && viewerSide) {
    markers.push({
      id: input.viewerId,
      name: 'You',
      lat: input.self.lat,
      lng: input.self.lng,
      kind: 'self',
      side: viewerSide,
      at: now,
    })
  }

  if (viewerCaught) {
    if (input.spectator === 'off' || !viewerSide) return markers
    const delayMs = input.spectator === 'delayed' ? input.spectatorDelaySec * 1000 : 0
    for (const person of input.others) {
      if (person.lat == null || person.lng == null) continue
      if (delayMs === 0) {
        markers.push({
          id: person.id,
          name: person.name,
          lat: person.lat,
          lng: person.lng,
          kind: 'spectate',
          side: person.side,
          at: now,
        })
        continue
      }
      const sample = sampleAt(person.history, now - delayMs)
      if (!sample) continue
      markers.push({
        id: person.id,
        name: person.name,
        lat: sample.lat,
        lng: sample.lng,
        kind: 'spectate',
        side: person.side,
        at: sample.t,
      })
    }
    return markers
  }

  const activeHunter = viewerSide === 'hunter'
  const activeRunner = viewerSide === 'runner'

  for (const person of input.others) {
    if (person.caught || person.lat == null || person.lng == null) continue
    if (activeHunter && person.side === 'hunter') {
      markers.push({
        id: person.id,
        name: person.name,
        lat: person.lat,
        lng: person.lng,
        kind: 'teammate',
        side: 'hunter',
        at: now,
      })
    }
    if (activeRunner && person.side === 'runner') {
      markers.push({
        id: person.id,
        name: person.name,
        lat: person.lat,
        lng: person.lng,
        kind: 'teammate',
        side: 'runner',
        at: now,
      })
    }
    if (activeHunter && person.side === 'runner' && phase === 'hunt') {
      const revealed = input.zoneEnabled
        && person.outSince != null
        && now - person.outSince >= OOB_GRACE_MS
      if (revealed) {
        markers.push({
          id: person.id,
          name: person.name,
          lat: person.lat,
          lng: person.lng,
          kind: 'reveal',
          side: 'runner',
          at: now,
        })
      } else {
        const ping = input.pings.find((item) => item.playerId === person.id)
        if (ping) {
          markers.push({
            id: person.id,
            name: person.name,
            lat: ping.lat,
            lng: ping.lng,
            kind: 'ping',
            side: 'runner',
            at: ping.at,
          })
        }
      }
    }
  }
  return markers
}

export function withinTag(
  a: { lat: number; lng: number } | null,
  b: { lat: number; lng: number } | null,
): boolean {
  if (!a || !b) return false
  return distanceMeters(a.lat, a.lng, b.lat, b.lng) <= TAG_RADIUS_M
}

export function nextShrinkRadius(radiusM: number, ratio: number): number | null {
  const next = Math.max(MIN_RADIUS_M, Math.round(radiusM * ratio))
  return next < radiusM ? next : null
}

export function describeZone(radiusM: number, enabled: boolean): string {
  if (!enabled) return 'Anywhere'
  return `${Math.round(radiusM)} m · ${zonePhrase(radiusM)}`
}
