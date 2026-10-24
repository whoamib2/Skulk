import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** Last resort so a render throw cannot leave the phone on an empty indigo screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error): void {
    console.error(error)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="grid h-full min-h-dvh place-items-center bg-ink px-6 text-center text-foam" data-screen="error">
        <div className="w-full max-w-xs">
          <h1 className="font-display text-4xl leading-none">Something went wrong — Reload</h1>
          <p className="mt-4 text-sm break-words text-mist">{error.message}</p>
          <Button className="mt-6" size="lg" onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </div>
    )
  }
}
