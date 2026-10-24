import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from './auth'
import { setActiveTenantId, supabase } from './supabase'

export type Role = 'owner' | 'editor' | 'viewer'
export type Tenant = {
  id: string
  slug: string
  name: string
  custom_domain: string | null
  status: 'active' | 'suspended' | 'ended'
  plan_key: string
  limits: Record<string, number | boolean>
  trial_ends_at: string | null
}
export type Profile = {
  display_name: string | null
  niche: string | null
  handle: string | null
  language: 'english' | 'hindi' | 'hinglish' | null
  about: string | null
  onboarded_at: string | null
}

type Ctx = {
  loading: boolean
  tenants: (Tenant & { role: Role })[]
  tenant: (Tenant & { role: Role }) | null
  profile: Profile | null
  role: Role | null
  /** May change data: owner or editor of an active workspace. */
  canWrite: boolean
  isOwner: boolean
  select: (id: string) => void
  refresh: () => void
}

export const TenantContext = createContext<Ctx>({
  loading: true, tenants: [], tenant: null, profile: null, role: null, canWrite: false, isOwner: false,
  select: () => {}, refresh: () => {},
})
export const useTenant = () => useContext(TenantContext)

const KEY = 'creator.tenant'
const read = () => { try { return localStorage.getItem(KEY) } catch { return null } }
const write = (v: string) => { try { localStorage.setItem(KEY, v) } catch { /* private window */ } }

/** The creator whose address this is (<slug>.creator.nevorai.com or their own domain). Public, says nothing private. */
export async function resolveHost(): Promise<{ id: string; slug: string; name: string } | null> {
  const host = window.location.hostname
  if (host === 'localhost' || host === 'creator.nevorai.com' || host.endsWith('.vercel.app')) return null
  const { data } = await supabase.rpc('tenant_by_host', { h: host })
  return (data as { id: string; slug: string; name: string }[] | null)?.[0] ?? null
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const qc = useQueryClient()
  const uid = session?.user.id
  const [chosen, setChosen] = useState<string | null>(read())

  const list = useQuery({
    queryKey: ['my_tenants', uid],
    enabled: Boolean(uid),
    staleTime: 30_000,
    queryFn: async () => {
      // Two small reads in parallel: my memberships (with role) and the tenants themselves.
      const [m, t] = await Promise.all([
        supabase.from('tenant_members').select('tenant_id, role, user_id').eq('user_id', uid!),
        supabase.from('tenants').select('id, slug, name, custom_domain, status, plan_key, limits, trial_ends_at'),
      ])
      if (m.error) throw m.error
      if (t.error) throw t.error
      const roles = new Map((m.data ?? []).map((r) => [r.tenant_id as string, r.role as Role]))
      return ((t.data ?? []) as Tenant[]).filter((x) => roles.has(x.id)).map((x) => ({ ...x, role: roles.get(x.id)! }))
    },
  })

  const tenants = list.data ?? []
  const tenant = tenants.find((t) => t.id === chosen) ?? tenants[0] ?? null
  // The header must be set before any tenant-scoped query runs, so set it during render.
  setActiveTenantId(tenant?.id ?? null)

  const prof = useQuery({
    queryKey: ['tenant_profile', tenant?.id],
    enabled: Boolean(tenant),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('tenant_profile').select('*').eq('tenant_id', tenant!.id).maybeSingle()
      if (error) throw error
      return (data as Profile | null) ?? null
    },
  })

  useEffect(() => {
    if (!uid) { setActiveTenantId(null) }
  }, [uid])

  const value = useMemo<Ctx>(() => {
    const role = tenant?.role ?? null
    return {
      loading: Boolean(uid) && (list.isLoading || (Boolean(tenant) && prof.isLoading)),
      tenants, tenant, profile: prof.data ?? null, role,
      canWrite: tenant?.status === 'active' && (role === 'owner' || role === 'editor'),
      isOwner: role === 'owner',
      select: (id: string) => { write(id); setChosen(id); qc.clear() },
      refresh: () => { qc.invalidateQueries({ queryKey: ['my_tenants'] }); qc.invalidateQueries({ queryKey: ['tenant_profile'] }) },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, list.isLoading, prof.isLoading, prof.data, tenant?.id, tenant?.status, tenant?.role, tenants.length])

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}
