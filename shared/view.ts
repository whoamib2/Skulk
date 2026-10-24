import type { ClientView, RosterEntry } from './types.ts'

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function names(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

function rosterEntry(person: RosterEntry): RosterEntry {
  return {
    ...person,
    name: typeof person?.name === 'string' && person.name ? person.name : 'Player',
    blockedByYou: person?.blockedByYou === true,
    flaggedBy: names(person?.flaggedBy),
  }
}

/**
 * Fill fields a newer client reads. A server from before blocks and stats
 * omits them, and the host lobby crashed on `flaggedBy.length` the moment
 * someone else joined.
 */
export function normalizeView(input: ClientView): ClientView {
  const you = input.you
  return {
    ...input,
    you: {
      ...you,
      name: typeof you?.name === 'string' && you.name ? you.name : 'Player',
      distanceM: num(you?.distanceM),
      runSec: num(you?.runSec),
    },
    roster: Array.isArray(input.roster) ? input.roster.map((person) => rosterEntry(person)) : [],
    canStart: input.canStart ?? { ok: false, reason: null, warning: null },
  }
}
