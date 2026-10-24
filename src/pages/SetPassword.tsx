import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Button, Card, FieldLabel, Input } from '../components/ui/primitives'

// Shown once after an invite or password-reset link: the person picks their own password.
export function SetPasswordPage() {
  const { passwordSet } = useAuth()
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return setErr(error.message)
    history.replaceState(null, '', window.location.pathname)
    passwordSet()
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-6 text-white">
      <Card className="w-full max-w-sm p-6">
        <div className="font-display text-lg font-semibold">Choose your password</div>
        <p className="mt-1 text-sm text-white/45">You will use it to sign in next time.</p>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <div>
            <FieldLabel>New password (10 or more characters)</FieldLabel>
            <Input type="password" required minLength={10} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
          <Button type="submit" className="w-full" disabled={busy || pw.length < 10}>
            {busy ? 'Saving…' : 'Save and continue'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
