import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, FieldLabel, Input, Select, Textarea } from '../components/ui/primitives'
import { callFn } from '../lib/fn'
import { supabase } from '../lib/supabase'
import { useTenant } from '../lib/tenant'

type CatalogueNiche = { key: string; name: string; sources: { name: string; url: string }[]; handles: string[] }
type Pick = { key?: string; custom?: string }
const idOf = (p: Pick) => (p.key ? `k:${p.key}` : `c:${(p.custom ?? '').toLowerCase()}`)

// First screen a new creator sees (their account was made when they paid):
// 1 welcome, 2 pick niches, 3 what Orbit watches (skippable), then the Brand Trainer.
export function OnboardingPage() {
  const { tenant, profile, refresh } = useTenant()
  const nav = useNavigate()
  const cap = Number(tenant?.limits?.niches ?? 2)
  const [step, setStep] = useState(1)
  const [f, setF] = useState({
    display_name: profile?.display_name ?? tenant?.name ?? '',
    handle: profile?.handle ?? '',
    language: (profile?.language ?? 'hinglish') as string,
    about: profile?.about ?? '',
  })
  const [picks, setPicks] = useState<Pick[]>([])
  const [primary, setPrimary] = useState<string | null>(null)
  const [custom, setCustom] = useState('')
  const [feeds, setFeeds] = useState<Record<string, boolean>>({})
  const [handles, setHandles] = useState('')

  const cat = useQuery({
    queryKey: ['niche_catalogue'],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('niche_catalogue')
      if (error) throw error
      return (data ?? []) as CatalogueNiche[]
    },
  })
  const byKey = useMemo(() => new Map((cat.data ?? []).map((n) => [n.key, n])), [cat.data])
  const full = picks.length >= cap

  const toggle = (p: Pick) => {
    const id = idOf(p)
    setPicks((cur) => (cur.some((x) => idOf(x) === id) ? cur.filter((x) => idOf(x) !== id) : cur.length >= cap ? cur : [...cur, p]))
  }
  const addCustom = () => {
    const c = custom.replace(/\s+/g, ' ').trim().slice(0, 60)
    if (c.length < 2 || full) return
    if (!picks.some((x) => idOf(x) === idOf({ custom: c }))) setPicks([...picks, { custom: c }])
    setCustom('')
  }

  // Feeds offered in step 3: the packs of the chosen niches, pre-ticked.
  const offered = useMemo(() => {
    const seen = new Map<string, { name: string; url: string; niche: string }>()
    for (const p of picks) for (const s of (p.key ? byKey.get(p.key)?.sources : []) ?? []) if (!seen.has(s.url)) seen.set(s.url, { ...s, niche: p.key! })
    return [...seen.values()]
  }, [picks, byKey])

  const saveNiches = useMutation({
    mutationFn: () => {
      const main = primary && picks.some((p) => idOf(p) === primary) ? primary : idOf(picks[0])
      return callFn('tenant-admin', {
        action: 'onboard', ...f,
        niches: picks.map((p) => ({ ...p, primary: idOf(p) === main })),
      })
    },
    onSuccess: () => {
      setFeeds(Object.fromEntries(offered.map((s) => [s.url, true])))
      setStep(3)
    },
  })
  const finish = useMutation({
    mutationFn: (skip: boolean) =>
      callFn('tenant-admin', {
        action: 'watch',
        sources: skip ? [] : offered.filter((s) => feeds[s.url]),
        handles: skip ? [] : handles.split(/[\s,]+/).filter(Boolean),
      }),
    onSuccess: () => {
      refresh()
      nav('/brand-trainer', { replace: true })
    },
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const chip = (on: boolean, disabled: boolean) =>
    `min-h-11 rounded-[14px] border px-4 py-2 text-sm font-medium transition-colors ${
      on ? 'border-accent-500 bg-[var(--nav-active-bg)] text-white' : 'border-border bg-surface-raised text-white/70 hover:text-white'
    } ${disabled ? 'opacity-40' : ''}`

  return (
    <div className="mx-auto max-w-xl pt-4 sm:pt-10">
      <p className="text-xs font-medium text-white/40">Step {step} of 3</p>
      <div className="mt-2 flex gap-1.5" aria-hidden="true">
        {[1, 2, 3].map((n) => <div key={n} className={`h-1 flex-1 rounded-full ${n <= step ? 'bg-accent-500' : 'bg-white/10'}`} />)}
      </div>

      {step === 1 && (
        <>
          <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight">Welcome. Let's set up your studio.</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/50">Three quick steps. Then you talk to your Brand Trainer, so everything your team writes sounds like you.</p>
          <Card className="mt-6 p-5">
            <form onSubmit={(e: FormEvent) => { e.preventDefault(); setStep(2) }} className="space-y-4">
              <div><FieldLabel>Your name or brand name</FieldLabel><Input required maxLength={120} value={f.display_name} onChange={set('display_name')} /></div>
              <div><FieldLabel>Instagram handle (optional)</FieldLabel><Input maxLength={60} placeholder="@yourhandle" value={f.handle} onChange={set('handle')} /></div>
              <div>
                <FieldLabel>Language you speak on camera</FieldLabel>
                <Select value={f.language} onChange={set('language')}>
                  <option value="hinglish">Hinglish</option><option value="hindi">Hindi</option><option value="english">English</option>
                </Select>
              </div>
              <div><FieldLabel>One line about you (optional)</FieldLabel><Textarea rows={2} maxLength={1000} value={f.about} onChange={set('about')} /></div>
              <Button type="submit" disabled={!f.display_name.trim()} className="w-full">Next</Button>
            </form>
          </Card>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight">What do you make content about?</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/50">
            Pick up to {cap}. Your research team follows each one. {picks.length}/{cap} chosen.
          </p>
          <Card className="mt-6 p-5">
            {cat.isLoading && <p className="text-sm text-white/50">Loading…</p>}
            {cat.isError && <p className="text-sm text-red-500">Could not load the niches. Refresh and try again.</p>}
            <div className="flex flex-wrap gap-2">
              {(cat.data ?? []).map((n) => {
                const on = picks.some((p) => p.key === n.key)
                return (
                  <button key={n.key} type="button" aria-pressed={on} disabled={!on && full} onClick={() => toggle({ key: n.key })} className={chip(on, !on && full)}>
                    {n.name}
                  </button>
                )
              })}
              {picks.filter((p) => p.custom).map((p) => (
                <button key={idOf(p)} type="button" aria-pressed onClick={() => toggle(p)} className={chip(true, false)}>{p.custom} ✕</button>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <Input
                maxLength={60} placeholder="Something else? Type it" value={custom} disabled={full}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
              />
              <Button type="button" variant="secondary" onClick={addCustom} disabled={full || custom.trim().length < 2}>Add</Button>
            </div>
            {picks.length > 1 && (
              <div className="mt-4">
                <FieldLabel>Main niche</FieldLabel>
                <Select value={primary ?? idOf(picks[0])} onChange={(e) => setPrimary(e.target.value)}>
                  {picks.map((p) => <option key={idOf(p)} value={idOf(p)}>{p.key ? byKey.get(p.key)?.name : p.custom}</option>)}
                </Select>
              </div>
            )}
            {saveNiches.isError && <p className="mt-3 text-xs text-red-500">{(saveNiches.error as Error).message}</p>}
            <div className="mt-5 flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep(1)}>Back</Button>
              <Button type="button" className="flex-1" disabled={!picks.length || saveNiches.isPending} onClick={() => saveNiches.mutate()}>
                {saveNiches.isPending ? 'Saving…' : 'Next'}
              </Button>
            </div>
          </Card>
        </>
      )}

      {step === 3 && (
        <>
          <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight">What should Orbit watch?</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/50">News feeds and creators it reads every night. You can change this any time, or skip it for now.</p>
          <Card className="mt-6 p-5">
            {offered.length > 0 && (
              <div className="space-y-1">
                <FieldLabel>News feeds for your niches</FieldLabel>
                {offered.map((s) => (
                  <label key={s.url} className="flex min-h-11 items-center gap-3 rounded-[14px] px-2 text-sm hover:bg-white/5">
                    <input type="checkbox" className="size-5 accent-[var(--brand-magenta)]" checked={feeds[s.url] ?? false} onChange={(e) => setFeeds({ ...feeds, [s.url]: e.target.checked })} />
                    {s.name}
                  </label>
                ))}
              </div>
            )}
            <div className={offered.length ? 'mt-4' : ''}>
              <FieldLabel>Instagram accounts to watch (optional)</FieldLabel>
              <Textarea rows={3} placeholder="@creator1 @creator2" value={handles} onChange={(e) => setHandles(e.target.value)} />
            </div>
            {finish.isError && <p className="mt-3 text-xs text-red-500">{(finish.error as Error).message}</p>}
            <div className="mt-5 flex gap-2">
              <Button type="button" variant="secondary" disabled={finish.isPending} onClick={() => finish.mutate(true)}>Skip</Button>
              <Button type="button" className="flex-1" disabled={finish.isPending} onClick={() => finish.mutate(false)}>
                {finish.isPending ? 'Saving…' : 'Continue to Brand Trainer'}
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
