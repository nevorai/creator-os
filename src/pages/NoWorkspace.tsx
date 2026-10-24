import { supabase } from '../lib/supabase'
import { Button, Card } from '../components/ui/primitives'

// A signed-in login that belongs to no workspace (for example a person from another Nevorai app).
export function NoWorkspacePage({ email }: { email?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-6 text-white">
      <Card className="w-full max-w-sm p-6 text-center">
        <div className="font-display text-lg font-semibold">No studio on this login yet</div>
        <p className="mt-2 text-sm leading-relaxed text-white/50">
          {email ? `${email} is not part of any Nevorai Creator studio.` : 'This login is not part of any Nevorai Creator studio.'}{' '}
          Studios are created when a plan is bought, or when a studio owner invites you.
        </p>
        <Button variant="secondary" className="mt-5 w-full" onClick={() => supabase.auth.signOut()}>
          Sign out
        </Button>
      </Card>
    </div>
  )
}
