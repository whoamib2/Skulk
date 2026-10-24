import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientMessage, ClientView, Intent, ServerMessage } from '@shared/types'
import { normalizeView } from '@shared/view'
import { joinCodeFromUrl, shouldResumeSavedRound } from '@shared/appLink'
import { isRoundLostMessage } from '@shared/roundEnd'
import { healthUrlFor, resolveWsUrl, SERVER_WAKE_MS, serverUrlProblem, socketRetryDelayMs, stillWithinWake } from '@shared/serverUrl'
import { readLaunchUrl } from '@/lib/appLinks'
import { LocalTable } from '@/lib/localTable'
import { isNativeApp } from '@/lib/native'
import { clearCode, forceSim, loadCode, loadName, loadServer, playerId, saveCode, saveName } from '@/lib/session'

export function useGame() {
  const [view, setView] = useState<ClientView | null>(null)
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live'>(() => {
    if (!shouldResumeSavedRound(location.href, loadCode(), loadName())) return 'idle'
    return resolveWsUrl(loadServer(), isNativeApp(), location.origin) ? 'connecting' : 'idle'
  })
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skew, setSkew] = useState(0)
  const [resuming, setResuming] = useState(() => shouldResumeSavedRound(location.href, loadCode(), loadName()) && Boolean(resolveWsUrl(loadServer(), isNativeApp(), location.origin)))
  const [restarted, setRestarted] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const acceptedRef = useRef(false)
  const localRef = useRef<LocalTable | null>(null)
  const modeRef = useRef<'remote' | 'local' | null>(null)
  const intentRef = useRef<Intent | null>(null)
  const urlRef = useRef<string | null>(null)
  const gen = useRef(0)
  const closed = useRef(false)
  const retry = useRef(0)
  const viewRef = useRef<ClientView | null>(null)
  const connectStarted = useRef(0)
  const wakeTimer = useRef<number | null>(null)
  const retryTimer = useRef<number | null>(null)
  const connectRef = useRef<(intent: Intent, name: string) => void>(() => {})
  const stopRef = useRef<(message: string | null, clearSession: boolean) => void>(() => {})

  useEffect(() => {
    viewRef.current = view
  }, [view])

  useEffect(() => {
    if (!error || !view) return
    const id = window.setTimeout(() => setError(null), 4500)
    return () => window.clearTimeout(id)
  }, [error, view])

  const applyServer = useCallback((message: ServerMessage) => {
    if (message.type === 'state') {
      acceptedRef.current = true
      const view = normalizeView(message.view)
      viewRef.current = view
      setView(view)
      setSkew(view.clock.serverNow - Date.now())
      setStatus('live')
      setConnected(true)
      if (view.practice) forceSim()
    } else if (message.type === 'error') {
      if (!viewRef.current && modeRef.current !== 'local') {
        stopRef.current(message.message, true)
      } else setError(message.message)
    } else if (message.type === 'dismissed') {
      localRef.current?.stop()
      localRef.current = null
      stopRef.current(message.message, true)
    }
  }, [])

  const send = useCallback((message: ClientMessage) => {
    if (modeRef.current === 'local') {
      localRef.current?.handle(message)
      return
    }
    if (!acceptedRef.current) return
    const socket = wsRef.current
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  }, [])

  useEffect(() => {
    function clearTimers() {
      if (wakeTimer.current != null) {
        window.clearTimeout(wakeTimer.current)
        wakeTimer.current = null
      }
      if (retryTimer.current != null) {
        window.clearTimeout(retryTimer.current)
        retryTimer.current = null
      }
    }

    function stopLocal() {
      localRef.current?.stop()
      localRef.current = null
    }

    function stopToHome(message: string | null, clearSession: boolean) {
      clearTimers()
      gen.current += 1
      closed.current = true
      intentRef.current = null
      modeRef.current = null
      urlRef.current = null
      acceptedRef.current = false
      wsRef.current?.close()
      wsRef.current = null
      stopLocal()
      if (clearSession) clearCode()
      viewRef.current = null
      setView(null)
      setConnected(false)
      setStatus('idle')
      setResuming(false)
      setRestarted(false)
      setError(message)
    }

    stopRef.current = stopToHome

    function giveUp() {
      const resumed = intentRef.current?.kind === 'resume' || viewRef.current != null
      const code = loadCode()
      const message = resumed
        ? (code
          ? `Couldn’t rejoin ${code}. That round may have ended, or the server didn’t wake up.`
          : 'Couldn’t rejoin that round. The server didn’t wake up.')
        : 'The server didn’t wake up. Check the game server and try again.'
      // Keep the saved code. A deploy can outlast this wait, and the next open should resume.
      stopToHome(message, false)
    }

    function armDeadline() {
      if (wakeTimer.current != null) window.clearTimeout(wakeTimer.current)
      const remaining = Math.max(0, connectStarted.current + SERVER_WAKE_MS - Date.now())
      if (remaining === 0) {
        giveUp()
        return
      }
      wakeTimer.current = window.setTimeout(() => {
        wakeTimer.current = null
        if (viewRef.current && wsRef.current?.readyState === WebSocket.OPEN) return
        giveUp()
      }, remaining)
    }

    function scheduleRetry(my: number) {
      if (closed.current || !intentRef.current) return
      if (!stillWithinWake(connectStarted.current, Date.now())) {
        giveUp()
        return
      }
      const delay = socketRetryDelayMs(retry.current)
      retry.current += 1
      retryTimer.current = window.setTimeout(() => {
        retryTimer.current = null
        if (gen.current === my) open()
      }, delay)
    }

    function showRestart() {
      clearTimers()
      closed.current = true
      gen.current += 1
      acceptedRef.current = false
      intentRef.current = null
      const socket = wsRef.current
      wsRef.current = null
      socket?.close()
      setError(null)
      setConnected(false)
      setStatus('idle')
      setResuming(false)
      setRestarted(true)
    }

    function open() {
      const my = ++gen.current
      wsRef.current?.close()
      stopLocal()
      const intent = intentRef.current
      const target = urlRef.current
      if (!intent || !target) return
      if (!stillWithinWake(connectStarted.current, Date.now())) {
        giveUp()
        return
      }
      modeRef.current = 'remote'
      const health = healthUrlFor(target)
      if (health) void fetch(health, { cache: 'no-store', mode: 'no-cors' }).catch(() => {})
      let socket: WebSocket
      try {
        socket = new WebSocket(target)
      } catch {
        scheduleRetry(my)
        return
      }
      wsRef.current = socket
      socket.onopen = () => {
        if (gen.current !== my) return
        setConnected(true)
        retry.current = 0
        const hello: ClientMessage = {
          type: 'hello',
          playerId: playerId(),
          name: loadName(),
          intent,
        }
        socket.send(JSON.stringify(hello))
      }
      socket.onmessage = (event) => {
        if (gen.current !== my) return
        let message: ServerMessage
        try {
          message = JSON.parse(String(event.data)) as ServerMessage
        } catch {
          return
        }
        if (
          message.type === 'error' &&
          modeRef.current !== 'local' &&
          (viewRef.current || intentRef.current?.kind === 'resume') &&
          isRoundLostMessage(message.message)
        ) {
          showRestart()
          return
        }
        if (message.type === 'state' && modeRef.current === 'remote') {
          saveCode(message.view.code)
          if (wakeTimer.current != null) {
            window.clearTimeout(wakeTimer.current)
            wakeTimer.current = null
          }
        }
        applyServer(message)
      }
      socket.onclose = () => {
        if (gen.current !== my) return
        acceptedRef.current = false
        setConnected(false)
        if (closed.current || !intentRef.current || modeRef.current !== 'remote') return
        if (viewRef.current) {
          const code = loadCode()
          if (code) {
            intentRef.current = { kind: 'resume', code }
            setResuming(true)
          }
          setStatus('connecting')
          connectStarted.current = Date.now()
          retry.current = 0
          armDeadline()
        }
        scheduleRetry(my)
      }
    }

    function begin(intent: Intent, target: string) {
      clearTimers()
      closed.current = false
      acceptedRef.current = false
      retry.current = 0
      connectStarted.current = Date.now()
      modeRef.current = 'remote'
      intentRef.current = intent
      urlRef.current = target
      setResuming(intent.kind === 'resume')
      setStatus('connecting')
      setError(null)
      setConnected(false)
      armDeadline()
      open()
    }

    function startLocal(name: string) {
      clearTimers()
      gen.current += 1
      wsRef.current?.close()
      wsRef.current = null
      stopLocal()
      closed.current = false
      modeRef.current = 'local'
      intentRef.current = { kind: 'create', practice: true }
      clearCode()
      forceSim()
      setResuming(false)
      setStatus('live')
      setConnected(true)
      setError(null)
      const table = new LocalTable((message) => {
        if (modeRef.current !== 'local') return
        applyServer(message)
      })
      localRef.current = table
      table.handle({
        type: 'hello',
        playerId: playerId(),
        name,
        intent: { kind: 'create', practice: true },
      })
    }

    connectRef.current = (intent, name) => {
      saveName(name)
      if (intent.kind === 'create' && intent.practice) {
        startLocal(name)
        return
      }
      const native = isNativeApp()
      const problem = serverUrlProblem(loadServer(), native)
      const target = resolveWsUrl(loadServer(), native, location.origin)
      if (problem || !target) {
        setError(problem ?? 'That server address is not a URL.')
        setStatus('idle')
        setResuming(false)
        return
      }
      stopLocal()
      if (intent.kind === 'create') clearCode()
      begin(intent, target)
    }

    let resumeCancelled = false
    void readLaunchUrl().then((url) => {
      if (resumeCancelled || joinCodeFromUrl(url)) return
      if (!shouldResumeSavedRound(location.href, loadCode(), loadName())) return
      const native = isNativeApp()
      const target = resolveWsUrl(loadServer(), native, location.origin)
      if (!target) clearCode()
      else begin({ kind: 'resume', code: loadCode() }, target)
    })

    return () => {
      resumeCancelled = true
      clearTimers()
      gen.current += 1
      wsRef.current?.close()
      wsRef.current = null
      stopLocal()
    }
  }, [applyServer])

  function cancelConnect() {
    const inRound = viewRef.current != null
    const resumed = intentRef.current?.kind === 'resume' || inRound
    if (inRound && modeRef.current === 'local') {
      localRef.current?.handle({ type: 'leave' })
    } else if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'leave' } satisfies ClientMessage))
    }
    stopRef.current(null, resumed)
  }

  function leave() {
    if (modeRef.current === 'local') localRef.current?.handle({ type: 'leave' })
    else if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'leave' } satisfies ClientMessage))
    }
    stopRef.current(null, true)
  }

  return {
    view,
    skew,
    status,
    connected,
    error,
    resuming,
    restarted,
    dismissRestart: () => {
      setRestarted(false)
      stopRef.current(null, true)
    },
    send,
    leave,
    cancelConnect,
    connect: (intent: Intent, name: string) => connectRef.current(intent, name),
  }
}
