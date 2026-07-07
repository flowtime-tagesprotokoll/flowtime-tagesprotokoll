import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { ProtokollEditPage } from './pages/ProtokollEdit';
import { AuditPage } from './pages/Audit';
import { ReportsPage } from './pages/Reports';
import { RemindersPreviewPage } from './pages/RemindersPreview';
import { DokuberichtPage } from './pages/Dokubericht';
import { WartungPage } from './pages/Wartung';
import { AdminMitarbeiterPage } from './pages/AdminMitarbeiter';
import { AdminShopsPage } from './pages/AdminShops';
import { ArbeitsplanPage } from './pages/Arbeitsplan';
import { ZertifikatePage } from './pages/Zertifikate';
import { StundenkontoPage } from './pages/Stundenkonto';
import { VorfuehrDashboardPage } from './pages/VorfuehrDashboard';
import { useAuth } from './lib/authStore';
import { checkForUpdates } from './lib/updater';
import { SingleInstanceGate } from './components/SingleInstance';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

function RequireAuth({ children }: { children: ReactNode }) {
  const session = useAuth((s) => s.session);
  const location = useLocation();
  if (!session) {
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname + location.search }}
        replace
      />
    );
  }
  return <>{children}</>;
}

function RedirectIfAuth({ children }: { children: ReactNode }) {
  const session = useAuth((s) => s.session);
  const location = useLocation();
  if (session) {
    // Wenn der Login von /vorfuehrung angefordert wurde, dorthin zurueck.
    const from = (location.state as { from?: string } | null)?.from;
    const target = from && from.startsWith('/vorfuehrung') ? from : '/';
    return <Navigate to={target} replace />;
  }
  return <>{children}</>;
}

function AuthRefresher() {
  // Bei JEDEM Sessionwechsel (User-ID ändert sich oder Logout) wird der
  // komplette React-Query-Cache geleert. Sonst zeigt ein neu eingeloggter
  // Mitarbeiter kurz Daten des vorigen Users (z.B. alte Protokoll-Liste vom
  // Admin), bis ein Refetch durchgelaufen ist.
  const profileId = useAuth((s) => s.session?.profile.id ?? null);
  useEffect(() => {
    queryClient.clear();
  }, [profileId]);
  return null;
}

export default function App() {
  useEffect(() => {
    checkForUpdates();
  }, []);

  return (
    <SingleInstanceGate>
    <QueryClientProvider client={queryClient}>
      <AuthRefresher />
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route
            path="/login"
            element={
              <RedirectIfAuth>
                <LoginPage />
              </RedirectIfAuth>
            }
          />
          <Route
            path="/"
            element={
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            }
          />
          <Route
            path="/protokoll/:shopId/:datum"
            element={
              <RequireAuth>
                <ProtokollEditPage />
              </RequireAuth>
            }
          />
          <Route
            path="/audit"
            element={
              <RequireAuth>
                <AuditPage />
              </RequireAuth>
            }
          />
          <Route
            path="/reports"
            element={
              <RequireAuth>
                <ReportsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/reminders/preview"
            element={
              <RequireAuth>
                <RemindersPreviewPage />
              </RequireAuth>
            }
          />
          <Route
            path="/dokubericht"
            element={
              <RequireAuth>
                <DokuberichtPage />
              </RequireAuth>
            }
          />
          <Route
            path="/wartung"
            element={
              <RequireAuth>
                <WartungPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/mitarbeiter"
            element={
              <RequireAuth>
                <AdminMitarbeiterPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/shops"
            element={
              <RequireAuth>
                <AdminShopsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/arbeitsplan"
            element={
              <RequireAuth>
                <ArbeitsplanPage />
              </RequireAuth>
            }
          />
          <Route
            path="/zertifikate"
            element={
              <RequireAuth>
                <ZertifikatePage />
              </RequireAuth>
            }
          />
          <Route
            path="/stunden"
            element={
              <RequireAuth>
                <StundenkontoPage />
              </RequireAuth>
            }
          />
          <Route
            path="/vorfuehrung"
            element={
              <RequireAuth>
                <VorfuehrDashboardPage />
              </RequireAuth>
            }
          />
          <Route
            path="/vorfuehrung/bericht"
            element={
              <RequireAuth>
                <DokuberichtPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
    </SingleInstanceGate>
  );
}
