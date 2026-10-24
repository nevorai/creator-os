import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, FieldLabel, Input, Select, Textarea } from '../components/ui/primitives'
import { callFn } from '../lib/fn'
import { useTenant } from '../lib/tenant'

// First screen a new creator sees (their account was made when they paid). Four questions, then
// straight into the Brand Trainer, where the Brand Brain is built from a conversation.
export function OnboardingPage() {
  const { tenant, profile, refresh } = useTenant()
  const nav = useNavigate()
  const [f, setF] = useState({
    display_name: profile?.display_name ?? tenant?.name ?? '',
    handle: profile?.handle ?? '',
    niche: profile?.niche ?? '',
    language: (profile?.language ?? 'hinglish') as string,
    about: profile?.about ?? '',
  })
  const save = useMutation({
    mutationFn: () => callFn('tenant-admin', { action: 'onboard', ...f }),
    onSuccess: () => {
      refresh()
      nav('/brand-trainer', { replace: true })
    },
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  return (
    <div className="mx-auto max-w-xl pt-4 sm:pt-10">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Welcome. Let's set up your studio.</h1>
      <p className="mt-2 text-sm leading-relaxed text-white/50">
        Four quick answers. Next, you will talk to your Brand Trainer and paste a few of your own reels, so
        everything your team writes sounds like you.
      </p>
      <Card className="mt-6 p-5">
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            save.mutate()
          }}
          className="space-y-4"
        >
          <div>
            <FieldLabel>Your name or brand name</FieldLabel>
            <Input required maxLength={120} value={f.display_name} onChange={set('display_name')} />
          </div>
          <div>
            <FieldLabel>Instagram handle (optional)</FieldLabel>
            <Input maxLength={60} placeholder="@yourhandle" value={f.handle} onChange={set('handle')} />
          </div>
          <div>
            <FieldLabel>What do you make content about?</FieldLabel>
            <Input
              maxLength={200}
              placeholder="e.g. health and fitness, astrology, trading, politics"
              value={f.niche}
              onChange={set('niche')}
            />
          </div>
          <div>
            <FieldLabel>Language you speak on camera</FieldLabel>
            <Select value={f.language} onChange={set('language')}>
              <option value="hinglish">Hinglish</option>
              <option value="hindi">Hindi</option>
              <option value="english">English</option>
            </Select>
          </div>
          <div>
            <FieldLabel>One line about you (optional)</FieldLabel>
            <Textarea rows={2} maxLength={1000} value={f.about} onChange={set('about')} />
          </div>
          {save.isError && <p className="text-xs text-red-400">{(save.error as Error).message}</p>}
          <Button type="submit" disabled={save.isPending || !f.display_name.trim()} className="w-full">
            {save.isPending ? 'Saving…' : 'Continue to Brand Trainer'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
