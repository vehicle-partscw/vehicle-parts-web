import { useEffect, useRef } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';
import './DashboardPage.css';

const DashboardPage = () => {
  const { user } = useAuthStore();
  const { theme } = useThemeStore();
  const lottieRef = useRef<HTMLDivElement>(null);
  const userRole = user?.role;
  const isStaff = userRole === 'Staff' || userRole === 'Admin';
  const isDark = theme === 'dark';

  /* Load Lottie animation */
  useEffect(() => {
    let anim: any;
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

  return (
    <div className="dashboard-page">
      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">
          {isStaff
            ? "Welcome back! Here's your business overview."
            : `Welcome back, ${user?.fullName}! Here's your account overview.`}
        </p>
      </div>

      {/* Hero Banner */}
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

      {/* Stats Grid */}
      {isStaff ? (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="stat-card accent-pop">
            <div className="stat-label">Total Parts</div>
            <div className="stat-value">1,245</div>
            <div className="stat-change">+12 this week</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Active Orders</div>
            <div className="stat-value">48</div>
            <div className="stat-change" style={{ color: 'var(--success)' }}>+5 today</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">This Month Sales</div>
            <div className="stat-value">$24,560</div>
            <div className="stat-change" style={{ color: 'var(--success)' }}>+18% vs last</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Low Stock Items</div>
            <div className="stat-value" style={{ color: 'var(--error)' }}>12</div>
            <div className="stat-change" style={{ color: 'var(--error)' }}>Needs attention</div>
          </div>
        </div>
      ) : (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="stat-card accent-pop">
            <div className="stat-label">My Appointments</div>
            <div className="stat-value">2</div>
            <div className="stat-change">Upcoming</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">My Reviews</div>
            <div className="stat-value">5</div>
            <div className="stat-change" style={{ color: 'var(--success)' }}>Total written</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Part Requests</div>
            <div className="stat-value">1</div>
            <div className="stat-change" style={{ color: 'var(--accent-9)' }}>Pending</div>
          </div>
        </div>
      )}

      {/* Insight Cards — Staff/Admin only */}
      {isStaff && (
        <div className="insight-row">
          <div className="insight-card">
            <img
              src={isDark ? '/illust-analysing-dark.svg' : '/illust-analysing-light.svg'}
              alt="analysing"
              style={{ maxHeight: 100, width: 'auto' }}
            />
            <div className="insight-card-text">
              <h4>AI Predictions</h4>
              <p>3 vehicles may need brake pads soon based on mileage patterns</p>
            </div>
          </div>
          <div className="insight-card">
            <img
              src={isDark ? '/illust-process-dark.svg' : '/illust-process-light.svg'}
              alt="process"
              style={{ maxHeight: 100, width: 'auto' }}
            />
            <div className="insight-card-text">
              <h4>Workflow Optimization</h4>
              <p>Streamline your inventory management process for better efficiency</p>
            </div>
          </div>
        </div>
      )}

      {/* Tables — Staff/Admin only */}
      {isStaff && (
        <div className="dashboard-tables">
          <div className="table-wrap">
            <div className="table-header">
              <div className="table-header-title">Recent Sales</div>
            </div>
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
                <tr>
                  <td>#INV-2401</td>
                  <td>John Smith</td>
                  <td>$890</td>
                  <td><span className="badge badge-success">Paid</span></td>
                </tr>
                <tr>
                  <td>#INV-2402</td>
                  <td>Sarah Johnson</td>
                  <td>$1,240</td>
                  <td><span className="badge badge-success">Paid</span></td>
                </tr>
                <tr>
                  <td>#INV-2403</td>
                  <td>Mike Brown</td>
                  <td>$645</td>
                  <td><span className="badge badge-warning">Pending</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="table-wrap">
            <div className="table-header">
              <div className="table-header-title">Top Parts</div>
            </div>
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
                <tr>
                  <td>Brake Pads</td>
                  <td>BP-001</td>
                  <td>156</td>
                  <td>$45</td>
                </tr>
                <tr>
                  <td>Air Filter</td>
                  <td>AF-002</td>
                  <td>89</td>
                  <td>$28</td>
                </tr>
                <tr>
                  <td>Oil Filter</td>
                  <td>OF-003</td>
                  <td>234</td>
                  <td>$15</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
