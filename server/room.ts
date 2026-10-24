import { bearingDegrees, destination, distanceMeters } from '../shared/geo.ts'
import { formatDuration, formatMeters } from '../shared/format.ts'
import {
  OOB_GRACE_MS,
  OPENING_PING_DELAY_MS,
  TAG_RADIUS_M,
  defaultSettings,
  markersFor,
  nextShrinkRadius,
  planRoles,
  practiceSettings,
  withinTag,
  clampSettings,
  describeZone,
} from '../shared/rules.ts'
import type {
  ClientView,
  EventTone,
  Phase,
  RoleChoice,
  RoundResult,
  Settings,
  Side,
} from '../shared/types.ts'
import { cleanName, cleanRadio } from '../shared/words.ts'

const BOT_NAMES = ['Juniper', 'Holt', 'Nia', 'Reed', 'Vela', 'Omar', 'Sable', 'Wynn', 'Idris', 'Pilar']

interface Audience {
  type: 'all' | 'player' | 'side'
  id?: string
  side?: Side
}

interface GameEvent {
  id: string
  at: number
  text: string
  tone: EventTone
  audience: Audience
}

interface RadioMessage {
  id: string
  playerId: string
  name: string
  side: Side
  text: string
  at: number
}

interface Ping {
  playerId: string
  name: string
  lat: number
  lng: number
  at: number
}

interface TagRequest {
  id: string
  hunterId: string
  runnerId: string
  at: number
}

interface CatchRecord {
  runnerId: string
  runnerName: string
  hunterId: string
  hunterName: string
  at: number
}

interface Player {
  id: string
  name: string
  isHost: boolean
  isBot: boolean
  connected: boolean
  preferredRole: RoleChoice
  side: Side | null
  caught: boolean
  joinedAt: number
  lat: number | null
  lng: number | null
  accuracy: number | null
  locAt: number | null
  outSince: number | null
  revealAnnounced: boolean
  history: { t: number; lat: number; lng: number }[]
  distanceM: number
  caughtAt: number | null
  leftAt: number | null
  left: boolean
  spooked: boolean
  waypoint: { lat: number; lng: number } | null
  hideUntil: number | null
  tagLockSince: number | null
  lastRadioAt: number
}

export interface ActionResult {
  ok: boolean
  error?: string
}

function player(partial: Pick<Player, 'id' | 'name' | 'isHost' | 'isBot' | 'joinedAt'> & { preferredRole?: RoleChoice }): Player {
  return {
    preferredRole: partial.preferredRole ?? 'random',
    side: null,
    caught: false,
    connected: true,
    lat: null,
    lng: null,
    accuracy: null,
    locAt: null,
    outSince: null,
    revealAnnounced: false,
    history: [],
    distanceM: 0,
    caughtAt: null,
    leftAt: null,
    left: false,
    spooked: false,
    waypoint: null,
    hideUntil: null,
    tagLockSince: null,
    lastRadioAt: 0,
    ...partial,
  }
}

export class Room {
  readonly code: string
  readonly practice: boolean
  phase: Phase = 'lobby'
  settings: Settings
  radiusM: number
  dismissed = false
  dirty = false

  private readonly players = new Map<string, Player>()
  private order: string[] = []
  private readonly banned = new Set<string>()
  private readonly blocks = new Map<string, Set<string>>()
  private readonly rng: () => number
  private events: GameEvent[] = []
  private radioLog: RadioMessage[] = []
  private latestPings: Ping[] = []
  private readonly tags = new Map<string, TagRequest>()
  private catches: CatchRecord[] = []
  private seq = 1
  private botSeq = 1
  private startedAt: number | null = null
  private headStartEndsAt: number | null = null
  private roundEndsAt: number | null = null
  private nextPingAt: number | null = null
  private shrinkAt: number | null = null
  private shrinkWarned = false
  private pingCount = 0
  private result: RoundResult | null = null
  private endedAt: number | null = null
  private lastTick = 0
  private lastHumanAt: number

  constructor(options: {
    code: string
    hostId: string
    hostName: string
    now: number
    practice?: boolean
    rng?: () => number
  }) {
    this.code = options.code
    this.practice = Boolean(options.practice)
    this.rng = options.rng ?? Math.random
    this.settings = defaultSettings()
    this.radiusM = this.settings.zoneRadiusM
    this.lastHumanAt = options.now
    const host = player({
      id: options.hostId,
      name: options.hostName,
      isHost: true,
      isBot: false,
      joinedAt: options.now,
    })
    this.players.set(host.id, host)
    this.order.push(host.id)
    this.pushEvent(options.now, `${host.name} is hosting.`, 'info', { type: 'all' })
    if (this.practice) {
      this.settings = practiceSettings(this.settings)
      this.radiusM = this.settings.zoneRadiusM
      this.addBot(host.id, options.now, 'hunter')
      this.addBot(host.id, options.now, 'runner')
      this.addBot(host.id, options.now, 'runner')
      this.addBot(host.id, options.now, 'runner')
    }
  }

  has(id: string): boolean {
    return this.players.has(id)
  }

  isBanned(id: string): boolean {
    return this.banned.has(id)
  }

  humanCount(): number {
    let count = 0
    for (const person of this.players.values()) {
      if (!person.isBot && !person.left) count += 1
    }
    return count
  }

  connectedHumans(): number {
    let count = 0
    for (const person of this.players.values()) {
      if (!person.isBot && !person.left && person.connected) count += 1
    }
    return count
  }

  get endedAtMs(): number | null {
    return this.endedAt
  }

  get lastHumanMs(): number {
    return this.lastHumanAt
  }

  consumeDirty(): boolean {
    const dirty = this.dirty
    this.dirty = false
    return dirty
  }

  setConnected(id: string, connected: boolean, now = Date.now()): void {
    const person = this.players.get(id)
    if (!person || person.left) return
    person.connected = connected
    if (connected && !person.isBot) this.lastHumanAt = now
    this.dirty = true
  }

  setName(id: string, name: string): void {
    const person = this.players.get(id)
    if (!person || this.phase !== 'lobby') return
    const clean = cleanName(name)
    if (!clean || clean === person.name) return
    person.name = clean
    this.dirty = true
  }

  addPlayer(id: string, name: string, now: number, opts?: { bot?: boolean; role?: RoleChoice }): ActionResult {
    if (this.banned.has(id)) return { ok: false, error: 'You left this round.' }
    if (this.players.has(id)) return { ok: true }
    if (this.phase !== 'lobby') return { ok: false, error: 'That round has already started.' }
    if (this.players.size >= 24) return { ok: false, error: 'This round is full.' }
    const clean = cleanName(name)
    if (!clean) return { ok: false, error: 'Use a name with 2–16 letters.' }
    const next = player({
      id,
      name: clean,
      isHost: false,
      isBot: Boolean(opts?.bot),
      joinedAt: now,
      preferredRole: opts?.role ?? 'random',
    })
    this.players.set(id, next)
    this.order.push(id)
    if (!next.isBot) this.lastHumanAt = now
    this.pushEvent(now, `${clean} joined.`, 'info', { type: 'all' })
    return { ok: true }
  }

  addBot(hostId: string, now: number, role?: RoleChoice): ActionResult {
    const host = this.players.get(hostId)
    if (!host?.isHost) return { ok: false, error: 'Only the host can add a practice player.' }
    if (this.phase !== 'lobby') return { ok: false, error: 'The round has already started.' }
    const name = BOT_NAMES.find((candidate) => ![...this.players.values()].some((person) => person.name === candidate))
    if (!name) return { ok: false, error: 'No more practice players.' }
    const id = `bot-${this.code}-${this.botSeq++}`
    return this.addPlayer(id, name, now, { bot: true, role: role ?? this.autoBotRole() })
  }

  setPreferred(id: string, role: RoleChoice): ActionResult {
    const person = this.players.get(id)
    if (!person) return { ok: false, error: 'You are not in this round.' }
    if (this.phase !== 'lobby') return { ok: false, error: 'Roles are already set.' }
    if (person.isBot) return { ok: false, error: 'Practice players keep their side.' }
    person.preferredRole = role
    this.dirty = true
    return { ok: true }
  }

  updateSettings(id: string, partial: Partial<Settings>): ActionResult {
    if (!this.players.get(id)?.isHost) return { ok: false, error: 'Only the host can change the rules.' }
    if (this.phase !== 'lobby') return { ok: false, error: 'The round has already started.' }
    this.settings = clampSettings({ ...this.settings, ...partial })
    this.radiusM = this.settings.zoneRadiusM
    this.dirty = true
    return { ok: true }
  }

  setZone(id: string, lat: number, lng: number): ActionResult {
    if (!this.players.get(id)?.isHost) return { ok: false, error: 'Only the host can move the circle.' }
    if (this.phase !== 'lobby') return { ok: false, error: 'The circle is locked.' }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, error: 'That point is not on the map.' }
    this.settings = clampSettings({ ...this.settings, zoneLat: lat, zoneLng: lng })
    this.dirty = true
    return { ok: true }
  }

  kick(hostId: string, targetId: string, now: number): ActionResult {
    if (!this.players.get(hostId)?.isHost) return { ok: false, error: 'Only the host can remove a player.' }
    if (this.phase !== 'lobby') return { ok: false, error: 'You can only remove someone before the round starts.' }
    if (hostId === targetId) return { ok: false, error: 'You can’t remove yourself.' }
    const target = this.players.get(targetId)
    if (!target) return { ok: false, error: 'That player is not in the lobby.' }
    this.banned.add(targetId)
    this.players.delete(targetId)
    this.order = this.order.filter((id) => id !== targetId)
    this.pushEvent(now, `${target.name} was removed.`, 'info', { type: 'all' })
    return { ok: true }
  }

  start(id: string, now: number): ActionResult {
    if (!this.players.get(id)?.isHost) return { ok: false, error: 'Only the host can start.' }
    if (this.phase !== 'lobby') return { ok: false, error: 'The round has already started.' }
    const roster = this.order.map((playerId) => this.players.get(playerId)!)
    const plan = planRoles(roster.map((person) => person.preferredRole))
    if (!plan.ok) return { ok: false, error: plan.reason ?? 'Roles are not ready.' }
    roster.forEach((person, index) => {
      person.side = plan.roles[index]
    })
    this.startedAt = now
    this.headStartEndsAt = now + this.settings.headStartSec * 1000
    this.roundEndsAt = now + this.settings.durationSec * 1000
    this.radiusM = this.settings.zoneRadiusM
    this.phase = this.settings.headStartSec > 0 ? 'headstart' : 'hunt'
    this.nextPingAt = this.settings.pingIntervalSec > 0
      ? this.headStartEndsAt + OPENING_PING_DELAY_MS
      : null
    if (this.settings.shrinkEnabled && this.settings.zoneEnabled) {
      this.shrinkAt = this.headStartEndsAt + this.settings.shrinkEverySec * 1000
    }
    this.placeBots(now)
    const hunters = roster.filter((person) => person.side === 'hunter').length
    const runners = roster.length - hunters
    const head = this.settings.headStartSec > 0
      ? `Round on. ${formatDuration(this.settings.headStartSec)} head start, then snapshots.`
      : 'Round on. Hunters are already moving.'
    this.pushEvent(now, head, 'good', { type: 'all' })
    this.pushEvent(now, `${hunters} hunting, ${runners} hiding.`, 'info', { type: 'all' })
    for (const person of roster) {
      if (!person.side) continue
      this.pushEvent(
        now,
        person.side === 'hunter' ? 'You’re a hunter.' : 'You’re a runner. Hide inside the circle.',
        'info',
        { type: 'player', id: person.id },
      )
    }
    return { ok: true }
  }

  setLocation(id: string, lat: number, lng: number, accuracy: number | undefined, now: number): ActionResult {
    const person = this.players.get(id)
    if (!person || person.left) return { ok: false, error: 'You are not in this round.' }
    if (this.phase === 'lobby' || this.phase === 'ended') return { ok: true }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, error: 'That point is not on the map.' }
    if (person.lat != null && person.locAt != null && now - person.locAt < 80) return { ok: true }
    this.applyLocation(person, lat, lng, accuracy ?? null, now)
    return { ok: true }
  }

  requestTag(hunterId: string, runnerId: string, now: number): ActionResult {
    const hunter = this.players.get(hunterId)
    const runner = this.players.get(runnerId)
    if (!hunter || !runner) return { ok: false, error: 'That player is not in this round.' }
    if (hunter.side !== 'hunter' || hunter.caught || hunter.left) return { ok: false, error: 'Only a hunter can call a tag.' }
    if (this.phase !== 'hunt') return { ok: false, error: 'Wait until the head start is over.' }
    if (runner.side !== 'runner' || runner.caught || runner.left) return { ok: false, error: 'That runner is already out.' }
    if (!withinTag(point(hunter), point(runner))) {
      return { ok: false, error: `Get within ${TAG_RADIUS_M} m, then tag in person.` }
    }
    if (this.tags.has(runner.id)) return { ok: false, error: `${runner.name} already has a tag to confirm.` }
    const request: TagRequest = { id: `t${this.seq++}`, hunterId, runnerId, at: now }
    this.tags.set(runner.id, request)
    this.pushEvent(now, `${hunter.name} says they tagged ${runner.name}.`, 'warn', { type: 'all' })
    return { ok: true }
  }

  answerTag(runnerId: string, requestId: string, accept: boolean, now: number): ActionResult {
    const runner = this.players.get(runnerId)
    const request = this.tags.get(runnerId)
    if (!runner || !request || request.id !== requestId) return { ok: false, error: 'That tag request is gone.' }
    const hunter = this.players.get(request.hunterId)
    this.tags.delete(runnerId)
    if (!accept || !hunter) {
      this.pushEvent(now, `${runner.name} says they’re still free.`, 'info', { type: 'all' })
      return { ok: true }
    }
    if (!runner.isBot && !withinTag(point(hunter), point(runner))) {
      this.pushEvent(now, `The tag on ${runner.name} didn’t count. Too far apart.`, 'info', { type: 'all' })
      return { ok: false, error: `You need to be within ${TAG_RADIUS_M} m.` }
    }
    this.catchRunner(runner, hunter, now)
    return { ok: true }
  }

  selfTag(runnerId: string, now: number): ActionResult {
    const runner = this.players.get(runnerId)
    if (!runner || runner.side !== 'runner' || runner.caught || runner.left) {
      return { ok: false, error: 'You’re not a runner in this round.' }
    }
    if (this.phase !== 'hunt') return { ok: false, error: 'The hunt has not started.' }
    const nearest = this.nearestHunter(runner, TAG_RADIUS_M)
    if (!nearest) return { ok: false, error: `No hunter is within ${TAG_RADIUS_M} m.` }
    this.catchRunner(runner, nearest.hunter, now)
    return { ok: true }
  }

  radio(id: string, text: string, now: number): ActionResult {
    const person = this.players.get(id)
    if (!person || person.left || person.caught || !person.side) return { ok: false, error: 'Radio is closed.' }
    if (this.phase !== 'headstart' && this.phase !== 'hunt') return { ok: false, error: 'Radio opens when the round starts.' }
    if (now - person.lastRadioAt < 400) return { ok: false, error: 'Give it a second.' }
    const clean = cleanRadio(text)
    if (!clean) return { ok: false, error: 'Write a message first.' }
    person.lastRadioAt = now
    this.radioLog.push({
      id: `r${this.seq++}`,
      playerId: person.id,
      name: person.name,
      side: person.side,
      text: clean,
      at: now,
    })
    if (this.radioLog.length > 80) this.radioLog.splice(0, this.radioLog.length - 80)
    this.dirty = true
    return { ok: true }
  }

  block(blockerId: string, targetId: string): ActionResult {
    const blocker = this.players.get(blockerId)
    const target = this.players.get(targetId)
    if (!blocker || blocker.left) return { ok: false, error: 'You are not in this round.' }
    if (!target || target.left) return { ok: false, error: 'That player is not in this round.' }
    if (blockerId === targetId) return { ok: false, error: 'You can’t block yourself.' }
    const set = this.blocks.get(blockerId) ?? new Set<string>()
    set.add(targetId)
    this.blocks.set(blockerId, set)
    this.dirty = true
    return { ok: true }
  }

  unblock(blockerId: string, targetId: string): ActionResult {
    const set = this.blocks.get(blockerId)
    set?.delete(targetId)
    this.dirty = true
    return { ok: true }
  }

  endRound(id: string, now: number): ActionResult {
    if (!this.players.get(id)?.isHost) return { ok: false, error: 'Only the host can end the round.' }
    if (this.phase === 'lobby' || this.phase === 'ended') return { ok: false, error: 'There is no live round to end.' }
    this.finish('called_off', now)
    return { ok: true }
  }

  closeLobby(id: string): ActionResult {
    if (!this.players.get(id)?.isHost) return { ok: false, error: 'Only the host can close the lobby.' }
    if (this.phase !== 'lobby') return { ok: false, error: 'The round has already started.' }
    this.dismissed = true
    this.dirty = true
    return { ok: true }
  }

  leave(id: string, now: number): void {
    const person = this.players.get(id)
    if (!person) return
    this.banned.add(id)
    if (this.phase === 'lobby') {
      this.players.delete(id)
      this.order = this.order.filter((playerId) => playerId !== id)
      this.pushEvent(now, `${person.name} left.`, 'info', { type: 'all' })
      if (person.isHost) this.transferHost()
      if (this.humanCount() === 0) this.dismissed = true
      return
    }
    person.left = true
    person.leftAt = now
    person.connected = false
    this.tags.delete(id)
    this.latestPings = this.latestPings.filter((ping) => ping.playerId !== id)
    this.pushEvent(now, `${person.name} left the round.`, 'info', { type: 'all' })
    if (person.isHost) this.transferHost()
    this.checkRunnersGone(now)
  }

  tick(now: number): void {
    const previous = this.lastTick
    this.lastTick = now
    if (this.phase === 'lobby' || this.phase === 'ended') return
    const dt = previous === 0 ? 0 : Math.min(1.2, Math.max(0, (now - previous) / 1000))

    if (this.phase === 'headstart' && this.headStartEndsAt != null && now >= this.headStartEndsAt) {
      this.phase = 'hunt'
      this.pushEvent(now, 'Head start is over. Hunters are moving.', 'warn', { type: 'all' })
    }
    if (this.roundEndsAt != null && now >= this.roundEndsAt) {
      this.finish('time', now)
      return
    }

    this.tickShrink(now)
    this.tickPing(now)
    this.tickOob(now)
    this.expireTags(now)
    this.moveBots(now, dt)
    this.tickBotTags(now)
    if (this.roundEndsAt != null && now >= this.roundEndsAt) this.finish('time', now)
  }

  view(viewerId: string, now: number): ClientView {
    const viewer = this.players.get(viewerId)
    if (!viewer) throw new Error('missing player')
    const plan = this.phase === 'lobby'
      ? planRoles(this.order.map((id) => this.players.get(id)!.preferredRole))
      : null
    const activeHunter = viewer.side === 'hunter' && !viewer.caught && !viewer.left
    const activeRunner = viewer.side === 'runner' && !viewer.caught && !viewer.left
    const roster = this.order.map((id, index) => {
      const person = this.players.get(id)!
      const ping = this.latestPings.find((item) => item.playerId === person.id)
      const revealed = this.isRevealed(person, now)
      const sharePing = activeHunter && person.side === 'runner' && !person.caught && this.phase === 'hunt' && ping
      return {
        id: person.id,
        name: person.name,
        isHost: person.isHost,
        isYou: person.id === viewer.id,
        isBot: person.isBot,
        connected: person.connected,
        preferredRole: person.preferredRole,
        side: person.side,
        likelySide: plan ? plan.roles[index] ?? null : person.side,
        caught: person.caught,
        left: person.left,
        pingAgeSec: sharePing ? Math.max(0, Math.floor((now - ping.at) / 1000)) : null,
        revealed: Boolean(sharePing) && revealed,
        blockedByYou: this.blocks.get(viewer.id)?.has(person.id) ?? false,
        flaggedBy: viewer.isHost ? this.flaggedBy(person.id, viewer.id) : [],
      }
    })

    const others = [...this.players.values()]
      .filter((person) => person.id !== viewer.id && !person.left)
      .map((person) => ({
        id: person.id,
        name: person.name,
        side: person.side ?? 'runner',
        caught: person.caught,
        lat: person.lat,
        lng: person.lng,
        history: person.history,
        outSince: person.outSince,
      }))
      .filter((person) => this.players.get(person.id)?.side)

    const markers = markersFor({
      phase: this.phase,
      now,
      viewerId,
      viewerSide: viewer.side,
      viewerCaught: viewer.caught,
      self: { lat: viewer.lat, lng: viewer.lng },
      others: others.map((person) => ({
        ...person,
        side: this.players.get(person.id)!.side!,
      })),
      pings: this.latestPings,
      zoneEnabled: this.settings.zoneEnabled,
      spectator: this.settings.spectator,
      spectatorDelaySec: this.settings.spectatorDelaySec,
    })

    const tagCandidates = activeHunter && this.phase === 'hunt'
      ? [...this.players.values()]
        .filter((person) => person.side === 'runner' && !person.caught && !person.left && withinTag(point(viewer), point(person)))
        .map((person) => ({
          id: person.id,
          name: person.name,
          distanceM: Math.round(distanceMeters(viewer.lat!, viewer.lng!, person.lat!, person.lng!)),
        }))
      : []

    const nearest = activeRunner && this.phase === 'hunt' ? this.nearestHunter(viewer, TAG_RADIUS_M) : null
    const pending = this.tags.get(viewer.id)
    const pendingHunter = pending ? this.players.get(pending.hunterId) : undefined
    const outgoing = [...this.tags.values()].find((request) => request.hunterId === viewer.id)
    const outgoingRunner = outgoing ? this.players.get(outgoing.runnerId) : undefined
    const radioOpen = Boolean(viewer.side) && !viewer.caught && !viewer.left && (this.phase === 'headstart' || this.phase === 'hunt')
    const runners = [...this.players.values()].filter((person) => person.side === 'runner' && !person.left)
    const nextRadius = this.shrinkAt != null ? nextShrinkRadius(this.radiusM, this.settings.shrinkRatio) : null

    return {
      code: this.code,
      practice: this.practice,
      phase: this.phase,
      you: {
        id: viewer.id,
        name: viewer.name,
        isHost: viewer.isHost,
        preferredRole: viewer.preferredRole,
        side: viewer.side,
        caught: viewer.caught,
        lat: viewer.lat,
        lng: viewer.lng,
        accuracy: viewer.accuracy,
        outForSec: viewer.outSince != null && (this.phase === 'headstart' || this.phase === 'hunt')
          ? Math.max(0, Math.floor((now - viewer.outSince) / 1000))
          : 0,
        revealed: this.isRevealed(viewer, now),
        connected: viewer.connected,
        distanceM: Math.round(viewer.distanceM),
        runSec: this.runSeconds(viewer, now),
      },
      settings: { ...this.settings },
      radiusM: this.radiusM,
      roster,
      markers,
      clock: {
        serverNow: now,
        startedAt: this.startedAt,
        headStartEndsAt: this.headStartEndsAt,
        roundEndsAt: this.roundEndsAt,
        nextPingAt: this.phase === 'hunt' ? this.nextPingAt : this.nextPingAt,
        shrinkAt: this.shrinkAt,
        shrinkWarning: this.shrinkWarned,
        nextRadiusM: this.shrinkWarned ? nextRadius : null,
      },
      runnersLeft: runners.filter((person) => !person.caught).length,
      runnersTotal: runners.length,
      pendingTag: pending && pendingHunter ? { id: pending.id, hunterName: pendingHunter.name } : null,
      outgoingTag: outgoing && outgoingRunner ? { id: outgoing.id, runnerName: outgoingRunner.name } : null,
      tagCandidates,
      selfTag: nearest ? { hunterName: nearest.hunter.name, distanceM: nearest.distanceM } : null,
      tagRadiusM: TAG_RADIUS_M,
      radio: radioOpen
        ? this.radioLog
          .filter((message) => message.side === viewer.side && !this.blocks.get(viewer.id)?.has(message.playerId))
          .slice(-40)
          .map((message) => ({
            id: message.id,
            name: message.name,
            text: message.text,
            at: message.at,
            you: message.playerId === viewer.id,
          }))
        : [],
      radioOpen,
      events: this.events
        .filter((event) => this.canSee(event, viewer))
        .slice(-40)
        .map(({ id, at, text, tone }) => ({ id, at, text, tone })),
      canStart: plan
        ? { ok: plan.ok, reason: plan.reason, warning: plan.warning }
        : { ok: false, reason: null, warning: null },
      result: this.result,
    }
  }

  private flaggedBy(targetId: string, hostId: string): string[] {
    const names: string[] = []
    for (const [blockerId, targets] of this.blocks) {
      if (blockerId === hostId || !targets.has(targetId)) continue
      const name = this.players.get(blockerId)?.name
      if (name) names.push(name)
    }
    return names
  }

  /** Seconds after hunters were released, until this runner was caught, left, or the round ended. */
  private runSeconds(person: Player, now: number): number {
    if (person.side !== 'runner' || this.startedAt == null) return 0
    const huntStart = this.headStartEndsAt ?? this.startedAt
    const end = person.caughtAt ?? person.leftAt ?? (this.phase === 'ended' ? this.endedAt ?? now : now)
    if (end <= huntStart) return 0
    return Math.max(0, Math.round((end - huntStart) / 1000))
  }

  private autoBotRole(): RoleChoice {
    const nextCount = this.players.size + 1
    const minH = Math.max(1, Math.ceil(nextCount / 10))
    const hunters = [...this.players.values()].filter((person) => person.preferredRole === 'hunter').length
    return hunters < minH ? 'hunter' : 'runner'
  }

  private transferHost(): void {
    for (const person of this.players.values()) person.isHost = false
    const next = this.order
      .map((id) => this.players.get(id))
      .find((person) => person && !person.isBot && !person.left)
    if (next) next.isHost = true
    else this.dismissed = true
  }

  private placeBots(now: number): void {
    let index = 0
    for (const person of this.players.values()) {
      if (!person.isBot || person.lat != null) continue
      const angle = (360 / 7) * index + this.rng() * 15
      const distance = person.side === 'hunter'
        ? 18 + this.rng() * 20
        : (this.settings.zoneEnabled ? this.radiusM : 180) * (0.42 + this.rng() * 0.28)
      const spot = destination(this.settings.zoneLat, this.settings.zoneLng, angle, distance)
      this.applyLocation(person, spot.lat, spot.lng, 8, now)
      if (person.side === 'runner') person.hideUntil = now + 75_000
      index += 1
    }
  }

  private applyLocation(person: Player, lat: number, lng: number, accuracy: number | null, now: number): void {
    if (person.lat != null && person.lng != null && (this.phase === 'headstart' || this.phase === 'hunt')) {
      const step = distanceMeters(person.lat, person.lng, lat, lng)
      if (step > 0 && step < 2000) person.distanceM += step
    }
    person.lat = lat
    person.lng = lng
    person.accuracy = accuracy
    person.locAt = now
    const last = person.history[person.history.length - 1]
    if (!last || now - last.t >= 2000 || distanceMeters(last.lat, last.lng, lat, lng) >= 8) {
      person.history.push({ t: now, lat, lng })
    }
    const cutoff = now - 5 * 60 * 1000
    while (person.history.length > 0 && person.history[0]!.t < cutoff) person.history.shift()
    this.refreshOob(person, now)
    this.dirty = true
  }

  private refreshOob(person: Player, now: number): void {
    if (person.side !== 'runner' || person.caught || person.left || person.lat == null || person.lng == null) return
    if (this.phase !== 'headstart' && this.phase !== 'hunt') return
    const outside = this.settings.zoneEnabled
      && distanceMeters(person.lat, person.lng, this.settings.zoneLat, this.settings.zoneLng) > this.radiusM + 0.5
    if (outside) {
      if (person.outSince == null) {
        person.outSince = now
        this.pushEvent(now, 'You’re outside the circle.', 'warn', { type: 'player', id: person.id })
      }
      return
    }
    if (person.outSince != null) {
      person.outSince = null
      person.revealAnnounced = false
      this.pushEvent(now, 'You’re back inside the circle.', 'good', { type: 'player', id: person.id })
    }
  }

  private tickOob(now: number): void {
    for (const person of this.players.values()) {
      this.refreshOob(person, now)
      if (!this.isRevealed(person, now) || person.revealAnnounced) continue
      person.revealAnnounced = true
      this.pushEvent(
        now,
        'You’ve been outside for 30 seconds. Hunters can see you until you’re back in.',
        'bad',
        { type: 'player', id: person.id },
      )
      this.pushEvent(now, `${person.name} is outside the circle and visible to hunters.`, 'warn', { type: 'all' })
    }
  }

  private isRevealed(person: Player, now: number): boolean {
    return this.phase === 'hunt'
      && this.settings.zoneEnabled
      && person.side === 'runner'
      && !person.caught
      && !person.left
      && person.outSince != null
      && now - person.outSince >= OOB_GRACE_MS
  }

  private tickPing(now: number): void {
    if (this.phase !== 'hunt' || this.nextPingAt == null || now < this.nextPingAt) return
    const pings: Ping[] = []
    let missing = 0
    for (const person of this.players.values()) {
      if (person.side !== 'runner' || person.caught || person.left) continue
      if (person.lat == null || person.lng == null) {
        missing += 1
        continue
      }
      pings.push({ playerId: person.id, name: person.name, lat: person.lat, lng: person.lng, at: now })
      this.pushEvent(now, 'Your spot was just sent to the hunters. Move.', 'warn', { type: 'player', id: person.id })
    }
    this.latestPings = pings
    this.pingCount += 1
    this.nextPingAt = this.settings.pingIntervalSec > 0 ? now + this.settings.pingIntervalSec * 1000 : null
    const noun = pings.length === 1 ? 'runner' : 'runners'
    let text = `Ping. ${pings.length} ${noun} showed on the map.`
    if (missing > 0) text += ` ${missing} had no location.`
    this.pushEvent(now, text, 'warn', { type: 'all' })
  }

  private tickShrink(now: number): void {
    if (this.phase !== 'hunt' || this.shrinkAt == null) return
    const upcoming = nextShrinkRadius(this.radiusM, this.settings.shrinkRatio)
    if (upcoming == null) {
      this.shrinkAt = null
      this.shrinkWarned = false
      return
    }
    const lead = Math.min(60_000, Math.floor(this.settings.shrinkEverySec * 1000 / 2))
    if (!this.shrinkWarned && now >= this.shrinkAt - lead) {
      this.shrinkWarned = true
      this.pushEvent(
        now,
        `Circle closes in ${formatDuration(Math.max(1, Math.round(lead / 1000)))}, down to ${formatMeters(upcoming)}. Get inside the new edge.`,
        'warn',
        { type: 'all' },
      )
    }
    if (now < this.shrinkAt) return
    this.radiusM = upcoming
    this.shrinkWarned = false
    this.pushEvent(now, `The circle is now ${formatMeters(this.radiusM)}.`, 'warn', { type: 'all' })
    for (const person of this.players.values()) this.refreshOob(person, now)
    const following = nextShrinkRadius(this.radiusM, this.settings.shrinkRatio)
    this.shrinkAt = following == null ? null : this.shrinkAt + this.settings.shrinkEverySec * 1000
  }

  private expireTags(now: number): void {
    for (const [runnerId, request] of this.tags) {
      if (now - request.at < 30_000) continue
      this.tags.delete(runnerId)
      const runner = this.players.get(runnerId)
      if (runner) this.pushEvent(now, `The tag request on ${runner.name} expired.`, 'info', { type: 'all' })
    }
  }

  private moveBots(now: number, dt: number): void {
    if (dt <= 0) return
    for (const person of this.players.values()) {
      if (!person.isBot || person.left || person.caught || person.lat == null || person.lng == null) continue
      if (person.side === 'hunter' && this.phase === 'headstart') continue
      if (this.tags.has(person.id)) continue
      const target = this.botTarget(person, now)
      if (!target) continue
      const dist = distanceMeters(person.lat, person.lng, target.lat, target.lng)
      const speed = person.side === 'hunter' ? 3.5 : 1.8
      if (dist < 8) {
        if (person.side === 'runner') {
          person.waypoint = null
          person.hideUntil = now + 30_000 + Math.floor(this.rng() * 20_000)
        }
        continue
      }
      const step = Math.min(dist, speed * dt)
      const bearing = bearingDegrees(person.lat, person.lng, target.lat, target.lng)
      const next = destination(person.lat, person.lng, bearing, step)
      this.applyLocation(person, next.lat, next.lng, 6, now)
    }
  }

  private botTarget(person: Player, now: number): { lat: number; lng: number } | null {
    const center = { lat: this.settings.zoneLat, lng: this.settings.zoneLng }
    if (person.side === 'runner') {
      if (person.hideUntil != null && now < person.hideUntil) return null
      if (person.spooked || !person.waypoint) {
        person.spooked = false
        person.hideUntil = null
        const angle = this.rng() * 360
        const distance = this.settings.zoneEnabled ? this.radiusM * (0.25 + this.rng() * 0.55) : 40 + this.rng() * 90
        person.waypoint = destination(center.lat, center.lng, angle, distance)
      }
      return person.waypoint
    }
    let best: { lat: number; lng: number; d: number } | null = null
    for (const other of this.players.values()) {
      if (other.side !== 'runner' || other.caught || other.left || person.lat == null || person.lng == null) continue
      const revealed = this.isRevealed(other, now)
      const ping = this.latestPings.find((item) => item.playerId === other.id)
      const spot = revealed && other.lat != null && other.lng != null
        ? { lat: other.lat, lng: other.lng }
        : ping
          ? { lat: ping.lat, lng: ping.lng }
          : null
      if (!spot) continue
      const d = distanceMeters(person.lat, person.lng, spot.lat, spot.lng)
      if (!best || d < best.d) best = { lat: spot.lat, lng: spot.lng, d }
    }
    return best ?? destination(center.lat, center.lng, this.rng() * 360, 15)
  }

  private tickBotTags(now: number): void {
    for (const person of this.players.values()) {
      if (!person.isBot || person.left || person.caught) continue
      if (person.side === 'runner') {
        const request = this.tags.get(person.id)
        if (request && now - request.at >= 1200) this.answerTag(person.id, request.id, true, now)
        continue
      }
      if (person.side !== 'hunter' || this.phase !== 'hunt') continue
      const target = this.nearestRunner(person, 12)
      if (!target) {
        person.tagLockSince = null
        continue
      }
      if (this.tags.has(target.id)) continue
      if (person.tagLockSince == null) person.tagLockSince = now
      if (now - person.tagLockSince >= 1500) {
        this.requestTag(person.id, target.id, now)
        person.tagLockSince = null
      }
    }
  }

  private nearestHunter(runner: Player, maxM: number): { hunter: Player; distanceM: number } | null {
    let best: { hunter: Player; distanceM: number } | null = null
    for (const hunter of this.players.values()) {
      if (hunter.side !== 'hunter' || hunter.caught || hunter.left) continue
      if (!withinTag(point(runner), point(hunter)) && maxM <= TAG_RADIUS_M) {
        const hunterPoint = point(hunter)
        const runnerPoint = point(runner)
        if (!hunterPoint || !runnerPoint) continue
        const distance = distanceMeters(runnerPoint.lat, runnerPoint.lng, hunterPoint.lat, hunterPoint.lng)
        if (distance > maxM) continue
      }
      const hunterPoint = point(hunter)
      const runnerPoint = point(runner)
      if (!hunterPoint || !runnerPoint) continue
      const distance = distanceMeters(runnerPoint.lat, runnerPoint.lng, hunterPoint.lat, hunterPoint.lng)
      if (distance > maxM) continue
      if (!best || distance < best.distanceM) best = { hunter, distanceM: Math.round(distance) }
    }
    return best
  }

  private nearestRunner(hunter: Player, maxM: number): Player | null {
    let best: { runner: Player; distance: number } | null = null
    for (const runner of this.players.values()) {
      if (runner.side !== 'runner' || runner.caught || runner.left) continue
      const a = point(hunter)
      const b = point(runner)
      if (!a || !b) continue
      const distance = distanceMeters(a.lat, a.lng, b.lat, b.lng)
      if (distance > maxM) continue
      if (!best || distance < best.distance) best = { runner, distance }
    }
    return best?.runner ?? null
  }

  private catchRunner(runner: Player, hunter: Player, now: number): void {
    runner.caught = true
    runner.caughtAt = now
    runner.outSince = null
    runner.revealAnnounced = false
    this.tags.delete(runner.id)
    this.latestPings = this.latestPings.filter((ping) => ping.playerId !== runner.id)
    this.catches.push({
      runnerId: runner.id,
      runnerName: runner.name,
      hunterId: hunter.id,
      hunterName: hunter.name,
      at: now,
    })
    this.pushEvent(now, `${hunter.name} tagged ${runner.name}.`, 'bad', { type: 'all' })
    const note = this.settings.spectator === 'off'
      ? 'You can sit the rest out.'
      : this.settings.spectator === 'live'
        ? 'You can watch the rest live.'
        : 'You can watch the rest, a minute behind.'
    this.pushEvent(now, `You’re out. ${note}`, 'info', { type: 'player', id: runner.id })
    this.checkRunnersGone(now)
  }

  private checkRunnersGone(now: number): void {
    if (this.phase === 'lobby' || this.phase === 'ended') return
    const active = [...this.players.values()].filter((person) => person.side === 'runner' && !person.caught && !person.left)
    if (active.length > 0) return
    this.finish(this.catches.length > 0 ? 'all_caught' : 'called_off', now)
  }

  private finish(reason: RoundResult['reason'], now: number): void {
    if (this.phase === 'ended') return
    this.phase = 'ended'
    this.endedAt = now
    const started = this.startedAt ?? now
    const survivors = [...this.players.values()]
      .filter((person) => person.side === 'runner' && !person.caught && !person.left)
      .map((person) => person.name)
    const left = [...this.players.values()].filter((person) => person.left).map((person) => person.name)
    const winner = reason === 'called_off' ? null : reason === 'all_caught' || survivors.length === 0 ? 'hunters' : 'runners'
    this.result = {
      winner,
      reason,
      elapsedSec: Math.max(0, Math.round((now - started) / 1000)),
      pingCount: this.pingCount,
      catches: this.catches.map((catchRecord) => ({
        runnerName: catchRecord.runnerName,
        hunterName: catchRecord.hunterName,
        atSec: Math.max(0, Math.round((catchRecord.at - started) / 1000)),
      })),
      survivors,
      left,
    }
    const text = winner === 'hunters'
      ? 'Hunters win. Every runner was tagged.'
      : winner === 'runners'
        ? 'Runners win. Someone was still free.'
        : 'The host called the round off.'
    this.pushEvent(now, text, winner === 'runners' ? 'good' : winner === 'hunters' ? 'bad' : 'info', { type: 'all' })
  }

  private canSee(event: GameEvent, viewer: Player): boolean {
    if (event.audience.type === 'all') return true
    if (event.audience.type === 'player') return event.audience.id === viewer.id
    return event.audience.side === viewer.side && !viewer.caught
  }

  private pushEvent(now: number, text: string, tone: EventTone, audience: Audience): void {
    this.events.push({ id: `e${this.seq++}`, at: now, text, tone, audience })
    if (this.events.length > 80) this.events.splice(0, this.events.length - 80)
    this.dirty = true
  }
}

function point(person: Player): { lat: number; lng: number } | null {
  if (person.lat == null || person.lng == null) return null
  return { lat: person.lat, lng: person.lng }
}

export { describeZone }
