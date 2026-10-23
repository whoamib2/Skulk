import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientMessage, ClientView, Intent, ServerMessage } from '@shared/types'
import { resolveWsUrl, serverUrlProblem } from '@shared/serverUrl'
import { LocalTable } from '@/lib/localTable'
import { isNativeApp } from '@/lib/native'
import { clearCode, forceSim, loadCode, loadName, loadServer, playerId, saveCode, saveName } from '@/lib/session'

export function useGame() {
  const [view, setView] = useState<ClientView | null>(null)
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live'>(() => {
    if (!loadCode() || !loadName()) return 'idle'
    return resolveWsUrl(loadServer(), isNativeApp(), location.origin) ? 'connecting' : 'idle'
  })
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skew, setSkew] = useState(0)
  const wsRef = useRef<WebSocket | null>(null)
  const localRef = useRef<LocalTable | null>(null)
  const modeRef = useRef<'remote' | 'local' | null>(null)
  const intentRef = useRef<Intent | null>(null)
  const urlRef = useRef<string | null>(null)
  const gen = useRef(0)
  const closed = useRef(false)
  const retry = useRef(0)
  const viewRef = useRef<ClientView | null>(null)
  const connectRef = useRef<(intent: Intent, name: string) => void>(() => {})

  useEffect(() => {
    viewRef.current = view
  }, [view])

  useEffect(() => {
    if (!error) return
    const id = window.setTimeout(() => setError(null), 4500)
    return () => window.clearTimeout(id)
  }, [error])

  const applyServer = useCallback((message: ServerMessage) => {
    if (message.type === 'state') {
      setView(message.view)
      setSkew(message.view.clock.serverNow - Date.now())
      if (message.view.practice) forceSim()
    } else if (message.type === 'error') {
      setError(message.message)
      if (!viewRef.current && modeRef.current !== 'local') {
        intentRef.current = null
        clearCode()
        setStatus('idle')
      }
    } else if (message.type === 'dismissed') {
      closed.current = true
      intentRef.current = null
      modeRef.current = null
      clearCode()
      setView(null)
      setConnected(false)
      setError(message.message)
      setStatus('idle')
      localRef.current?.stop()
      localRef.current = null
    }
  }, [])

  const send = useCallback((message: ClientMessage) => {
    if (modeRef.current === 'local') {
      localRef.current?.handle(message)
      return
    }
    const socket = wsRef.current
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  }, [])

  useEffect(() => {
    function stopLocal() {
      localRef.current?.stop()
      localRef.current = null
    }

    function startLocal(name: string) {
      gen.current += 1
      wsRef.current?.close()
      wsRef.current = null
      stopLocal()
      closed.current = false
      modeRef.current = 'local'
      intentRef.current = { kind: 'create', practice: true }
      clearCode()
      forceSim()
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

    function open() {
      const my = ++gen.current
      wsRef.current?.close()
      stopLocal()
      const intent = intentRef.current
      const target = urlRef.current
      if (!intent || !target) return
      modeRef.current = 'remote'
      const socket = new WebSocket(target)
      wsRef.current = socket
      socket.onopen = () => {
        if (gen.current !== my) return
        setConnected(true)
        setStatus('live')
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
        const message = JSON.parse(String(event.data)) as ServerMessage
        if (message.type === 'state' && modeRef.current === 'remote') saveCode(message.view.code)
        applyServer(message)
      }
      socket.onclose = () => {
        if (gen.current !== my) return
        setConnected(false)
        if (closed.current || !intentRef.current || modeRef.current !== 'remote') return
        const code = loadCode()
        if (code) intentRef.current = { kind: 'resume', code }
        const delay = Math.min(4000, 400 * 2 ** retry.current)
        retry.current += 1
        window.setTimeout(() => {
          if (gen.current === my) open()
        }, delay)
      }
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
        return
      }
      stopLocal()
      closed.current = false
      retry.current = 0
      modeRef.current = 'remote'
      intentRef.current = intent
      urlRef.current = target
      setStatus('connecting')
      setError(null)
      open()
    }

    if (loadCode() && loadName()) {
      const native = isNativeApp()
      const target = resolveWsUrl(loadServer(), native, location.origin)
      if (!target) {
        clearCode()
      } else {
        intentRef.current = { kind: 'resume', code: loadCode() }
        urlRef.current = target
        modeRef.current = 'remote'
        closed.current = false
        open()
      }
    }

    return () => {
      gen.current += 1
      wsRef.current?.close()
      wsRef.current = null
      stopLocal()
    }
  }, [applyServer])

  function leave() {
    closed.current = true
    intentRef.current = null
    clearCode()
    if (modeRef.current === 'local') {
      localRef.current?.handle({ type: 'leave' })
      localRef.current?.stop()
      localRef.current = null
      modeRef.current = null
      setView(null)
      setConnected(false)
      setStatus('idle')
      return
    }
    send({ type: 'leave' })
    setView(null)
    setStatus('idle')
    gen.current += 1
    wsRef.current?.close()
  }

  return {
    view,
    skew,
    status,
    connected,
    error,
    send,
    leave,
    connect: (intent: Intent, name: string) => connectRef.current(intent, name),
  }
}
