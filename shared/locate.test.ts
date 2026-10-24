import { describe, expect, it } from 'vitest'
import { classifyLocateFailure, lobbyFallbackMessage, locateProblemMessage } from './locate.ts'

describe('classifyLocateFailure', () => {
  it('reads a browser denial, timeout, and an unavailable fix', () => {
    expect(classifyLocateFailure({ code: 1, message: 'User denied Geolocation' })).toBe('denied')
    expect(classifyLocateFailure({ code: 3, message: 'Timeout expired' })).toBe('timeout')
    expect(classifyLocateFailure({ code: 2, message: 'Position update is unavailable' })).toBe('unavailable')
  })

  it('reads the Capacitor Android codes', () => {
    expect(classifyLocateFailure({ code: 'OS-PLUG-GLOC-0003', message: 'Location permission request was denied.' })).toBe('denied')
    expect(classifyLocateFailure({ code: 'OS-PLUG-GLOC-0007', message: 'Location services are not enabled.' })).toBe('off')
    expect(classifyLocateFailure({ code: 'OS-PLUG-GLOC-0009', message: 'Request to enable location was denied.' })).toBe('off')
    expect(classifyLocateFailure({ code: 'OS-PLUG-GLOC-0010', message: 'Could not obtain location in time. Try with a higher timeout.' })).toBe('timeout')
    expect(classifyLocateFailure({ code: 'OS-PLUG-GLOC-0017', message: 'Unable to retrieve location because device has both Network and Location turned off.' })).toBe('off')
  })
})

describe('locate messages', () => {
  it('names denial, location off, and a timeout', () => {
    expect(locateProblemMessage('denied')).toMatch(/permission was denied/i)
    expect(locateProblemMessage('off')).toMatch(/turned off/i)
    expect(locateProblemMessage('timeout')).toMatch(/GPS fix/i)
    expect(lobbyFallbackMessage('denied')).toMatch(/default map/)
  })
})
