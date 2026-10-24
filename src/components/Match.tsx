import { useEffect, useRef, useState } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import { Ellipsis, LocateFixed, Map as MapIcon, Radio as RadioIcon } from 'lucide-react'
import { boundsFromRadius, destination, hashString } from '@shared/geo'
import { formatAgo, formatClock, formatMeters } from '@shared/format'
import { locateProblemMessage } from '@shared/locate'
import type { ClientMessage, ClientView } from '@shared/types'
import { ExpandableMap } from '@/components/ExpandableMap'
import { FindMeButton } from '@/components/FindMeButton'
import { MapCanvas } from '@/components/MapCanvas'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { locateOnce } from '@/lib/locate'
import { useSim } from '@/lib/useSim'
import { buzz } from '@/lib/utils'

export function Match({
  view,
  now,
  sim,
  onSim,
  send,
  onLeave,
}: {
  view: ClientView
  now: number
  sim: boolean
  onSim: (on: boolean) => void
  send: (message: ClientMessage) => void
  onLeave: () => void
}) {
  const [tab, setTab] = useState('map')
  const [menu, setMenu] = useState(false)
  const [draft, setDraft] = useState('')
  const [geoError, setGeoError] = useState(false)
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [locateMessage, setLocateMessage] = useState<string | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const [leafletMap, setLeafletMap] = useState<LeafletMap | null>(null)
  const dropped = useRef(false)
  const seen = useRef(new Set<string>())
  const codeRef = useRef<string | null>(null)
  const you = view.you.lat != null && view.you.lng != null ? { lat: view.you.lat, lng: view.you.lng } : null
  const movement = useSim({
    enabled: sim && view.phase !== 'ended',
    originLat: view.you.lat,
    originLng: view.you.lng,
    send: (lat, lng) => send({ type: 'location', lat, lng, accuracy: 5 }),
  })

  useEffect(() => {
    if (codeRef.current !== view.code) {
      codeRef.current = view.code
      seen.current = new Set(view.events.map((event) => event.id))
      dropped.current = false
      return
    }
    for (const event of view.events) {
      if (seen.current.has(event.id)) continue
      seen.current.add(event.id)
      if (event.tone === 'bad') buzz([24, 40, 24])
      else if (event.tone === 'warn') buzz(18)
      if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('Skulk', { body: event.text, silent: true })
      }
    }
  }, [view])

  useEffect(() => {
    if (view.phase === 'headstart' || view.phase === 'hunt') {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission()
    }
  }, [view.phase])

  useEffect(() => {
    if (!sim || dropped.current || view.you.lat != null) return
    dropped.current = true
    const angle = hashString(view.you.id) % 360
    const distance = view.you.side === 'hunter' ? 28 : Math.min(140, view.radiusM * 0.5)
    const spot = destination(view.settings.zoneLat, view.settings.zoneLng, angle, distance)
    send({ type: 'location', lat: spot.lat, lng: spot.lng, accuracy: 5 })
  }, [sim, send, view.radiusM, view.settings.zoneLat, view.settings.zoneLng, view.you.id, view.you.lat, view.you.side])

  useEffect(() => {
    if (sim) return
    const handle = { cancelled: false, id: null as string | null, browserId: null as number | null }
    const publish = (lat: number, lng: number, accuracy: number | null) => {
      if (handle.cancelled) return
      setGeoError(false)
      send({ type: 'location', lat, lng, accuracy: accuracy ?? undefined })
    }
    void (async () => {
      try {
        const { Geolocation } = await import('@capacitor/geolocation')
        const perm = await Geolocation.requestPermissions()
        const granted = perm.location === 'granted' || perm.coarseLocation === 'granted'
        if (!granted) throw new Error('denied')
        if (handle.cancelled) return
        handle.id = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 2000 },
          (position, err) => {
            if (err || !position) {
              if (!handle.cancelled) setGeoError(true)
              return
            }
            publish(position.coords.latitude, position.coords.longitude, position.coords.accuracy)
          },
        )
        if (handle.cancelled && handle.id) void Geolocation.clearWatch({ id: handle.id })
      } catch {
        if (handle.cancelled || !navigator.geolocation) {
          if (!handle.cancelled) setGeoError(true)
          return
        }
        handle.browserId = navigator.geolocation.watchPosition(
          (position) => publish(position.coords.latitude, position.coords.longitude, position.coords.accuracy),
          () => setGeoError(true),
          { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 },
        )
      }
    })()
    return () => {
      handle.cancelled = true
      if (handle.id) {
        void import('@capacitor/geolocation').then(({ Geolocation }) => {
          if (handle.id) void Geolocation.clearWatch({ id: handle.id })
        })
      }
      if (handle.browserId != null) navigator.geolocation.clearWatch(handle.browserId)
    }
  }, [sim, send])

  useEffect(() => {
    const id = requestAnimationFrame(() => mapRef.current?.invalidateSize())
    return () => cancelAnimationFrame(id)
  }, [tab])

  const headLeft = view.clock.headStartEndsAt != null ? Math.max(0, (view.clock.headStartEndsAt - now) / 1000) : 0
  const roundLeft = view.clock.roundEndsAt != null ? Math.max(0, (view.clock.roundEndsAt - now) / 1000) : 0
  const pingLeft = view.clock.nextPingAt != null ? Math.max(0, (view.clock.nextPingAt - now) / 1000) : null
  const shrinkLeft = view.clock.shrinkAt != null ? Math.max(0, (view.clock.shrinkAt - now) / 1000) : null
  const hunting = view.phase === 'hunt'
  const hiding = view.you.side === 'runner' && !view.you.caught
  const chasing = view.you.side === 'hunter' && !view.you.caught
  const recent = view.events.slice(-2)

  async function onFindMe() {
    setLocating(true)
    setLocateMessage(null)
    const result = await locateOnce()
    setLocating(false)
    if (!result.ok) {
      setLocateMessage(locateProblemMessage(result.problem))
      return
    }
    setHere({ lat: result.lat, lng: result.lng })
    const map = mapRef.current
    map?.flyTo([result.lat, result.lng], Math.max(map.getZoom(), 16), { duration: 0.75 })
    if (!sim) send({ type: 'location', lat: result.lat, lng: result.lng, accuracy: result.accuracy ?? undefined })
  }

  function sendRadio() {
    const text = draft.trim()
    if (!text) return
    send({ type: 'radio', text })
    setDraft('')
  }

  return (
    <div className="relative flex h-full flex-col" data-screen="map">
      <div className="relative z-0 min-h-0 flex-1 overflow-hidden">
        <ExpandableMap
          className={tab === 'map' ? 'absolute inset-0' : 'invisible absolute inset-0'}
          map={leafletMap}
          expandClassName="right-3 bottom-24"
          overlay={tab === 'map' ? (
            <>
              {locateMessage && (
                <p className="pointer-events-auto max-w-sm rounded-2xl bg-ink/95 px-3 py-2 text-center text-sm text-foam">{locateMessage}</p>
              )}
              <FindMeButton pending={locating} onClick={() => void onFindMe()} />
            </>
          ) : undefined}
        >
          {(frame) => (
            <MapCanvas
              center={{ lat: view.settings.zoneLat, lng: view.settings.zoneLng }}
              radiusM={view.radiusM}
              zoneEnabled={view.settings.zoneEnabled}
              shrinkWarning={view.clock.shrinkWarning}
              nextRadiusM={view.clock.nextRadiusM}
              markers={view.markers}
              now={now}
              followCenter={false}
              onMapClick={sim ? movement.walkTo : undefined}
              onExpand={sim || frame.open ? undefined : frame.expand}
              destination={movement.destinationPoint}
              you={you}
              here={here}
              onReady={(map) => { mapRef.current = map; setLeafletMap(map) }}
            />
          )}
        </ExpandableMap>
        {tab === 'radio' && (
          <div className="absolute inset-0 flex flex-col bg-ink">
            <div className="px-4 pt-24">
              <h2 className="font-display text-3xl">{view.you.side === 'hunter' ? 'Hunter radio' : 'Runner radio'}</h2>
              <p className="text-sm text-mist">{view.radioOpen ? 'The other side can’t read this.' : 'Radio is closed.'}</p>
            </div>
            <ul className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
              {view.radio.length === 0 && <li className="text-sm text-mist">Your team is quiet. Plans stay on this side.</li>}
              {view.radio.map((message) => (
                <li key={message.id} className={message.you ? 'text-right' : ''}>
                  <p className="text-xs text-mist">{message.you ? 'You' : message.name} · {formatAgo((now - message.at) / 1000)}</p>
                  <p className="mt-1 inline-block max-w-[85%] rounded-2xl bg-panel px-3 py-2 text-left text-sm">{message.text}</p>
                </li>
              ))}
            </ul>
            {view.radioOpen && (
              <form
                className="flex gap-2 border-t border-line p-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  sendRadio()
                }}
              >
                <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Say it plain" maxLength={180} aria-label="Radio message" />
                <Button type="submit">Send</Button>
              </form>
            )}
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 px-3 pt-[max(0.6rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto rounded-3xl border border-line/80 bg-ink/88 px-3 py-3 backdrop-blur-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] tracking-[0.14em] text-mist uppercase">
                  {view.you.caught ? 'Watching' : view.you.side === 'hunter' ? 'Hunter' : 'Runner'}
                  {view.practice ? ' · practice' : ''}
                </p>
                <p className="font-display text-4xl leading-none">
                  {view.phase === 'headstart' ? formatClock(headLeft) : formatClock(roundLeft)}
                </p>
                <p className="mt-1 text-xs text-mist">
                  {view.phase === 'headstart'
                    ? (hiding ? 'Hide. Hunters move when this hits zero.' : 'Head start. No snapshots yet.')
                    : `${view.runnersLeft} of ${view.runnersTotal} still out`}
                </p>
              </div>
              <div className="text-right text-xs text-mist">
                {view.phase === 'headstart' && <p>Round {formatClock(roundLeft)}</p>}
                {hunting && view.settings.pingIntervalSec > 0 && pingLeft != null && <p>Next ping {formatClock(pingLeft)}</p>}
                {hunting && view.settings.pingIntervalSec === 0 && <p>No pings</p>}
                {view.settings.zoneEnabled && <p>{formatMeters(view.radiusM)} circle</p>}
                {shrinkLeft != null && view.settings.shrinkEnabled && <p>Closes in {formatClock(shrinkLeft)}</p>}
              </div>
            </div>
          </div>
          {view.you.outForSec > 0 && hiding && (
            <p className="pointer-events-auto mt-2 rounded-2xl bg-alert px-3 py-2 text-sm text-ink">
              {view.you.revealed
                ? 'Hunters can see you live until you’re back inside.'
                : `You’re outside the circle · ${view.you.outForSec}s. At 30s they see you live.`}
            </p>
          )}
          {view.clock.shrinkWarning && view.clock.nextRadiusM && (
            <p className="pointer-events-auto mt-2 rounded-2xl bg-hunter px-3 py-2 text-sm text-ink">
              Circle closes to {formatMeters(view.clock.nextRadiusM)}. Get inside the new edge.
            </p>
          )}
          {view.pendingTag && (
            <div className="pointer-events-auto mt-2 rounded-2xl border border-alert bg-ink px-3 py-3">
              <p className="text-sm">{view.pendingTag.hunterName} says you’re tagged.</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button size="default" variant="danger" onClick={() => send({ type: 'tagAnswer', requestId: view.pendingTag!.id, accept: true })}>I got tagged</Button>
                <Button size="default" variant="secondary" onClick={() => send({ type: 'tagAnswer', requestId: view.pendingTag!.id, accept: false })}>Still free</Button>
              </div>
            </div>
          )}
          {recent.length > 0 && (
            <ul className="pointer-events-none mt-2 grid gap-1" aria-live="polite">
              {recent.map((event) => (
                <li key={event.id} className="truncate rounded-full bg-ink/80 px-3 py-1 text-xs text-mist">{event.text}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <footer className="relative z-30 max-h-[46%] overflow-y-auto border-t border-line bg-panel px-3 pt-3 pb-[max(0.7rem,env(safe-area-inset-bottom))]">
        <div className="chip-row">
          {view.roster.filter((person) => person.side === 'runner' && !person.left).map((person) => {
            const ping = view.markers.find((marker) => marker.id === person.id && (marker.kind === 'ping' || marker.kind === 'reveal'))
            return (
              <div key={person.id} className="rounded-2xl border border-line px-3 py-2 text-xs">
                <p className="font-medium text-foam">{person.name}</p>
                <p className="text-mist">
                  {person.caught ? 'Out' : person.revealed ? 'Live' : person.pingAgeSec != null ? formatAgo(person.pingAgeSec) : chasing ? 'No ping yet' : person.isYou ? 'You' : 'Hiding'}
                </p>
                {sim && chasing && ping && !person.caught && (
                  <button
                    type="button"
                    className="mt-1 text-hunter"
                    onClick={() => {
                      const spot = destination(ping.lat, ping.lng, 0, 6)
                      movement.place(spot.lat, spot.lng)
                      window.setTimeout(() => send({ type: 'tag', runnerId: person.id }), 400)
                    }}
                  >
                    Drop and tag
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {chasing && hunting && (
          <div className="mt-3 grid gap-2">
            {view.outgoingTag && <p className="text-sm text-mist">Waiting for {view.outgoingTag.runnerName} to confirm.</p>}
            {view.tagCandidates.map((candidate) => (
              <Button
                key={candidate.id}
                type="button"
                size="lg"
                onClick={() => {
                  if (you) movement.place(you.lat, you.lng)
                  send({ type: 'tag', runnerId: candidate.id })
                }}
              >
                Tag {candidate.name} · {candidate.distanceM} m
              </Button>
            ))}
            {view.tagCandidates.length === 0 && !view.outgoingTag && (
              <p className="text-xs text-mist">Tag in person, inside {view.tagRadiusM} m. They confirm it.</p>
            )}
          </div>
        )}
        {hiding && hunting && !view.pendingTag && (
          <div className="mt-3">
            <Button
              variant="danger"
              size="lg"
              disabled={!view.selfTag}
              onClick={() => send({ type: 'selfTag' })}
            >
              {view.selfTag ? `I got tagged · ${view.selfTag.hunterName} is ${view.selfTag.distanceM} m away` : `I got tagged`}
            </Button>
            {!view.selfTag && <p className="mt-1 text-xs text-mist">A hunter has to be within {view.tagRadiusM} m.</p>}
          </div>
        )}
        {view.you.caught && (
          <p className="mt-3 text-sm text-mist">
            {view.settings.spectator === 'off'
              ? 'You’re out. The map stays dark.'
              : view.settings.spectator === 'live'
                ? 'You’re out. You’re watching live.'
                : 'You’re out. You’re watching about a minute behind.'}
          </p>
        )}
        {geoError && !sim && (
          <button type="button" className="mt-3 text-left text-sm text-hunter" onClick={() => onSim(true)}>
            This phone isn’t sharing a location. Switch to on-screen movement.
          </button>
        )}
        {view.you.accuracy != null && view.you.accuracy > 40 && !sim && (
          <p className="mt-2 text-xs text-mist">This fix is fuzzy, about ±{Math.round(view.you.accuracy)} m.</p>
        )}

        {sim && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex gap-1">
              <Pad label="North" onPress={() => movement.nudge(0)}>N</Pad>
              <Pad label="West" onPress={() => movement.nudge(270)}>W</Pad>
              <Pad label="South" onPress={() => movement.nudge(180)}>S</Pad>
              <Pad label="East" onPress={() => movement.nudge(90)}>E</Pad>
            </div>
            <div className="text-right">
              <div className="chip-row justify-end">
                <button type="button" className="chip" aria-pressed={movement.mode === 'walk'} onClick={() => movement.setMode('walk')}>Walk</button>
                <button type="button" className="chip" aria-pressed={movement.mode === 'drop'} onClick={() => movement.setMode('drop')}>Drop</button>
              </div>
              <p className="mt-1 text-[11px] text-mist">Arrows move · tap the map</p>
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <Tabs value={tab} onValueChange={setTab} className="flex-1">
            <TabsList>
              <TabsTrigger value="map"><MapIcon className="mr-1 inline size-4" />Map</TabsTrigger>
              <TabsTrigger value="radio"><RadioIcon className="mr-1 inline size-4" />Radio</TabsTrigger>
            </TabsList>
          </Tabs>
          <button type="button" className="grid size-11 place-items-center rounded-full border border-line" aria-label="Round menu" onClick={() => setMenu(true)}>
            <Ellipsis className="size-5" />
          </button>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-full border border-line"
            aria-label="Show the circle"
            onClick={() => mapRef.current?.fitBounds(boundsFromRadius(view.settings.zoneLat, view.settings.zoneLng, Math.max(view.radiusM, 80)), { padding: [48, 48] })}
          >
            <LocateFixed className="size-5" />
          </button>
        </div>
      </footer>

      <Dialog open={menu} onOpenChange={setMenu}>
        <DialogContent>
          <DialogTitle>This round</DialogTitle>
          <DialogDescription>{view.code}</DialogDescription>
          <label className="mt-4 flex items-center justify-between gap-3 text-sm">
            On-screen movement
            <Switch checked={sim} onCheckedChange={onSim} aria-label="On-screen movement" />
          </label>
          <div className="mt-4 max-h-48 space-y-2 overflow-y-auto">
            {[...view.events].reverse().map((event) => (
              <p key={event.id} className="text-sm text-mist">{event.text}</p>
            ))}
          </div>
          <div className="mt-4 grid gap-2">
            {view.you.isHost && (
              <Button variant="secondary" onClick={() => { send({ type: 'end' }); setMenu(false) }}>End the round</Button>
            )}
            <Button variant="danger" onClick={onLeave}>Leave the round</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Pad({ children, label, onPress }: { children: string; label: string; onPress: () => void }) {
  return (
    <button type="button" aria-label={label} onClick={onPress} className="grid size-11 place-items-center rounded-2xl border border-line bg-ink text-sm">
      {children}
    </button>
  )
}
