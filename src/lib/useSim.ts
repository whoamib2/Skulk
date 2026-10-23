import { useEffect, useRef, useState } from 'react'
import { bearingDegrees, destination, distanceMeters } from '@shared/geo'

export function useSim(options: {
  enabled: boolean
  originLat: number | null
  originLng: number | null
  send: (lat: number, lng: number) => void
}) {
  const pos = useRef<{ lat: number; lng: number } | null>(null)
  const dest = useRef<{ lat: number; lng: number } | null>(null)
  const keys = useRef({ n: false, s: false, e: false, w: false })
  const sendRef = useRef(options.send)
  const [mode, setMode] = useState<'walk' | 'drop'>('walk')
  const [destinationPoint, setDestinationPoint] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    sendRef.current = options.send
  }, [options.send])

  useEffect(() => {
    if (options.originLat == null || options.originLng == null || pos.current) return
    pos.current = { lat: options.originLat, lng: options.originLng }
  }, [options.originLat, options.originLng])

  useEffect(() => {
    if (!options.enabled) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      const dirs: Record<string, 'n' | 's' | 'e' | 'w'> = { ArrowUp: 'n', ArrowDown: 's', ArrowLeft: 'w', ArrowRight: 'e' }
      const dir = dirs[event.key]
      if (!dir) return
      event.preventDefault()
      keys.current[dir] = event.type === 'keydown'
      if (event.type === 'keydown') {
        dest.current = null
        setDestinationPoint(null)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    const id = window.setInterval(() => {
      if (!pos.current) return
      let { lat, lng } = pos.current
      const step = 1.7
      let moved = false
      if (keys.current.n) { const next = destination(lat, lng, 0, step); lat = next.lat; lng = next.lng; moved = true }
      if (keys.current.s) { const next = destination(lat, lng, 180, step); lat = next.lat; lng = next.lng; moved = true }
      if (keys.current.e) { const next = destination(lat, lng, 90, step); lat = next.lat; lng = next.lng; moved = true }
      if (keys.current.w) { const next = destination(lat, lng, 270, step); lat = next.lat; lng = next.lng; moved = true }
      if (!moved && dest.current) {
        const remaining = distanceMeters(lat, lng, dest.current.lat, dest.current.lng)
        if (remaining < 1.5) {
          dest.current = null
          setDestinationPoint(null)
        } else {
          const bearing = bearingDegrees(lat, lng, dest.current.lat, dest.current.lng)
          const next = destination(lat, lng, bearing, Math.min(remaining, step))
          lat = next.lat
          lng = next.lng
          moved = true
        }
      }
      if (!moved) return
      pos.current = { lat, lng }
      sendRef.current(lat, lng)
    }, 200)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.clearInterval(id)
    }
  }, [options.enabled])

  function place(lat: number, lng: number) {
    pos.current = { lat, lng }
    dest.current = null
    setDestinationPoint(null)
    sendRef.current(lat, lng)
  }

  function walkTo(lat: number, lng: number) {
    if (!pos.current || mode === 'drop') {
      place(lat, lng)
      return
    }
    dest.current = { lat, lng }
    setDestinationPoint({ lat, lng })
  }

  function nudge(bearing: number) {
    if (!pos.current) return
    const next = destination(pos.current.lat, pos.current.lng, bearing, 8)
    place(next.lat, next.lng)
  }

  return { mode, setMode, destinationPoint, walkTo, nudge, place }
}
