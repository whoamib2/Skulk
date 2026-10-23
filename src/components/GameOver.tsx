import { formatClock, formatMeters } from '@shared/format'
import type { ClientView } from '@shared/types'
import { MapCanvas } from '@/components/MapCanvas'
import { Button } from '@/components/ui/button'

export function GameOver({ view, now, onDone }: { view: ClientView; now: number; onDone: () => void }) {
  const result = view.result
  const title = result?.winner === 'runners' ? 'Runners win' : result?.winner === 'hunters' ? 'Hunters win' : 'Called off'
  const detail = result?.reason === 'time'
    ? 'Time ran out with someone still free.'
    : result?.reason === 'all_caught'
      ? 'Every runner was tagged.'
      : 'The host ended it before the clock did.'

  return (
    <div className="flex h-full flex-col overflow-y-auto" data-screen="game-over">
      {view.settings.zoneEnabled && (
        <div className="h-48 shrink-0">
          <MapCanvas
            center={{ lat: view.settings.zoneLat, lng: view.settings.zoneLng }}
            radiusM={view.radiusM}
            zoneEnabled
            shrinkWarning={false}
            nextRadiusM={null}
            markers={[]}
            now={now}
            followCenter={false}
          />
        </div>
      )}
      <div className="px-5 pt-6 pb-8">
        <p className="text-xs tracking-[0.16em] text-mist uppercase">Round over · {view.code}</p>
        <h1 className={`font-display mt-2 text-5xl leading-none ${result?.winner === 'hunters' ? 'text-hunter' : result?.winner === 'runners' ? 'text-runner' : 'text-foam'}`}>
          {title}
        </h1>
        <p className="mt-3 text-mist">{detail}</p>
        <dl className="mt-6 grid grid-cols-3 gap-2 text-center">
          <Stat k="Played" v={formatClock(result?.elapsedSec ?? 0)} />
          <Stat k="Pings" v={String(result?.pingCount ?? 0)} />
          <Stat k="Tags" v={String(result?.catches.length ?? 0)} />
        </dl>
        <section className="mt-6">
          <h2 className="text-sm text-mist">What happened</h2>
          <ul className="mt-2 grid gap-2 text-sm">
            {result?.catches.map((catchRecord) => (
              <li key={`${catchRecord.runnerName}-${catchRecord.atSec}`} className="rounded-2xl bg-panel px-3 py-2">
                {catchRecord.hunterName} tagged {catchRecord.runnerName}
                <span className="text-mist"> · {formatClock(catchRecord.atSec)}</span>
              </li>
            ))}
            {result?.survivors.map((name) => (
              <li key={name} className="rounded-2xl bg-panel px-3 py-2">{name} was still free.</li>
            ))}
            {result?.left.map((name) => (
              <li key={name} className="rounded-2xl bg-panel px-3 py-2 text-mist">{name} left.</li>
            ))}
            {result && result.catches.length === 0 && result.survivors.length === 0 && result.left.length === 0 && (
              <li className="text-mist">Nobody was tagged.</li>
            )}
          </ul>
        </section>
        {view.settings.zoneEnabled && (
          <p className="mt-4 text-xs text-mist">Circle finished at {formatMeters(view.radiusM)}.</p>
        )}
        <Button className="mt-6" size="lg" onClick={onDone}>Back to the start</Button>
      </div>
    </div>
  )
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-2xl bg-panel px-2 py-3">
      <dt className="text-[11px] text-mist">{k}</dt>
      <dd className="font-display text-2xl">{v}</dd>
    </div>
  )
}
