import { Moon, Sun, Bell } from 'lucide-react';
import { useThemeStore } from '../../stores/themeStore';
import { useAuthStore } from '../../stores/authStore';
import './Topbar.css';

const Topbar = () => {
  const { theme, toggleTheme } = useThemeStore();
  const { user } = useAuthStore();

  return (
    <div className="topbar">
      {/* Search */}
      <div className="search-bar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" placeholder="Search parts, customers, orders..." />
      </div>

      {/* Right side */}
      <div className="topbar-right">
        {/* Role pill — display only, no dropdown */}
        <div className="role-pill">
          <span className="role-pill-label">Role:</span>
          <span className="role-pill-value">{user?.role || 'User'}</span>
        </div>

        <div className="topbar-divider" />

        {/* Theme toggle */}
        <button className="topbar-btn" onClick={toggleTheme} title="Toggle theme">
          {theme === 'light' ? (
            <Moon size={18} />
          ) : (
            <Sun size={18} />
          )}
        </button>

        {/* Notifications */}
        <div style={{ position: 'relative' }}>
          <button className="topbar-btn" title="Notifications">
            <Bell size={18} />
            <span className="notif-dot" />
          </button>
        </div>

        <div className="topbar-divider" />

        {/* Avatar */}
        <div className="topbar-avatar" title={user?.fullName}>
          {user?.fullName ? user.fullName[0].toUpperCase() : 'U'}
        </div>
      </div>
    </div>
  );
};

export default Topbar;
