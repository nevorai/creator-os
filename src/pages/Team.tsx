import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Badge, Button, Card, Input, PageHeader, Select } from '../components/ui/primitives'
import { callFn } from '../lib/fn'
import { supabase } from '../lib/supabase'
import { useTenant } from '../lib/tenant'

type Member = { user_id: string; email: string; role: 'owner' | 'editor' | 'viewer'; added_at: string }

export function TeamPage() {
  const { tenant, isOwner } = useTenant()
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('editor')
  const key = ['members', tenant?.id]

  const members = useQuery({
    queryKey: key,
    enabled: Boolean(tenant),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('team_list')
      if (error) throw error
      return (data ?? []) as Member[]
    },
  })
  const act = useMutation({
    mutationFn: (b: Record<string, unknown>) => callFn('tenant-admin', b),
    onSuccess: () => {
      setEmail('')
      qc.invalidateQueries({ queryKey: key })
    },
  })
  const seats = Number(tenant?.limits?.seats ?? 1)
  const used = members.data?.length ?? 0

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Team"
        description="Editors can create and change things. Viewers can only look. Only the owner manages the team."
      />
      <p className="mt-3 text-xs text-white/40">
        {used} of {seats} seats used on your plan.
      </p>

      {isOwner && (
        <Card className="mt-4 p-4">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (email.trim()) act.mutate({ action: 'add_member', email, role })
            }}
          >
            <Input
              type="email"
              required
              placeholder="teammate@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-w-[200px] flex-1"
            />
            <Select value={role} onChange={(e) => setRole(e.target.value)} className="w-auto">
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </Select>
            <Button type="submit" disabled={act.isPending || !email.trim()}>
              {act.isPending ? 'Inviting…' : 'Invite'}
            </Button>
          </form>
          {act.isError && <p className="mt-2 text-xs text-red-400">{(act.error as Error).message}</p>}
        </Card>
      )}

      <div className="mt-4 space-y-2">
        {(members.data ?? []).map((m) => (
          <Card key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 p-3.5 text-sm">
            <span className="min-w-0 break-all text-xs text-white/70">{m.email}</span>
            <div className="flex items-center gap-2">
              <Badge variant={m.role === 'owner' ? 'success' : 'default'}>{m.role}</Badge>
              {isOwner && m.role !== 'owner' && (
                <>
                  <Button
                    variant="secondary"
                    className="px-2 py-1 text-xs"
                    onClick={() =>
                      act.mutate({ action: 'set_role', user_id: m.user_id, role: m.role === 'editor' ? 'viewer' : 'editor' })
                    }
                  >
                    Make {m.role === 'editor' ? 'viewer' : 'editor'}
                  </Button>
                  <Button
                    variant="secondary"
                    className="px-2 py-1 text-xs"
                    onClick={() => {
                      if (confirm('Remove this person?')) act.mutate({ action: 'remove_member', user_id: m.user_id })
                    }}
                  >
                    Remove
                  </Button>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
