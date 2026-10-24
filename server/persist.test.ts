import type { WebSocket } from 'ws'
import { describe, expect, it } from 'vitest'
import { ROUND_RESTARTED } from '../shared/roundEnd.ts'
import type { ClientView, ServerMessage } from '../shared/types.ts'
import { Hub } from './hub.ts'
import { Room, type RoomSnapshot } from './room.ts'
import { memoryRoomStore, postgresSsl } from './roomStore.ts'

const HOST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const RUNNER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const RUNNER_2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

class FakeSocket {
  OPEN = 1
  readyState = 1
  sent: string[] = []
  private listeners = new Map<string, (data?: unknown) => void>()

  on(type: string, fn: (data?: unknown) => void): void {
    this.listeners.set(type, fn)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.readyState = 3
  }

  receive(raw: string): void {
    this.listeners.get('message')?.(raw)
  }
}

function connect(hub: Hub): FakeSocket {
  const socket = new FakeSocket()
  hub.connect(socket as unknown as WebSocket)
  return socket
}

function hello(socket: FakeSocket, playerId: string, name: string, intent: unknown): void {
  socket.receive(JSON.stringify({ type: 'hello', playerId, name, intent }))
}

function viewOf(socket: FakeSocket): ClientView {
  for (let index = socket.sent.length - 1; index >= 0; index -= 1) {
    const message = JSON.parse(socket.sent[index]!) as ServerMessage
    if (message.type === 'state') return message.view
  }
  throw new Error(socket.sent.at(-1) ?? 'silent')
}

function lastMessage(socket: FakeSocket): ServerMessage {
  return JSON.parse(socket.sent.at(-1) ?? 'null') as ServerMessage
}

describe('room snapshots', () => {
  it('round-trips a live round without keeping players marked connected', () => {
    const room = new Room({ code: 'ABC234', hostId: HOST, hostName: 'Ada', now: 1_000 })
    expect(room.addPlayer(RUNNER, 'Bea', 1_100).ok).toBe(true)
    expect(room.addPlayer(RUNNER_2, 'Cy', 1_200).ok).toBe(true)
    expect(room.setPreferred(HOST, 'hunter').ok).toBe(true)
    expect(room.setPreferred(RUNNER, 'runner').ok).toBe(true)
    expect(room.setPreferred(RUNNER_2, 'runner').ok).toBe(true)
    expect(room.updateSettings(HOST, {
      durationSec: 600,
      headStartSec: 30,
      pingIntervalSec: 60,
      zoneLat: 40.7,
      zoneLng: -74,
      zoneRadiusM: 400,
      shrinkEnabled: true,
      shrinkEverySec: 120,
    }).ok).toBe(true)
    expect(room.start(HOST, 2_000).ok).toBe(true)
    expect(room.setLocation(RUNNER, 40.701, -74.001, 6, 2_500).ok).toBe(true)
    expect(room.block(RUNNER, HOST).ok).toBe(true)

    const snapshot = JSON.parse(JSON.stringify(room.snapshot())) as RoomSnapshot
    room.setLocation(RUNNER, 1, 2, 5, 9_000)
    const restored = new Room({ snapshot })
    snapshot.players.find((person) => person.id === RUNNER)!.lat = 9

    const runner = restored.view(RUNNER, 9_000)
    expect(restored.phase).toBe('headstart')
    expect(restored.code).toBe('ABC234')
    expect(restored.radiusM).toBe(400)
    expect(restored.snapshot().shrinkAt).toBe(room.snapshot().shrinkAt)
    expect(restored.snapshot().shrinkAt).toBe(152_000)
    expect(restored.snapshot().seq).toBe(snapshot.seq)
    expect(runner.you.side).toBe('runner')
    expect(runner.you.lat).toBe(40.701)
    expect(runner.you.lng).toBe(-74.001)
    expect(runner.you.connected).toBe(false)
    expect(restored.view(HOST, 9_000).you.connected).toBe(false)
    expect(runner.roster.find((person) => person.id === HOST)?.blockedByYou).toBe(true)
  })
})

describe('room store', () => {
  it('uses TLS only for public database hosts', () => {
    expect(postgresSsl('postgres://user:secret@dpg-abc-a/skulk_db')).toBeUndefined()
    expect(postgresSsl('postgres://user:secret@localhost:5432/skulk')).toBeUndefined()
    expect(postgresSsl('postgres://user:secret@dpg-abc-a.ohio-postgres.render.com/skulk_db?sslmode=require')).toEqual({
      rejectUnauthorized: false,
    })
    expect(postgresSsl('postgres://user:secret@example.render.com/skulk_db?sslmode=disable')).toBeUndefined()
  })
})

describe('hub persistence', () => {
  it('restores a round so the same player resumes with their role and position', async () => {
    const store = memoryRoomStore()
    const hub = new Hub(store, 60_000)
    const host = connect(hub)
    hello(host, HOST, 'Ada', { kind: 'create', practice: false })
    const code = viewOf(host).code
    const bea = connect(hub)
    const cy = connect(hub)
    hello(bea, RUNNER, 'Bea', { kind: 'join', code })
    hello(cy, RUNNER_2, 'Cy', { kind: 'join', code })
    host.receive(JSON.stringify({ type: 'prefs', role: 'hunter' }))
    bea.receive(JSON.stringify({ type: 'prefs', role: 'runner' }))
    cy.receive(JSON.stringify({ type: 'prefs', role: 'runner' }))
    host.receive(JSON.stringify({ type: 'settings', settings: { headStartSec: 30, durationSec: 600, zoneLat: 40.7, zoneLng: -74, zoneRadiusM: 400 } }))
    host.receive(JSON.stringify({ type: 'start' }))
    bea.receive(JSON.stringify({ type: 'location', lat: 40.701, lng: -74.001, accuracy: 6 }))
    expect(viewOf(bea).you.side).toBe('runner')
    await hub.flush()

    const restarted = new Hub(store, 60_000)
    await restarted.restore()
    const again = connect(restarted)
    hello(again, RUNNER, 'Bea', { kind: 'resume', code })
    const view = viewOf(again)
    expect(view.code).toBe(code)
    expect(view.phase).toBe('headstart')
    expect(view.you.side).toBe('runner')
    expect(view.you.lat).toBe(40.701)
    expect(view.you.lng).toBe(-74.001)
    expect(view.you.connected).toBe(true)
    expect(view.roster.map((person) => person.name).sort()).toEqual(['Ada', 'Bea', 'Cy'])
  })

  it('keeps a restored lobby long enough for players to reconnect', async () => {
    const store = memoryRoomStore()
    const room = new Room({ code: 'ABC234', hostId: HOST, hostName: 'Ada', now: 1_000 })
    const snapshot = room.snapshot()
    snapshot.lastHumanAt = Date.now() - 10 * 60 * 1000
    await store.save(snapshot)
    const restarted = new Hub(store, 60_000)
    await restarted.restore()
    restarted.tick(Date.now())
    const again = connect(restarted)
    hello(again, HOST, 'Ada', { kind: 'resume', code: 'ABC234' })
    expect(viewOf(again).phase).toBe('lobby')
    expect(viewOf(again).you.isHost).toBe(true)
  })

  it('tells a resume that the round ended when the room is really gone', () => {
    const hub = new Hub()
    const socket = connect(hub)
    socket.receive(JSON.stringify({ type: 'location', lat: 1, lng: 2, accuracy: 5 }))
    expect(socket.sent).toEqual([])
    hello(socket, HOST, 'Ada', { kind: 'resume', code: 'ZZZZZZ' })
    expect(lastMessage(socket)).toEqual({ type: 'error', message: ROUND_RESTARTED })
  })

  it('still says when a join code does not exist', () => {
    const hub = new Hub()
    const socket = connect(hub)
    hello(socket, HOST, 'Ada', { kind: 'join', code: 'ZZZZZZ' })
    expect(lastMessage(socket)).toEqual({ type: 'error', message: 'No round with that code.' })
  })

  it('drops a closed lobby from the store', async () => {
    const store = memoryRoomStore()
    const hub = new Hub(store, 60_000)
    const host = connect(hub)
    hello(host, HOST, 'Ada', { kind: 'create', practice: false })
    const code = viewOf(host).code
    await hub.flush()
    host.receive(JSON.stringify({ type: 'end' }))
    await hub.flush()
    const restarted = new Hub(store, 60_000)
    await restarted.restore()
    const again = connect(restarted)
    hello(again, HOST, 'Ada', { kind: 'resume', code })
    expect(lastMessage(again)).toEqual({ type: 'error', message: ROUND_RESTARTED })
  })
})
