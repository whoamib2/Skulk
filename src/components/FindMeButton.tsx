import { Crosshair, Loader2 } from 'lucide-react'

export function FindMeButton({ pending, onClick }: { pending: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label="Find me"
      aria-busy={pending}
      className="pointer-events-auto inline-flex h-14 items-center gap-2 rounded-full bg-foam px-4 text-base font-medium text-ink shadow-lg disabled:opacity-80"
    >
      {pending ? <Loader2 className="size-6 animate-spin" /> : <Crosshair className="size-6" />}
      Find me
    </button>
  )
}
