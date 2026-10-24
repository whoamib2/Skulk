import { describe, expect, it } from 'vitest'
import { destination, distanceMeters } from '../shared/geo.ts'
import { OPENING_PING_DELAY_MS } from '../shared/rules.ts'
import { Room } from './room.ts'

const HOST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const RUNNER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const RUNNER_2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function lobby() {
  const room = new Room({ code: 'ABC234', hostId: HOST, hostName: 'Ada', now: 0 })
  expect(room.addPlayer(RUNNER, 'Bea', 1).ok).toBe(true)
  expect(room.addPlayer(RUNNER_2, 'Cy', 2).ok).toBe(true)
  expect(room.setPreferred(HOST, 'hunter').ok).toBe(true)
  expect(room.setPreferred(RUNNER, 'runner').ok).toBe(true)
  expect(room.setPreferred(RUNNER_2, 'runner').ok).toBe(true)
  return room
}

describe('Room', () => {
  it('refuses to start with fewer than three players', () => {
    const room = new Room({ code: 'ABC234', hostId: HOST, hostName: 'Ada', now: 0 })
    room.addPlayer(RUNNER, 'Bea', 1)
    expect(room.start(HOST, 10).ok).toBe(false)
    expect(room.view(HOST, 10).canStart.reason).toMatch(/3 players/)
  })

  it('hides live runners during the head start and only reveals the snapshot', () => {
    const room = lobby()
    room.updateSettings(HOST, {
      durationSec: 180,
      headStartSec: 30,
      pingIntervalSec: 20,
      zoneLat: 0,
      zoneLng: 0,
      zoneRadiusM: 3000,
    })
    expect(room.start(HOST, 0).ok).toBe(true)
    const hiddenSpot = destination(0, 0, 20, 90)
    room.setLocation(RUNNER, hiddenSpot.lat, hiddenSpot.lng, 5, 1000)
    const duringHeadStart = room.view(HOST, 2000)
    expect(duringHeadStart.markers.some((marker) => marker.id === RUNNER)).toBe(false)
    expect(JSON.stringify(duringHeadStart)).not.toContain(hiddenSpot.lat.toFixed(6))

    const pingSpot = destination(0, 0, 90, 70)
    const secretSpot = destination(0, 0, 180, 110)
    room.setLocation(RUNNER, pingSpot.lat, pingSpot.lng, 5, 5000)
    const huntStart = 30_000
    room.tick(huntStart + OPENING_PING_DELAY_MS)
    room.setLocation(RUNNER, secretSpot.lat, secretSpot.lng, 5, huntStart + 2000)
    const view = room.view(HOST, huntStart + 3000)
    const ping = view.markers.find((marker) => marker.id === RUNNER)
    expect(ping?.kind).toBe('ping')
    expect(distanceMeters(ping!.lat, ping!.lng, pingSpot.lat, pingSpot.lng)).toBeLessThan(1)
    expect(distanceMeters(ping!.lat, ping!.lng, secretSpot.lat, secretSpot.lng)).toBeGreaterThan(30)
    expect(view.events.some((event) => event.text.startsWith('Ping.'))).toBe(true)
  })

  it('does not let a runner see a hunter', () => {
    const room = lobby()
    room.updateSettings(HOST, { headStartSec: 0, durationSec: 120, pingIntervalSec: 0, zoneLat: 0, zoneLng: 0, zoneRadiusM: 3000 })
    room.start(HOST, 0)
    room.setLocation(HOST, 8.424242, 4.111111, 5, 1000)
    const view = room.view(RUNNER, 2000)
    expect(JSON.stringify(view)).not.toContain('8.424242')
    expect(view.markers.some((marker) => marker.id === HOST)).toBe(false)
  })

  it('tags inside 15 m, ignores a far tag, and ends when every runner is caught', () => {
    const room = lobby()
    room.updateSettings(HOST, { headStartSec: 0, durationSec: 180, pingIntervalSec: 0, zoneLat: 0, zoneLng: 0, zoneRadiusM: 2000 })
    room.start(HOST, 0)
    const close = destination(0, 0, 90, 10)
    const far = destination(0, 0, 90, 80)
    room.setLocation(HOST, 0, 0, 5, 1000)
    room.setLocation(RUNNER, far.lat, far.lng, 5, 1100)
    expect(room.requestTag(HOST, RUNNER, 1200).ok).toBe(false)
    room.setLocation(RUNNER, close.lat, close.lng, 5, 1300)
    const request = room.requestTag(HOST, RUNNER, 1400)
    expect(request.ok).toBe(true)
    const pending = room.view(RUNNER, 1500).pendingTag
    expect(pending?.hunterName).toBe('Ada')
    expect(room.answerTag(RUNNER, pending!.id, true, 1600).ok).toBe(true)
    expect(room.view(RUNNER, 1700).you.caught).toBe(true)
    expect(room.phase).toBe('hunt')

    room.setLocation(RUNNER_2, close.lat, close.lng, 5, 1800)
    expect(room.selfTag(RUNNER_2, 1900).ok).toBe(true)
    expect(room.phase).toBe('ended')
    expect(room.view(HOST, 2000).result).toMatchObject({ winner: 'hunters', reason: 'all_caught' })
  })

  it('gives the round to the runners when time runs out', () => {
    const room = lobby()
    room.updateSettings(HOST, { headStartSec: 0, durationSec: 60, pingIntervalSec: 0 })
    room.start(HOST, 0)
    room.tick(60_000)
    expect(room.view(HOST, 60_000).result).toMatchObject({
      winner: 'runners',
      reason: 'time',
      survivors: ['Bea', 'Cy'],
    })
  })

  it('shows a runner live after 30 seconds outside the circle', () => {
    const room = lobby()
    room.updateSettings(HOST, {
      headStartSec: 0,
      durationSec: 180,
      pingIntervalSec: 0,
      zoneEnabled: true,
      zoneLat: 0,
      zoneLng: 0,
      zoneRadiusM: 150,
    })
    room.start(HOST, 0)
    const outside = destination(0, 0, 0, 220)
    room.setLocation(HOST, 0, 0, 5, 1000)
    room.setLocation(RUNNER, outside.lat, outside.lng, 5, 1000)
    expect(room.view(HOST, 10_000).markers.some((marker) => marker.kind === 'reveal')).toBe(false)
    const revealed = room.view(HOST, 32_000)
    expect(revealed.markers.find((marker) => marker.id === RUNNER)?.kind).toBe('reveal')
    expect(room.view(RUNNER, 32_000).you.revealed).toBe(true)
  })

  it('shrinks the circle on the host schedule', () => {
    const room = lobby()
    room.updateSettings(HOST, {
      headStartSec: 0,
      durationSec: 300,
      pingIntervalSec: 0,
      shrinkEnabled: true,
      shrinkEverySec: 30,
      zoneRadiusM: 400,
    })
    room.start(HOST, 0)
    room.tick(16_000)
    expect(room.view(HOST, 16_000).clock.shrinkWarning).toBe(true)
    expect(room.view(HOST, 16_000).radiusM).toBe(400)
    room.tick(30_000)
    expect(room.view(HOST, 30_000).radiusM).toBe(300)
  })

  it('hides a blocked teammate’s radio from the blocker', () => {
    const room = lobby()
    room.setPreferred(HOST, 'runner')
    room.setPreferred(RUNNER_2, 'hunter')
    room.updateSettings(HOST, { headStartSec: 0, durationSec: 120, pingIntervalSec: 0 })
    room.start(HOST, 0)
    expect(room.block(HOST, RUNNER).ok).toBe(true)
    expect(room.radio(RUNNER, 'meet at the oak', 1000).ok).toBe(true)
    expect(room.radio(HOST, 'stay low', 1400).ok).toBe(true)
    expect(room.view(HOST, 1500).radio.map((message) => message.text)).toEqual(['stay low'])
    expect(room.view(RUNNER, 1500).radio.map((message) => message.text)).toEqual(['meet at the oak', 'stay low'])
    expect(room.view(HOST, 1500).roster.find((person) => person.id === RUNNER)?.blockedByYou).toBe(true)
    expect(room.unblock(HOST, RUNNER).ok).toBe(true)
    expect(room.view(HOST, 1600).radio.map((message) => message.text)).toEqual(['meet at the oak', 'stay low'])
  })

  it('flags a player to the host when someone else blocks them', () => {
    const room = lobby()
    expect(room.block(RUNNER, RUNNER_2).ok).toBe(true)
    expect(room.block(HOST, HOST).ok).toBe(false)
    const hostView = room.view(HOST, 10).roster.find((person) => person.id === RUNNER_2)
    expect(hostView?.flaggedBy).toEqual(['Bea'])
    expect(hostView?.blockedByYou).toBe(false)
    expect(room.view(RUNNER, 10).roster.find((person) => person.id === RUNNER_2)?.blockedByYou).toBe(true)
  })

  it('counts distance during the hunt and time on the run after the head start', () => {
    const room = lobby()
    room.updateSettings(HOST, { headStartSec: 10, durationSec: 300, pingIntervalSec: 0, zoneLat: 0, zoneLng: 0, zoneRadiusM: 2000 })
    room.start(HOST, 0)
    room.setLocation(RUNNER, 0, 0, 5, 1000)
    const next = destination(0, 0, 90, 100)
    room.setLocation(RUNNER, next.lat, next.lng, 5, 5000)
    expect(room.view(RUNNER, 6000).you.distanceM).toBeGreaterThan(90)
    expect(room.view(RUNNER, 6000).you.runSec).toBe(0)
    room.tick(10_000)
    room.setLocation(HOST, 0, 0, 5, 20_000)
    const close = destination(0, 0, 90, 8)
    room.setLocation(RUNNER, close.lat, close.lng, 5, 24_000)
    expect(room.selfTag(RUNNER, 25_000).ok).toBe(true)
    const ended = room.view(RUNNER, 26_000)
    expect(ended.you.runSec).toBe(15)
    expect(ended.you.caught).toBe(true)
  })

  it('keeps radio inside the team and blocks a banned rejoin', () => {
    const room = lobby()
    room.updateSettings(HOST, { headStartSec: 15, durationSec: 120, pingIntervalSec: 0 })
    room.start(HOST, 0)
    expect(room.radio(HOST, 'cover the gate', 1000).ok).toBe(true)
    expect(room.view(HOST, 1100).radio.map((message) => message.text)).toEqual(['cover the gate'])
    expect(room.view(RUNNER, 1100).radio).toEqual([])
    room.leave(RUNNER, 1200)
    expect(room.addPlayer(RUNNER, 'Bea', 1300).ok).toBe(false)
  })

  it('lets tagged players watch a minute behind', () => {
    const room = lobby()
    room.updateSettings(HOST, {
      headStartSec: 0,
      durationSec: 300,
      pingIntervalSec: 0,
      spectator: 'delayed',
      zoneLat: 0,
      zoneLng: 0,
      zoneRadiusM: 2000,
    })
    room.start(HOST, 0)
    room.setLocation(HOST, 0, 0, 5, 1000)
    room.setLocation(RUNNER, 0, 0.00008, 5, 1100)
    room.selfTag(RUNNER, 2000)
    const moved = destination(0, 0, 0, 400)
    room.setLocation(HOST, moved.lat, moved.lng, 5, 80_000)
    const view = room.view(RUNNER, 80_000)
    const hunter = view.markers.find((marker) => marker.id === HOST)
    expect(hunter?.kind).toBe('spectate')
    expect(distanceMeters(hunter!.lat, hunter!.lng, 0, 0)).toBeLessThan(1)
    expect(distanceMeters(hunter!.lat, hunter!.lng, moved.lat, moved.lng)).toBeGreaterThan(100)
  })

  it('lets a hunter tag a practice runner who is still standing on the ping', () => {
    const room = new Room({ code: 'ABC234', hostId: HOST, hostName: 'Ada', now: 0 })
    expect(room.addBot(HOST, 1, 'runner').ok).toBe(true)
    expect(room.addBot(HOST, 2, 'runner').ok).toBe(true)
    expect(room.setPreferred(HOST, 'hunter').ok).toBe(true)
    room.updateSettings(HOST, {
      headStartSec: 0,
      durationSec: 300,
      pingIntervalSec: 20,
      zoneLat: 0,
      zoneLng: 0,
      zoneRadiusM: 400,
    })
    expect(room.start(HOST, 0).ok).toBe(true)
    room.tick(1000)
    const ping = room.view(HOST, 1000).markers.find((marker) => marker.kind === 'ping')
    expect(ping).toBeTruthy()
    const spot = destination(ping!.lat, ping!.lng, 0, 6)
    room.setLocation(HOST, spot.lat, spot.lng, 5, 1100)
    const candidate = room.view(HOST, 1100).tagCandidates[0]
    expect(candidate?.distanceM).toBeLessThanOrEqual(15)
    expect(room.requestTag(HOST, candidate.id, 1200).ok).toBe(true)
    room.tick(2600)
    expect(room.view(HOST, 2600).roster.find((person) => person.id === candidate.id)?.caught).toBe(true)
  })

  it('calls the round off when the host ends it', () => {
    const room = lobby()
    room.updateSettings(HOST, { headStartSec: 0, durationSec: 180, pingIntervalSec: 0 })
    room.start(HOST, 0)
    expect(room.endRound(HOST, 5000).ok).toBe(true)
    expect(room.view(HOST, 5000).result).toMatchObject({ winner: null, reason: 'called_off' })
  })
})
