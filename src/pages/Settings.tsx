import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { callFn } from '../lib/fn'
import { useTenant } from '../lib/tenant'
import { Badge, Button, Card, Input, PageHeader } from '../components/ui/primitives'
import type { AppSettingsRow } from '../types'

export function SettingsPage() {
  const qc = useQueryClient()
  const { tenant, isOwner } = useTenant()
  const { data } = useQuery({
    queryKey: ['app_settings', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings').select('*').eq('id', 1).single()
      if (error) throw error
      return data as AppSettingsRow
    },
    enabled: supabaseConfigured && Boolean(tenant),
  })
  const usage = useQuery({
    queryKey: ['ai_usage', tenant?.id],
    enabled: Boolean(tenant),
    queryFn: async () => {
      const month = new Date().toISOString().slice(0, 7) + '-01'
      const { data } = await supabase.from('ai_usage').select('credits').eq('month', month).maybeSingle()
      return (data?.credits as number | undefined) ?? 0
    },
  })
  const billing = useMutation({
    mutationFn: () => callFn<{ url: string }>('tenant-admin', { action: 'billing_url' }),
    onSuccess: (r) => {
      window.location.href = r.url
    },
  })

  const cap = Number(tenant?.limits?.ai_credits ?? 300)
  const refresh = () => qc.invalidateQueries({ queryKey: ['app_settings', tenant?.id] })

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Settings"
        description="Your plan, your AI credits and, if you want to use your own, your AI keys. Keys are stored where only the server can read them, and they are never shown again after saving."
      />

      <div className="mt-6 space-y-3">
        <Card className="p-3.5 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-white">Plan</span>
            <Badge variant={tenant?.status === 'active' ? 'success' : 'default'}>
              {tenant?.status === 'active' ? tenant.plan_key : `${tenant?.status ?? ''} · ${tenant?.plan_key ?? ''}`}
            </Badge>
          </div>
          <div className="mt-3 text-xs text-white/50">
            AI credits this month: <span className="text-white">{usage.data ?? 0}</span> of {cap.toLocaleString()}. They reset on the 1st.
            {data?.anthropic_key_set ? ' You use your own Anthropic key, so credits are not counted.' : ''}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-accent-500" style={{ width: `${Math.min(100, ((usage.data ?? 0) / Math.max(1, cap)) * 100)}%` }} />
          </div>
          {isOwner && (
            <div className="mt-3">
              <Button variant="secondary" className="text-xs" disabled={billing.isPending} onClick={() => billing.mutate()}>
                {billing.isPending ? 'Opening…' : 'Billing and invoices'}
              </Button>
              {billing.isError && <p className="mt-2 text-xs text-red-400">{(billing.error as Error).message}</p>}
            </div>
          )}
        </Card>

        <KeyRow label="Anthropic API key (optional)" provider="anthropic" currentlySet={Boolean(data?.anthropic_key_set)} createUrl="console.anthropic.com" canEdit={isOwner} onSaved={refresh} />
        <KeyRow label="Gemini API key (optional)" provider="gemini" currentlySet={Boolean(data?.gemini_key_set)} createUrl="aistudio.google.com" canEdit={isOwner} onSaved={refresh} />

        <Row label="Instagram Graph API" ok={data?.instagram_connected ?? false} okText="Connected" badText="Not connected" />
      </div>
    </div>
  )
}

function Row({ label, ok, okText, badText }: { label: string; ok: boolean; okText: string; badText: string }) {
  return (
    <Card className="flex items-center justify-between gap-2 p-3.5 text-sm">
      <span className="font-medium text-white">{label}</span>
      <Badge variant={ok ? 'success' : 'default'}>{ok ? okText : badText}</Badge>
    </Card>
  )
}

function KeyRow({
  label, provider, currentlySet, createUrl, canEdit, onSaved,
}: {
  label: string
  provider: 'anthropic' | 'gemini'
  currentlySet: boolean
  createUrl: string
  canEdit: boolean
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')

  const save = useMutation({
    mutationFn: () => callFn('tenant-admin', { action: 'save_key', provider, key: value }),
    onSuccess: () => {
      setEditing(false)
      setValue('')
      onSaved()
    },
  })
  const remove = useMutation({
    mutationFn: () => callFn('tenant-admin', { action: 'remove_key', provider }),
    onSuccess: onSaved,
  })

  if (!editing) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-2 p-3.5 text-sm">
        <span className="font-medium text-white">{label}</span>
        <div className="flex items-center gap-2">
          <Badge variant={currentlySet ? 'success' : 'default'}>{currentlySet ? 'Set' : 'Not set (Nevorai’s key is used)'}</Badge>
          {canEdit && (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)} className="px-2 py-1 text-xs">
                {currentlySet ? 'Replace' : 'Add key'}
              </Button>
              {currentlySet && (
                <Button variant="secondary" onClick={() => remove.mutate()} disabled={remove.isPending} className="px-2 py-1 text-xs">
                  Remove
                </Button>
              )}
            </>
          )}
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-3.5 text-sm">
      <div className="mb-1 font-medium text-white">{label}</div>
      <div className="mb-2 text-[11px] text-white/35">Create one at {createUrl}</div>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="flex flex-wrap gap-2">
        <Input type="password" autoComplete="off" placeholder="Paste key, never shown again" value={value} onChange={(e) => setValue(e.target.value)} className="min-w-[200px] flex-1" />
        <Button type="submit" disabled={save.isPending || !value.trim()} className="text-xs">{save.isPending ? 'Saving…' : 'Save'}</Button>
        <Button type="button" variant="secondary" onClick={() => { setEditing(false); setValue('') }} className="text-xs">Cancel</Button>
      </form>
      {save.isError && <p className="mt-2 text-xs text-red-400">{(save.error as Error).message}</p>}
    </Card>
  )
}
