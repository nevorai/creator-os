import { useEffect, useState, type FormEvent } from 'react'
import { resolveHost } from '../lib/tenant'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { Button, Input } from '../components/ui/primitives'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [brand, setBrand] = useState<string | null>(null)
  useEffect(() => {
    resolveHost().then((t) => setBrand(t?.name ?? null)).catch(() => {})
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-canvas p-6 text-white">
      <div
        className="pointer-events-none absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-20 blur-[120px]"
        style={{ background: 'radial-gradient(circle, var(--color-accent-500), transparent 70%)' }}
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent-400 to-accent-700 font-display text-lg font-bold shadow-glow">
            C
          </div>
          <div className="font-display text-lg font-semibold tracking-tight">{brand ?? 'Nevorai Creator'}</div>
          <div className="text-sm text-white/40">{brand ? 'Sign in to your studio' : 'Sign in to your studio'}</div>
        </div>

        {!supabaseConfigured ? (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-300">
            Supabase is not connected. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env,
            then restart the dev server.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-border-subtle bg-surface p-5 shadow-card">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-white/40">
                Email
              </label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-white/40">
                Password
              </label>
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/25 bg-red-500/10 p-2 text-xs text-red-300">
                {error}
              </div>
            )}

            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
            <button
              type="button"
              disabled={busy || !email}
              onClick={async () => {
                setBusy(true)
                setError(null)
                const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
                setError(error ? error.message : 'If this email has a studio, a link to set your password is on its way.')
                setBusy(false)
              }}
              className="w-full py-1 text-xs text-white/40 hover:text-white/70 disabled:opacity-40"
            >
              First time, or forgot your password? Email me a link
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-white/30">
          Studios are created when a plan is bought. Check your email for the invite link, or ask
          your studio owner to invite you.
        </p>
      </div>
    </div>
  )
}
