import { applyRound, type FinishedRound } from '@shared/stats'
import { loadSeenRounds, loadStats, saveSeenRounds, saveStats } from '@/lib/deviceStore'

/** Record a finished round once. The key stops a reconnect or a re-render from counting it twice. */
export function recordFinishedRound(key: string, round: FinishedRound): void {
  const seen = loadSeenRounds()
  if (seen.includes(key)) return
  saveSeenRounds([...seen, key])
  saveStats(applyRound(loadStats(), round))
}
