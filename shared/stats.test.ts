import { describe, expect, it } from 'vitest'
import { applyRound, emptyStats } from './stats.ts'

describe('applyRound', () => {
  it('counts a runner who stays free as a win and a clean escape', () => {
    const stats = applyRound(emptyStats(), {
      side: 'runner',
      caught: false,
      left: false,
      winner: 'runners',
      runSec: 240,
      distanceM: 850.4,
    })
    expect(stats).toEqual({
      roundsPlayed: 1,
      roundsWon: 1,
      neverCaught: 1,
      longestRunSec: 240,
      distanceM: 850.4,
    })
  })

  it('does not treat a catch, a leave, or a called-off round as a win or a clean escape', () => {
    const caught = applyRound(emptyStats(), {
      side: 'runner',
      caught: true,
      left: false,
      winner: 'hunters',
      runSec: 90,
      distanceM: 100,
    })
    expect(caught.roundsWon).toBe(0)
    expect(caught.neverCaught).toBe(0)
    expect(caught.longestRunSec).toBe(90)

    const left = applyRound(emptyStats(), {
      side: 'runner',
      caught: false,
      left: true,
      winner: 'runners',
      runSec: 30,
      distanceM: 10,
    })
    expect(left.neverCaught).toBe(0)
    expect(left.roundsWon).toBe(0)

    const called = applyRound(emptyStats(), {
      side: 'runner',
      caught: false,
      left: false,
      winner: null,
      runSec: 15,
      distanceM: 40,
    })
    expect(called.roundsWon).toBe(0)
    expect(called.neverCaught).toBe(1)
  })

  it('keeps the longest run and adds distance across rounds', () => {
    const once = applyRound(emptyStats(), {
      side: 'hunter',
      caught: false,
      left: false,
      winner: 'hunters',
      runSec: 999,
      distanceM: 200,
    })
    expect(once.longestRunSec).toBe(0)
    expect(once.roundsWon).toBe(1)
    const twice = applyRound(once, {
      side: 'runner',
      caught: true,
      left: false,
      winner: 'runners',
      runSec: 40,
      distanceM: 50,
    })
    expect(twice.roundsPlayed).toBe(2)
    expect(twice.roundsWon).toBe(1)
    expect(twice.longestRunSec).toBe(40)
    expect(twice.distanceM).toBe(250)
  })

  it('ignores a round where you never took a side', () => {
    expect(applyRound(emptyStats(), {
      side: null,
      caught: false,
      left: false,
      winner: 'runners',
      runSec: 10,
      distanceM: 10,
    })).toEqual(emptyStats())
  })
})
