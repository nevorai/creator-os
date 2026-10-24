import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button, Card, PageHeader, Select, Textarea } from '../components/ui/primitives'
import type { Reel, StudioSession } from '../types'

// A stuck spinner with no feedback is worse than a slow one — this rejects
// with a clear message instead of hanging forever if something goes wrong
// upstream (a dropped connection, an edge function that never responds).
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} took longer than ${ms / 1000}s and was cancelled — try again.`)),
        ms,
      ),
    ),
  ])
}

// Shows real elapsed seconds while a call is in flight, so "is it stuck?" has
// a visible answer instead of a spinner that looks the same at 2s and 2min.
function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!active) {
      setSeconds(0)
      return
    }
    const start = Date.now()
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [active])
  return seconds
}

export function StudioPage() {
  const qc = useQueryClient()
  const location = useLocation()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [linkingSessionId, setLinkingSessionId] = useState<string | null>(null)
  // Arrives from Ideas' "Use in Studio" button (navigate with router state) —
  // read once on mount so picking a different idea later doesn't stomp on
  // whatever the user has typed since.
  const [topic, setTopic] = useState(() => (location.state as { topic?: string } | null)?.topic ?? '')
  const [hook, setHook] = useState('')
  const [researchText, setResearchText] = useState('')
  const [hooksText, setHooksText] = useState('')
  const [scriptText, setScriptText] = useState('')
  const [packageText, setPackageText] = useState('')
  const [shootText, setShootText] = useState('')
  const [skipResearch, setSkipResearch] = useState(false)

  // Every step upserts into studio_sessions — one row per topic, filled in as it
  // goes, not thrown away when the page is left. See STATUS.md for the design.
  async function saveStep(fields: Partial<StudioSession>) {
    if (sessionId) {
      const { error } = await supabase
        .from('studio_sessions')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', sessionId)
      if (error) throw error
    } else {
      const { data, error } = await supabase
        .from('studio_sessions')
        .insert({ topic, ...fields })
        .select('id')
        .single()
      if (error) throw error
      setSessionId(data.id)
    }
    qc.invalidateQueries({ queryKey: ['studio_sessions'] })
  }

  const history = useQuery({
    queryKey: ['studio_sessions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('studio_sessions')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data as StudioSession[]
    },
  })

  // For the "mark as posted" picker on each history row — just enough per reel to
  // recognize which one it is, not the full Library shape.
  const reels = useQuery({
    queryKey: ['reels_for_linking'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reels')
        .select('id, posted_at, pillar, transcript, is_organic, created_at')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as Pick<Reel, 'id' | 'posted_at' | 'pillar' | 'transcript' | 'is_organic' | 'created_at'>[]
    },
    enabled: linkingSessionId !== null,
  })

  const linkReel = useMutation({
    mutationFn: async ({ sessionId: sid, reelId }: { sessionId: string; reelId: string | null }) => {
      const { error } = await supabase.from('studio_sessions').update({ reel_id: reelId }).eq('id', sid)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['studio_sessions'] })
      setLinkingSessionId(null)
    },
  })

  function loadSession(s: StudioSession) {
    setSessionId(s.id)
    setTopic(s.topic)
    setResearchText(s.research_text ?? '')
    setHooksText(s.hooks_text ?? '')
    setChosenHookAndClear(s.chosen_hook ?? '')
    setScriptText(s.script_text ?? '')
    setPackageText(s.package_text ?? '')
    setShootText(s.shoot_text ?? '')
  }

  function setChosenHookAndClear(h: string) {
    setHook(h)
  }

  function newSession() {
    setSessionId(null)
    setTopic('')
    setResearchText('')
    setHooksText('')
    setHook('')
    setScriptText('')
    setPackageText('')
    setShootText('')
    setSkipResearch(false)
  }

  const genResearch = useMutation({
    mutationFn: async () => {
      const { data, error } = await withTimeout(
        supabase.functions.invoke('studio-generate', { body: { action: 'research', topic } }),
        120000,
        'Research',
      )
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data.text as string
    },
    onSuccess: async (text) => {
      setResearchText(text)
      await saveStep({ research_text: text })
    },
  })

  const genHooks = useMutation({
    mutationFn: async () => {
      const { data, error } = await withTimeout(
        supabase.functions.invoke('studio-generate', {
          body: { action: 'hooks', topic, research: researchText },
        }),
        40000,
        'Hook writing',
      )
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data.text as string
    },
    onSuccess: async (text) => {
      setHooksText(text)
      await saveStep({ hooks_text: text })
    },
  })

  const genScript = useMutation({
    mutationFn: async () => {
      const { data, error } = await withTimeout(
        supabase.functions.invoke('studio-generate', {
          body: { action: 'script', topic, hook, research: researchText },
        }),
        40000,
        'Script writing',
      )
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data.text as string
    },
    onSuccess: async (text) => {
      setScriptText(text)
      await saveStep({ chosen_hook: hook, script_text: text })
    },
  })

  function makeFollowUp(action: 'package' | 'shoot', label: string, field: 'package_text' | 'shoot_text', set: (t: string) => void) {
    return async () => {
      const { data, error } = await withTimeout(
        supabase.functions.invoke('studio-generate', { body: { action, topic, script: scriptText } }),
        40000,
        label,
      )
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      const text = data.text as string
      set(text)
      await saveStep({ [field]: text })
    }
  }
  const genPackage = useMutation({ mutationFn: makeFollowUp('package', 'Packaging', 'package_text', setPackageText) })
  const genShoot = useMutation({ mutationFn: makeFollowUp('shoot', 'Shoot card', 'shoot_text', setShootText) })

  const canResearch = topic.trim().length > 0
  const canWriteHooks = skipResearch ? canResearch : researchText.trim().length > 0
  const researchSecs = useElapsedSeconds(genResearch.isPending)
  const hooksSecs = useElapsedSeconds(genHooks.isPending)
  const scriptSecs = useElapsedSeconds(genScript.isPending)

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Studio"
        description="Topic → real sources → hooks in your formula → a full script in your voice — reading from the Brand Brain you've already set up. Every step is saved as you go."
        actions={
          sessionId && (
            <Button variant="secondary" onClick={newSession} className="text-xs">
              + New topic
            </Button>
          )
        }
      />

      <div className="mt-6 space-y-2">
        <label htmlFor="topic" className="text-sm font-medium text-white/70">
          Topic
        </label>
        <Textarea
          id="topic"
          rows={2}
          placeholder="What's today's reel about?"
          value={topic}
          onChange={(e) => {
            if (sessionId) newSession()
            setTopic(e.target.value)
          }}
        />
        <Button onClick={() => genResearch.mutate()} disabled={genResearch.isPending || !canResearch}>
          {genResearch.isPending ? `Searching the web… ${researchSecs}s` : 'Research this topic'}
        </Button>
        {genResearch.isError && (
          <p className="text-sm text-red-400">{(genResearch.error as Error).message}</p>
        )}
      </div>

      {researchText && (
        <div className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold text-white/70">Sources — check these before you shoot</h2>
          <Card className="border-amber-500/25 bg-amber-500/[0.06] p-4">
            <pre className="whitespace-pre-wrap font-sans text-sm text-amber-100/90">{researchText}</pre>
          </Card>
          <p className="text-xs text-white/30">
            Hooks and the script below are instructed to use only what's written here — nothing
            else. Click the links and confirm before you say anything specific on camera.
          </p>
        </div>
      )}

      {!researchText && (
        <label className="mt-3 flex items-center gap-2 text-xs text-white/40">
          <input
            type="checkbox"
            checked={skipResearch}
            onChange={(e) => setSkipResearch(e.target.checked)}
            className="accent-accent-500"
          />
          Skip research for this one (hooks will stay general — no invented facts, numbers, or
          names, but nothing specific either)
        </label>
      )}

      <div className="mt-6">
        <Button onClick={() => genHooks.mutate()} disabled={genHooks.isPending || !canWriteHooks}>
          {genHooks.isPending ? `Writing hooks… ${hooksSecs}s` : 'Generate hooks'}
        </Button>
        {genHooks.isError && (
          <p className="mt-2 text-sm text-red-400">{(genHooks.error as Error).message}</p>
        )}
      </div>

      {hooksText && (
        <div className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold text-white/70">Hooks</h2>
          <Card className="p-4">
            <pre className="whitespace-pre-wrap font-sans text-sm text-white/80">{hooksText}</pre>
          </Card>

          <label htmlFor="hook" className="mt-4 block text-sm font-medium text-white/70">
            Paste the hook you're going with
          </label>
          <input
            id="hook"
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            placeholder="Copy one line from above"
            className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-accent-500/60 focus:ring-2 focus:ring-accent-500/20"
          />
          <Button onClick={() => genScript.mutate()} disabled={genScript.isPending || !hook.trim()}>
            {genScript.isPending ? `Writing script… ${scriptSecs}s` : 'Generate script'}
          </Button>
          {genScript.isError && (
            <p className="text-sm text-red-400">{(genScript.error as Error).message}</p>
          )}
        </div>
      )}

      {scriptText && (
        <div className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold text-white/70">Script</h2>
          <Card className="p-4">
            <pre className="whitespace-pre-wrap font-sans text-sm text-white/80">{scriptText}</pre>
          </Card>
          <p className="text-xs text-white/30">
            Saved to History automatically. Once you've shot it, add the real numbers in the
            Library too — that's what teaches the Pattern Analyst later.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="secondary" onClick={() => genPackage.mutate()} disabled={genPackage.isPending}>
              {genPackage.isPending ? 'Writing packaging…' : packageText ? 'Rewrite caption and tags' : 'Write caption and tags'}
            </Button>
            <Button variant="secondary" onClick={() => genShoot.mutate()} disabled={genShoot.isPending}>
              {genShoot.isPending ? 'Writing shoot card…' : shootText ? 'Rewrite shoot card' : 'Write shoot card'}
            </Button>
          </div>
          {(genPackage.isError || genShoot.isError) && (
            <p className="text-sm text-red-400">{((genPackage.error ?? genShoot.error) as Error).message}</p>
          )}
        </div>
      )}

      {packageText && (
        <div className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold text-white/70">Caption, tags and cover text</h2>
          <Card className="p-4"><pre className="whitespace-pre-wrap font-sans text-sm text-white/80">{packageText}</pre></Card>
        </div>
      )}
      {shootText && (
        <div className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold text-white/70">Shoot card and edit brief</h2>
          <Card className="p-4"><pre className="whitespace-pre-wrap font-sans text-sm text-white/80">{shootText}</pre></Card>
        </div>
      )}

      <div className="mt-10 border-t border-border-subtle pt-6">
        <h2 className="text-sm font-semibold text-white/70">History</h2>
        {history.isLoading && <p className="mt-2 text-sm text-white/40">Loading…</p>}
        {history.isError && (
          <p className="mt-2 text-sm text-red-400">{(history.error as Error).message}</p>
        )}
        {history.data && history.data.length === 0 && (
          <p className="mt-2 text-sm text-white/40">
            Nothing yet — your first topic above will show up here once you research or write
            hooks for it.
          </p>
        )}
        <div className="mt-3 space-y-2">
          {history.data?.map((s) => {
            const linkedReel = s.reel_id ? reels.data?.find((r) => r.id === s.reel_id) : null
            return (
              <Card
                key={s.id}
                className={`p-3 text-sm ${s.id === sessionId ? 'border-accent-500/40 bg-accent-500/[0.06]' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => loadSession(s)}
                  className="block w-full text-left hover:opacity-80"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-medium text-white">{s.topic}</span>
                    <span className="shrink-0 text-xs text-white/40">
                      {new Date(s.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-white/40">
                    <span>{s.research_text ? '✓ research' : '— research'}</span>
                    <span>{s.hooks_text ? '✓ hooks' : '— hooks'}</span>
                    <span>{s.script_text ? '✓ script' : '— script'}</span>
                    <span>
                      {s.reel_id
                        ? `✓ posted${linkedReel ? ` — ${linkedReel.pillar ?? 'reel'} ${linkedReel.posted_at ?? ''}` : ''}`
                        : '— not posted'}
                    </span>
                  </div>
                </button>

                <div className="mt-2 flex items-center gap-2 border-t border-border-subtle pt-2">
                  {s.reel_id ? (
                    <button
                      type="button"
                      onClick={() => linkReel.mutate({ sessionId: s.id, reelId: null })}
                      disabled={linkReel.isPending}
                      className="text-xs text-white/40 underline hover:text-white/70 disabled:opacity-50"
                    >
                      Unlink
                    </button>
                  ) : linkingSessionId === s.id ? (
                    <>
                      <Select
                        defaultValue=""
                        disabled={reels.isLoading || linkReel.isPending}
                        onChange={(e) => {
                          if (e.target.value) linkReel.mutate({ sessionId: s.id, reelId: e.target.value })
                        }}
                        className="flex-1 py-1.5 text-xs"
                      >
                        <option value="" disabled>
                          {reels.isLoading ? 'Loading reels…' : 'Pick the reel you posted'}
                        </option>
                        {reels.data?.map((r) => (
                          <option key={r.id} value={r.id}>
                            {(r.posted_at ?? 'no date') +
                              ' — ' +
                              (r.pillar ?? 'untitled') +
                              ' — ' +
                              r.transcript.slice(0, 40).replace(/\s+/g, ' ') +
                              '…'}
                          </option>
                        ))}
                      </Select>
                      <button
                        type="button"
                        onClick={() => setLinkingSessionId(null)}
                        className="text-xs text-white/40 hover:text-white/70"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setLinkingSessionId(s.id)}
                      className="text-xs text-accent-300 underline hover:text-accent-200"
                    >
                      Mark as posted →
                    </button>
                  )}
                  {linkReel.isError && linkingSessionId === s.id && (
                    <span className="text-xs text-red-400">{(linkReel.error as Error).message}</span>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
