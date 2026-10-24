import { makeCode } from '@shared/rules'
import type { ClientMessage, Intent, ServerMessage } from '@shared/types'
import { cleanName } from '@shared/words'
import { Room } from '../../server/room.ts'

/** One practice round, running in this phone. No WebSocket. */
export class LocalTable {
  private room: Room | null = null
  private playerId: string | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly emit: (message: ServerMessage) => void

  constructor(emit: (message: ServerMessage) => void) {
    this.emit = emit
  }

  handle(message: ClientMessage): void {
    if (message.type === 'hello') {
      this.open(message.playerId, message.name, message.intent)
      return
    }
    const room = this.room
    const playerId = this.playerId
    if (!room || !playerId) {
      this.emit({ type: 'error', message: 'Join a round first.' })
      return
    }
    const now = Date.now()
    if (message.type === 'prefs') this.reply(room.setPreferred(playerId, message.role))
    else if (message.type === 'settings') this.reply(room.updateSettings(playerId, message.settings))
    else if (message.type === 'zone') this.reply(room.setZone(playerId, message.lat, message.lng))
    else if (message.type === 'kick') this.reply(room.kick(playerId, message.playerId, now))
    else if (message.type === 'block') this.reply(room.block(playerId, message.playerId))
    else if (message.type === 'unblock') this.reply(room.unblock(playerId, message.playerId))
    else if (message.type === 'start') this.reply(room.start(playerId, now))
    else if (message.type === 'location') {
      const result = room.setLocation(playerId, message.lat, message.lng, message.accuracy, now)
      if (!result.ok && result.error) this.emit({ type: 'error', message: result.error })
      this.push()
    } else if (message.type === 'tag') this.reply(room.requestTag(playerId, message.runnerId, now))
    else if (message.type === 'tagAnswer') this.reply(room.answerTag(playerId, message.requestId, message.accept, now))
    else if (message.type === 'selfTag') this.reply(room.selfTag(playerId, now))
    else if (message.type === 'radio') this.reply(room.radio(playerId, message.text, now))
    else if (message.type === 'end') {
      if (room.phase === 'lobby') {
        const result = room.closeLobby(playerId)
        if (!result.ok && result.error) this.emit({ type: 'error', message: result.error })
        else {
          this.emit({ type: 'dismissed', message: 'The host closed the lobby.' })
          this.stop()
        }
      } else this.reply(room.endRound(playerId, now))
    } else if (message.type === 'leave') {
      room.leave(playerId, now)
      this.stop()
    } else if (message.type === 'addBot') this.reply(room.addBot(playerId, now))
  }

  stop(): void {
    if (this.timer != null) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.room = null
    this.playerId = null
  }

  private open(playerId: string, name: string, intent: Intent): void {
    if (intent.kind !== 'create' || !intent.practice) {
      this.emit({ type: 'error', message: 'This phone can only run a practice round on its own. Add a server address to host or join.' })
      return
    }
    const clean = cleanName(name)
    if (!clean) {
      this.emit({ type: 'error', message: 'Use a name with 2–16 letters.' })
      return
    }
    this.stop()
    this.playerId = playerId
    this.room = new Room({
      code: makeCode(),
      hostId: playerId,
      hostName: clean,
      now: Date.now(),
      practice: true,
    })
    this.push()
    this.timer = setInterval(() => {
      const room = this.room
      if (!room) return
      room.tick(Date.now())
      room.consumeDirty()
      this.push()
      if (room.dismissed) {
        this.emit({ type: 'dismissed', message: 'The lobby is empty.' })
        this.stop()
      }
    }, 250)
  }

  private reply(result: { ok: boolean; error?: string }): void {
    if (!result.ok && result.error) this.emit({ type: 'error', message: result.error })
    this.room?.consumeDirty()
    this.push()
  }

  private push(): void {
    const room = this.room
    const playerId = this.playerId
    if (!room || !playerId || !room.has(playerId)) return
    this.emit({ type: 'state', view: room.view(playerId, Date.now()) })
  }
}
