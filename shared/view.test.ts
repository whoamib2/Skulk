import { describe, expect, it } from 'vitest'
import type { ClientView, RosterEntry } from './types.ts'
import { normalizeView } from './view.ts'

/** The shape https://skulk.onrender.com was still sending when v6 shipped. */
function legacyRoster(partial: Partial<RosterEntry> & Pick<RosterEntry, 'id' | 'name' | 'isYou'>): RosterEntry {
  const { blockedByYou: _blocked, flaggedBy: _flagged, ...rest } = {
    isHost: false,
    isBot: false,
    connected: true,
    preferredRole: 'random' as const,
    side: null,
    likelySide: null,
    caught: false,
    left: false,
    pingAgeSec: null,
    revealed: false,
    blockedByYou: false,
    flaggedBy: [] as string[],
    ...partial,
  }
  return rest as RosterEntry
}

describe('normalizeView', () => {
  it('lets the host render a joiner when the server omits block fields', () => {
    const host = legacyRoster({ id: 'host', name: 'Ada', isYou: true, isHost: true })
    const joiner = legacyRoster({ id: 'join', name: 'Bea', isYou: false })
    delete (joiner as { flaggedBy?: string[] }).flaggedBy
    delete (joiner as { blockedByYou?: boolean }).blockedByYou
    const view = normalizeView({
      you: { id: 'host', name: 'Ada', isHost: true },
      roster: [host, joiner],
    } as ClientView)

    const other = view.roster.find((person) => !person.isYou)
    expect(other?.flaggedBy).toEqual([])
    expect(other?.blockedByYou).toBe(false)
    expect(other?.flaggedBy.length).toBe(0)
    expect(view.you.distanceM).toBe(0)
    expect(view.you.runSec).toBe(0)
  })

  it('keeps a real flag list and a block', () => {
    const view = normalizeView({
      you: { id: 'host', name: 'Ada', isHost: true, distanceM: 12.4, runSec: 3 },
      roster: [{
        id: 'join',
        name: 'Bea',
        isYou: false,
        blockedByYou: true,
        flaggedBy: ['Cy', 4, ''],
      }],
    } as unknown as ClientView)
    expect(view.roster[0]?.flaggedBy).toEqual(['Cy'])
    expect(view.roster[0]?.blockedByYou).toBe(true)
    expect(view.you.distanceM).toBe(12.4)
    expect(view.you.runSec).toBe(3)
  })
})
