import { useNiches } from '../lib/niches'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Badge, Button, Card, Input, PageHeader, Select } from '../components/ui/primitives'
import type { WatchlistAccount, WatchlistPost } from '../types'

function AccountPosts({ accountId }: { accountId: string }) {
  const posts = useQuery({
    queryKey: ['watchlist_posts', accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('watchlist_posts')
        .select('*')
        .eq('account_id', accountId)
        .order('posted_at', { ascending: false })
        .limit(10)
      if (error) throw error
      return data as WatchlistPost[]
    },
  })

  if (posts.isLoading) return <p className="mt-2 text-xs text-white/40">Loading posts…</p>
  if (posts.isError) return <p className="mt-2 text-xs text-red-400">{(posts.error as Error).message}</p>
  if (!posts.data || posts.data.length === 0) {
    return (
      <p className="mt-2 text-xs text-white/30">
        Nothing scraped yet — the daily Influencer Watch run fills this in, or log a link above.
      </p>
    )
  }

  return (
    <ul className="mt-2 space-y-1.5">
      {posts.data.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
          <a
            href={p.post_url}
            target="_blank"
            rel="noreferrer"
            className="truncate text-white/50 hover:text-white/80 hover:underline"
          >
            {p.posted_at ?? 'no date'} — {p.caption?.slice(0, 50) ?? p.post_url}
          </a>
          <span className="flex shrink-0 items-center gap-1">
            {p.is_outlier && (
              <Badge variant="warning">
                {p.outlier_ratio ? `${p.outlier_ratio.toFixed(1)}×` : 'outlier'}
              </Badge>
            )}
            <span className="text-white/30">{p.views != null ? `${p.views.toLocaleString()} views` : '—'}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function IngestPostForm({ accountId }: { accountId: string }) {
  const qc = useQueryClient()
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  const ingest = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('ingest-instagram', {
        body: { url, kind: 'competitor', account_id: accountId },
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['watchlist'] })
      setUrl('')
      setStatus('Logged.')
    },
    onError: (e: Error) => setStatus(e.message),
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (url.trim()) ingest.mutate()
      }}
      className="mt-1 flex gap-2"
    >
      <Input
        placeholder="Paste their reel link to log it"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="flex-1 py-1.5 text-xs"
      />
      <Button type="submit" variant="secondary" disabled={ingest.isPending} className="px-2 py-1 text-xs">
        {ingest.isPending ? '…' : 'Log'}
      </Button>
      {status && <span className="self-center text-xs text-white/40">{status}</span>}
    </form>
  )
}

export function WatchlistPage() {
  const qc = useQueryClient()
  const niches = useNiches()
  const [nicheId, setNicheId] = useState('')
  const political = (niches.data ?? []).some((n) => /politic|news/i.test(n.name))
  const nicheName = new Map((niches.data ?? []).map((n) => [n.id, n.name]))
  const [handle, setHandle] = useState('')
  const [wing, setWing] = useState<'right' | 'left' | 'neutral'>('neutral')
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['watchlist'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('watchlist_accounts')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as WatchlistAccount[]
    },
  })

  const addAccount = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('watchlist_accounts')
        .insert({ handle: handle.replace(/^@/, ''), wing: political ? wing : null, niche_id: nicheId || null })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['watchlist'] })
      setHandle('')
    },
  })

  const toggleActive = useMutation({
    mutationFn: async (acc: WatchlistAccount) => {
      const { error } = await supabase
        .from('watchlist_accounts')
        .update({ active: !acc.active })
        .eq('id', acc.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['watchlist'] }),
  })

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Watchlist"
        description="Accounts you watch, tagged right / left / neutral. The Influencer Watch desk logs every new post against this list — outliers are ~3× that account's own 30-day median, never an absolute threshold."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (handle.trim()) addAccount.mutate()
        }}
        className="mt-6 flex gap-2"
      >
        <Input placeholder="@handle" value={handle} onChange={(e) => setHandle(e.target.value)} className="flex-1" />
        {political && (
          <Select value={wing} onChange={(e) => setWing(e.target.value as 'right' | 'left' | 'neutral')}>
            <option value="right">Right</option>
            <option value="left">Left</option>
            <option value="neutral">Neutral</option>
          </Select>
        )}
        {(niches.data?.length ?? 0) > 1 && (
          <Select aria-label="Niche" value={nicheId} onChange={(e) => setNicheId(e.target.value)}>
            <option value="">All niches</option>
            {niches.data!.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </Select>
        )}
        <Button type="submit" disabled={addAccount.isPending}>
          Add
        </Button>
      </form>

      {isLoading && <p className="mt-4 text-sm text-white/40">Loading…</p>}
      {accounts && accounts.length === 0 && (
        <p className="mt-4 text-sm text-white/40">No accounts yet.</p>
      )}
      {accounts && accounts.length > 0 && (
        <Card className="mt-6 divide-y divide-border-subtle overflow-hidden">
          {accounts.map((acc) => (
            <div key={acc.id} className="p-3.5 text-sm">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setExpanded(expanded === acc.id ? null : acc.id)}
                  className="text-left"
                >
                  <span className="font-medium text-white">@{acc.handle}</span>{' '}
                  <span className="text-xs text-white/40">{acc.wing}{acc.niche_id && nicheName.get(acc.niche_id) ? `${acc.wing ? " · " : ""}${nicheName.get(acc.niche_id)}` : ""}</span>
                </button>
                <button
                  onClick={() => toggleActive.mutate(acc)}
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    acc.active
                      ? 'border border-emerald-500/25 bg-emerald-500/15 text-emerald-300'
                      : 'border border-white/10 bg-white/5 text-white/40'
                  }`}
                >
                  {acc.active ? 'Active' : 'Paused'}
                </button>
              </div>
              {expanded === acc.id && (
                <>
                  <IngestPostForm accountId={acc.id} />
                  <AccountPosts accountId={acc.id} />
                </>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
