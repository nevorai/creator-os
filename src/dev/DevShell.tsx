// DEV ONLY (import.meta.env.DEV; Vite drops it from production builds). Renders the real Layout and pages with a fake
// signed-in owner, so phone-check.js, drag-smoothness.js and screenshots can run without a login.  Open  /?dev=1#/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter } from 'react-router-dom'
import { AppRoutes } from '../App'
import { AuthContext } from '../lib/auth'
import { TenantContext } from '../lib/tenant'

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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
