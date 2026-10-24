/** Shown when a phone still has a round the server can no longer restore. */
export const ROUND_RESTARTED = 'Round ended because the server restarted'

const LOST = new Set<string>([
  ROUND_RESTARTED,
  'Join a round first.',
  'No round with that code.',
])

/** True for errors that mean this phone's round is gone, not for ordinary tag or radio failures. */
export function isRoundLostMessage(message: string): boolean {
  return LOST.has(message)
}
