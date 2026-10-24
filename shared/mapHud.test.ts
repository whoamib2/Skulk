import { describe, expect, it } from 'vitest'
import { mapHudText, radioToasts, radiusLabel, toastOpacity } from './mapHud.ts'

describe('map HUD', () => {
  it('puts role, round time, the next shrink, and the circle on one line', () => {
    expect(mapHudText({
      role: 'Runner',
      phaseClock: '2:01',
      phase: 'Hide',
      roundClock: '44:01',
      shrinkClock: '3:20',
      radiusLabel: '400 m circle',
    })).toBe('RUNNER 2:01 Hide · Round 44:01 · Circle closes 3:20 · 400 m circle')
  })

  it('omits the shrink countdown when the circle is not closing', () => {
    expect(mapHudText({
      role: 'Hunter',
      phaseClock: '0:20',
      phase: 'Wait',
      roundClock: '1:30',
      shrinkClock: null,
      radiusLabel: radiusLabel(220, true),
    })).toBe('HUNTER 0:20 Wait · Round 1:30 · 220 m circle')
    expect(radiusLabel(400, false)).toBeNull()
  })

  it('keeps the two newest radio lines and fades them out', () => {
    const messages = [
      { id: 'a', at: 0 },
      { id: 'b', at: 1000 },
      { id: 'c', at: 2000 },
    ]
    expect(radioToasts(messages, 5000).map((message) => message.id)).toEqual(['b', 'c'])
    expect(radioToasts(messages, 9000)).toEqual([])
    expect(toastOpacity(1000)).toBe(1)
    expect(toastOpacity(5400)).toBeCloseTo(0.5)
    expect(toastOpacity(6000)).toBe(0)
  })
})