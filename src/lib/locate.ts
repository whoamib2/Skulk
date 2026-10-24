import { classifyLocateFailure, type LocateProblem } from '@shared/locate'
import { isNativeApp } from '@/lib/native'

export interface LocateFix {
  ok: true
  lat: number
  lng: number
  accuracy: number | null
}

export interface LocateFailure {
  ok: false
  problem: LocateProblem
}

export type LocateOutcome = LocateFix | LocateFailure

const FIX_TIMEOUT_MS = 12_000

/** Ask the phone for one GPS fix. On Android this goes through the Capacitor plugin, which shows the system permission dialog. */
export async function locateOnce(timeoutMs = FIX_TIMEOUT_MS): Promise<LocateOutcome> {
  if (isNativeApp()) return locateNative(timeoutMs)
  return locateBrowser(timeoutMs)
}

async function locateNative(timeoutMs: number): Promise<LocateOutcome> {
  try {
    const { Geolocation } = await import('@capacitor/geolocation')
    // getCurrentPosition requests ACCESS_FINE_LOCATION / ACCESS_COARSE_LOCATION if they are not granted yet.
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: timeoutMs,
      maximumAge: 0,
    })
    return {
      ok: true,
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
    }
  } catch (error) {
    return { ok: false, problem: classifyLocateFailure(readError(error)) }
  }
}

function locateBrowser(timeoutMs: number): Promise<LocateOutcome> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ ok: false, problem: 'unavailable' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        ok: true,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      }),
      (error) => resolve({ ok: false, problem: classifyLocateFailure({ code: error.code, message: error.message }) }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    )
  })
}

function readError(error: unknown): { code?: string | number | null; message?: string | null } {
  if (typeof error === 'string') return { message: error }
  if (error && typeof error === 'object') {
    const record = error as { code?: string | number; message?: string }
    return { code: record.code, message: record.message }
  }
  return {}
}
