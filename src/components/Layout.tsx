import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { callFn } from '../lib/fn'
import { useTenant } from '../lib/tenant'
import { Badge } from './ui/primitives'

type NavItem = { to: string; label: string; phase1: boolean; ownerOnly?: boolean }
type NavGroup = { title: string; items: NavItem[] }

const groups: NavGroup[] = [
  { title: 'Team', items: [{ to: '/manager', label: 'Manager', phase1: true }] },
  {
    title: 'Daily',
    items: [
      { to: '/', label: 'Today', phase1: true },
      { to: '/ideas', label: 'Ideas', phase1: true },
      { to: '/studio', label: 'Studio', phase1: true },
      { to: '/board', label: 'Board', phase1: true },
    ],
  },
  {
    title: 'What you learn',
    items: [
      { to: '/formats', label: 'Formats', phase1: true },
      { to: '/library', label: 'Library', phase1: true },
      { to: '/performance', label: 'Performance', phase1: false },
    ],
  },
  {
    title: 'What you feed it',
    items: [
      { to: '/watchlist', label: 'Watchlist', phase1: true },
      { to: '/sources', label: 'Sources', phase1: true },
      { to: '/brand-trainer', label: 'Brand Trainer', phase1: true },
      { to: '/brand-brain', label: 'Brand Brain', phase1: true },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/employees', label: 'Employees', phase1: true },
      { to: '/team', label: 'Team', phase1: true },
      { to: '/settings', label: 'Settings', phase1: true },
    ],
  },
]

export function Layout() {
  const { session } = useAuth()
  const { tenant, tenants, profile, role, isOwner, select } = useTenant()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const initial = session?.user.email?.[0]?.toUpperCase() ?? '?'
  const studioName = profile?.display_name || tenant?.name || 'Nevorai Creator'

  // Close the phone drawer after every navigation.
  useEffect(() => setOpen(false), [loc.pathname])

  const billing = useMutation({
    mutationFn: () => callFn<{ url: string }>('tenant-admin', { action: 'billing_url' }),
    onSuccess: (r) => {
      window.location.href = r.url
    },
  })

  const nav = (
    <>
      <div className="mb-5 flex items-center gap-2.5 px-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent-400 to-accent-700 font-display text-sm font-bold text-white shadow-glow">
          {studioName[0]?.toUpperCase() ?? 'C'}
        </div>
        <div className="min-w-0">
          <div className="truncate font-display text-sm font-semibold tracking-tight text-white">{studioName}</div>
          <div className="text-[11px] text-white/40">Nevorai Creator{role ? ` · ${role}` : ''}</div>
        </div>
      </div>

      {tenants.length > 1 && (
        <select
          aria-label="Switch studio"
          value={tenant?.id}
          onChange={(e) => select(e.target.value)}
          className="mb-4 w-full rounded-lg border border-border bg-surface-raised px-2 py-1.5 text-white/80 outline-none"
        >
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}

      <nav className="flex-1 space-y-6 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.title}>
            <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-white/25">{group.title}</div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `group flex min-h-10 items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors duration-150 md:min-h-0 ${
                      isActive ? 'bg-accent-500/15 font-medium text-white' : 'text-white/55 hover:bg-white/5 hover:text-white'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className="flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${isActive ? 'bg-accent-400' : 'bg-white/15 group-hover:bg-white/30'}`} />
                        {item.label}
                      </span>
                      {!item.phase1 && <Badge variant="default" className="text-[9px]">later</Badge>}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
        {isOwner && tenant?.status !== undefined && (
          <div>
            <button
              type="button"
              onClick={() => billing.mutate()}
              disabled={billing.isPending}
              className="flex min-h-10 w-full items-center rounded-lg px-2.5 py-1.5 text-left text-sm text-white/55 hover:bg-white/5 hover:text-white md:min-h-0"
            >
              <span className="mr-2 h-1.5 w-1.5 rounded-full bg-white/15" />
              {billing.isPending ? 'Opening…' : 'Billing'}
            </button>
            {billing.isError && <p className="px-2.5 text-[11px] text-red-400">{(billing.error as Error).message}</p>}
          </div>
        )}
      </nav>

      {session && (
        <div className="mt-4 flex items-center gap-2.5 border-t border-border-subtle pt-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white/70">{initial}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs text-white/60">{session.user.email}</div>
          </div>
          <button type="button" onClick={() => supabase.auth.signOut()} className="rounded-md px-1.5 py-1 text-[11px] text-white/40 hover:bg-white/5 hover:text-white/80">
            Sign out
          </button>
        </div>
      )}

      {!supabaseConfigured && (
        <div className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/10 p-2 text-[11px] text-amber-300">
          Supabase not connected. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env
        </div>
      )}
    </>
  )

  return (
    <div className="flex min-h-dvh bg-canvas text-white">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border-subtle bg-surface/60 p-4 md:flex">{nav}</aside>

      {/* Phone: top bar + slide-over drawer */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center gap-3 border-b border-border-subtle bg-surface/95 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur md:hidden">
        <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-lg text-white/70 active:bg-white/10">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 5h14M3 10h14M3 15h14" /></svg>
        </button>
        <div className="min-w-0 flex-1 truncate font-display text-sm font-semibold">{studioName}</div>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col overflow-y-auto border-r border-border-subtle bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
            {nav}
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[calc(4.25rem+env(safe-area-inset-top))] md:px-[3%] md:pb-8 md:pt-8">
        <div className="mx-auto max-w-[1320px]">
          {tenant && tenant.status !== 'active' && (
            <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-200">
              {tenant.status === 'suspended'
                ? 'Your studio is paused because a payment did not go through. You can still read everything. Open Billing to continue.'
                : 'This studio has ended. You can still read your data.'}
            </div>
          )}
          {tenant && tenant.status === 'active' && role === 'viewer' && (
            <div className="mb-5 rounded-xl border border-border-subtle bg-white/[0.03] p-3 text-sm text-white/60">You have view-only access to this studio.</div>
          )}
          <Outlet />
        </div>
      </main>
    </div>
  )
}
