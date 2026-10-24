import { Pool } from 'pg'
import type { RoomSnapshot } from './room.ts'

export interface RoomStore {
  load(): Promise<RoomSnapshot[]>
  save(snapshot: RoomSnapshot): Promise<void>
  remove(code: string): Promise<void>
}

export function memoryRoomStore(): RoomStore {
  const rooms = new Map<string, RoomSnapshot>()
  return {
    async load() {
      return [...rooms.values()].map((snapshot) => structuredClone(snapshot))
    },
    async save(snapshot) {
      rooms.set(snapshot.code, structuredClone(snapshot))
    },
    async remove(code) {
      rooms.delete(code)
    },
  }
}

export function noopRoomStore(): RoomStore {
  return {
    async load() {
      return []
    },
    async save() {},
    async remove() {},
  }
}

/** Internal Render hostnames do not use TLS. Public hostnames do. */
export function postgresSsl(connectionString: string): { rejectUnauthorized: false } | undefined {
  let sslmode: string | null = null
  let host = ''
  try {
    const url = new URL(connectionString)
    sslmode = url.searchParams.get('sslmode')
    host = url.hostname
  } catch {
    return undefined
  }
  if (sslmode === 'disable') return undefined
  if (sslmode === 'require' || sslmode === 'verify-ca' || sslmode === 'verify-full') {
    return { rejectUnauthorized: false }
  }
  if (host === 'localhost' || host === '127.0.0.1' || !host.includes('.')) return undefined
  if (host.endsWith('.render.com')) return { rejectUnauthorized: false }
  return undefined
}

const ROOM_TABLE = `
  create table if not exists skulk_rooms (
    code text primary key,
    snapshot jsonb not null,
    updated_at timestamptz not null default now()
  )
`

export async function openPostgresRoomStore(
  connectionString: string,
  shouldStop: () => boolean = () => false,
): Promise<RoomStore & { close(): Promise<void> }> {
  const pool = new Pool({
    connectionString,
    max: 2,
    connectionTimeoutMillis: 5_000,
    ssl: postgresSsl(connectionString),
  })
  let opened = false
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    if (shouldStop()) break
    try {
      await pool.query(ROOM_TABLE)
      opened = true
      break
    } catch {
      console.error(`waiting for the room database (${attempt})`)
      const keepGoing = await pause(2_000, shouldStop)
      if (!keepGoing) break
    }
  }
  if (!opened) {
    await pool.end().catch(() => {})
    throw new Error('room database unavailable')
  }
  console.log('Loading rooms from the database')
  return {
    async load() {
      const result = await pool.query('select snapshot from skulk_rooms')
      const rooms: RoomSnapshot[] = []
      for (const row of result.rows) {
        const value = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) as unknown : row.snapshot
        if (value && typeof value === 'object') rooms.push(value as RoomSnapshot)
      }
      return rooms
    },
    async save(snapshot) {
      await pool.query(
        `insert into skulk_rooms (code, snapshot, updated_at)
         values ($1, $2::jsonb, now())
         on conflict (code) do update set snapshot = excluded.snapshot, updated_at = now()`,
        [snapshot.code, JSON.stringify(snapshot)],
      )
    },
    async remove(code) {
      await pool.query('delete from skulk_rooms where code = $1', [code])
    },
    async close() {
      await pool.end()
    },
  }
}

function pause(ms: number, shouldStop: () => boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const started = Date.now()
    const timer = setInterval(() => {
      if (shouldStop() || Date.now() - started >= ms) {
        clearInterval(timer)
        resolve(!shouldStop())
      }
    }, 200)
  })
}
