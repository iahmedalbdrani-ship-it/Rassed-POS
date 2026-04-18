import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TenantProvider } from './contexts/TenantContext';

// المكونات التي صممناها
import { Sidebar } from './components/layout/Sidebar';
import { DashboardHome } from './pages/DashboardHome';
import POSCashier from './pages/POSCashier';
import { ProfitLossReport } from './pages/ProfitLossReport';
import { ChartOfAccounts } from './pages/ChartOfAccounts';
import InvoicesPage from './pages/InvoicesPageSupabase';
import { SettingsPage } from './pages/SettingsPage';
import { InventoryPage } from './pages/InventoryPage';
import ExpensesPage from './pages/ExpensesPage';
import { Login } from './pages/Login';

// 🛡️ مكون حماية المسارات (ProtectedRoute)
const ProtectedRoute = ({ children, allowedRoles }: { children: any, allowedRoles?: string[] }) => {
  const { user, isAuthenticated } = useAuth();
  
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (allowedRoles && user && !allowedRoles.includes(user.role)) return <Navigate to="/unauthorized" />;
  
  return children;
};

function App() {
  return (
    <AuthProvider>
      <TenantProvider>
        <Router>
          <div className="flex h-screen overflow-hidden font-['Tajawal']" dir="rtl"
            style={{ background: 'linear-gradient(135deg,#fef9f5 0%,#fdf4eb 50%,#f0f4ff 100%)' }}>
            
            {/* لا نعرض السايدبار في صفحة تسجيل الدخول */}
            <Routes>
              <Route path="/login" element={<Login />} />
              
              {/* جميع المسارات المحمية داخل هذا النطاق */}
              <Route path="/*" element={
                <ProtectedRoute>
                  <div className="flex w-full h-screen overflow-hidden">
                    <Sidebar />
                    <main className="flex-1 overflow-y-auto">
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

                        {/* مسارات مخصصة للمحاسبين والمدراء فقط */}
                        <Route path="/reports" element={
                          <ProtectedRoute allowedRoles={['ADMIN', 'ACCOUNTANT']}>
                            <ProfitLossReport />
                          </ProtectedRoute>
                        } />
                        <Route path="/accounts" element={
                          <ProtectedRoute allowedRoles={['ADMIN', 'ACCOUNTANT']}>
                            <ChartOfAccounts />
                          </ProtectedRoute>
                        } />
                        <Route path="*" element={<Navigate to="/" />} />
                      </Routes>
                    </main>
                  </div>
                </ProtectedRoute>
              } />
            </Routes>
            
          </div>
        </Router>
      </TenantProvider>
    </AuthProvider>
  );
}

export default App;