import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth, useIsAdmin } from './lib/auth';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { SpecialistsPage } from './pages/SpecialistsPage';
import { ApplicationsPage } from './pages/ApplicationsPage';
import { ReportsPage } from './pages/ReportsPage';
import { ListingsPage } from './pages/ListingsPage';
import { SpecialistEditPage } from './pages/SpecialistEditPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { EmptyState } from './components/states';

export function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}

function Router() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="login">
        <div className="skeleton" style={{ width: 400, height: 220 }} />
      </div>
    );
  }

  if (status === 'anonymous') return <LoginPage />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="reviews" element={<ReviewsPage />} />
        {/* Жалобы разбирают и модераторы: это работа с содержимым, не с каталогом. */}
        <Route path="reports" element={<ReportsPage />} />
        {/* Управление каталогом — только администраторам; модератор видит лишь отзывы. */}
        <Route path="applications" element={<AdminOnly><ApplicationsPage /></AdminOnly>} />
        <Route path="listings" element={<AdminOnly><ListingsPage /></AdminOnly>} />
        <Route path="specialists" element={<AdminOnly><SpecialistsPage /></AdminOnly>} />
        <Route path="specialists/:id" element={<AdminOnly><SpecialistEditPage /></AdminOnly>} />
        <Route path="categories" element={<AdminOnly><CategoriesPage /></AdminOnly>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const isAdmin = useIsAdmin();
  if (!isAdmin) {
    return <EmptyState icon="🔒" title="Недостаточно прав" hint="Этот раздел доступен только администраторам" />;
  }
  return <>{children}</>;
}
