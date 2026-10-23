import { describe, expect, it } from 'vitest'
import { resolveWsUrl, serverUrlProblem } from './serverUrl.ts'

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
})
