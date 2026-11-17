import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SERVER_URL,
  healthUrlFor,
  privacyPageUrl,
  termsPageUrl,
  publicJoinUrl,
  resolveWsUrl,
  RECONNECT_MS,
  HEALTH_ATTEMPT_MS,
  HEALTH_BACKOFF_MS,
  SERVER_WAKE_MS,
  WAKE_FAILED_MESSAGE,
  WAKE_MESSAGE,
  WAKE_PATIENCE_MS,
  WAKE_STILL_MESSAGE,
  connectBudgetMs,
  serverUrlProblem,
  socketRetryDelayMs,
  stillWithinBudget,
  stillWithinWake,
  wakeStatusMessage,
} from './serverUrl.ts'

describe('resolveWsUrl', () => {
  it('uses this site when the field is empty in a browser', () => {
    expect(resolveWsUrl('', false, 'http://127.0.0.1:43123')).toBe('ws://127.0.0.1:43123/ws')
    expect(resolveWsUrl('', false, 'https://skulk.example')).toBe('wss://skulk.example/ws')
  })

  it('refuses an empty address on a phone', () => {
    expect(resolveWsUrl('', true)).toBeNull()
    expect(serverUrlProblem('', true)).toMatch(/server address/)
  })

  it('accepts https, ws, and a bare host', () => {
    expect(resolveWsUrl('https://play.example.com', true)).toBe('wss://play.example.com/ws')
    expect(resolveWsUrl('wss://play.example.com/ws', true)).toBe('wss://play.example.com/ws')
    expect(resolveWsUrl('192.168.1.20:43123', true)).toBe('ws://192.168.1.20:43123/ws')
    expect(resolveWsUrl('ws://10.0.0.4:43123/ws', true)).toBe('ws://10.0.0.4:43123/ws')
  })

  it('rejects a sentence', () => {
    expect(resolveWsUrl('not a server', true)).toBeNull()
    expect(serverUrlProblem('not a server', false)).toMatch(/address/)
  })

  it('points the public server at Render', () => {
    expect(DEFAULT_SERVER_URL).toBe('https://skulk.onrender.com')
    expect(resolveWsUrl(DEFAULT_SERVER_URL, true)).toBe('wss://skulk.onrender.com/ws')
    expect(healthUrlFor('wss://skulk.onrender.com/ws')).toBe('https://skulk.onrender.com/health')
  })
})

describe('publicJoinUrl', () => {
  it('uses the configured server instead of the phone WebView origin', () => {
    expect(publicJoinUrl('https://skulk.onrender.com', '7k7s5b', true, 'https://localhost')).toBe('https://skulk.onrender.com/?join=7K7S5B')
    expect(publicJoinUrl('wss://play.example.com/ws', 'ab12cd', true, 'https://localhost')).toBe('https://play.example.com/?join=AB12CD')
    expect(publicJoinUrl('192.168.1.20:43123', 'ab12cd', true, 'https://localhost')).toBe('http://192.168.1.20:43123/?join=AB12CD')
    expect(publicJoinUrl('', 'ab12cd', true, 'https://localhost')).toBe('https://skulk.onrender.com/?join=AB12CD')
  })

  it('uses this site in a browser when the field is empty', () => {
    expect(publicJoinUrl('', 'ab12cd', false, 'http://127.0.0.1:43123')).toBe('http://127.0.0.1:43123/?join=AB12CD')
  })
})

describe('privacyPageUrl', () => {
  it('uses the public server on a phone and this site in a browser', () => {
    expect(privacyPageUrl('https://skulk.onrender.com', true, 'https://localhost')).toBe('https://skulk.onrender.com/privacy')
    expect(privacyPageUrl('', true, 'https://localhost')).toBe('https://skulk.onrender.com/privacy')
    expect(privacyPageUrl('', false, 'http://127.0.0.1:43123')).toBe('http://127.0.0.1:43123/privacy')
    expect(termsPageUrl('https://skulk.onrender.com', true, 'https://localhost')).toBe('https://skulk.onrender.com/terms')
    expect(termsPageUrl('', false, 'http://127.0.0.1:43123')).toBe('http://127.0.0.1:43123/terms')
  })
})

describe('server wake', () => {
  it('keeps trying a cold server for about 3 minutes', () => {
    expect(SERVER_WAKE_MS).toBe(3 * 60 * 1000)
    expect(HEALTH_ATTEMPT_MS).toBe(8_000)
    expect(HEALTH_BACKOFF_MS).toBeGreaterThanOrEqual(2_000)
    expect(HEALTH_BACKOFF_MS).toBeLessThanOrEqual(5_000)
    expect(WAKE_PATIENCE_MS).toBe(90_000)
    expect(RECONNECT_MS).toBe(5 * 60 * 1000)
    expect(connectBudgetMs(false)).toBe(SERVER_WAKE_MS)
    expect(connectBudgetMs(true)).toBe(RECONNECT_MS)
    expect(stillWithinWake(1_000, 1_000 + SERVER_WAKE_MS - 1)).toBe(true)
    expect(stillWithinWake(1_000, 1_000 + SERVER_WAKE_MS)).toBe(false)
    expect(stillWithinBudget(1_000, 1_000 + RECONNECT_MS - 1, RECONNECT_MS)).toBe(true)
    expect(stillWithinBudget(1_000, 1_000 + RECONNECT_MS, RECONNECT_MS)).toBe(false)
    expect(wakeStatusMessage(0)).toBe(WAKE_MESSAGE)
    expect(wakeStatusMessage(WAKE_PATIENCE_MS - 1)).toBe(WAKE_MESSAGE)
    expect(wakeStatusMessage(WAKE_PATIENCE_MS)).toBe(WAKE_STILL_MESSAGE)
    expect(WAKE_FAILED_MESSAGE).toMatch(/didn’t wake up/)
    expect(socketRetryDelayMs(0)).toBe(400)
    expect(socketRetryDelayMs(1)).toBe(800)
    expect(socketRetryDelayMs(3)).toBe(3200)
    expect(socketRetryDelayMs(4)).toBe(4000)
    expect(socketRetryDelayMs(20)).toBe(4000)
    const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
    const game = readFileSync(new URL('../src/lib/useGame.ts', import.meta.url), 'utf8')
    const health = readFileSync(new URL('../src/lib/health.ts', import.meta.url), 'utf8')
    expect(app).toContain('data-screen="waking"')
    expect(app).toContain('data-screen="wake-failed"')
    expect(app).toContain('warmGameServer')
    expect(app).toContain('Try again')
    expect(app).toContain('>Cancel<')
    expect(game).toContain('pingHealth')
    expect(game).toContain('WAKE_FAILED_MESSAGE')
    expect(health).toContain("mode: 'no-cors'")
    expect(health).toContain('HEALTH_ATTEMPT_MS')
  })
})
