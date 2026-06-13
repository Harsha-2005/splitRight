import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Home, Users, LogOut, Upload, CreditCard } from 'lucide-react';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>💸 SplitRight</h1>
          <p>Shared expense tracker</p>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Main</div>
          <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Home size={16} /> Dashboard
          </NavLink>

          <div className="nav-section-label" style={{ marginTop: 12 }}>Quick Actions</div>
          <button className="nav-item" onClick={() => navigate('/')}>
            <Users size={16} /> My Groups
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="user-info">
              <div className="name">{user?.name}</div>
              <div className="email">{user?.email}</div>
            </div>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={handleLogout} title="Logout">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
