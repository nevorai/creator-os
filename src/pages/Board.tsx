import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Card, EmptyState, PageHeader } from '../components/ui/primitives'
import type { StudioSession } from '../types'

const STAGES: { key: StudioSession['production_status']; label: string }[] = [
  { key: 'scripted', label: 'Scripted' },
  { key: 'shooting', label: 'Shooting' },
  { key: 'editing', label: 'Editing' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'posted', label: 'Posted' },
]

export function BoardPage() {
  const qc = useQueryClient()

  const sessions = useQuery({
    queryKey: ['board_sessions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('studio_sessions')
        .select('*')
        .not('script_text', 'is', null)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as StudioSession[]
    },
  })

  const move = useMutation({
    mutationFn: async ({ id, production_status }: { id: string; production_status: StudioSession['production_status'] }) => {
      const { error } = await supabase.from('studio_sessions').update({ production_status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board_sessions'] }),
  })

  return (
    <div>
      <PageHeader
        title="Board"
        description="Every scripted reel from Studio, tracked from script to posted. AI can't edit video — this is a simple hand-moved tracker for you and your editor, not an automated desk."
      />

      {sessions.isLoading && <p className="mt-6 text-sm text-white/40">Loading…</p>}
      {sessions.isError && <p className="mt-6 text-sm text-red-400">{(sessions.error as Error).message}</p>}
      {sessions.data && sessions.data.length === 0 && (
        <div className="mt-6">
          <EmptyState title="Nothing here yet" description="A card shows up once you've generated a script in Studio." />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {STAGES.map((stage, idx) => (
          <div key={stage.key} className="min-w-0">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/35">
              {stage.label}
            </h2>
            <div className="space-y-2">
              {sessions.data
                ?.filter((s) => (s.production_status ?? 'scripted') === stage.key)
                .map((s) => (
                  <Card key={s.id} className="p-3 text-xs">
                    <p className="truncate font-medium text-white">{s.topic}</p>
                    <p className="mt-1 text-white/40">
                      {new Date(s.updated_at).toLocaleDateString()}
                    </p>
                    {s.reel_id && <p className="mt-1 text-emerald-400">✓ linked to Library</p>}
                    <div className="mt-2 flex gap-1">
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            move.mutate({ id: s.id, production_status: STAGES[idx - 1].key })
                          }
                          disabled={move.isPending}
                          className="rounded-md border border-border px-1.5 py-0.5 text-white/60 hover:border-white/20 hover:text-white disabled:opacity-50"
                        >
                          ← back
                        </button>
                      )}
                      {idx < STAGES.length - 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            move.mutate({ id: s.id, production_status: STAGES[idx + 1].key })
                          }
                          disabled={move.isPending}
                          className="rounded-md bg-accent-500 px-1.5 py-0.5 text-on-brand hover:bg-accent-400 disabled:opacity-50"
                        >
                          next →
                        </button>
                      )}
                    </div>
                  </Card>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
