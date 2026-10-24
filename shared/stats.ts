import type { Side } from './types.ts'

export interface PlayerStats {
  roundsPlayed: number
  roundsWon: number
  /** Rounds you finished as a runner without being caught. */
  neverCaught: number
  /** Longest time, in seconds, from hunters being released until you were caught or the round ended. */
  longestRunSec: number
  distanceM: number
}

export interface FinishedRound {
  side: Side | null
  caught: boolean
  left: boolean
  winner: 'hunters' | 'runners' | null
  /** Seconds on the run after hunters were released. Ignored unless you were a runner. */
  runSec: number
  distanceM: number
}

export const emptyStats = (): PlayerStats => ({
  roundsPlayed: 0,
  roundsWon: 0,
  neverCaught: 0,
  longestRunSec: 0,
  distanceM: 0,
})

export function applyRound(stats: PlayerStats, round: FinishedRound): PlayerStats {
  if (round.side !== 'hunter' && round.side !== 'runner') return stats
  const next: PlayerStats = {
    roundsPlayed: stats.roundsPlayed + 1,
    roundsWon: stats.roundsWon,
    neverCaught: stats.neverCaught,
    longestRunSec: stats.longestRunSec,
    distanceM: stats.distanceM + Math.max(0, round.distanceM),
  }
  const sideWon = (round.side === 'hunter' && round.winner === 'hunters')
    || (round.side === 'runner' && round.winner === 'runners')
  const stayed = !round.left && (round.side === 'hunter' || !round.caught)
  if (sideWon && stayed) next.roundsWon += 1
  if (round.side === 'runner' && !round.caught && !round.left) next.neverCaught += 1
  if (round.side === 'runner') next.longestRunSec = Math.max(stats.longestRunSec, Math.max(0, round.runSec))
  return next
}
