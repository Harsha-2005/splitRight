import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import GroupPage from './pages/GroupPage';
import ExpensesPage from './pages/ExpensesPage';
import ImportPage from './pages/ImportPage';
import BalancePage from './pages/BalancePage';
import Layout from './components/Layout';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<DashboardPage />} />
        <Route path="groups/:id" element={<GroupPage />} />
        <Route path="groups/:id/expenses" element={<ExpensesPage />} />
        <Route path="groups/:id/import" element={<ImportPage />} />
        <Route path="groups/:id/balances" element={<BalancePage />} />
      </Route>
    </Routes>
  );
}
