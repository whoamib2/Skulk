export type Phase = 'lobby' | 'headstart' | 'hunt' | 'ended'
export type RoleChoice = 'hunter' | 'runner' | 'random'
export type Side = 'hunter' | 'runner'
export type SpectatorMode = 'delayed' | 'live' | 'off'
export type EventTone = 'info' | 'warn' | 'good' | 'bad'

export interface Settings {
  durationSec: number
  headStartSec: number
  /** 0 means hunters never get a snapshot. */
  pingIntervalSec: number
  zoneEnabled: boolean
  zoneLat: number
  zoneLng: number
  zoneRadiusM: number
  shrinkEnabled: boolean
  shrinkEverySec: number
  shrinkRatio: number
  spectator: SpectatorMode
  spectatorDelaySec: number
}

export interface RoundResult {
  winner: 'hunters' | 'runners' | null
  reason: 'all_caught' | 'time' | 'called_off'
  elapsedSec: number
  pingCount: number
  catches: { runnerName: string; hunterName: string; atSec: number }[]
  survivors: string[]
  left: string[]
}

export interface RosterEntry {
  id: string
  name: string
  isHost: boolean
  isYou: boolean
  isBot: boolean
  connected: boolean
  preferredRole: RoleChoice
  side: Side | null
  likelySide: Side | null
  caught: boolean
  left: boolean
  pingAgeSec: number | null
  revealed: boolean
  blockedByYou: boolean
  /** Names of other players who blocked this person. Only filled in for the host. */
  flaggedBy: string[]
}

export interface ViewMarker {
  id: string
  name: string
  lat: number
  lng: number
  kind: 'self' | 'teammate' | 'ping' | 'reveal' | 'spectate'
  side: Side
  at: number
}

export interface ClientView {
  code: string
  practice: boolean
  phase: Phase
  you: {
    id: string
    name: string
    isHost: boolean
    preferredRole: RoleChoice
    side: Side | null
    caught: boolean
    lat: number | null
    lng: number | null
    accuracy: number | null
    outForSec: number
    revealed: boolean
    connected: boolean
    distanceM: number
    /** Seconds after hunters were released. Zero for hunters and during the head start. */
    runSec: number
  }
  settings: Settings
  radiusM: number
  roster: RosterEntry[]
  markers: ViewMarker[]
  clock: {
    serverNow: number
    startedAt: number | null
    headStartEndsAt: number | null
    roundEndsAt: number | null
    nextPingAt: number | null
    shrinkAt: number | null
    shrinkWarning: boolean
    nextRadiusM: number | null
  }
  runnersLeft: number
  runnersTotal: number
  pendingTag: { id: string; hunterName: string } | null
  outgoingTag: { id: string; runnerName: string } | null
  tagCandidates: { id: string; name: string; distanceM: number }[]
  selfTag: { hunterName: string; distanceM: number } | null
  tagRadiusM: number
  radio: { id: string; name: string; text: string; at: number; you: boolean }[]
  radioOpen: boolean
  events: { id: string; at: number; text: string; tone: EventTone }[]
  canStart: { ok: boolean; reason: string | null; warning: string | null }
  result: RoundResult | null
}

export type Intent =
  | { kind: 'create'; practice: boolean }
  | { kind: 'join'; code: string }
  | { kind: 'resume'; code: string }

export type ClientMessage =
  | { type: 'hello'; playerId: string; name: string; intent: Intent }
  | { type: 'prefs'; role: RoleChoice }
  | { type: 'settings'; settings: Partial<Settings> }
  | { type: 'zone'; lat: number; lng: number }
  | { type: 'kick'; playerId: string }
  | { type: 'block'; playerId: string }
  | { type: 'unblock'; playerId: string }
  | { type: 'start' }
  | { type: 'location'; lat: number; lng: number; accuracy?: number }
  | { type: 'tag'; runnerId: string }
  | { type: 'tagAnswer'; requestId: string; accept: boolean }
  | { type: 'selfTag' }
  | { type: 'radio'; text: string }
  | { type: 'end' }
  | { type: 'leave' }
  | { type: 'addBot' }

export type ServerMessage =
  | { type: 'state'; view: ClientView }
  | { type: 'error'; message: string }
  | { type: 'dismissed'; message: string }
