export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.ceil(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  return `${m}:${String(r).padStart(2, '0')}`
}

export function formatAgo(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m >= 60) return `${Math.floor(m / 60)}h ago`
  return `${m}:${String(r).padStart(2, '0')} ago`
}

export function formatMeters(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`
  const km = m / 1000
  return `${km.toFixed(km < 10 ? 1 : 0)} km`
}

export function formatDuration(sec: number): string {
  if (sec < 60) return `${sec} second${sec === 1 ? '' : 's'}`
  const m = Math.round(sec / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (rem === 0) return `${h} hour${h === 1 ? '' : 's'}`
  return `${h} h ${rem} min`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
}

export function zonePhrase(radiusM: number): string {
  if (radiusM < 250) return 'a couple of blocks'
  if (radiusM < 500) return 'a few blocks'
  if (radiusM < 1000) return 'a small neighbourhood'
  if (radiusM < 1800) return 'a neighbourhood'
  return 'a long loop'
}
