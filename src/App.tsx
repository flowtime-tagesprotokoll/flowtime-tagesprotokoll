import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
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
import { useAuth } from './lib/authStore';
import { checkForUpdates } from './lib/updater';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

function RequireAuth({ children }: { children: ReactNode }) {
  const session = useAuth((s) => s.session);
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RedirectIfAuth({ children }: { children: ReactNode }) {
  const session = useAuth((s) => s.session);
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  useEffect(() => {
    checkForUpdates();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
