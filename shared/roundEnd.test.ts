import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ROUND_RESTARTED, isRoundLostMessage } from './roundEnd.ts'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const game = readFileSync(new URL('../src/lib/useGame.ts', import.meta.url), 'utf8')

describe('round lost messages', () => {
  it('treats a wiped room as lost and leaves ordinary failures alone', () => {
    expect(isRoundLostMessage(ROUND_RESTARTED)).toBe(true)
    expect(isRoundLostMessage('Join a round first.')).toBe(true)
    expect(isRoundLostMessage('No round with that code.')).toBe(true)
    expect(isRoundLostMessage('Get within 15 m, then tag in person.')).toBe(false)
  })

  it('shows a restart screen instead of the join banner over a live round', () => {
    expect(app).toContain('data-screen="restarted"')
    expect(app).toContain('Round ended because the server restarted')
    expect(app).toContain('Back to lobby')
    expect(app).toContain('!game.restarted')
    expect(game).toContain('isRoundLostMessage')
    expect(game).toContain("modeRef.current !== 'local'")
    expect(game).toContain('acceptedRef')
  })
})
