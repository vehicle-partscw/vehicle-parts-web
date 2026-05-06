import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';
import api from '../../lib/api';
import { useThemeStore } from '../../stores/themeStore';
import './ReportsPage.css';

type Period = 'daily' | 'monthly' | 'yearly';

interface TimeBucket { label: string; sales: number; purchases: number }
interface TopPart { partId: string; sku: string; name: string; quantitySold: number; revenue: number }
interface TopCustomer { customerUserId: string; invoiceCount: number; totalSpent: number }
interface FinancialReport {
  period: Period;
  from: string;
  to: string;
  totalSales: number;
  totalPurchases: number;
  grossMargin: number;
  salesInvoiceCount: number;
  purchaseInvoiceCount: number;
  series: TimeBucket[];
  topParts: TopPart[];
  topCustomers: TopCustomer[];
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'NPR', maximumFractionDigits: 0,
  }).format(n).replace('NPR', 'Rs');
}

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`;
}

function extractError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: string; errors?: Record<string, string[]> } } };
  const data = e?.response?.data;
  if (data?.errors) return Object.values(data.errors).flat().join(' ');
  if (data?.detail) return data.detail;
  return fallback;
}

const ReportsPage = () => {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const lottieRef = useRef<HTMLDivElement>(null);

  const [period, setPeriod] = useState<Period>('monthly');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [loading, setLoading] = useState(false);

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
        path: '/lottie-process.json',
      });
    };
    loadLottie();
    return () => { if (anim) anim.destroy(); };
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { period };
      if (from) params.from = from;
      if (to) params.to = to;
      const res = await api.get<FinancialReport>('/reports/financial', { params });
      setReport(res.data);
    } catch (err) {
      toast.error(extractError(err, 'Could not load report.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const marginPct = report && report.totalSales > 0
    ? (report.grossMargin / report.totalSales) * 100
    : 0;

  const totalInvoices = report
    ? report.salesInvoiceCount + report.purchaseInvoiceCount
    : 0;

  const trendCopy = report && report.totalSales > 0
    ? `Sales of ${fmtMoney(report.totalSales)} across ${report.salesInvoiceCount} invoice${report.salesInvoiceCount === 1 ? '' : 's'} - gross margin sits at ${fmtPct(marginPct)}.`
    : 'No sales recorded for this period yet - pick a wider range or start logging invoices.';

  return (
    <div className="reports-page">
      <div className="page-header">
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">Analyze your business performance.</p>
      </div>

      <div className="hero">
        <div className="hero-text">
          <h2>Business Analytics</h2>
          <p>Generate detailed reports to understand your business trends and make data-driven decisions.</p>
        </div>
        <div className="hero-illust">
          <div ref={lottieRef} className="lottie-hero hero-wide" aria-label="process animation" />
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card accent-pop">
          <div className="stat-label">Total Revenue</div>
          <div className="stat-value">{report ? fmtMoney(report.totalSales) : 'Rs 0'}</div>
          <div className="stat-change">
            {report ? `${report.salesInvoiceCount} invoice${report.salesInvoiceCount === 1 ? '' : 's'}` : '-'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Margin Rate</div>
          <div className="stat-value">{report ? fmtPct(marginPct) : '0.0%'}</div>
          <div className="stat-change" style={{ color: marginPct > 20 ? 'var(--success)' : 'var(--neutral-9)' }}>
            {marginPct > 20 ? 'Healthy' : marginPct > 0 ? 'Watch' : 'No data'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Purchases</div>
          <div className="stat-value">{report ? fmtMoney(report.totalPurchases) : 'Rs 0'}</div>
          <div className="stat-change">
            {report ? `${report.purchaseInvoiceCount} invoice${report.purchaseInvoiceCount === 1 ? '' : 's'}` : '-'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Gross Margin</div>
          <div className="stat-value">{report ? fmtMoney(report.grossMargin) : 'Rs 0'}</div>
          <div className="stat-change" style={{ color: report && report.grossMargin > 0 ? 'var(--success)' : 'var(--neutral-9)' }}>
            {report && report.grossMargin > 0 ? 'In the black' : 'Break-even'}
          </div>
        </div>
      </div>

      <div className="insight-row" style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <div className="insight-card">
          <img
            className="light-only"
            src={`/illust-progress-${isDark ? 'dark' : 'light'}.svg`}
            alt=""
          />
          <div className="insight-card-text">
            <h4>Growth Trend</h4>
            <p>{trendCopy}</p>
          </div>
        </div>
      </div>

      <div className="filter-row">
        <div className="period-toggle">
          {(['daily', 'monthly', 'yearly'] as Period[]).map((p) => (
            <button
              key={p}
              className={`period-btn ${period === p ? 'active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {p[0].toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        <div className="date-range">
          <label>
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button className="apply-btn" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Apply'}
          </button>
        </div>
      </div>

      <div className="chart-wrap">
        <div className="chart-header">
          <span className="chart-title">Sales vs purchases</span>
          <span className="chart-meta">{report ? `${report.from} → ${report.to}` : ''}</span>
        </div>
        <div className="chart-body">
          {report && report.series.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={report.series} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#3a2a26' : '#f0d8ce'} />
                <XAxis dataKey="label" stroke={isDark ? '#cbb6ad' : '#5C271F'} fontSize={12} />
                <YAxis stroke={isDark ? '#cbb6ad' : '#5C271F'} fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#1F1513' : '#FFFCFC',
                    border: '2px solid #5C271F',
                    borderRadius: 8,
                  }}
                />
                <Legend />
                <Bar dataKey="sales" fill="#E54D2E" name="Sales" radius={[4, 4, 0, 0]} />
                <Bar dataKey="purchases" fill="#5C271F" name="Purchases" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="chart-empty">No data for this period.</div>
          )}
        </div>
      </div>

      <div className="two-col">
        <div className="table-wrap">
          <div className="table-header">
            <span className="table-header-title">Top selling parts</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>SKU</th><th>Name</th><th>Qty</th><th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {report && report.topParts.length > 0 ? (
                report.topParts.map((p) => (
                  <tr key={p.partId}>
                    <td className="mono">{p.sku}</td>
                    <td>{p.name}</td>
                    <td>{p.quantitySold}</td>
                    <td>{fmtMoney(p.revenue)}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={4} className="empty">No sales in this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="table-wrap">
          <div className="table-header">
            <span className="table-header-title">Top customers</span>
          </div>
          <table>
            <thead>
              <tr><th>Customer</th><th>Invoices</th><th>Spent</th></tr>
            </thead>
            <tbody>
              {report && report.topCustomers.length > 0 ? (
                report.topCustomers.map((c) => (
                  <tr key={c.customerUserId}>
                    <td className="mono">{c.customerUserId.slice(0, 8)}…</td>
                    <td>{c.invoiceCount}</td>
                    <td>{fmtMoney(c.totalSpent)}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={3} className="empty">No customer activity yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="meta-row">{totalInvoices} total invoices in this period.</div>
    </div>
  );
};

export default ReportsPage;
