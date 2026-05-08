import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useThemeStore } from './stores/themeStore';
import { useAuthStore } from './stores/authStore';

import AppLayout from './components/layout/AppLayout';

import LoginPage from './pages/auth/LoginPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import StaffPage from './pages/staff/StaffPage';
import VendorsPage from './pages/vendors/VendorsPage';
import InventoryPage from './pages/inventory/InventoryPage';
import PurchasesPage from './pages/purchases/PurchasesPage';
import SalesPage from './pages/sales/SalesPage';
import AppointmentsPage from './pages/appointments/AppointmentsPage';
import CustomersPage from './pages/customers/CustomersPage';
import PartRequestsPage from './pages/part-requests/PartRequestsPage';
import ReviewsPage from './pages/reviews/ReviewsPage';
import MyHistoryPage from './pages/my-history/MyHistoryPage';
import ReportsPage from './pages/reports/ReportsPage';
import CustomerReportsPage from './pages/customer-reports/CustomerReportsPage';
import ProfilePage from './pages/profile/ProfilePage';
import ComingSoonPage from './pages/ComingSoonPage';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const CustomerRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== 'Customer') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

interface AdminRouteProps {
  children: React.ReactNode;
}

const AdminRoute = ({ children }: AdminRouteProps) => {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== 'Admin') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

// Staff or Admin (i.e. anyone except Customer)
const StaffRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== 'Admin' && user?.role !== 'Staff') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

function App() {
  const initializeTheme = useThemeStore((state) => state.initializeTheme);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    initializeTheme();
  }, [initializeTheme]);

  return (
    <Router>
      <Toaster
        position="top-right"
        theme="light"
        expand
        richColors
        closeButton
        duration={4000}
      />

      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<Navigate to="/login" replace />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout>
                <DashboardPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <AppLayout>
                <DashboardPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/staff"
          element={
            <AdminRoute>
              <AppLayout>
                <StaffPage />
              </AppLayout>
            </AdminRoute>
          }
        />

        <Route
          path="/inventory"
          element={
            <StaffRoute>
              <AppLayout>
                <InventoryPage />
              </AppLayout>
            </StaffRoute>
          }
        />

        <Route
          path="/sales"
          element={
            <StaffRoute>
              <AppLayout>
                <SalesPage />
              </AppLayout>
            </StaffRoute>
          }
        />

        <Route
          path="/purchases"
          element={
            <AdminRoute>
              <AppLayout>
                <PurchasesPage />
              </AppLayout>
            </AdminRoute>
          }
        />

        <Route
          path="/customers"
          element={
            <StaffRoute>
              <AppLayout>
                <CustomersPage />
              </AppLayout>
            </StaffRoute>
          }
        />

        <Route
          path="/vendors"
          element={
            <AdminRoute>
              <AppLayout>
                <VendorsPage />
              </AppLayout>
            </AdminRoute>
          }
        />

        <Route
          path="/appointments"
          element={
            <ProtectedRoute>
              <AppLayout>
                <AppointmentsPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/reviews"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ReviewsPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/part-requests"
          element={
            <ProtectedRoute>
              <AppLayout>
                <PartRequestsPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/reports"
          element={
            <AdminRoute>
              <AppLayout>
                <ReportsPage />
              </AppLayout>
            </AdminRoute>
          }
        />

        <Route
          path="/my-history"
          element={
            <CustomerRoute>
              <AppLayout>
                <MyHistoryPage />
              </AppLayout>
            </CustomerRoute>
          }
        />

        <Route
          path="/customer-reports"
          element={
            <StaffRoute>
              <AppLayout>
                <CustomerReportsPage />
              </AppLayout>
            </StaffRoute>
          }
        />

        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ProfilePage />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ProfilePage />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="*"
          element={
            isAuthenticated ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
