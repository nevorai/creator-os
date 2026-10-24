// DEV ONLY (import.meta.env.DEV; Vite drops it from production builds). Renders the real Layout and pages with a fake
// signed-in owner, so phone-check.js, drag-smoothness.js and screenshots can run without a login.  Open  /?dev=1#/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter } from 'react-router-dom'
import { AppRoutes } from '../App'
import { AuthContext } from '../lib/auth'
import { TenantContext } from '../lib/tenant'

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
qc.setQueryData(['today_brief'], {
  ideas: [{ id: '1', topic: 'Why most people stop after 21 days of a diet', why_now: 'Three watched accounts did well on it this week', confidence: 'high', niche_id: 'n1' },
    { id: '2', topic: 'The ₹500 mistake new traders make', why_now: 'Markets hit a record today', confidence: 'medium', niche_id: 'n2' }],
  outliers: [{ id: 'o1', post_url: 'https://example.com', caption: 'A very long caption that goes on and on to test how the card wraps on a narrow phone screen without sideways scroll', views: 1250000, outlier_ratio: 4.2, handle: 'some_creator_with_long_handle_name' }],
  news: [{ id: 'w1', title: 'Sensex crosses a new high as banking stocks lead the rally across all sectors today', url: 'https://example.com', published_at: null, niche_id: 'n2' }],
  board: { scripted: 2, shooting: 1, posted: 4 }, counts: { news_24h: 31, outliers_7d: 3, watching: 12, sources: 5 },
})
qc.setQueryData(['my_niches', '00000000-0000-0000-0000-000000000001'], [{ id: 'n1', name: 'Health', primary: true }, { id: 'n2', name: 'Trading and finance', primary: false }])
const tenant = {
  id: '00000000-0000-0000-0000-000000000001', slug: 'demo', name: 'Demo Creator', custom_domain: null,
  status: 'active' as const, plan_key: 'creator', limits: { niches: 2 }, trial_ends_at: null, role: 'owner' as const,
}

export function DevShell() {
  const onboarding = new URLSearchParams(location.search).get('dev') === 'onboarding'
  return (
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={{ session: { user: { email: 'demo@example.com' } } as never, loading: false, needsPassword: false, passwordSet: () => {} }}>
        <TenantContext.Provider
          value={{
            loading: false, tenants: [tenant], tenant, role: 'owner', canWrite: true, isOwner: true, select: () => {}, refresh: () => {},
            profile: { display_name: 'Demo Creator', niche: null, handle: null, language: 'hinglish', about: null, onboarded_at: onboarding ? null : new Date().toISOString() },
          }}
        >
          <HashRouter><AppRoutes needsOnboarding={onboarding} /></HashRouter>
        </TenantContext.Provider>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}
