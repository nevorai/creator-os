import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Card, Input, PageHeader, Select, Textarea } from '../components/ui/primitives'
import type { Reel } from '../types'


const emptyForm = {
  posted_at: '',
  transcript: '',
  caption: '',
  pillar: '',
  hook_type: '',
  length_seconds: '',
  is_organic: true,
  views: '',
  likes: '',
  comments: '',
  shares: '',
  saves: '',
  profile_visits: '',
  follows: '',
  notes: '',
}

function toIntOrNull(v: string) {
  return v.trim() === '' ? null : Number.parseInt(v, 10)
}

function engagementRate(r: Reel) {
  if (!r.views) return null
  return (((r.likes ?? 0) + (r.comments ?? 0)) / r.views) * 100
}

function followRate(r: Reel) {
  if (!r.views) return null
  return ((r.follows ?? 0) / r.views) * 100
}

function saveRate(r: Reel) {
  if (!r.views) return null
  return ((r.saves ?? 0) / r.views) * 100
}

export function LibraryPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState(emptyForm)
  const [open, setOpen] = useState(false)
  const [igUrl, setIgUrl] = useState('')
  const [igStatus, setIgStatus] = useState<string | null>(null)

  const ingestLink = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('ingest-instagram', {
        body: { url: igUrl, kind: 'own' },
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reels'] })
      setIgUrl('')
      setIgStatus('Added.')
    },
    onError: (e: Error) => setIgStatus(e.message),
  })

  // This creator's own pillars (from their Brand Brain), not a fixed list.
  const { data: brainPillars } = useQuery({
    queryKey: ['brand_brain_pillars'],
    queryFn: async () => {
      const { data } = await supabase.from('brand_brain').select('pillars').eq('id', 1).maybeSingle()
      return ((data?.pillars as string[] | undefined) ?? []).filter(Boolean)
    },
  })
  const PILLARS = brainPillars ?? []

  const { data: reels, isLoading, isError, error } = useQuery({
    queryKey: ['reels'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reels')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Reel[]
    },
    retry: 1, // fail fast and show the real error instead of hanging through backoff
  })

  const addReel = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('reels').insert({
        posted_at: form.posted_at || null,
        transcript: form.transcript,
        caption: form.caption || null,
        pillar: form.pillar || null,
        hook_type: form.hook_type || null,
        length_seconds: toIntOrNull(form.length_seconds),
        is_organic: form.is_organic,
        views: toIntOrNull(form.views),
        likes: toIntOrNull(form.likes),
        comments: toIntOrNull(form.comments),
        shares: toIntOrNull(form.shares),
        saves: toIntOrNull(form.saves),
        profile_visits: toIntOrNull(form.profile_visits),
        follows: toIntOrNull(form.follows),
        notes: form.notes || null,
        source: 'voice_training',
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reels'] })
      setForm(emptyForm)
      setOpen(false)
    },
  })

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Library"
        description="The foundation table. Every reel you have posted — transcript and metrics together. This is also the Voice Training intake: paste past reels here to build the voice profile and give the Pattern Analyst labelled examples."
        actions={<Button onClick={() => setOpen((v) => !v)}>{open ? 'Close' : '+ Add reel'}</Button>}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (igUrl.trim()) ingestLink.mutate()
        }}
        className="mb-1 mt-6 flex gap-2"
      >
        <Input
          placeholder="Paste an Instagram reel link — auto-fetches views/likes/comments via Apify"
          value={igUrl}
          onChange={(e) => setIgUrl(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" variant="secondary" disabled={ingestLink.isPending}>
          {ingestLink.isPending ? 'Fetching…' : 'Auto-fetch'}
        </Button>
      </form>
      {igStatus && <p className="mb-4 text-xs text-white/40">{igStatus}</p>}

      {open && (
        <Card className="mb-8 space-y-3 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              addReel.mutate()
            }}
            className="space-y-3"
          >
            <Textarea
              required
              placeholder="Transcript — paste the full reel transcript"
              value={form.transcript}
              onChange={(e) => setForm({ ...form, transcript: e.target.value })}
              rows={5}
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Input
                type="date"
                value={form.posted_at}
                onChange={(e) => setForm({ ...form, posted_at: e.target.value })}
              />
              <Select value={form.pillar} onChange={(e) => setForm({ ...form, pillar: e.target.value })}>
                <option value="">Pillar</option>
                {PILLARS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
              <Input
                placeholder="Hook type"
                value={form.hook_type}
                onChange={(e) => setForm({ ...form, hook_type: e.target.value })}
              />
              <Input
                type="number"
                placeholder="Length (sec)"
                value={form.length_seconds}
                onChange={(e) => setForm({ ...form, length_seconds: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {(['views', 'likes', 'comments', 'shares', 'saves', 'profile_visits', 'follows'] as const).map(
                (field) => (
                  <Input
                    key={field}
                    type="number"
                    placeholder={field.replace('_', ' ')}
                    value={form[field]}
                    onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  />
                ),
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-white/50">
              <input
                type="checkbox"
                checked={form.is_organic}
                onChange={(e) => setForm({ ...form, is_organic: e.target.checked })}
                className="accent-accent-500"
              />
              Organic (uncheck if this was a paid promotion — promoted reels confound teardowns)
            </label>
            <Input
              placeholder="Notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
            <Button type="submit" disabled={addReel.isPending}>
              {addReel.isPending ? 'Saving…' : 'Save reel'}
            </Button>
            {addReel.isError && (
              <p className="text-sm text-red-400">{(addReel.error as Error).message}</p>
            )}
          </form>
        </Card>
      )}

      {isLoading && <p className="text-sm text-white/40">Loading…</p>}
      {isError && (
        <Card className="border-red-500/25 bg-red-500/10 p-3 text-sm text-red-300">
          Could not load reels: {(error as Error).message}
        </Card>
      )}
      {!isLoading && !isError && reels && reels.length === 0 && (
        <p className="text-sm text-white/40">No reels yet. Add the first one above.</p>
      )}
      {reels && reels.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.03] text-white/40">
              <tr>
                <th className="p-3 font-medium">Date</th>
                <th className="p-3 font-medium">Pillar</th>
                <th className="p-3 font-medium">Views</th>
                <th className="p-3 font-medium">Likes</th>
                <th className="p-3 font-medium">Comments</th>
                <th className="p-3 font-medium">Saves</th>
                <th className="p-3 font-medium">Follows</th>
                <th className="p-3 font-medium">Engagement %</th>
                <th className="p-3 font-medium">Save %</th>
                <th className="p-3 font-medium">Follow %</th>
                <th className="p-3 font-medium">Organic</th>
              </tr>
            </thead>
            <tbody>
              {reels.map((r) => (
                <tr key={r.id} className="border-t border-border-subtle text-white/70">
                  <td className="p-3">{r.posted_at ?? '—'}</td>
                  <td className="p-3">{r.pillar ?? '—'}</td>
                  <td className="p-3">{r.views ?? '—'}</td>
                  <td className="p-3">{r.likes ?? '—'}</td>
                  <td className="p-3">{r.comments ?? '—'}</td>
                  <td className="p-3">{r.saves ?? '—'}</td>
                  <td className="p-3">{r.follows ?? '—'}</td>
                  <td className="p-3">{engagementRate(r)?.toFixed(2) ?? '—'}</td>
                  <td className="p-3">{saveRate(r)?.toFixed(2) ?? '—'}</td>
                  <td className="p-3">{followRate(r)?.toFixed(2) ?? '—'}</td>
                  <td className="p-3">{r.is_organic ? 'Yes' : 'Paid'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
