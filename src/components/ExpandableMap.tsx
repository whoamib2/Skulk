import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import { Maximize2, X } from 'lucide-react'

const HISTORY_FLAG = 'skulkFullscreenMap'

export function ExpandableMap({
  className,
  map,
  overlay,
  hud,
  expandedControls,
  expandClassName = 'top-3 right-3',
  children,
}: {
  className: string
  map: LeafletMap | null
  overlay?: ReactNode
  /** Compact overlay that stays on the map when it fills the screen. */
  hud?: ReactNode
  expandedControls?: ReactNode
  expandClassName?: string
  children: (api: { open: boolean; expand: () => void }) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const slotRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const pushedRef = useRef(false)
  const openRef = useRef(false)
  openRef.current = open

  const close = useCallback(() => {
    setOpen(false)
    if (!pushedRef.current) return
    pushedRef.current = false
    const state = history.state as { skulkFullscreenMap?: boolean } | null
    if (state?.skulkFullscreenMap) history.back()
  }, [])

  const expand = useCallback(() => {
    if (pushedRef.current || openRef.current) return
    history.pushState({ [HISTORY_FLAG]: true }, '')
    pushedRef.current = true
    setOpen(true)
  }, [])

  useEffect(() => {
    const onPop = () => {
      if (!pushedRef.current) return
      pushedRef.current = false
      setOpen(false)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    return () => {
      if (!pushedRef.current) return
      pushedRef.current = false
      const state = history.state as { skulkFullscreenMap?: boolean } | null
      if (state?.skulkFullscreenMap) history.back()
    }
  }, [])

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  useLayoutEffect(() => {
    const shell = shellRef.current
    const slot = slotRef.current
    return () => {
      if (shell && slot && shell.parentElement !== slot) slot.appendChild(shell)
    }
  }, [])

  useLayoutEffect(() => {
    const shell = shellRef.current
    const slot = slotRef.current
    const root = document.getElementById('root')
    if (!shell || !slot || !root) return
    // Stay inside #root. React delegates clicks there; moving the shell to
    // document.body lets the tap hit the button and then drop the event, so
    // Close, Find me, and the slider never run. A direct child of #root also
    // escapes the in-game map's z-0 box, which would otherwise paint the
    // footer over the fullscreen map.
    if (open) {
      if (shell.parentElement !== root) root.appendChild(shell)
    } else if (shell.parentElement !== slot) {
      slot.appendChild(shell)
    }
  })

  useLayoutEffect(() => {
    const shell = shellRef.current
    if (!map || !shell) return
    let cancelled = false
    const invalidate = () => {
      if (cancelled) return
      map.invalidateSize({ animate: false })
    }
    invalidate()
    const raf = requestAnimationFrame(invalidate)
    const timer = window.setTimeout(invalidate, 200)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
    }
  }, [open, map])

  return (
    <div ref={slotRef} className={className}>
      <div
        ref={shellRef}
        data-map-shell={open ? 'open' : 'closed'}
        className={open
          ? 'fixed inset-0 z-[4000] flex flex-col bg-ink pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]'
          : 'relative h-full w-full'}
      >
        <div className={open ? 'relative z-0 min-h-0 flex-1 isolate overflow-hidden' : 'absolute inset-0'}>
          {children({ open, expand })}
          {hud && (
            <div
              data-map-hud
              className={open
                ? 'pointer-events-none absolute top-3 left-3 right-[8.5rem] z-[1100]'
                : 'pointer-events-none absolute top-[max(0.5rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] left-[max(0.75rem,env(safe-area-inset-left))] z-[1100]'}
            >
              {hud}
            </div>
          )}
          {open ? (
            <button
              ref={closeRef}
              type="button"
              aria-label="Close map"
              onClick={close}
              className="absolute top-3 right-3 z-[1100] inline-flex h-14 items-center gap-2 rounded-full bg-foam px-4 text-base font-medium text-ink shadow-lg"
            >
              <X className="size-6" />
              Close
            </button>
          ) : (
            <button
              type="button"
              aria-label="Expand map"
              onClick={expand}
              className={`absolute z-[1100] grid size-14 place-items-center rounded-full bg-foam text-ink shadow-lg ${expandClassName}`}
            >
              <Maximize2 className="size-7" />
            </button>
          )}
          {overlay && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[1200] flex flex-col items-center gap-2 px-3">
              {overlay}
            </div>
          )}
        </div>
        {open && expandedControls && (
          <div className="relative z-[1200] shrink-0 border-t border-line bg-ink px-4 pt-3 pb-3">
            {expandedControls}
          </div>
        )}
      </div>
    </div>
  )
}
