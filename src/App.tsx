import { useEffect, useRef, useState } from 'react'
import { joinCodeFromUrl } from '@shared/appLink'
import { Wordmark } from '@/components/Wordmark'
import { Button } from '@/components/ui/button'
import { GameOver } from '@/components/GameOver'
import { Home } from '@/components/Home'
import { Lobby } from '@/components/Lobby'
import { Match } from '@/components/Match'
import { watchJoinLinks } from '@/lib/appLinks'
import { isNativeApp } from '@/lib/native'
import { hydrateDeviceStore } from '@/lib/deviceStore'
import { recordFinishedRound } from '@/lib/recordRound'
import { loadServer, loadSim, saveServer, saveSim } from '@/lib/session'
import { useGame } from '@/lib/useGame'

export default function App() {
  const game = useGame()
  const [simChoice, setSimChoice] = useState<boolean | null>(null)
  const [serverUrl, setServerUrl] = useState(loadServer)
  const [now, setNow] = useState(() => Date.now())
  const [appLinkReady, setAppLinkReady] = useState(() => !isNativeApp())
  const [joinLink, setJoinLink] = useState(() => {
    const code = joinCodeFromUrl(window.location.href)
    return { code, token: code ? 1 : 0 }
  })
  const gameRef = useRef(game)
  const setServerRef = useRef<(url: string) => void>(() => {})
  const sim = simChoice ?? (loadSim() || Boolean(game.view?.practice))

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    void hydrateDeviceStore()
  }, [])

  useEffect(() => {
    gameRef.current = game
    setServerRef.current = setServer
  })

  useEffect(() => {
    return watchJoinLinks((link) => {
      if (link.origin) setServerRef.current(link.origin)
      const current = gameRef.current
      if (current.view?.code === link.code) return
      if (current.view) current.leave()
      else if (current.status === 'connecting') current.cancelConnect()
      setJoinLink((prev) => ({ code: link.code, token: prev.token + 1 }))
    }, () => setAppLinkReady(true))
  }, [])

  useEffect(() => {
    const current = game.view
    if (!current || current.phase !== 'ended' || !current.result || !current.you.side) return
    const key = `${current.code}:${current.clock.startedAt ?? 0}:${current.you.id}`
    recordFinishedRound(key, {
      side: current.you.side,
      caught: current.you.caught,
      left: current.roster.find((person) => person.isYou)?.left ?? false,
      winner: current.result.winner,
      runSec: current.you.runSec || 0,
      distanceM: current.you.distanceM || 0,
    })
  }, [game.view])

  useEffect(() => {
    const role = game.view?.you.caught ? 'Watching' : game.view?.you.side === 'hunter' ? 'Hunter' : game.view?.you.side === 'runner' ? 'Runner' : null
    document.title = game.view ? `Skulk · ${game.view.code}${role ? ` · ${role}` : ''}` : 'Skulk'
  }, [game.view])

  const serverNow = now + game.skew
  const view = game.view

  function setSimMode(on: boolean) {
    saveSim(on)
    setSimChoice(on)
  }

  function setServer(url: string) {
    saveServer(url)
    setServerUrl(url)
  }

  const waitingForAppLink = isNativeApp() && !appLinkReady

  return (
    <div className="min-h-dvh bg-night text-foam lg:flex lg:h-dvh lg:items-center lg:justify-center lg:gap-16 lg:px-12">
      <aside className="hidden max-w-md lg:block">
        <Wordmark className="h-16 w-auto" />
        <p className="mt-6 text-xs tracking-[0.18em] text-mist uppercase">Skulk</p>
        <h1 className="font-display mt-2 text-5xl leading-none">The phone keeps score. You do the running.</h1>
        <p className="mt-4 text-mist">
          A neighbourhood game of hide-and-seek. Runners hide inside a circle. Hunters only learn where they were, and only when the clock says so.
        </p>
        <ol className="mt-8 grid gap-4 text-sm text-mist">
          <li><span className="text-foam">Host.</span> Place the circle, set the clock, share the code.</li>
          <li><span className="text-foam">Scatter.</span> Runners use the head start. Hunters wait.</li>
          <li><span className="text-foam">Hunt.</span> Pings are memories, not a trail. Tag up close and let them confirm.</li>
        </ol>
      </aside>
      <main className="mx-auto flex h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-ink lg:h-[min(920px,calc(100dvh-3rem))] lg:rounded-[28px] lg:border lg:border-line">
        {view && !game.connected && (
          <div className="flex items-center justify-center gap-3 bg-glow px-3 py-1 text-center text-xs text-ink">
            <span>Reconnecting…</span>
            <button type="button" className="font-medium underline" onClick={game.cancelConnect}>Back to start</button>
          </div>
        )}
        {view && game.error && (
          <p className="bg-alert/90 px-3 py-1 text-center text-xs text-ink">{game.error}</p>
        )}
        {!view && waitingForAppLink && game.status === 'connecting' ? (
          <div className="grid h-full place-items-center px-6 text-center">
            <Wordmark className="mx-auto h-16 w-auto" />
          </div>
        ) : !view && game.status === 'connecting' ? (
          <div className="grid h-full place-items-center px-6 text-center">
            <div className="w-full max-w-xs">
              <Wordmark className="mx-auto h-16 w-auto" />
              <p className="mt-4 text-sm text-foam">Waking the server…</p>
              {game.resuming && <p className="mt-1 text-sm text-mist">Rejoining your round.</p>}
              <p className="mt-2 text-sm text-mist">This can take a minute.</p>
              <Button className="mt-6" variant="secondary" size="lg" onClick={game.cancelConnect}>Back to start</Button>
            </div>
          </div>
        ) : !view ? (
          <Home
            key={joinLink.token}
            error={game.error}
            busy={game.status === 'connecting'}
            sim={sim}
            onSim={setSimMode}
            prefillCode={joinLink.code}
            serverUrl={serverUrl}
            onServerUrl={setServer}
            native={isNativeApp()}
            onCreate={(name, practice) => game.connect({ kind: 'create', practice }, name)}
            onJoin={(name, code) => game.connect({ kind: 'join', code }, name)}
          />
        ) : view.phase === 'lobby' ? (
          <Lobby view={view} now={serverNow} send={game.send} serverUrl={serverUrl} native={isNativeApp()} />
        ) : view.phase === 'ended' ? (
          <GameOver view={view} now={serverNow} onDone={game.leave} />
        ) : (
          <Match view={view} now={serverNow} sim={sim} onSim={setSimMode} send={game.send} onLeave={game.leave} />
        )}
      </main>
    </div>
  )
}
