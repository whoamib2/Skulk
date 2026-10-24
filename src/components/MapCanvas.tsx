import { useEffect, useRef, useState } from 'react'
import { Circle, MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { LatLngExpression, Map as LeafletMap } from 'leaflet'
import { divIcon } from 'leaflet'
import { boundsFromRadius, distanceMeters } from '@shared/geo'
import { formatAgo, initials } from '@shared/format'
import type { ViewMarker } from '@shared/types'

interface MapCanvasProps {
  center: { lat: number; lng: number }
  radiusM: number
  zoneEnabled: boolean
  shrinkWarning: boolean
  nextRadiusM: number | null
  markers: ViewMarker[]
  now: number
  followCenter: boolean
  onZoneCenter?: (lat: number, lng: number) => void
  onMapClick?: (lat: number, lng: number) => void
  onExpand?: () => void
  destination?: { lat: number; lng: number } | null
  you?: { lat: number; lng: number } | null
  here?: { lat: number; lng: number } | null
  onReady?: (map: LeafletMap) => void
}

const zoneStyle = {
  color: '#7fcd9e',
  weight: 2,
  fillColor: '#7fcd9e',
  fillOpacity: 0.08,
}

const warnStyle = {
  color: '#fede79',
  weight: 2,
  dashArray: '8 8',
  fillColor: '#fede79',
  fillOpacity: 0.06,
}

export function MapCanvas(props: MapCanvasProps) {
  const mapRef = useRef<LeafletMap | null>(null)
  return (
    <div className="skulk-map h-full w-full">
      <MapContainer
        center={[props.center.lat, props.center.lng]}
        zoom={16}
        zoomControl={false}
        attributionControl
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <Bind onReady={(map) => { mapRef.current = map; props.onReady?.(map) }} />
        <InitialFit lat={props.center.lat} lng={props.center.lng} radius={props.radiusM} enabled={props.zoneEnabled} />
        {props.followCenter ? (
          <HostCircle {...props} />
        ) : (
          props.zoneEnabled && (
            <Circle center={[props.center.lat, props.center.lng]} radius={props.radiusM} pathOptions={props.shrinkWarning ? warnStyle : zoneStyle} />
          )
        )}
        {props.shrinkWarning && props.nextRadiusM && props.zoneEnabled && !props.followCenter && (
          <Circle
            center={[props.center.lat, props.center.lng]}
            radius={props.nextRadiusM}
            pathOptions={{ color: '#fede79', weight: 1, dashArray: '4 6', fillOpacity: 0 }}
          />
        )}
        {props.markers.map((marker) => (
          <PlayerMarker key={`${marker.id}-${marker.kind}`} marker={marker} now={props.now} />
        ))}
        {props.destination && props.you && (
          <Polyline
            positions={[[props.you.lat, props.you.lng], [props.destination.lat, props.destination.lng]]}
            pathOptions={{ color: '#f9f4f8', weight: 1, dashArray: '4 6', opacity: 0.8 }}
          />
        )}
        {props.here && <HereMarker lat={props.here.lat} lng={props.here.lng} />}
        <Clicks onClick={props.onMapClick} onExpand={props.onExpand} />
      </MapContainer>
    </div>
  )
}

function Bind({ onReady }: { onReady: (map: LeafletMap) => void }) {
  const map = useMap()
  useEffect(() => {
    onReady(map)
  }, [map, onReady])
  return null
}

function InitialFit({ lat, lng, radius, enabled }: { lat: number; lng: number; radius: number; enabled: boolean }) {
  const map = useMap()
  const once = useRef(false)
  useEffect(() => {
    if (once.current || !enabled) return
    once.current = true
    map.fitBounds(boundsFromRadius(lat, lng, radius), { padding: [28, 28], animate: false })
  }, [enabled, lat, lng, map, radius])
  return null
}

function HostCircle(props: MapCanvasProps) {
  const map = useMap()
  const [center, setCenter] = useState(() => map.getCenter())
  const lastSent = useRef<{ lat: number; lng: number } | null>(null)
  const lastRadius = useRef(props.radiusM)
  useMapEvents({
    move: () => setCenter(map.getCenter()),
    moveend: () => {
      const next = map.getCenter()
      setCenter(next)
      if (!props.onZoneCenter) return
      if (lastSent.current && distanceMeters(lastSent.current.lat, lastSent.current.lng, next.lat, next.lng) < 4) return
      lastSent.current = { lat: next.lat, lng: next.lng }
      props.onZoneCenter(next.lat, next.lng)
    },
  })
  useEffect(() => {
    if (lastRadius.current === props.radiusM) return
    lastRadius.current = props.radiusM
    const current = map.getCenter()
    map.fitBounds(boundsFromRadius(current.lat, current.lng, props.radiusM), { padding: [28, 28], animate: false })
  }, [map, props.radiusM])
  if (!props.zoneEnabled) return null
  return <Circle center={center as LatLngExpression} radius={props.radiusM} pathOptions={zoneStyle} />
}

function HereMarker({ lat, lng }: { lat: number; lng: number }) {
  const icon = divIcon({
    className: 'skulk-marker',
    iconSize: [72, 48],
    iconAnchor: [36, 16],
    html: '<div class="here-wrap"><div class="here-dot"></div><div class="here-label">You</div></div>',
  })
  return <Marker position={[lat, lng]} icon={icon} interactive={false} zIndexOffset={900} />
}

function Clicks({ onClick, onExpand }: { onClick?: (lat: number, lng: number) => void; onExpand?: () => void }) {
  const onClickRef = useRef(onClick)
  const onExpandRef = useRef(onExpand)
  onClickRef.current = onClick
  onExpandRef.current = onExpand
  const handlers = useRef({
    click(event: { latlng: { lat: number; lng: number } }) {
      const click = onClickRef.current
      if (click) click(event.latlng.lat, event.latlng.lng)
      else onExpandRef.current?.()
    },
  })
  useMapEvents(handlers.current)
  return null
}

function PlayerMarker({ marker, now }: { marker: ViewMarker; now: number }) {
  const age = Math.max(0, (now - marker.at) / 1000)
  const label = marker.kind === 'ping' || marker.kind === 'spectate'
    ? `${marker.name} · ${formatAgo(age)}`
    : marker.kind === 'reveal'
      ? `${marker.name} · live`
      : marker.kind === 'self'
        ? 'You'
        : marker.name
  const tone = marker.kind === 'ping'
    ? 'ping'
    : marker.kind === 'reveal'
      ? 'reveal'
      : marker.kind === 'spectate'
        ? 'spectate'
        : marker.side
  const fresh = marker.kind === 'ping' && age < 12
  const icon = divIcon({
    className: 'skulk-marker',
    iconSize: [120, 64],
    iconAnchor: [60, 18],
    html: `<div class="pin-wrap"><div class="pin ${tone}${marker.kind === 'self' ? ' you' : ''}${fresh ? ' fresh' : ''}">${escapeHtml(initials(marker.kind === 'self' ? 'You' : marker.name))}</div><div class="pin-label">${escapeHtml(label)}</div></div>`,
  })
  return <Marker position={[marker.lat, marker.lng]} icon={icon} interactive={false} zIndexOffset={marker.kind === 'self' ? 800 : marker.kind === 'reveal' ? 600 : 0} />
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char
  ))
}
