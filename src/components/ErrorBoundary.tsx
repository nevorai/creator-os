import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

// A single broken screen (a bad query, an unexpected null) shouldn't take
// down the whole app with a blank white page — this catches it and shows
// what broke instead.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-canvas p-8 text-white">
          <div className="max-w-md rounded-2xl border border-red-500/25 bg-red-500/10 p-6 text-sm shadow-card">
            <p className="font-medium text-red-300">Something broke on this screen.</p>
            <p className="mt-2 text-red-400/80">{this.state.error.message}</p>
            <button
              type="button"
              onClick={() => {
                this.setState({ error: null })
                window.location.hash = '#/'
              }}
              className="mt-4 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-on-brand hover:bg-red-400"
            >
              Back to Today
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
