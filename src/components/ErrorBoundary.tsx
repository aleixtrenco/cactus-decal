import { Component, type ReactNode } from 'react'

// Catches a crash in part of the page and shows `fallback` instead, so one
// failing piece (e.g. 3D on a device without WebGL) never blanks the site.
export default class ErrorBoundary extends Component<{ fallback: (error: Error, retry: () => void) => ReactNode; children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error) {
    console.error(error)
  }
  render() {
    return this.state.error ? this.props.fallback(this.state.error, () => this.setState({ error: null })) : this.props.children
  }
}

export function PageError({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <main className="result" role="alert">
      <div>
        <span className="eyebrow">Something went wrong</span>
        <h1 className="display" style={{ marginTop: 16, fontSize: 'clamp(44px, 8vw, 88px)' }}>
          This page didn’t load
        </h1>
        <p>Try again, or reload the page. If it keeps happening, send us this message:</p>
        <pre className="error-detail">{error.message || String(error)}</pre>
        <div className="hero-ctas" style={{ justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={retry}>
            Try again
          </button>
          <button className="btn btn-ghost" onClick={() => location.reload()}>
            Reload page
          </button>
        </div>
      </div>
    </main>
  )
}
