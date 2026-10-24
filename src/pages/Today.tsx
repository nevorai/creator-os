import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useNiches } from '../lib/niches'
import { supabase } from '../lib/supabase'
import { useTenant } from '../lib/tenant'
import { Badge, Button, Card, EmptyState, PageHeader, StatTile } from '../components/ui/primitives'

type Brief = {
  ideas: { id: string; topic: string; why_now: string | null; confidence: string | null; niche_id: string | null }[]
  outliers: { id: string; post_url: string; caption: string | null; views: number | null; outlier_ratio: number | null; handle: string }[]
  news: { id: string; title: string; url: string; published_at: string | null; niche_id: string | null }[]
  board: Record<string, number>
  counts: { news_24h: number; outliers_7d: number; watching: number; sources: number }
}
const STAGES: [string, string][] = [['scripted', 'Scripted'], ['shooting', 'Shooting'], ['editing', 'Editing'], ['scheduled', 'Scheduled'], ['posted', 'Posted']]

// The morning brief: everything below comes from ONE database call (today_brief), cached for 30 seconds.
export function TodayPage() {
  const nav = useNavigate()
  const { profile } = useTenant()
  const niches = useNiches()
  const nicheName = new Map((niches.data ?? []).map((n) => [n.id, n.name]))
  const brief = useQuery({
    queryKey: ['today_brief'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('today_brief')
      if (error) throw error
      return data as Brief
    },
  })
  const b = brief.data
  const first = (profile?.display_name ?? '').split(' ')[0]
  const empty = b && !b.ideas.length && !b.news.length && !b.outliers.length

  return (
    <div>
      <PageHeader
        title={first ? `Good to see you, ${first}` : 'Today'}
        description={niches.data?.length ? `Your brief for ${niches.data.map((n) => n.name).join(' and ')}.` : 'Your morning brief.'}
        actions={<Link to="/ideas"><Button variant="secondary">Find new ideas</Button></Link>}
      />
      {brief.isLoading && <div className="mt-6 h-40 animate-pulse rounded-[20px] bg-white/5" aria-label="Loading" />}
      {brief.isError && <p className="mt-6 text-sm text-red-500">{(brief.error as Error).message}</p>}

      {b && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Headlines, last 24 h" value={b.counts.news_24h} hint={`${b.counts.sources} sources`} />
            <StatTile label="Outliers, last 7 days" value={b.counts.outliers_7d} hint={`${b.counts.watching} accounts watched`} />
            <StatTile label="Ideas waiting" value={b.ideas.length} />
            <StatTile label="In the pipeline" value={STAGES.reduce((n, [k]) => n + (k === 'posted' ? 0 : (b.board[k] ?? 0)), 0)} hint={`${b.board.posted ?? 0} posted`} />
          </div>

          {empty && (
            <div className="mt-6">
              <EmptyState
                title="Orbit is warming up"
                description="Add what to watch in Watchlist and Sources. The first headlines arrive at the next nightly run; you can ask for ideas any time."
              />
            </div>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="min-w-0">
              <h2 className="mb-3 text-sm font-semibold text-white/50">Ideas ready for you</h2>
              {b.ideas.length === 0 && <EmptyState title="No ideas yet" description="Open Ideas and ask the Topic Planner for today's list." />}
              <div className="space-y-2">
                {b.ideas.map((i) => (
                  <Card key={i.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-white">{i.topic}</p>
                      {i.niche_id && nicheName.get(i.niche_id) && <Badge variant="accent">{nicheName.get(i.niche_id)}</Badge>}
                    </div>
                    {i.why_now && <p className="mt-1 text-xs text-white/50">{i.why_now}</p>}
                    <Button variant="secondary" className="mt-3" onClick={() => nav('/studio', { state: { topic: i.topic } })}>Use in Studio</Button>
                  </Card>
                ))}
              </div>
            </section>

            <section className="min-w-0">
              <h2 className="mb-3 text-sm font-semibold text-white/50">Outliers: 3× or more their own normal</h2>
              {b.outliers.length === 0 && <EmptyState title="No outliers yet" description="Watched accounts are checked every morning." />}
              <div className="space-y-2">
                {b.outliers.map((o) => (
                  <a key={o.id} href={o.post_url} target="_blank" rel="noreferrer" className="block">
                    <Card className="p-4 transition-colors hover:border-accent-500/40">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate font-medium text-white">@{o.handle}</span>
                        <Badge variant="warning">{o.outlier_ratio ? `${o.outlier_ratio.toFixed(1)}×` : 'outlier'}</Badge>
                      </div>
                      {o.caption && <p className="mt-1 line-clamp-2 text-xs text-white/50">{o.caption}</p>}
                      <p className="mt-1 text-xs text-white/40">{o.views?.toLocaleString() ?? '—'} views</p>
                    </Card>
                  </a>
                ))}
              </div>
            </section>
          </div>

          <section className="mt-6">
            <h2 className="mb-3 text-sm font-semibold text-white/50">Latest headlines</h2>
            {b.news.length === 0 ? (
              <EmptyState title="Nothing pulled yet" description="The nightly run reads every source you added." />
            ) : (
              <Card className="divide-y divide-border-subtle overflow-hidden">
                {b.news.map((s) => (
                  <a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="flex items-start justify-between gap-3 p-4 text-sm transition-colors hover:bg-white/[0.03]">
                    <span className="font-medium text-white">{s.title}</span>
                    {s.niche_id && nicheName.get(s.niche_id) && <Badge className="shrink-0">{nicheName.get(s.niche_id)}</Badge>}
                  </a>
                ))}
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  )
}
