import { formatClock, formatMeters } from './format.ts'

/** How long a radio line stays on the map before it fades away. */
export const RADIO_TOAST_MS = 6000

export function mapHudText(input: {
  role: string
  phaseClock: string
  phase: string
  roundClock: string
  /** Seconds until the circle next shrinks. Omit when shrinking is off or the circle cannot shrink further. */
  shrinkClock: string | null
  /** Current size, such as "400 m circle". Omit when there is no play circle. */
  radiusLabel: string | null
}): string {
  const parts = [`${input.role.toUpperCase()} ${input.phaseClock} ${input.phase}`, `Round ${input.roundClock}`]
  if (input.shrinkClock) parts.push(`Circle closes ${input.shrinkClock}`)
  if (input.radiusLabel) parts.push(input.radiusLabel)
  return parts.join(' · ')
}

export function radiusLabel(radiusM: number, zoneEnabled: boolean): string | null {
  if (!zoneEnabled) return null
  return `${formatMeters(radiusM)} circle`
}

export function phaseClock(seconds: number): string {
  return formatClock(seconds)
}

/** Newest messages still inside the toast window, oldest of those first. */
export function radioToasts<T extends { at: number }>(messages: T[], now: number, lifeMs = RADIO_TOAST_MS): T[] {
  return messages.filter((message) => {
    const age = now - message.at
    return age < lifeMs && age > -2_000
  }).slice(-2)
}

/** Solid, then a short fade at the end of the toast life. */
export function toastOpacity(ageMs: number, lifeMs = RADIO_TOAST_MS): number {
  if (ageMs < 0) return 1
  const fadeMs = 1200
  if (ageMs >= lifeMs) return 0
  if (ageMs <= lifeMs - fadeMs) return 1
  return (lifeMs - ageMs) / fadeMs
}
