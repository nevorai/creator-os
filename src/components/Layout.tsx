import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { callFn } from '../lib/fn'
import { useTenant } from '../lib/tenant'
import { Icon, type IconName } from './shell/icons'
import { ResizeHandle } from './shell/ResizeHandle'
import { Tip } from './shell/Tip'

type Item = { to: string; label: string; icon: IconName }
type Group = { title?: string; items: Item[] }

const groups: Group[] = [
  { items: [{ to: '/', label: 'Today', icon: 'today' }] },
  { title: 'Orbit', items: [{ to: '/watchlist', label: 'Watchlist', icon: 'watch' }, { to: '/sources', label: 'Sources', icon: 'sources' }] },
  {
    items: [
      { to: '/ideas', label: 'Ideas', icon: 'ideas' },
      { to: '/studio', label: 'Studio', icon: 'studio' },
      { to: '/board', label: 'Plan', icon: 'plan' },
      { to: '/formats', label: 'Formats', icon: 'formats' },
      { to: '/library', label: 'Library', icon: 'library' },
      { to: '/manager', label: 'Manager', icon: 'manager' },
    ],
  },
  {
    title: 'Setup',
    items: [
      { to: '/brand-trainer', label: 'Brand Trainer', icon: 'trainer' },
      { to: '/brand-brain', label: 'Brand Brain', icon: 'brain' },
      { to: '/employees', label: 'Employees', icon: 'staff' },
      { to: '/team', label: 'Team', icon: 'team' },
    ],
  },
]
const tabs: Item[] = [
  { to: '/', label: 'Today', icon: 'today' },
  { to: '/watchlist', label: 'Orbit', icon: 'orbit' },
  { to: '/studio', label: 'Studio', icon: 'studio' },
  { to: '/board', label: 'Plan', icon: 'plan' },
]

const LIM = { min: 200, max: 360, def: 264, folded: 72, showAt: 150 }
const PREF_KEY = 'nc-side'
type Pref = { width: number; collapsed: boolean }
function readPref(): Pref {
  try {
    const j = JSON.parse(localStorage.getItem(PREF_KEY) ?? '')
    if (typeof j?.width === 'number') return { width: Math.min(LIM.max, Math.max(LIM.min, j.width)), collapsed: j.collapsed === true }
  } catch { /* first visit or blocked storage */ }
  return { width: LIM.def, collapsed: false }
}
const savePref = (p: Pref) => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)) } catch { /* private window */ } }

type Mode = 'system' | 'light' | 'dark'
function readMode(): Mode { try { const t = localStorage.getItem('nc-theme'); return t === 'light' || t === 'dark' ? t : 'system' } catch { return 'system' } }
function applyMode(m: Mode) {
  try { if (m === 'system') localStorage.removeItem('nc-theme'); else localStorage.setItem('nc-theme', m) } catch { /* private window */ }
  if (m === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', m)
}

export function Layout() {
  const { session } = useAuth()
  const { tenant, tenants, profile, role, isOwner, select } = useTenant()
  const loc = useLocation()
  const [pref, setPref] = useState<Pref>(readPref)
  const [preview, setPreview] = useState<boolean | null>(null)
  const [sheet, setSheet] = useState(false)
  const [mode, setMode] = useState<Mode>(readMode)
  const folded = preview ?? pref.collapsed
  const studioName = profile?.display_name || tenant?.name || 'Nevorai Creator'
  const save = (next: Pref) => { setPref(next); setPreview(null); savePref(next) }

  useEffect(() => setSheet(false), [loc.pathname])

  const billing = useMutation({
    mutationFn: () => callFn<{ url: string }>('tenant-admin', { action: 'billing_url' }),
    onSuccess: (r) => { window.location.href = r.url },
  })
  const cycle = () => { const n: Mode = mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system'; setMode(n); applyMode(n) }
  const themeLabel = `Theme: ${mode}`

  const link = (item: Item, compact: boolean) => (
    <Tip key={item.to} label={item.label} disabled={!compact}>
      <NavLink
        to={item.to}
        end={item.to === '/'}
        aria-label={compact ? item.label : undefined}
        className={({ isActive }) =>
          `flex min-h-11 items-center rounded-[14px] py-2 text-sm font-medium transition-colors ${compact ? 'justify-center px-0' : 'gap-3 px-3'} ${
            isActive ? 'bg-[var(--nav-active-bg)] text-white' : 'text-white/55 hover:bg-white/5 hover:text-white'
          }`
        }
      >
        {({ isActive }) => (
          <>
            <span className={isActive ? 'text-accent-500' : ''}><Icon name={item.icon} active={isActive} /></span>
            {!compact && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
          </>
        )}
      </NavLink>
    </Tip>
  )

  const action = (icon: IconName, label: string, onClick: () => void, compact: boolean, busy = false) => (
    <Tip label={label} disabled={!compact}>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-label={label}
        className={`flex min-h-11 w-full items-center rounded-[14px] py-2 text-sm font-medium text-white/55 transition-colors hover:bg-white/5 hover:text-white ${compact ? 'justify-center px-0' : 'gap-3 px-3'}`}
      >
        <Icon name={icon} />
        {!compact && <span className="min-w-0 flex-1 truncate text-left">{busy ? 'Opening…' : label}</span>}
      </button>
    </Tip>
  )

  const footer = (compact: boolean) => (
    <div className="space-y-0.5 border-t border-border-subtle p-3">
      {isOwner && tenant && action('billing', 'Billing', () => billing.mutate(), compact, billing.isPending)}
      {link({ to: '/settings', label: 'Settings', icon: 'settings' }, compact)}
      {action('theme', themeLabel, cycle, compact)}
      {action('out', 'Sign out', () => supabase.auth.signOut(), compact)}
      {!compact && session && <div className="truncate px-3 pt-1 text-[11px] text-white/40">{session.user.email}</div>}
      {billing.isError && !compact && <p className="px-3 text-[11px] text-red-500">{(billing.error as Error).message}</p>}
      {!supabaseConfigured && !compact && <p className="px-3 text-[11px] text-amber-500">Supabase is not connected.</p>}
    </div>
  )

  const switcher = tenants.length > 1 && (
    <select aria-label="Switch studio" value={tenant?.id} onChange={(e) => select(e.target.value)} className="mx-3 mb-2 w-[calc(100%-1.5rem)] rounded-[14px] border border-border bg-surface-raised px-3 py-2.5 text-base text-white outline-none md:text-sm">
      {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  )

  return (
    <div className="flex min-h-dvh bg-canvas text-white">
      {/* Desktop sidebar */}
      <aside
        style={{ width: pref.collapsed ? LIM.folded : pref.width }}
        className="sticky top-0 z-30 hidden h-dvh shrink-0 flex-col border-r border-border-subtle bg-surface transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden whitespace-nowrap">
          <div className={folded ? 'flex flex-col items-center gap-2 px-2 pb-2 pt-5' : 'flex items-center gap-2.5 px-5 pb-4 pt-5'}>
            <Mark initial={studioName[0]?.toUpperCase() ?? 'C'} />
            {!folded && (
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate font-display text-[15px] font-semibold">{studioName}</div>
                <div className="truncate text-xs text-white/40">Nevorai Creator{role ? ` · ${role}` : ''}</div>
              </div>
            )}
            <Tip label={folded ? 'Open the sidebar' : 'Fold to icons'} side={folded ? 'right' : 'bottom'}>
              <button type="button" onClick={() => save({ ...pref, collapsed: !folded })} aria-label={folded ? 'Open the sidebar' : 'Fold the sidebar to icons'} className="grid size-9 shrink-0 place-items-center rounded-[10px] text-white/50 hover:bg-white/5 hover:text-white">
                <Icon name={folded ? 'unfold' : 'fold'} />
              </button>
            </Tip>
          </div>
          {!folded && switcher}
          <nav className={`flex-1 space-y-3 overflow-y-auto py-2 ${folded ? 'px-2' : 'px-3'}`}>
            {groups.map((g, i) => (
              <div key={i} className="space-y-0.5">
                {g.title && (folded ? <div className="mx-3 my-1 border-t border-border-subtle" /> : <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/30">{g.title}</div>)}
                {g.items.map((it) => link(it, folded))}
              </div>
            ))}
          </nav>
          {footer(folded)}
        </div>
        <ResizeHandle
          width={pref.width} folded={pref.collapsed} foldedWidth={LIM.folded} min={LIM.min} max={LIM.max} showAt={LIM.showAt}
          label="Resize the sidebar" onPreview={setPreview} onCommit={(n) => save({ width: n.width, collapsed: n.folded })} onReset={() => save({ width: LIM.def, collapsed: false })}
        />
      </aside>

      <main className="min-w-0 flex-1 px-4 pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+1.5rem)] pt-[max(1.25rem,env(safe-area-inset-top))] md:px-[3%] lg:pb-8 lg:pt-8">
        <div className="mx-auto max-w-[1320px]">
          {tenant && tenant.status !== 'active' && (
            <div className="mb-5 rounded-[14px] border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-200">
              {tenant.status === 'suspended'
                ? 'Your studio is paused because a payment did not go through. You can still read everything. Open Billing to continue.'
                : 'This studio has ended. You can still read your data.'}
            </div>
          )}
          {tenant && tenant.status === 'active' && role === 'viewer' && (
            <div className="mb-5 rounded-[14px] border border-border-subtle bg-white/[0.03] p-3 text-sm text-white/60">You have view-only access to this studio.</div>
          )}
          <Outlet />
        </div>
      </main>

      {/* Phone: docked bar with five tabs; More opens a sheet */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border-subtle bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => `flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium ${isActive ? 'text-accent-500' : 'text-white/50'}`}>
            {({ isActive }) => (<><Icon name={t.icon} size={22} active={isActive} />{t.label}</>)}
          </NavLink>
        ))}
        <button type="button" onClick={() => setSheet(true)} className="flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-white/50">
          <Icon name="more" size={22} />More
        </button>
      </nav>
      {sheet && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/50" onClick={() => setSheet(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-[20px] border-t border-border-subtle bg-surface pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-pop)]">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/20" />
            <div className="px-3 pb-2 pt-3">
              {switcher}
              {groups.map((g, i) => (
                <div key={i} className="space-y-0.5 pb-2">
                  {g.title && <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/30">{g.title}</div>}
                  {g.items.map((it) => link(it, false))}
                </div>
              ))}
            </div>
            {footer(false)}
          </div>
        </div>
      )}
    </div>
  )
}

function Mark({ initial }: { initial: string }) {
  return (
    <div className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-gradient-to-br from-accent-500 to-[#ff7a1a] font-display text-sm font-bold text-on-brand shadow-glow">{initial}</div>
  )
}
