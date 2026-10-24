import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Layout } from './components/Layout'
import { AuthProvider, useAuth } from './lib/auth'
import { TenantProvider, useTenant } from './lib/tenant'
import { BrandTrainerPage } from './pages/BrandTrainer'
import { NoWorkspacePage } from './pages/NoWorkspace'
import { OnboardingPage } from './pages/Onboarding'
import { SetPasswordPage } from './pages/SetPassword'
import { TeamPage } from './pages/Team'
import { LoginPage } from './pages/Login'
import { BoardPage } from './pages/Board'
import { BrandBrainPage } from './pages/BrandBrain'
import { EmployeesPage } from './pages/Employees'
import { FormatsPage } from './pages/Formats'
import { IdeasPage } from './pages/Ideas'
import { LaterPage } from './pages/Later'
import { LibraryPage } from './pages/Library'
import { ManagerPage } from './pages/Manager'
import { NotFoundPage } from './pages/NotFound'
import { SettingsPage } from './pages/Settings'
import { SourcesPage } from './pages/Sources'
import { StudioPage } from './pages/Studio'
import { TodayPage } from './pages/Today'
import { WatchlistPage } from './pages/Watchlist'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <AuthProvider>
          <TenantProvider>
            <Gate />
          </TenantProvider>
        </AuthProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  )
}

function Gate() {
  const { session, loading, needsPassword } = useAuth()
  const { loading: tenantLoading, tenant, profile, isOwner } = useTenant()

  if (loading || (session && tenantLoading)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas text-sm text-white/40">
        Loading…
      </div>
    )
  }

  if (!session) return <LoginPage />
  if (needsPassword) return <SetPasswordPage />
  if (!tenant) return <NoWorkspacePage email={session.user.email} />
  // A brand-new owner goes through the four questions and the Brand Trainer first.
  const needsOnboarding = isOwner && !profile?.onboarded_at

  return (
    <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={needsOnboarding ? <OnboardingPage /> : <TodayPage />} />
            <Route path="welcome" element={<OnboardingPage />} />
            <Route path="brand-trainer" element={<BrandTrainerPage />} />
            <Route path="team" element={<TeamPage />} />
            <Route path="manager" element={<ManagerPage />} />
            <Route path="ideas" element={<IdeasPage />} />
            <Route path="studio" element={<StudioPage />} />
            <Route path="board" element={<BoardPage />} />
            <Route path="formats" element={<FormatsPage />} />
            <Route path="library" element={<LibraryPage />} />
            <Route path="performance" element={<LaterPage />} />
            <Route path="watchlist" element={<WatchlistPage />} />
            <Route path="sources" element={<SourcesPage />} />
            <Route path="brand-brain" element={<BrandBrainPage />} />
            <Route path="employees" element={<EmployeesPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
      </Routes>
    </HashRouter>
  )
}
