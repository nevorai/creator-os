import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(url && anonKey)

// Which creator's workspace this browser tab is working in. The database only honours it when the
// signed-in user is a member of that workspace (creator_os.active_tenant()), so it is a choice, not a key.
let activeTenantId: string | null = null
export function setActiveTenantId(id: string | null) {
  activeTenantId = id
}

// Every request (tables and edge functions alike) carries the workspace id.
const withTenant: typeof fetch = (input, init) => {
  if (!activeTenantId) return fetch(input, init)
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  headers.set('x-tenant-id', activeTenantId)
  return fetch(input, { ...init, headers })
}

// Creator lives in its own schema ("creator_os") inside the shared Nevorai OS project, not in "public",
// so it never collides with tables other Nevorai apps add. This must match the schema exposed in
// Project Settings -> API -> Exposed schemas.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder',
  { db: { schema: 'creator_os' }, global: { fetch: withTenant } },
)
