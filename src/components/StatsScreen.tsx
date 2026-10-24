import runnerMark from '@/assets/brand/runner.svg'
import { formatClock, formatMeters } from '@shared/format'
import { t } from '@/lib/copy'
import { loadStats } from '@/lib/deviceStore'

export function StatsScreen({ onDone }: { onDone: () => void }) {
  const stats = loadStats()
  const fresh = stats.roundsPlayed === 0
  return (
    <div className="flex h-full flex-col bg-ink" data-screen="stats">
      <header className="grid grid-cols-[4.5rem_1fr_4.5rem] items-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span />
        <h1 className="text-center text-base font-medium">{t('statsTitle')}</h1>
        <button type="button" className="text-right text-base font-medium text-runner" onClick={onDone}>{t('done')}</button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-8">
        <section className="relative overflow-hidden rounded-[28px] bg-runner px-5 py-6 text-ink">
          <img src={runnerMark} alt="" className="pointer-events-none absolute -top-6 -right-8 h-52 w-52 opacity-25" />
          <p className="relative text-sm font-medium">{t('statsEyebrow')}</p>
          <h2 className="font-display relative mt-3 text-5xl leading-none">{t('statsHeadline')}</h2>
          <p className="relative mt-4 max-w-[16rem] text-sm font-medium">{fresh ? t('statsBody') : t('distanceHint')}</p>
        </section>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Tile label={t('roundsPlayed')} value={String(stats.roundsPlayed)} hint={t('roundsPlayedHint')} />
          <Tile label={t('roundsWon')} value={String(stats.roundsWon)} hint={t('roundsWonHint')} />
          <Tile
            label={t('neverCaught')}
            value={stats.neverCaught > 0 ? String(stats.neverCaught) : '—'}
            hint={t('neverCaughtHint')}
            accent={stats.neverCaught === 0}
          />
          <Tile
            label={t('longestRun')}
            value={stats.longestRunSec > 0 ? formatClock(stats.longestRunSec) : '—'}
            hint={t('longestRunHint')}
          />
        </div>
        <Tile
          className="mt-3"
          label={t('distance')}
          value={formatMeters(stats.distanceM)}
          hint={t('distanceHint')}
        />
      </div>
    </div>
  )
}

function Tile({ label, value, hint, accent = false, className = '' }: { label: string; value: string; hint: string; accent?: boolean; className?: string }) {
  return (
    <div className={`rounded-[24px] px-4 py-4 ${accent ? 'bg-runner/15' : 'bg-panel'} ${className}`}>
      <p className="text-sm text-mist">{label}</p>
      <p className="font-display mt-2 text-5xl leading-none">{value}</p>
      <p className={`mt-3 text-sm ${accent ? 'text-runner' : 'text-mist'}`}>{hint}</p>
    </div>
  )
}
