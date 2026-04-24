import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TenantProvider } from './contexts/TenantContext';
import { SmartAccountantWidget } from './components/SmartAccountantWidget';
import { OfflineBanner } from './components/ui/OfflineBanner';
import { Sidebar } from './components/layout/Sidebar';

// ─── Lazy-loaded pages (code splitting per route) ─────────────
const Login             = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const DashboardHome     = lazy(() => import('./pages/DashboardHome').then(m => ({ default: m.DashboardHome })));
const POSCashier        = lazy(() => import('./pages/POSCashier'));
const InventoryPage     = lazy(() => import('./pages/InventoryPage').then(m => ({ default: m.InventoryPage })));
const InvoicesPage      = lazy(() => import('./pages/InvoicesPageSupabase'));
const ExpensesPage      = lazy(() => import('./pages/ExpensesPage'));
const SettingsPage      = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const ProfitLossReport  = lazy(() => import('./pages/ProfitLossReport').then(m => ({ default: m.ProfitLossReport })));
const ChartOfAccounts   = lazy(() => import('./pages/ChartOfAccounts').then(m => ({ default: m.ChartOfAccounts })));

// ─── Loading fallback ─────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="w-8 h-8 rounded-full border-2 border-orange-200 border-t-orange-500 animate-spin" />
    </div>
  );
}

// ─── Route guard ──────────────────────────────────────────────
const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) => {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (allowedRoles && user && !allowedRoles.includes(user.role)) return <Navigate to="/unauthorized" />;
  return <>{children}</>;
};

function App() {
  return (
    <AuthProvider>
      <TenantProvider>
        <Router>
          <OfflineBanner />
          <div
            className="flex h-screen overflow-hidden font-['Tajawal']"
            dir="rtl"
            style={{ background: 'linear-gradient(135deg,#fef9f5 0%,#fdf4eb 50%,#f0f4ff 100%)' }}
          >
            <Routes>
              <Route
                path="/login"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <Login />
                  </Suspense>
                }
              />

              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <div className="flex w-full h-screen overflow-hidden">
                      <Sidebar />
                      <main className="flex-1 overflow-y-auto relative">
                        <Suspense fallback={<PageLoader />}>
                          <Routes>
                            <Route path="/"         element={<DashboardHome />} />
                            <Route path="/pos"       element={<POSCashier />} />
                            <Route path="/inventory" element={<InventoryPage />} />
                            <Route path="/invoices"  element={<InvoicesPage />} />
                            <Route path="/expenses"  element={
                              <ProtectedRoute allowedRoles={['ADMIN', 'ACCOUNTANT']}>
                                <ExpensesPage />
                              </ProtectedRoute>
                            } />
                            <Route path="/settings"  element={<SettingsPage />} />
                            <Route path="/reports"   element={
                              <ProtectedRoute allowedRoles={['ADMIN', 'ACCOUNTANT']}>
                                <ProfitLossReport />
                              </ProtectedRoute>
                            } />
                            <Route path="/accounts"  element={
                              <ProtectedRoute allowedRoles={['ADMIN', 'ACCOUNTANT']}>
                                <ChartOfAccounts />
                              </ProtectedRoute>
                            } />
                            <Route path="*" element={<Navigate to="/" />} />
                          </Routes>
                        </Suspense>
                      </main>
                      <SmartAccountantWidget />
                    </div>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </div>
        </Router>
      </TenantProvider>
    </AuthProvider>
  );
}

export default App;
