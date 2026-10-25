import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import { Check, Copy, Loader2, Plus, X } from 'lucide-react'
import { boundsFromRadius } from '@shared/geo'
import { formatDuration } from '@shared/format'
import { lobbyFallbackMessage, locateProblemMessage } from '@shared/locate'
import {
  FREE_PLAYER_CAP,
  FREE_RADIUS_M,
  PRO_PLAYER_CAP,
  PRO_PLAYER_MESSAGE,
  durationIsPro,
  headIsPro,
  isFreeSettings,
  pingIsPro,
} from '@shared/pro'
import { clampSettings, describeZone } from '@shared/rules'
import { publicJoinUrl } from '@shared/serverUrl'
import type { ClientMessage, ClientView, RoleChoice, Settings } from '@shared/types'
import { ExpandableMap } from '@/components/ExpandableMap'
import { FindMeButton } from '@/components/FindMeButton'
import { MapCanvas } from '@/components/MapCanvas'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { t } from '@/lib/copy'
import { blockPlayer, loadBlocks, unblockPlayer } from '@/lib/deviceStore'
import { locateOnce } from '@/lib/locate'
import { usePro } from '@/lib/usePro'

const DURATIONS = [
  ['15 min', 15 * 60],
  ['30 min', 30 * 60],
  ['45 min', 45 * 60],
  ['1 min', 60],
  ['60 min', 60 * 60],
  ['90 min', 90 * 60],
  ['3 h', 3 * 3600],
] as const

const HEADS = [
  ['None', 0],
  ['15 s', 15],
  ['30 s', 30],
  ['1 min', 60],
  ['3 min', 180],
  ['5 min', 300],
  ['10 min', 600],
  ['15 min', 900],
] as const

const PINGS = [
  ['Off', 0],
  ['20 s', 20],
  ['1 min', 60],
  ['2 min', 120],
  ['5 min', 300],
  ['10 min', 600],
  ['15 min', 900],
  ['30 min', 1800],
] as const

const SHRINKS = [
  ['Off', 0],
  ['1 min', 60],
  ['5 min', 300],
  ['10 min', 600],
  ['15 min', 900],
] as const

type UpsellKind = 'players' | 'time' | 'sprint' | 'circle' | 'hunters' | 'generic'

const UPSELL: Record<UpsellKind, { title: string; body: string }> = {
  players: {
    title: 'Bigger rounds are in Skulk Pro',
    body: `A free round fits ${FREE_PLAYER_CAP} players, including you. Skulk Pro fits ${PRO_PLAYER_CAP}. Joining a round stays free.`,
  },
  time: {
    title: 'That clock is in Skulk Pro',
    body: 'Free rounds are 15, 30, or 45 minutes, with a head start of none, 1 minute, or 3. Skulk Pro opens the other clocks.',
  },
  sprint: {
    title: 'Sprint is in Skulk Pro',
    body: 'Sprint is a one-minute round with a short head start, fast pings, and a smaller circle. Classic stays free.',
  },
  circle: {
    title: 'A custom circle is in Skulk Pro',
    body: `The free circle stays on, at ${FREE_RADIUS_M} meters. You can still drag it to wherever you are playing. Skulk Pro can resize it, turn it off, or let it close.`,
  },
  hunters: {
    title: 'That hunter tool is in Skulk Pro',
    body: 'Free hunters get a ping every 5 minutes. Skulk Pro can ping sooner, turn pings off, or close the circle.',
  },
  generic: {
    title: 'That option is in Skulk Pro',
    body: 'Joining and playing stay free. Skulk Pro is a one-time unlock for the host.',
  },
}

export function Lobby({
  view,
  now,
  send,
  serverUrl,
  native,
  serverLimit,
  onServerLimitClear,
}: {
  view: ClientView
  now: number
  send: (message: ClientMessage) => void
  serverUrl: string
  native: boolean
  serverLimit: string | null
  onServerLimitClear: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [dragRadius, setDragRadius] = useState<number | null>(null)
  const [map, setMap] = useState<LeafletMap | null>(null)
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(view.you.isHost)
  const [locateMessage, setLocateMessage] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(!view.you.isHost)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [localUpsell, setLocalUpsell] = useState<UpsellKind | null>(null)
  const [seenLimit, setSeenLimit] = useState<string | null>(null)
  const pro = usePro()
  const locked = view.you.isHost && !view.practice && !pro.owned
  const serverKind: UpsellKind | null = serverLimit && serverLimit !== seenLimit && view.you.isHost && !view.practice
    ? (serverLimit === PRO_PLAYER_MESSAGE ? 'players' : 'generic')
    : null
  const upsell = pro.owned ? null : (localUpsell ?? serverKind)
  const blockSync = useRef(new Set<string>())
  const radius = dragRadius ?? view.settings.zoneRadiusM
  const pending = view.roster.find((person) => person.id === pendingId && !person.isYou) ?? null
  const link = publicJoinUrl(serverUrl, view.code, native, location.origin)
  const mapCenter = here ?? { lat: view.settings.zoneLat, lng: view.settings.zoneLng }

  useEffect(() => {
    if (!view.you.isHost) return
    let alive = true
    void locateOnce().then((result) => {
      if (!alive) return
      setLocating(false)
      setMapReady(true)
      if (!result.ok) {
        setLocateMessage(lobbyFallbackMessage(result.problem))
        return
      }
      setHere({ lat: result.lat, lng: result.lng })
      send({ type: 'zone', lat: result.lat, lng: result.lng })
    })
    return () => {
      alive = false
    }
  }, [send, view.you.isHost])

  useEffect(() => {
    const local = new Set(loadBlocks().map((player) => player.id))
    for (const person of view.roster) {
      if (person.isYou) continue
      const wantBlocked = local.has(person.id)
      const blockedNow = person.blockedByYou === true
      if (wantBlocked === blockedNow) {
        blockSync.current.delete(person.id)
        continue
      }
      if (blockSync.current.has(person.id)) continue
      blockSync.current.add(person.id)
      send({ type: wantBlocked ? 'block' : 'unblock', playerId: person.id })
    }
  }, [send, view.roster])

  function confirmBlock() {
    if (!pending) return
    if (pending.blockedByYou) {
      unblockPlayer(pending.id)
      send({ type: 'unblock', playerId: pending.id })
    } else {
      blockPlayer({ id: pending.id, name: pending.name })
      send({ type: 'block', playerId: pending.id })
    }
    blockSync.current.delete(pending.id)
    setPendingId(null)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  async function onFindMe() {
    setLocating(true)
    setLocateMessage(null)
    const result = await locateOnce()
    setLocating(false)
    setMapReady(true)
    if (!result.ok) {
      setLocateMessage(locateProblemMessage(result.problem))
      return
    }
    setHere({ lat: result.lat, lng: result.lng })
    if (view.you.isHost) send({ type: 'zone', lat: result.lat, lng: result.lng })
    map?.flyTo([result.lat, result.lng], Math.max(map.getZoom(), 16), { duration: 0.75 })
  }

  function closeUpsell() {
    setLocalUpsell(null)
    if (serverLimit) setSeenLimit(serverLimit)
    onServerLimitClear()
  }

  function commit(partial: Partial<Settings>, kind: UpsellKind) {
    setDragRadius(null)
    if (locked && !isFreeSettings(clampSettings({ ...view.settings, ...partial }))) {
      setLocalUpsell(kind)
      return
    }
    send({ type: 'settings', settings: partial })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.16em] text-mist uppercase">{view.practice ? 'Practice lobby' : 'Lobby'}</p>
            <h1 className="font-display text-4xl">{view.code}</h1>
          </div>
          <button type="button" onClick={() => void copyLink()} className="flex h-11 items-center gap-2 rounded-full border border-line px-3 text-sm">
            {copied ? <Check className="size-4 text-runner" /> : <Copy className="size-4" />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
        <p className="mt-1 text-sm text-mist">Share {link.replace(/^https?:\/\//, '')}</p>

        {mapReady ? (
          <ExpandableMap
            className="relative mt-4 h-56 overflow-hidden rounded-3xl border border-line"
            map={map}
            overlay={
              <>
                {locateMessage && (
                  <p className="pointer-events-auto max-w-sm rounded-2xl bg-ink/95 px-3 py-2 text-center text-sm text-foam">{locateMessage}</p>
                )}
                <FindMeButton pending={locating} onClick={() => void onFindMe()} />
              </>
            }
            expandedControls={view.settings.zoneEnabled ? (
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span>{view.you.isHost ? `Circle size · ${describeZone(radius, true)}` : describeZone(view.settings.zoneRadiusM, true)}</span>
                  <button
                    type="button"
                    className="text-foam"
                    onClick={() => map?.fitBounds(boundsFromRadius(view.settings.zoneLat, view.settings.zoneLng, radius), { padding: [24, 24] })}
                  >
                    Show circle
                  </button>
                </div>
                {view.you.isHost && (
                  <Slider
                    min={150}
                    max={3000}
                    step={10}
                    value={[radius]}
                    onValueChange={(value) => setDragRadius(value[0] ?? radius)}
                    onValueCommit={(value) => commit({ zoneRadiusM: value[0] ?? radius }, 'circle')}
                  />
                )}
              </div>
            ) : undefined}
          >
            {(frame) => (
              <MapCanvas
                center={mapCenter}
                radiusM={view.settings.zoneEnabled ? radius : view.radiusM}
                zoneEnabled={view.settings.zoneEnabled}
                shrinkWarning={false}
                nextRadiusM={null}
                markers={[]}
                now={now}
                followCenter={view.you.isHost}
                here={here}
                onZoneCenter={view.you.isHost ? (lat, lng) => send({ type: 'zone', lat, lng }) : undefined}
                onExpand={frame.open ? undefined : frame.expand}
                onReady={setMap}
              />
            )}
          </ExpandableMap>
        ) : (
          <div className="relative mt-4 grid h-56 place-items-center gap-2 overflow-hidden rounded-3xl border border-line text-sm text-mist">
            <Loader2 className="size-6 animate-spin text-foam" />
            Finding you…
          </div>
        )}
        <div className="mt-2 flex items-center justify-between text-xs text-mist">
          <span>{view.you.isHost ? 'Drag the map. The circle stays in the middle. Tap it to fill the screen.' : 'The host is placing the circle. Tap the map to fill the screen.'}</span>
          <button
            type="button"
            className="text-foam"
            onClick={() => map?.fitBounds(boundsFromRadius(view.settings.zoneLat, view.settings.zoneLng, view.settings.zoneRadiusM), { padding: [24, 24] })}
          >
            Show circle
          </button>
        </div>

        <section className="mt-5">
          <h2 className="text-sm text-mist">Your side</h2>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(['hunter', 'runner', 'random'] as RoleChoice[]).map((role) => (
              <button
                key={role}
                type="button"
                aria-pressed={view.you.preferredRole === role}
                onClick={() => send({ type: 'prefs', role })}
                className={`min-h-16 rounded-2xl border px-2 py-2 text-left ${view.you.preferredRole === role ? 'border-foam bg-foam text-ink' : 'border-line bg-panel'}`}
              >
                <span className="block text-sm font-medium capitalize">{role}</span>
                <span className={`mt-1 block text-[11px] leading-tight ${view.you.preferredRole === role ? 'text-ink/70' : 'text-mist'}`}>
                  {role === 'hunter' ? 'Snapshots, then you run.' : role === 'runner' ? 'Hide until time runs out.' : 'Fills the short side.'}
                </span>
              </button>
            ))}
          </div>
          {view.you.preferredRole === 'random' && view.roster.find((person) => person.isYou)?.likelySide && (
            <p className="mt-2 text-sm text-mist">
              Right now you’d {view.roster.find((person) => person.isYou)?.likelySide === 'hunter' ? 'hunt' : 'run'}.
            </p>
          )}
        </section>

        <section className="mt-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm text-mist">Players · {view.roster.length}</h2>
            {view.you.isHost && (
              <button
                type="button"
                className="flex items-center gap-1 text-sm text-foam"
                onClick={() => {
                  if (locked && view.roster.length >= FREE_PLAYER_CAP) {
                    setLocalUpsell('players')
                    return
                  }
                  send({ type: 'addBot' })
                }}
              >
                <Plus className="size-4" /> Practice player
              </button>
            )}
          </div>
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line">
            {view.roster.map((person) => (
              <li key={person.id} className="flex items-center gap-2 px-3 py-2">
                {person.isYou ? (
                  <PlayerLine person={person} />
                ) : (
                  <button
                    type="button"
                    className="min-w-0 flex-1 rounded-xl py-1 text-left"
                    aria-label={person.blockedByYou === true ? `${t('unblock')} ${person.name}` : `${t('block')} ${person.name}`}
                    onClick={() => setPendingId(person.id)}
                  >
                    <PlayerLine person={person} host={view.you.isHost} />
                  </button>
                )}
                {view.you.isHost && !person.isYou && (
                  <button type="button" className="rounded-full p-2 text-mist" aria-label={`Remove ${person.name}`} onClick={() => send({ type: 'kick', playerId: person.id })}>
                    <X className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-mist">Tap a player to block them. Their radio stays hidden from you, and the host is told.</p>
          {locked && (
            <p className="mt-1 text-xs text-mist">A free round fits {FREE_PLAYER_CAP} players. Skulk Pro fits {PRO_PLAYER_CAP}.</p>
          )}
        </section>

        <section className="mt-5">
          <h2 className="text-sm text-mist">Rules</h2>
          {view.you.isHost ? (
            <div className="mt-3 grid gap-4">
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => commit({ durationSec: 60, headStartSec: 15, pingIntervalSec: 20, zoneRadiusM: 220 }, 'sprint')}
                >
                  {locked ? 'Sprint · Pro' : 'Sprint'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => commit({ durationSec: 45 * 60, headStartSec: 3 * 60, pingIntervalSec: 5 * 60, zoneRadiusM: 400, shrinkEnabled: false, spectator: 'delayed' }, 'generic')}
                >
                  Classic
                </Button>
              </div>
              <Field label="Round length">
                <Chips options={DURATIONS} value={view.settings.durationSec} locked={locked} proOption={durationIsPro} onPick={(durationSec) => commit({ durationSec }, 'time')} />
              </Field>
              <Field label="Head start">
                <Chips options={HEADS} value={view.settings.headStartSec} locked={locked} proOption={headIsPro} onPick={(headStartSec) => commit({ headStartSec }, 'time')} />
              </Field>
              <Field label="Ping every">
                <Chips options={PINGS} value={view.settings.pingIntervalSec} locked={locked} proOption={pingIsPro} onPick={(pingIntervalSec) => commit({ pingIntervalSec }, 'hunters')} />
              </Field>
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm">Play circle</span>
                <Switch checked={view.settings.zoneEnabled} onCheckedChange={(zoneEnabled) => commit({ zoneEnabled }, 'circle')} aria-label="Play circle" />
              </label>
              {view.settings.zoneEnabled && (
                <Field label={`Size · ${describeZone(radius, true)}`}>
                  <Slider
                    min={150}
                    max={3000}
                    step={10}
                    value={[radius]}
                    onValueChange={(value) => setDragRadius(value[0] ?? radius)}
                    onValueCommit={(value) => commit({ zoneRadiusM: value[0] ?? radius }, 'circle')}
                  />
                </Field>
              )}
              <Field label="Circle closes">
                <Chips
                  options={SHRINKS}
                  value={view.settings.shrinkEnabled ? view.settings.shrinkEverySec : 0}
                  locked={locked}
                  proOption={(every) => every > 0}
                  onPick={(every) => commit({ shrinkEnabled: every > 0, shrinkEverySec: every || view.settings.shrinkEverySec }, 'hunters')}
                />
                <p className="text-xs text-mist">Each close tightens the circle to 75%, with a warning before it moves.</p>
              </Field>
              <Field label="After a tag">
                <div className="chip-row">
                  {([
                    ['delayed', 'A minute behind'],
                    ['live', 'Watch live'],
                    ['off', 'No map'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className="chip"
                      aria-pressed={view.settings.spectator === value}
                      onClick={() => commit({ spectator: value }, 'generic')}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          ) : (
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <Stat k="Round" v={formatDuration(view.settings.durationSec)} />
              <Stat k="Head start" v={view.settings.headStartSec ? formatDuration(view.settings.headStartSec) : 'None'} />
              <Stat k="Ping" v={view.settings.pingIntervalSec ? formatDuration(view.settings.pingIntervalSec) : 'Off'} />
              <Stat k="Circle" v={describeZone(view.settings.zoneRadiusM, view.settings.zoneEnabled)} />
            </dl>
          )}
          <p className="mt-3 text-xs text-mist">Play where you can see traffic, and stay off private property.</p>
        </section>
      </div>
      <div className="border-t border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {view.canStart.warning && <p className="mb-2 text-sm text-glow">{view.canStart.warning}</p>}
        {view.canStart.reason && <p className="mb-2 text-sm text-mist">{view.canStart.reason}</p>}
        {view.you.isHost ? (
          <Button size="lg" disabled={!view.canStart.ok} onClick={() => send({ type: 'start' })}>Start the round</Button>
        ) : (
          <p className="py-3 text-center text-sm text-mist">Waiting for the host to start.</p>
        )}
      </div>
      <Dialog open={pending != null} onOpenChange={(open) => { if (!open) setPendingId(null) }}>
        <DialogContent>
          <DialogTitle>{pending?.blockedByYou ? t('unblockTitle') : t('blockTitle')}</DialogTitle>
          <DialogDescription>
            {pending ? `${pending.name}. ` : ''}
            {pending?.blockedByYou ? t('unblockBody') : t('blockBody')}
          </DialogDescription>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button variant="secondary" size="lg" onClick={() => setPendingId(null)}>{t('cancel')}</Button>
            <Button size="lg" onClick={confirmBlock}>{pending?.blockedByYou ? t('unblock') : t('block')}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={upsell != null} onOpenChange={(open) => { if (!open) closeUpsell() }}>
        <DialogContent data-upsell={upsell ?? 'closed'}>
          <DialogTitle>{upsell ? UPSELL[upsell].title : 'Skulk Pro'}</DialogTitle>
          <DialogDescription>{upsell ? UPSELL[upsell].body : ''}</DialogDescription>
          {pro.price && <p className="mt-3 text-sm text-mist">Google Play lists it at {pro.price}.</p>}
          <div className={`mt-5 grid gap-2 ${pro.billing && !pro.owned ? 'grid-cols-2' : ''}`}>
            <Button variant="secondary" size="lg" onClick={closeUpsell}>Not now</Button>
            {pro.billing && !pro.owned && (
              <Button size="lg" disabled={pro.busy} onClick={() => void pro.buy()}>Go Pro</Button>
            )}
          </div>
          {!pro.billing && (
            <p className="mt-3 text-sm text-mist">You can unlock it in the Android app. Invited players never need to.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PlayerLine({
  person,
  host = false,
}: {
  person: ClientView['roster'][number]
  host?: boolean
}) {
  const flags = Array.isArray(person.flaggedBy) ? person.flaggedBy : []
  return (
    <div className={host || person.isYou ? 'min-w-0 flex-1' : undefined}>
      <p className="text-sm">
        {person.name}
        {person.isYou ? ' · you' : ''}
        {person.isHost ? ' · host' : ''}
        {person.isBot ? ' · bot' : ''}
        {!person.connected && !person.isBot ? ' · away' : ''}
        {person.blockedByYou ? ` · ${t('blocked')}` : ''}
      </p>
      <p className="text-xs text-mist capitalize">
        {person.preferredRole}
        {person.preferredRole === 'random' && person.likelySide ? ` · would ${person.likelySide === 'hunter' ? 'hunt' : 'run'}` : ''}
      </p>
      {host && flags.length > 0 && (
        <p className="text-xs text-glow">{t('flaggedBy')} {flags.join(', ')}</p>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <span className="text-sm">{label}</span>
      {children}
    </div>
  )
}

function Chips({
  options,
  value,
  onPick,
  locked = false,
  proOption,
}: {
  options: readonly (readonly [string, number])[]
  value: number
  onPick: (value: number) => void
  locked?: boolean
  proOption?: (value: number) => boolean
}) {
  return (
    <div className="chip-row">
      {options.map(([label, option]) => (
        <button key={label} type="button" className="chip" aria-pressed={value === option} onClick={() => onPick(option)}>
          {locked && proOption?.(option) ? `${label} · Pro` : label}
        </button>
      ))}
    </div>
  )
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-2xl bg-panel px-3 py-2">
      <dt className="text-xs text-mist">{k}</dt>
      <dd>{v}</dd>
    </div>
  )
}
