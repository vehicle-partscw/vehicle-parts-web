import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Moon, Sun, Bell, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useThemeStore } from '../../stores/themeStore';
import { useAuthStore } from '../../stores/authStore';
import api from '../../lib/api';
import GlobalSearchModal from '../shared/GlobalSearchModal';
import InvoiceEmailedModal from '../shared/InvoiceEmailedModal';
import './Topbar.css';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  relatedEntityName: string | null;
  relatedEntityId: string | null;
  readAt: string | null;
  createdAt: string;
}

interface PagedResult<T> {
  items: T[]; page: number; pageSize: number; totalCount: number;
  totalPages: number; hasPrevious: boolean; hasNext: boolean;
}

const POLL_MS = 60_000; // refresh unread count every minute

// Lottie shown inside the notifications dropdown when there's nothing new.
// Lives in its own component so the lottie player only mounts when the empty state actually renders.
const NotificationsEmptyLottie = () => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let anim: { destroy: () => void } | null = null;
    let cancelled = false;
    const load = async () => {
      await Promise.resolve();
      if (cancelled || !ref.current) return;
      const lottie = (await import('lottie-web')).default;
      if (cancelled || !ref.current) return;
      anim = lottie.loadAnimation({
        container: ref.current,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: '/lottie-notifications-empty.json',
      });
    };
    load();
    return () => {
      cancelled = true;
      anim?.destroy();
    };
  }, []);
  return <div ref={ref} className="notif-empty-lottie" />;
};

const Topbar = () => {
  const { theme, toggleTheme } = useThemeStore();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recent, setRecent] = useState<Notification[]>([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const [emailedInvoice, setEmailedInvoice] = useState<{ number: string | null } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isStaff = user?.role === 'Staff' || user?.role === 'Admin';

  const onSignOut = () => {
    if (!window.confirm('Sign out of AutoParts?')) return;
    logout();
    toast.success('Signed out.');
    navigate('/login', { replace: true });
  };

  // poll unread count
  useEffect(() => {
    let alive = true;
    const fetchCount = async () => {
      try {
        const res = await api.get<{ count: number }>('/me/notifications/unread-count');
        if (alive) setUnreadCount(res.data.count ?? 0);
      } catch {
        // silent - bell just shows whatever we have
      }
    };
    fetchCount();
    const t = setInterval(fetchCount, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // close notif dropdown on outside click
  useEffect(() => {
    if (!notifOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [notifOpen]);


  const openNotifications = async () => {
    if (!notifOpen) {
      setLoadingNotifs(true);
      try {
        const res = await api.get<PagedResult<Notification>>('/me/notifications', {
          params: { page: 1, pageSize: 12 },
        });
        // only show notifications that haven't been read yet - read ones disappear from the dropdown
        const unread = (res.data.items ?? []).filter((n) => !n.readAt);
        setRecent(unread);
      } catch {
        setRecent([]);
      } finally {
        setLoadingNotifs(false);
      }
    }
    setNotifOpen((v) => !v);
  };

  const markOneRead = async (n: Notification) => {
    if (!n.readAt) {
      try {
        await api.patch(`/me/notifications/${n.id}/read`);
        setUnreadCount((c) => Math.max(0, c - 1));
        // remove the notification from the dropdown so the user gets a clean list of only unread items
        setRecent((rs) => rs.filter((r) => r.id !== n.id));
      } catch {
        // ignore
      }
    }
    // route based on entity + viewer role
    if (n.type === 'InvoiceEmailed' && !isStaff) {
      // customer sees a small celebration modal with the second message-sent lottie
      // and we leave them on the current page so the modal floats over it
      const num = (n.title.match(/Invoice ([^ ]+) sent/)?.[1]) ?? null;
      setEmailedInvoice({ number: num });
    } else if (n.type === 'InvoiceEmailed' && isStaff) {
      navigate('/sales');
    } else if (n.relatedEntityName === 'Part') {
      // a part-related notification for the customer means "your requested part is sourced".
      // customers should never land on /inventory, so route them to their own requests page.
      navigate(isStaff ? `/inventory?search=${encodeURIComponent(n.relatedEntityId ?? '')}` : '/part-requests');
    } else if (n.relatedEntityName === 'PartRequest') {
      navigate('/part-requests');
    } else if (n.type === 'AppointmentReminder') {
      navigate('/appointments');
    } else if (n.type === 'LowStock') {
      navigate(isStaff ? '/inventory' : '/dashboard');
    } else if (n.type === 'OverdueCredit') {
      navigate(isStaff ? '/customer-reports' : '/my-history');
    }
    setNotifOpen(false);
  };

  const markAllRead = async () => {
    try {
      await api.patch('/me/notifications/read-all');
      setUnreadCount(0);
      // clear the dropdown list since everything was just marked read
      setRecent([]);
    } catch {
      // ignore
    }
  };

  const fmtAgo = (iso: string) => {
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60_000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="topbar">
      <button
        type="button"
        className="search-trigger"
        onClick={() => setSearchOpen(true)}
        aria-label="Open search"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <span className="search-trigger-placeholder">
          {isStaff ? 'Search parts, customers, vehicles, vendors…' : 'Search parts…'}
        </span>
      </button>

      <div className="topbar-right">
        <div className="topbar-divider" />

        <button className="topbar-btn" onClick={toggleTheme} title="Toggle theme">
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        <div className="notif-wrap" ref={dropdownRef}>
          <button className="topbar-btn" title="Notifications" onClick={openNotifications} aria-label="Notifications">
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>

          {notifOpen && (
            <>
              <div className="notif-backdrop" onClick={() => setNotifOpen(false)} />
            <div className="notif-dropdown">
              <div className="notif-dropdown-header">
                <span className="notif-dropdown-title">Notifications</span>
                {unreadCount > 0 && (
                  <button className="notif-link" onClick={markAllRead}>Mark all read</button>
                )}
              </div>

              {loadingNotifs ? (
                <div className="notif-empty">Loading…</div>
              ) : recent.length === 0 ? (
                <div className="notif-empty notif-empty-rich">
                  <NotificationsEmptyLottie />
                  <p className="notif-empty-title">You're all caught up</p>
                  <p className="notif-empty-sub">Nothing new to look at right now.</p>
                </div>
              ) : (
                <ul className="notif-list">
                  {recent.map((n) => (
                    <li
                      key={n.id}
                      className={n.readAt ? 'notif-item' : 'notif-item unread'}
                      onClick={() => markOneRead(n)}
                    >
                      <div className="notif-item-row">
                        <span className="notif-item-title">{n.title}</span>
                        <span className="notif-item-time">{fmtAgo(n.createdAt)}</span>
                      </div>
                      <div className="notif-item-body">{n.body}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            </>
          )}
        </div>

        <div className="topbar-divider" />

        <button
          className="topbar-btn topbar-btn-signout"
          onClick={onSignOut}
          title={`Sign out${user?.fullName ? ` (${user.fullName})` : ''}`}
          aria-label="Sign out"
        >
          <LogOut size={18} />
        </button>
      </div>

      <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />

      <InvoiceEmailedModal
        open={emailedInvoice !== null}
        onClose={() => setEmailedInvoice(null)}
        invoiceNumber={emailedInvoice?.number ?? null}
        customerEmail={user?.email ?? ''}
      />
    </div>
  );
};

export default Topbar;
