import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientMessage, ClientView, Intent, ServerMessage } from '@shared/types'
import { clearCode, forceSim, loadCode, loadName, playerId, saveCode, saveName } from '@/lib/session'
import { wsUrl } from '@/lib/utils'

export function useGame() {
  const [view, setView] = useState<ClientView | null>(null)
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live'>(() => (
    loadCode() && loadName() ? 'connecting' : 'idle'
  ))
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skew, setSkew] = useState(0)
  const wsRef = useRef<WebSocket | null>(null)
  const intentRef = useRef<Intent | null>(null)
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

  const send = useCallback((message: ClientMessage) => {
    const socket = wsRef.current
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  }, [])

  useEffect(() => {
    function open() {
      const my = ++gen.current
      wsRef.current?.close()
      const intent = intentRef.current
      if (!intent) return
      const socket = new WebSocket(wsUrl())
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
        if (message.type === 'state') {
          setView(message.view)
          setSkew(message.view.clock.serverNow - Date.now())
          saveCode(message.view.code)
          if (message.view.practice) forceSim()
        } else if (message.type === 'error') {
          setError(message.message)
          if (!viewRef.current) {
            intentRef.current = null
            clearCode()
            setStatus('idle')
          }
        } else if (message.type === 'dismissed') {
          closed.current = true
          intentRef.current = null
          clearCode()
          setView(null)
          setError(message.message)
          setStatus('idle')
        }
      }
      socket.onclose = () => {
        if (gen.current !== my) return
        setConnected(false)
        if (closed.current || !intentRef.current) return
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
      if (intent.kind === 'create' && intent.practice) forceSim()
      closed.current = false
      retry.current = 0
      intentRef.current = intent
      setStatus('connecting')
      setError(null)
      open()
    }

    if (loadCode() && loadName()) {
      intentRef.current = { kind: 'resume', code: loadCode() }
      closed.current = false
      open()
    }

    return () => {
      gen.current += 1
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [])

  function leave() {
    closed.current = true
    intentRef.current = null
    clearCode()
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
