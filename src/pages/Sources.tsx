import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Badge, Button, Card, Input, PageHeader, Select } from '../components/ui/primitives'
import type { NewsStory, Source } from '../types'

export function SourcesPage() {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [type, setType] = useState<'rss' | 'newspaper' | 'other'>('rss')

  const { data: sources, isLoading } = useQuery({
    queryKey: ['sources'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sources')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Source[]
    },
  })

  const { data: stories } = useQuery({
    queryKey: ['news_stories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('news_stories')
        .select('*')
        .order('fetched_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return data as NewsStory[]
    },
  })

  const addSource = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('sources').insert({ name, url, type })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sources'] })
      setName('')
      setUrl('')
    },
  })

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Sources"
        description="Newspapers and RSS feeds the News Desk Analyst reads nightly, kept to what is relevant to your niche."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim() && url.trim()) addSource.mutate()
        }}
        className="mt-6 space-y-2"
      >
        <div className="flex gap-2">
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
          <Select value={type} onChange={(e) => setType(e.target.value as 'rss' | 'newspaper' | 'other')}>
            <option value="rss">RSS</option>
            <option value="newspaper">Newspaper</option>
            <option value="other">Other</option>
          </Select>
        </div>
        <div className="flex gap-2">
          <Input placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} className="flex-1" />
          <Button type="submit" disabled={addSource.isPending}>
            Add
          </Button>
        </div>
      </form>

      {isLoading && <p className="mt-4 text-sm text-white/40">Loading…</p>}
      {sources && sources.length === 0 && (
        <p className="mt-4 text-sm text-white/40">No sources yet.</p>
      )}
      {sources && sources.length > 0 && (
        <Card className="mt-6 divide-y divide-border-subtle overflow-hidden">
          {sources.map((s) => (
            <div key={s.id} className="flex items-center justify-between p-3.5 text-sm">
              <div>
                <div className="font-medium text-white">{s.name}</div>
                <div className="text-xs text-white/40">{s.url}</div>
              </div>
              <Badge>{s.type}</Badge>
            </div>
          ))}
        </Card>
      )}

      <h2 className="mb-3 mt-10 text-sm font-semibold text-white/50">
        Latest headlines (pulled nightly at 2am)
      </h2>
      {stories && stories.length === 0 && (
        <p className="text-sm text-white/40">
          Nothing pulled yet — the nightly job runs at 2am IST, or add a source above and check
          back tomorrow.
        </p>
      )}
      {stories && stories.length > 0 && (
        <Card className="divide-y divide-border-subtle overflow-hidden text-sm">
          {stories.map((s) => (
            <a
              key={s.id}
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="block p-3.5 transition-colors hover:bg-white/[0.03]"
            >
              <span className="font-medium text-white hover:text-accent-300">{s.title}</span>
              <div className="text-xs text-white/30">
                {s.published_at ? new Date(s.published_at).toLocaleDateString() : '—'}
              </div>
            </a>
          ))}
        </Card>
      )}
    </div>
  )
}
