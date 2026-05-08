import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';
import api from '../../lib/api';
import './DashboardPage.css';

interface PagedResult<T> {
  items: T[]; page: number; pageSize: number; totalCount: number;
  totalPages: number; hasPrevious: boolean; hasNext: boolean;
}

interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  customerUserId: string;
  totalAmount: number;
  amountDue: number;
  paymentStatus: 'Unpaid' | 'PartiallyPaid' | 'Paid' | 'OnCredit';
  issueDate: string;
}
interface Part {
  id: string;
  sku: string;
  name: string;
  unitPrice: number;
  stockQty: number;
  reorderLevel: number;
  isLowStock: boolean;
}
interface Appointment {
  id: string;
  scheduledAt: string;
  status: 'Pending' | 'Confirmed' | 'Done' | 'Cancelled';
}
interface Review { id: string; customerUserId: string; rating: number }
interface PartRequest { id: string; status: 'Pending' | 'Sourced' | 'Rejected' }

interface CustomerStats {
  upcoming: number;
  myReviewsCount: number;
  pendingRequests: number;
  lifetimeSpend: number;
  recentSales: SalesInvoice[];
}
interface StaffStats {
  totalParts: number;
  lowStockCount: number;
  monthRevenue: number;
  todayInvoices: number;
  recentSales: SalesInvoice[];
  topParts: Part[];
  customerLookup: Record<string, string>;
}

function fmtMoney(n: number) {
  return 'Rs ' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}

const DashboardPage = () => {
  const { user } = useAuthStore();
  const { theme } = useThemeStore();
  const navigate = useNavigate();
  const lottieRef = useRef<HTMLDivElement>(null);
  const userRole = user?.role;
  const isStaff = userRole === 'Staff' || userRole === 'Admin';
  const isAdmin = userRole === 'Admin';
  const isDark = theme === 'dark';

  const [customerStats, setCustomerStats] = useState<CustomerStats | null>(null);
  const [staffStats, setStaffStats] = useState<StaffStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let anim: { destroy: () => void } | undefined;
    const loadLottie = async () => {
      if (!lottieRef.current) return;
      const lottie = (await import('lottie-web')).default;
      anim = lottie.loadAnimation({
        container: lottieRef.current,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: '/lottie-dashboard.json',
      });
    };
    loadLottie();
    return () => { if (anim) anim.destroy(); };
  }, []);

  const loadCustomer = async () => {
    try {
      const [appts, reviews, requests, sales] = await Promise.all([
        api.get<PagedResult<Appointment>>('/appointments', { params: { pageSize: 100 } }),
        api.get<PagedResult<Review>>('/reviews', { params: { pageSize: 100 } }),
        api.get<PagedResult<PartRequest>>('/part-requests', { params: { pageSize: 100 } }),
        api.get<PagedResult<SalesInvoice>>('/sales-invoices', { params: { pageSize: 100 } }),
      ]);
      const now = new Date();
      const upcoming = appts.data.items.filter(
        (a) => (a.status === 'Pending' || a.status === 'Confirmed') && new Date(a.scheduledAt) >= now
      ).length;
      const mine = reviews.data.items.filter((r) => r.customerUserId === user?.userId);
      const pending = requests.data.items.filter((r) => r.status === 'Pending').length;
      const lifetimeSpend = sales.data.items.reduce((sum, s) => sum + s.totalAmount, 0);
      setCustomerStats({
        upcoming,
        myReviewsCount: mine.length,
        pendingRequests: pending,
        lifetimeSpend,
        recentSales: sales.data.items.slice(0, 5),
      });
    } catch {
      // fall through silently - show empty state
    }
  };

  const loadStaff = async () => {
    try {
      const [parts, lowStock, sales, customers] = await Promise.all([
        api.get<PagedResult<Part>>('/parts', { params: { pageSize: 100 } }),
        api.get<PagedResult<Part>>('/parts', { params: { pageSize: 100, lowStock: true } }),
        api.get<PagedResult<SalesInvoice>>('/sales-invoices', { params: { pageSize: 100 } }),
        api.get<{ userId: string; fullName: string }[]>('/customers').catch(() => ({ data: [] })),
      ]);

      const lookup: Record<string, string> = {};
      const customerData = (customers.data || []) as { userId: string; fullName: string }[];
      for (const c of customerData) lookup[c.userId] = c.fullName;

      const today = new Date();
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthRevenue = sales.data.items
        .filter((s) => new Date(s.issueDate) >= monthStart)
        .reduce((sum, s) => sum + s.totalAmount, 0);

      const todayIso = today.toISOString().slice(0, 10);
      const todayInvoices = sales.data.items
        .filter((s) => s.issueDate.slice(0, 10) === todayIso)
        .length;

      const recentSales = [...sales.data.items]
        .sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime())
        .slice(0, 5);

      const topParts = [...parts.data.items]
        .sort((a, b) => b.stockQty - a.stockQty)
        .slice(0, 5);

      setStaffStats({
        totalParts: parts.data.totalCount,
        lowStockCount: lowStock.data.totalCount,
        monthRevenue,
        todayInvoices,
        recentSales,
        topParts,
        customerLookup: lookup,
      });
    } catch {
      // empty state
    }
  };

  useEffect(() => {
    setLoading(true);
    (isStaff ? loadStaff() : loadCustomer()).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRole]);

  const statusBadge = (s: SalesInvoice['paymentStatus']) => {
    const map: Record<SalesInvoice['paymentStatus'], string> = {
      Paid: 'badge-success',
      PartiallyPaid: 'badge-warning',
      Unpaid: 'badge-warning',
      OnCredit: 'badge-danger',
    };
    const label = s === 'PartiallyPaid' ? 'Partial' : s === 'OnCredit' ? 'Overdue' : s;
    return <span className={`badge ${map[s]}`}>{label}</span>;
  };

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">
          {isStaff
            ? "Welcome back! Here's your business overview."
            : `Welcome back, ${user?.fullName ?? 'friend'}! Here's your account overview.`}
        </p>
      </div>

      <div className="hero">
        <div className="hero-text">
          <h2>{isStaff ? 'Business Overview' : 'Your Account'}</h2>
          <p>
            {isStaff
              ? 'Monitor your vehicle parts inventory, track sales performance, and manage customer relationships all in one place.'
              : 'View your appointments, track part requests, and manage your reviews all in one place.'}
          </p>
        </div>
        <div className="hero-illust">
          <div ref={lottieRef} className="lottie-hero" aria-label="dashboard animation" />
        </div>
      </div>

      {isStaff ? (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="stat-card accent-pop">
            <div className="stat-label">Total Parts</div>
            <div className="stat-value">{staffStats?.totalParts ?? '-'}</div>
            <div className="stat-change">{staffStats ? `${staffStats.totalParts - staffStats.lowStockCount} healthy` : ''}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Today's Invoices</div>
            <div className="stat-value">{staffStats?.todayInvoices ?? '-'}</div>
            <div className="stat-change" style={{ color: 'var(--success)' }}>Logged today</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">This Month Sales</div>
            <div className="stat-value">{staffStats ? fmtMoney(staffStats.monthRevenue) : '-'}</div>
            <div className="stat-change" style={{ color: 'var(--success)' }}>Calendar month</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Low Stock Items</div>
            <div className="stat-value" style={{ color: (staffStats?.lowStockCount ?? 0) > 0 ? 'var(--accent-9)' : 'var(--success)' }}>
              {staffStats?.lowStockCount ?? '-'}
            </div>
            <div className="stat-change" style={{ color: (staffStats?.lowStockCount ?? 0) > 0 ? 'var(--accent-9)' : 'var(--success)' }}>
              {(staffStats?.lowStockCount ?? 0) > 0 ? 'Needs attention' : 'All healthy'}
            </div>
          </div>
        </div>
      ) : (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="stat-card accent-pop">
            <div className="stat-label">Lifetime spend</div>
            <div className="stat-value">{customerStats ? fmtMoney(customerStats.lifetimeSpend) : '-'}</div>
            <div className="stat-change">All invoices</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">My Appointments</div>
            <div className="stat-value">{customerStats?.upcoming ?? '-'}</div>
            <div className="stat-change">Upcoming</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">My Reviews</div>
            <div className="stat-value">{customerStats?.myReviewsCount ?? '-'}</div>
            <div className="stat-change" style={{ color: 'var(--success)' }}>Total written</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Part Requests</div>
            <div className="stat-value">{customerStats?.pendingRequests ?? '-'}</div>
            <div className="stat-change" style={{ color: (customerStats?.pendingRequests ?? 0) > 0 ? 'var(--accent-9)' : 'var(--neutral-9)' }}>
              {(customerStats?.pendingRequests ?? 0) > 0 ? 'Pending' : 'None pending'}
            </div>
          </div>
        </div>
      )}

      {isStaff && isAdmin && (
        <div className="insight-row">
          <div className="insight-card" onClick={() => navigate('/reports')} style={{ cursor: 'pointer' }}>
            <img
              src={isDark ? '/illust-analysing-dark.svg' : '/illust-analysing-light.svg'}
              alt="analysing"
              style={{ maxHeight: 100, width: 'auto' }}
            />
            <div className="insight-card-text">
              <h4>See the financial pulse</h4>
              <p>Open the financial reports for sales, purchases and gross-margin charts.</p>
            </div>
          </div>
          <div className="insight-card" onClick={() => navigate('/customer-reports')} style={{ cursor: 'pointer' }}>
            <img
              src={isDark ? '/illust-process-dark.svg' : '/illust-process-light.svg'}
              alt="process"
              style={{ maxHeight: 100, width: 'auto' }}
            />
            <div className="insight-card-text">
              <h4>Customer rankings</h4>
              <p>Top spenders, regulars, and overdue accounts at a glance.</p>
            </div>
          </div>
        </div>
      )}

      {isStaff && (
        <div className="dashboard-tables">
          <div className="table-wrap">
            <div className="table-header">
              <div className="table-header-title">Recent Sales</div>
            </div>
            {loading ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--neutral-9)' }}>Loading…</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(staffStats?.recentSales.length ?? 0) === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24, color: 'var(--neutral-9)' }}>No invoices yet.</td></tr>
                  ) : (
                    staffStats!.recentSales.map((s) => (
                      <tr key={s.id}>
                        <td className="mono">{s.invoiceNumber}</td>
                        <td>{staffStats!.customerLookup[s.customerUserId] ?? s.customerUserId.slice(0, 8) + '…'}</td>
                        <td className="mono">{fmtMoney(s.totalAmount)}</td>
                        <td>{statusBadge(s.paymentStatus)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
          <div className="table-wrap">
            <div className="table-header">
              <div className="table-header-title">Top Stocked Parts</div>
            </div>
            {loading ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--neutral-9)' }}>Loading…</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Part Name</th>
                    <th>SKU</th>
                    <th>Stock</th>
                    <th>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {(staffStats?.topParts.length ?? 0) === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24, color: 'var(--neutral-9)' }}>No parts yet.</td></tr>
                  ) : (
                    staffStats!.topParts.map((p) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td className="mono">{p.sku}</td>
                        <td className="mono" style={{ color: p.isLowStock ? 'var(--accent-9)' : 'inherit' }}>{p.stockQty}</td>
                        <td className="mono">{fmtMoney(p.unitPrice)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {!isStaff && customerStats && customerStats.recentSales.length > 0 && (
        <div className="dashboard-tables" style={{ gridTemplateColumns: '1fr' }}>
          <div className="table-wrap">
            <div className="table-header">
              <div className="table-header-title">Recent invoices</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {customerStats.recentSales.map((s) => (
                  <tr key={s.id}>
                    <td className="mono">{s.invoiceNumber}</td>
                    <td>{new Date(s.issueDate).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td className="mono">{fmtMoney(s.totalAmount)}</td>
                    <td>{statusBadge(s.paymentStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
