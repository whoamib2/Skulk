import { isUuid } from '../shared/rules.ts'
import type { ClientMessage, RoleChoice, Settings } from '../shared/types.ts'

const ROLES = new Set<RoleChoice>(['hunter', 'runner', 'random'])

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

export function parseMessage(raw: unknown): ClientMessage | null {
  const msg = record(raw)
  if (!msg || typeof msg.type !== 'string') return null

  if (msg.type === 'hello') {
    if (typeof msg.playerId !== 'string' || !isUuid(msg.playerId) || typeof msg.name !== 'string') return null
    const intent = record(msg.intent)
    if (!intent) return null
    if (intent.kind === 'create' && typeof intent.practice === 'boolean') {
      return { type: 'hello', playerId: msg.playerId, name: msg.name, intent: { kind: 'create', practice: intent.practice } }
    }
    if ((intent.kind === 'join' || intent.kind === 'resume') && typeof intent.code === 'string') {
      return {
        type: 'hello',
        playerId: msg.playerId,
        name: msg.name,
        intent: { kind: intent.kind, code: intent.code },
      }
    }
    return null
  }

  if (msg.type === 'prefs' && typeof msg.role === 'string' && ROLES.has(msg.role as RoleChoice)) {
    return { type: 'prefs', role: msg.role as RoleChoice }
  }
  if (msg.type === 'settings' && msg.settings && typeof msg.settings === 'object') {
    return { type: 'settings', settings: sanitizeSettings(msg.settings) }
  }
  if (msg.type === 'zone' && typeof msg.lat === 'number' && typeof msg.lng === 'number') {
    return { type: 'zone', lat: msg.lat, lng: msg.lng }
  }
  if (msg.type === 'kick' && typeof msg.playerId === 'string') return { type: 'kick', playerId: msg.playerId }
  if (msg.type === 'block' && typeof msg.playerId === 'string') return { type: 'block', playerId: msg.playerId }
  if (msg.type === 'unblock' && typeof msg.playerId === 'string') return { type: 'unblock', playerId: msg.playerId }
  if (msg.type === 'start') return { type: 'start' }
  if (msg.type === 'location' && typeof msg.lat === 'number' && typeof msg.lng === 'number') {
    return {
      type: 'location',
      lat: msg.lat,
      lng: msg.lng,
      accuracy: typeof msg.accuracy === 'number' ? msg.accuracy : undefined,
    }
  }
  if (msg.type === 'tag' && typeof msg.runnerId === 'string') return { type: 'tag', runnerId: msg.runnerId }
  if (msg.type === 'tagAnswer' && typeof msg.requestId === 'string' && typeof msg.accept === 'boolean') {
    return { type: 'tagAnswer', requestId: msg.requestId, accept: msg.accept }
  }
  if (msg.type === 'selfTag') return { type: 'selfTag' }
  if (msg.type === 'radio' && typeof msg.text === 'string') return { type: 'radio', text: msg.text }
  if (msg.type === 'end') return { type: 'end' }
  if (msg.type === 'leave') return { type: 'leave' }
  if (msg.type === 'addBot') return { type: 'addBot' }
  return null
}

function sanitizeSettings(value: object): Partial<Settings> {
  const raw = value as Partial<Settings>
  const settings: Partial<Settings> = {}
  if (typeof raw.durationSec === 'number') settings.durationSec = raw.durationSec
  if (typeof raw.headStartSec === 'number') settings.headStartSec = raw.headStartSec
  if (typeof raw.pingIntervalSec === 'number') settings.pingIntervalSec = raw.pingIntervalSec
  if (typeof raw.zoneEnabled === 'boolean') settings.zoneEnabled = raw.zoneEnabled
  if (typeof raw.zoneLat === 'number') settings.zoneLat = raw.zoneLat
  if (typeof raw.zoneLng === 'number') settings.zoneLng = raw.zoneLng
  if (typeof raw.zoneRadiusM === 'number') settings.zoneRadiusM = raw.zoneRadiusM
  if (typeof raw.shrinkEnabled === 'boolean') settings.shrinkEnabled = raw.shrinkEnabled
  if (typeof raw.shrinkEverySec === 'number') settings.shrinkEverySec = raw.shrinkEverySec
  if (raw.spectator === 'delayed' || raw.spectator === 'live' || raw.spectator === 'off') settings.spectator = raw.spectator
  return settings
}
