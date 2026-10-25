import { useState } from 'react'
import { ChartColumn, Settings } from 'lucide-react'
import { openInAppIntent } from '@shared/appLink'
import { DEFAULT_SERVER_URL, privacyPageUrl, serverUrlProblem } from '@shared/serverUrl'
import { cleanName } from '@shared/words'
import hero from '@/assets/brand/art1.svg'
import { Wordmark } from '@/components/Wordmark'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { loadName } from '@/lib/session'
import { SettingsScreen } from '@/components/SettingsScreen'
import { StatsScreen } from '@/components/StatsScreen'

type Sheet = 'host' | 'practice' | 'join' | 'rules' | null
type Panel = 'stats' | 'settings' | null

export function Home({
  error,
  busy,
  sim,
  onSim,
  prefillCode,
  serverUrl,
  onServerUrl,
  native,
  onCreate,
  onJoin,
}: {
  error: string | null
  busy: boolean
  sim: boolean
  onSim: (on: boolean) => void
  prefillCode: string
  serverUrl: string
  onServerUrl: (url: string) => void
  native: boolean
  onCreate: (name: string, practice: boolean) => void
  onJoin: (name: string, code: string) => void
}) {
  const [sheet, setSheet] = useState<Sheet>(prefillCode ? 'join' : null)
  const [panel, setPanel] = useState<Panel>(null)
  const [name, setName] = useState(loadName())
  const [code, setCode] = useState(prefillCode)
  const [localError, setLocalError] = useState<string | null>(null)

  function submit() {
    const cleaned = cleanName(name)
    if (!cleaned) {
      setLocalError('Use 2–16 letters, numbers, or spaces.')
      return
    }
    setLocalError(null)
    if (sheet !== 'practice') {
      const problem = serverUrlProblem(serverUrl, native)
      if (problem) {
        setLocalError(problem)
        return
      }
    }
    if (sheet === 'join') {
      const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, '')
      if (normalized.length < 4) {
        setLocalError('Enter the round code.')
        return
      }
      onJoin(cleaned, normalized)
      return
    }
    onCreate(cleaned, sheet === 'practice')
  }

  if (panel === 'stats') return <StatsScreen onDone={() => setPanel(null)} />
  if (panel === 'settings') {
    return (
      <SettingsScreen
        serverUrl={serverUrl}
        native={native}
        onDone={() => {
          setName(loadName())
          setPanel(null)
        }}
      />
    )
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-8">
      <div className="flex items-center justify-between gap-3">
        <Wordmark />
        <div className="flex items-center gap-1">
          <button type="button" className="grid size-10 place-items-center rounded-full text-foam" aria-label="Your stats" onClick={() => setPanel('stats')}>
            <ChartColumn className="size-5" />
          </button>
          <button type="button" className="grid size-10 place-items-center rounded-full text-foam" aria-label="Settings" onClick={() => setPanel('settings')}>
            <Settings className="size-5" />
          </button>
          <button type="button" className="px-1 text-sm text-mist" onClick={() => setSheet('rules')}>Rules</button>
        </div>
      </div>
      <img
        src={hero}
        alt="A coral runner sprinting past a lit window while a mint hider peeks from a tree"
        className="mt-5 w-full rounded-3xl"
      />
      <p className="mt-6 text-xs tracking-[0.18em] text-mist uppercase">On foot</p>
      <h1 className="font-display mt-2 text-5xl leading-none text-foam">Hide on your feet.</h1>
      <p className="mt-4 max-w-sm text-base text-mist">
        Runners scatter inside a circle. Hunters don’t get a live dot. Every few minutes the map blinks, and then they have to guess.
      </p>
      {error && <p className="mt-4 rounded-2xl border border-alert/40 bg-alert/10 px-3 py-2 text-sm text-foam">{error}</p>}
      <div className="mt-8 grid gap-3">
        {!native && sheet !== 'join' && <OpenInApp code={prefillCode} />}
        <Button size="lg" onClick={() => setSheet('host')} disabled={busy}>Host a round</Button>
        <Button size="lg" variant="secondary" onClick={() => setSheet('join')} disabled={busy}>Join with a code</Button>
        <Button size="lg" variant="ghost" onClick={() => setSheet('practice')} disabled={busy}>Practice on this phone</Button>
      </div>
      <label className="mt-6 grid gap-2 rounded-2xl border border-line bg-panel px-4 py-3">
        <span>
          <span className="block text-sm">Game server</span>
          <span className="block text-xs text-mist">
            Host and join use this address. It’s filled in with the public server, and you can change it. Leave it blank in a browser to use the site you’re on. Practice on this phone ignores it.
          </span>
        </span>
        <Input
          value={serverUrl}
          onChange={(event) => onServerUrl(event.target.value)}
          placeholder={DEFAULT_SERVER_URL}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="url"
          aria-label="Game server"
        />
      </label>
      <label className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-line bg-panel px-4 py-3">
        <span>
          <span className="block text-sm">On-screen movement</span>
          <span className="block text-xs text-mist">Walk the map with taps and arrow keys. For trying a round indoors.</span>
        </span>
        <Switch checked={sim} onCheckedChange={onSim} aria-label="On-screen movement" />
      </label>
      <ol className="mt-8 grid gap-4 text-sm">
        <Step n="1" title="Set the circle" body="The host drops a circle on the map and shares a six-character code. A free round uses a 400 m circle." />
        <Step n="2" title="Pick a side" body="Hunter, runner, or random. Random fills whichever side is short. A round needs three players and never more hunters than runners." />
        <Step n="3" title="Scatter" body="Runners get a head start inside the circle. Hunters wait. No snapshots yet." />
        <Step n="4" title="Hunt by memory" body="Each ping shows where a runner was, and how long ago. Tag in person, within 15 m. They confirm. If anyone is still free at the end, the runners win." />
      </ol>
      <p className="mt-8 text-xs text-mist">
        Play where you can see traffic, and stay off private property.
        {native
          ? ' Practice runs on this phone. A hosted round needs the server above, and location permission when you are really walking.'
          : ' Add Skulk to your home screen for a full-screen round.'}
        {' '}
        <a className="text-foam underline" href={privacyPageUrl(serverUrl, native, window.location.origin)}>Privacy</a>
      </p>

      <Dialog open={sheet === 'host' || sheet === 'practice' || sheet === 'join'} onOpenChange={(open) => { if (!open) setSheet(null) }}>
        <DialogContent>
          <DialogTitle>
            {sheet === 'join' ? 'Join a round' : sheet === 'practice' ? 'Practice round' : 'Host a round'}
          </DialogTitle>
          <DialogDescription>
            {sheet === 'practice'
              ? 'Four bots fill the lobby on this phone. No server. You still start the clock.'
              : sheet === 'join'
                ? 'Ask the host for the code, or open their link.'
                : 'You’ll land in the lobby with the code ready to share.'}
          </DialogDescription>
          {!native && sheet === 'join' && (
            <div className="mt-5">
              <OpenInApp code={code || prefillCode} />
            </div>
          )}
          <form
            className="mt-5 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            {sheet === 'join' && (
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="Code"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={6}
                aria-label="Round code"
                className="tracking-[0.3em] uppercase"
              />
            )}
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              autoComplete="nickname"
              maxLength={16}
              aria-label="Your name"
            />
            {localError && <p className="text-sm text-alert">{localError}</p>}
            <Button type="submit" size="lg" disabled={busy}>{busy ? 'Connecting…' : sheet === 'join' ? 'Join' : 'Continue'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={sheet === 'rules'} onOpenChange={(open) => { if (!open) setSheet(null) }}>
        <DialogContent>
          <DialogTitle>How a round works</DialogTitle>
          <DialogDescription>The phone keeps the clock. People do the running.</DialogDescription>
          <ul className="mt-4 grid gap-3 text-sm text-mist">
            <li>Your team sees each other live. Hunters see runners only when a ping goes out.</li>
            <li>Runners who are still in never see hunters.</li>
            <li>Stay outside the circle for 30 seconds and hunters can see you live until you’re back in.</li>
            <li>A tag counts inside 15 m. The runner confirms it, then watches the rest a minute behind, live, or not at all.</li>
            <li>With Skulk Pro, the host can close the circle on a timer. There’s a warning before each shrink.</li>
            <li>Radio is only for your side. The other team never reads it.</li>
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function OpenInApp({ code }: { code: string }) {
  return (
    <Button asChild size="lg" variant="secondary">
      <a href={openInAppIntent(code)}>Open in the Skulk app</a>
    </Button>
  )
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="grid grid-cols-[2rem_1fr] gap-3">
      <span className="font-display text-xl text-glow">{n}</span>
      <span>
        <span className="block text-foam">{title}</span>
        <span className="mt-1 block text-mist">{body}</span>
      </span>
    </li>
  )
}
