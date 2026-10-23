import { describe, expect, it } from 'vitest'
import { destination, distanceMeters } from './geo.ts'
import { makeCode, markersFor, planRoles, TAG_RADIUS_M, withinTag, CODE_ALPHABET } from './rules.ts'
import { cleanName, cleanRadio } from './words.ts'

describe('geo', () => {
  it('measures a short northbound step', () => {
    const next = destination(40.66, -73.969, 0, 15)
    expect(distanceMeters(40.66, -73.969, next.lat, next.lng)).toBeCloseTo(15, 1)
  })
})

describe('codes and names', () => {
  it('makes a 6 character code without ambiguous glyphs', () => {
    const code = makeCode(() => 0)
    expect(code).toHaveLength(6)
    for (const char of code) expect(CODE_ALPHABET.includes(char)).toBe(true)
    expect(code.includes('O')).toBe(false)
    expect(code.includes('0')).toBe(false)
  })

  it('rejects short and offensive names and stars radio', () => {
    expect(cleanName('Ada')).toBe('Ada')
    expect(cleanName('A')).toBeNull()
    expect(cleanName('fuck')).toBeNull()
    expect(cleanRadio('meet by the gate')).toBe('meet by the gate')
    expect(cleanRadio('fuck off')).toBe('**** off')
  })
})

describe('planRoles', () => {
  it('fills random players toward an even side and never more hunters than runners', () => {
    const plan = planRoles(['random', 'random', 'random', 'random', 'random'])
    expect(plan.ok).toBe(true)
    expect(plan.roles.filter((role) => role === 'hunter')).toHaveLength(2)
    expect(plan.roles.filter((role) => role === 'runner')).toHaveLength(3)
  })

  it('needs three players and refuses a hunter majority', () => {
    expect(planRoles(['hunter', 'runner']).ok).toBe(false)
    const heavy = planRoles(['hunter', 'hunter', 'hunter'])
    expect(heavy.ok).toBe(false)
    expect(heavy.reason).toMatch(/Too many hunters/)
  })

  it('requires one hunter per ten players', () => {
    const preferred = ['hunter', ...Array.from({ length: 10 }, () => 'runner' as const)]
    expect(planRoles(preferred).ok).toBe(false)
    const withSpare = ['hunter', 'random', ...Array.from({ length: 9 }, () => 'runner' as const)]
    const plan = planRoles(withSpare)
    expect(plan.ok).toBe(true)
    expect(plan.roles.filter((role) => role === 'hunter')).toHaveLength(2)
  })
})

describe('markersFor', () => {
  const runner = {
    id: 'runner',
    name: 'Bea',
    side: 'runner' as const,
    caught: false,
    lat: 13.579246,
    lng: 0,
    history: [
      { t: 0, lat: 13.5, lng: 0 },
      { t: 70_000, lat: 13.579246, lng: 0 },
    ],
    outSince: null,
  }
  const hunter = {
    id: 'hunter',
    name: 'Ada',
    side: 'hunter' as const,
    caught: false,
    lat: 13.4,
    lng: 0,
    history: [
      { t: 0, lat: 13.1, lng: 0 },
      { t: 70_000, lat: 13.4, lng: 0 },
    ],
    outSince: null,
  }

  it('hides runners from hunters during the head start, even if a ping exists', () => {
    const markers = markersFor({
      phase: 'headstart',
      now: 5_000,
      viewerId: 'hunter',
      viewerSide: 'hunter',
      viewerCaught: false,
      self: { lat: hunter.lat, lng: hunter.lng },
      others: [runner],
      pings: [{ playerId: 'runner', lat: 13.579246, lng: 0, at: 4_000 }],
      zoneEnabled: true,
      spectator: 'delayed',
      spectatorDelaySec: 60,
    })
    expect(markers.some((marker) => marker.id === 'runner')).toBe(false)
  })

  it('shows hunters the snapshot, not the live runner', () => {
    const markers = markersFor({
      phase: 'hunt',
      now: 20_000,
      viewerId: 'hunter',
      viewerSide: 'hunter',
      viewerCaught: false,
      self: { lat: 0, lng: 0 },
      others: [runner],
      pings: [{ playerId: 'runner', lat: 13.5, lng: 0.01, at: 10_000 }],
      zoneEnabled: true,
      spectator: 'delayed',
      spectatorDelaySec: 60,
    })
    const ping = markers.find((marker) => marker.id === 'runner')
    expect(ping).toMatchObject({ kind: 'ping', lat: 13.5, lng: 0.01 })
    expect(JSON.stringify(markers)).not.toContain('13.579246')
  })

  it('never shows hunters to a runner who is still in', () => {
    const markers = markersFor({
      phase: 'hunt',
      now: 20_000,
      viewerId: 'runner',
      viewerSide: 'runner',
      viewerCaught: false,
      self: { lat: runner.lat, lng: runner.lng },
      others: [hunter],
      pings: [],
      zoneEnabled: true,
      spectator: 'delayed',
      spectatorDelaySec: 60,
    })
    expect(markers.some((marker) => marker.id === 'hunter')).toBe(false)
    expect(JSON.stringify(markers)).not.toContain('13.4')
  })

  it('reveals a runner who stays outside past the grace period', () => {
    const markers = markersFor({
      phase: 'hunt',
      now: 40_000,
      viewerId: 'hunter',
      viewerSide: 'hunter',
      viewerCaught: false,
      self: { lat: 0, lng: 0 },
      others: [{ ...runner, outSince: 40_000 - 31_000 }],
      pings: [{ playerId: 'runner', lat: 1, lng: 1, at: 1 }],
      zoneEnabled: true,
      spectator: 'delayed',
      spectatorDelaySec: 60,
    })
    expect(markers.find((marker) => marker.id === 'runner')).toMatchObject({
      kind: 'reveal',
      lat: 13.579246,
    })
  })

  it('gives tagged players a delayed view and withholds the live fix', () => {
    const markers = markersFor({
      phase: 'hunt',
      now: 70_000,
      viewerId: 'runner',
      viewerSide: 'runner',
      viewerCaught: true,
      self: { lat: runner.lat, lng: runner.lng },
      others: [hunter],
      pings: [],
      zoneEnabled: true,
      spectator: 'delayed',
      spectatorDelaySec: 60,
    })
    expect(markers.find((marker) => marker.id === 'hunter')).toMatchObject({ lat: 13.1, kind: 'spectate' })
    expect(JSON.stringify(markers)).not.toContain('13.4')
  })
})

describe('tag distance', () => {
  it('allows a tag inside 15 m and refuses one farther out', () => {
    const here = { lat: 0, lng: 0 }
    const close = destination(0, 0, 90, TAG_RADIUS_M - 1)
    const far = destination(0, 0, 90, TAG_RADIUS_M + 5)
    expect(withinTag(here, close)).toBe(true)
    expect(withinTag(here, far)).toBe(false)
    expect(withinTag(here, null)).toBe(false)
  })
})
