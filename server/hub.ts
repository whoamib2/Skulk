import type { WebSocket } from 'ws'
import { makeCode } from '../shared/rules.ts'
import { ROUND_RESTARTED } from '../shared/roundEnd.ts'
import type { ServerMessage } from '../shared/types.ts'
import { cleanName } from '../shared/words.ts'
import { parseMessage } from './protocol.ts'
import { Room } from './room.ts'
import { noopRoomStore, type RoomStore } from './roomStore.ts'

interface SocketState {
  playerId: string | null
  greeted: boolean
}

export class Hub {
  private readonly rooms = new Map<string, Room>()
  private readonly sockets = new Map<string, WebSocket>()
  private readonly socketPlayer = new Map<WebSocket, string>()
  private readonly playerRoom = new Map<string, string>()
  private readonly socketState = new WeakMap<WebSocket, SocketState>()
  private readonly saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly tails = new Map<string, Promise<void>>()
  private store: RoomStore
  private readonly saveDelayMs: number

  constructor(store: RoomStore = noopRoomStore(), saveDelayMs = 1000) {
    this.store = store
    this.saveDelayMs = saveDelayMs
  }

  setStore(store: RoomStore): void {
    this.store = store
  }

  async restore(): Promise<void> {
    const snapshots = await this.store.load()
    let loaded = 0
    for (const snapshot of snapshots) {
      if (!snapshot || typeof snapshot.code !== 'string') continue
      if (this.rooms.has(snapshot.code)) continue
      try {
        const room = new Room({ snapshot })
        this.rooms.set(room.code, room)
        loaded += 1
      } catch {
        console.error(`room restore failed ${snapshot.code}`)
      }
    }
    console.log(`Loaded ${loaded} room(s)`)
  }

  async flush(): Promise<void> {
    for (const code of [...this.saveTimers.keys()]) this.cancelSave(code)
    for (const room of this.rooms.values()) {
      if (room.dismissed) continue
      this.enqueue(room.code, () => this.save(room))
    }
    await Promise.all([...this.tails.values()])
  }

  connect(ws: WebSocket): void {
    this.socketState.set(ws, { playerId: null, greeted: false })
    ws.on('message', (data) => {
      this.onMessage(ws, rawText(data))
    })
    ws.on('close', () => {
      const playerId = this.socketPlayer.get(ws)
      this.socketPlayer.delete(ws)
      if (!playerId || this.sockets.get(playerId) !== ws) return
      this.sockets.delete(playerId)
      const room = this.roomFor(playerId)
      if (!room) return
      room.setConnected(playerId, false)
      this.push(room)
    })
  }

  tick(now: number): void {
    for (const [code, room] of this.rooms) {
      room.tick(now)
      if (room.consumeDirty()) this.push(room)
      if (room.dismissed) {
        this.dismiss(room, 'The host closed the lobby.')
        continue
      }
      if (room.phase === 'ended' && room.endedAtMs != null && now - room.endedAtMs > 15 * 60 * 1000) {
        this.dropRoom(code)
      } else if (room.phase === 'lobby' && room.connectedHumans() === 0 && now - room.lastHumanMs > 2 * 60 * 1000) {
        this.dropRoom(code)
      }
    }
  }

  private onMessage(ws: WebSocket, raw: string): void {
    if (raw.length > 8000) return
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    const message = parseMessage(parsed)
    if (!message) return
    if (message.type === 'hello') {
      this.onHello(ws, message.playerId, message.name, message.intent)
      return
    }
    const playerId = this.socketPlayer.get(ws)
    const room = playerId ? this.roomFor(playerId) : undefined
    if (!playerId || !room) {
      // A reconnect can deliver a GPS fix before hello. That is not a missing round.
      if (message.type === 'location') return
      this.send(ws, { type: 'error', message: 'Join a round first.' })
      return
    }
    const now = Date.now()
    if (message.type === 'prefs') this.reply(ws, room.setPreferred(playerId, message.role), room)
    else if (message.type === 'settings') this.reply(ws, room.updateSettings(playerId, message.settings), room)
    else if (message.type === 'zone') this.reply(ws, room.setZone(playerId, message.lat, message.lng), room)
    else if (message.type === 'block') this.reply(ws, room.block(playerId, message.playerId), room)
    else if (message.type === 'unblock') this.reply(ws, room.unblock(playerId, message.playerId), room)
    else if (message.type === 'kick') {
      const result = room.kick(playerId, message.playerId, now)
      if (!result.ok) this.send(ws, { type: 'error', message: result.error ?? 'Could not remove them.' })
      else this.dismissPlayer(message.playerId, 'The host removed you from the lobby.')
      this.push(room)
    } else if (message.type === 'start') this.reply(ws, room.start(playerId, now), room)
    else if (message.type === 'location') room.setLocation(playerId, message.lat, message.lng, message.accuracy, now)
    else if (message.type === 'tag') this.reply(ws, room.requestTag(playerId, message.runnerId, now), room)
    else if (message.type === 'tagAnswer') this.reply(ws, room.answerTag(playerId, message.requestId, message.accept, now), room)
    else if (message.type === 'selfTag') this.reply(ws, room.selfTag(playerId, now), room)
    else if (message.type === 'radio') this.reply(ws, room.radio(playerId, message.text, now), room)
    else if (message.type === 'end') {
      if (room.phase === 'lobby') {
        const result = room.closeLobby(playerId)
        if (!result.ok) this.send(ws, { type: 'error', message: result.error ?? 'Could not close the lobby.' })
        else this.dismiss(room, 'The host closed the lobby.')
      } else this.reply(ws, room.endRound(playerId, now), room)
    } else if (message.type === 'leave') {
      room.leave(playerId, now)
      this.playerRoom.delete(playerId)
      this.sockets.delete(playerId)
      this.socketPlayer.delete(ws)
      if (room.dismissed) this.dismiss(room, 'The lobby is empty.')
      else this.push(room)
    } else if (message.type === 'addBot') this.reply(ws, room.addBot(playerId, now), room)
  }

  private onHello(
    ws: WebSocket,
    playerId: string,
    name: string,
    intent: { kind: 'create'; practice: boolean } | { kind: 'join' | 'resume'; code: string },
  ): void {
    const clean = cleanName(name)
    if (!clean) {
      this.send(ws, { type: 'error', message: 'Use a name with 2–16 letters.' })
      return
    }
    if (intent.kind === 'create') {
      this.detach(playerId, Date.now())
      const room = this.createRoom(playerId, clean, intent.practice)
      this.attach(ws, room, playerId)
      this.push(room)
      return
    }
    const code = intent.code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    const room = this.rooms.get(code)
    if (!room) {
      const message = intent.kind === 'resume' ? ROUND_RESTARTED : 'No round with that code.'
      this.send(ws, { type: 'error', message })
      return
    }
    if (room.isBanned(playerId)) {
      this.send(ws, { type: 'error', message: 'You left this round.' })
      return
    }
    if (!room.has(playerId)) {
      if (room.phase !== 'lobby') {
        this.send(ws, { type: 'error', message: 'That round has already started.' })
        return
      }
      const added = room.addPlayer(playerId, clean, Date.now())
      if (!added.ok) {
        this.send(ws, { type: 'error', message: added.error ?? 'Could not join.' })
        return
      }
    } else {
      room.setName(playerId, clean)
      room.setConnected(playerId, true)
    }
    this.attach(ws, room, playerId)
    this.push(room)
  }

  private createRoom(hostId: string, name: string, practice: boolean): Room {
    let code = makeCode()
    while (this.rooms.has(code)) code = makeCode()
    const room = new Room({ code, hostId, hostName: name, now: Date.now(), practice })
    this.rooms.set(code, room)
    return room
  }

  private attach(ws: WebSocket, room: Room, playerId: string): void {
    const previous = this.sockets.get(playerId)
    if (previous && previous !== ws) previous.close()
    this.sockets.set(playerId, ws)
    this.socketPlayer.set(ws, playerId)
    this.playerRoom.set(playerId, room.code)
    room.setConnected(playerId, true)
  }

  private detach(playerId: string, now: number): void {
    const room = this.roomFor(playerId)
    if (!room) return
    room.leave(playerId, now)
    this.playerRoom.delete(playerId)
    if (room.dismissed) this.dismiss(room, 'The lobby is empty.')
    else this.push(room)
  }

  private roomFor(playerId: string): Room | undefined {
    const code = this.playerRoom.get(playerId)
    return code ? this.rooms.get(code) : undefined
  }

  private reply(ws: WebSocket, result: { ok: boolean; error?: string }, room: Room): void {
    if (!result.ok && result.error) this.send(ws, { type: 'error', message: result.error })
    room.consumeDirty()
    this.push(room)
  }

  private push(room: Room): void {
    const now = Date.now()
    for (const [playerId, socket] of this.sockets) {
      if (this.playerRoom.get(playerId) !== room.code) continue
      if (!room.has(playerId)) continue
      this.send(socket, { type: 'state', view: room.view(playerId, now) })
    }
    this.queueSave(room)
  }

  private queueSave(room: Room): void {
    if (room.dismissed) return
    const code = room.code
    this.cancelSave(code)
    const timer = setTimeout(() => {
      this.saveTimers.delete(code)
      const current = this.rooms.get(code)
      if (!current || current.dismissed) return
      this.enqueue(code, () => this.save(current))
    }, this.saveDelayMs)
    timer.unref()
    this.saveTimers.set(code, timer)
  }

  private cancelSave(code: string): void {
    const timer = this.saveTimers.get(code)
    if (!timer) return
    clearTimeout(timer)
    this.saveTimers.delete(code)
  }

  private enqueue(code: string, work: () => Promise<void>): void {
    const previous = this.tails.get(code) ?? Promise.resolve()
    const next = previous.then(work, work)
    this.tails.set(code, next)
  }

  private async save(room: Room): Promise<void> {
    try {
      await this.store.save(room.snapshot())
    } catch {
      console.error(`room save failed ${room.code}`)
    }
  }

  private dismiss(room: Room, message: string): void {
    const code = room.code
    this.cancelSave(code)
    this.rooms.delete(code)
    this.enqueue(code, async () => {
      try {
        await this.store.remove(code)
      } catch {
        console.error(`room save failed ${code}`)
      }
    })
    for (const playerId of [...this.playerRoom.keys()]) {
      if (this.playerRoom.get(playerId) !== code) continue
      this.dismissPlayer(playerId, message)
    }
  }

  private dismissPlayer(playerId: string, message: string): void {
    const socket = this.sockets.get(playerId)
    this.playerRoom.delete(playerId)
    this.sockets.delete(playerId)
    if (!socket) return
    this.socketPlayer.delete(socket)
    this.send(socket, { type: 'dismissed', message })
  }

  private dropRoom(code: string): void {
    const room = this.rooms.get(code)
    if (!room) return
    this.dismiss(room, 'That round has ended.')
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
  }
}

function rawText(data: unknown): string {
  if (typeof data === 'string') return data
  if (Buffer.isBuffer(data)) return data.toString()
  if (Array.isArray(data)) return Buffer.concat(data).toString()
  return Buffer.from(data as ArrayBuffer).toString()
}
