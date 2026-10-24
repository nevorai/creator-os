import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Badge, Button, Card, PageHeader, Spinner, Textarea } from '../components/ui/primitives'
import { callFn } from '../lib/fn'
import { supabase } from '../lib/supabase'
import { useTenant } from '../lib/tenant'
import type { BrandBrain } from '../types'

type Msg = { id: string; role: 'user' | 'assistant'; content: string }

const OPENER =
  'Hi! I am your Brand Trainer. Paste 2 or 3 of your best reel scripts or transcripts (as many as you like), and tell me who you make content for. I will learn how you talk, then build your Brand Brain from our chat.'

export function BrandTrainerPage() {
  const { tenant, canWrite, isOwner } = useTenant()
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const chatKey = ['brand_chat', tenant?.id]

  const chat = useQuery({
    queryKey: chatKey,
    enabled: Boolean(tenant),
    queryFn: async () => {
      const { data, error } = await supabase.from('brand_chat').select('id, role, content').order('created_at').limit(200)
      if (error) throw error
      return (data ?? []) as Msg[]
    },
  })
  const brain = useQuery({
    queryKey: ['brand_brain', tenant?.id],
    enabled: Boolean(tenant),
    queryFn: async () => {
      const { data, error } = await supabase.from('brand_brain').select('*').eq('id', 1).maybeSingle()
      if (error) throw error
      return data as BrandBrain | null
    },
  })

  const send = useMutation({
    mutationFn: (t: string) => callFn('brand-trainer', { action: 'message', text: t }),
    onMutate: async (t) => {
      // Show their message at once; the server copy replaces it when the reply lands.
      await qc.cancelQueries({ queryKey: chatKey })
      qc.setQueryData<Msg[]>(chatKey, (old) => [...(old ?? []), { id: 'tmp', role: 'user', content: t }])
      setText('')
    },
    onSettled: () => qc.invalidateQueries({ queryKey: chatKey }),
  })
  const build = useMutation({
    mutationFn: () => callFn('brand-trainer', { action: 'build' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brand_brain', tenant?.id] }),
  })
  const reset = useMutation({
    mutationFn: () => callFn('brand-trainer', { action: 'reset' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatKey }),
  })

  const msgs = chat.data ?? []
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [msgs.length, send.isPending])
  const userTurns = msgs.filter((m) => m.role === 'user').length
  const built = Boolean(brain.data?.voice_notes)

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0">
        <PageHeader
          title="Brand Trainer"
          description="Talk to it like a person. Paste your reels, answer a question or two, then press Build. Your whole team writes from this."
          actions={
            isOwner && msgs.length > 0 ? (
              <Button
                variant="secondary"
                className="text-xs"
                disabled={reset.isPending}
                onClick={() => {
                  if (confirm('Start the training chat again? Your built Brand Brain stays.')) reset.mutate()
                }}
              >
                Start over
              </Button>
            ) : undefined
          }
        />
        <Card className="mt-5 flex flex-col p-0">
          <div className="max-h-[56dvh] min-h-[240px] space-y-3 overflow-y-auto p-4">
            <Bubble role="assistant" content={OPENER} />
            {msgs.map((m) => (
              <Bubble key={m.id} role={m.role} content={m.content} />
            ))}
            {send.isPending && (
              <div className="flex items-center gap-2 text-xs text-white/40">
                <Spinner /> Reading…
              </div>
            )}
            <div ref={end} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (text.trim() && canWrite) send.mutate(text.trim())
            }}
            className="border-t border-border-subtle p-3"
          >
            <Textarea
              rows={3}
              maxLength={40000}
              disabled={!canWrite}
              placeholder={canWrite ? 'Paste a reel transcript, or type your answer…' : 'Your workspace is view-only right now.'}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            {(send.isError || build.isError) && (
              <p className="mt-2 text-xs text-red-400">{((send.error ?? build.error) as Error).message}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-white/30">{text.length.toLocaleString()} / 40,000</span>
              <div className="flex gap-2">
                <Button type="submit" disabled={!canWrite || send.isPending || !text.trim()}>
                  Send
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!canWrite || build.isPending || userTurns < 1}
                  onClick={() => build.mutate()}
                >
                  {build.isPending ? 'Building…' : built ? 'Rebuild my Brand Brain' : 'Build my Brand Brain'}
                </Button>
              </div>
            </div>
          </form>
        </Card>
      </div>

      <div className="min-w-0 lg:pt-1">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-display text-sm font-semibold">Your Brand Brain</span>
            <Badge variant={built ? 'success' : 'default'}>{built ? 'Built' : 'Not built yet'}</Badge>
          </div>
          {built && brain.data ? (
            <div className="space-y-3 text-sm">
              <Block label="Pillars" value={(brain.data.pillars ?? []).join(' · ')} />
              <Block label="Hook formula" value={brain.data.hook_formula} />
              <Block label="Voice" value={brain.data.voice_notes} />
              <Block label="Rules" value={brain.data.banned_claims} />
              <p className="text-[11px] text-white/30">Edit any of this by hand on the Brand Brain page.</p>
            </div>
          ) : (
            <p className="text-sm text-white/40">
              After a few messages, press Build. It is made only from what you pasted and said.
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}

function Bubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  const mine = role === 'user'
  const long = content.length > 600
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          mine ? 'bg-accent-500/20 text-white' : 'bg-white/[0.05] text-white/85'
        }`}
      >
        {long && mine ? `${content.slice(0, 600)}…  (${content.length.toLocaleString()} characters pasted)` : content}
      </div>
    </div>
  )
}

function Block({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-widest text-white/30">{label}</div>
      <p className="mt-1 whitespace-pre-wrap break-words text-white/75">{value}</p>
    </div>
  )
}
