import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import api from '../../lib/api';
import './CustomerReportsPage.css';

type ReportType = 'top-spenders' | 'regulars' | 'overdue';

interface CustomerReportRow {
  customerUserId: string;
  fullName: string;
  email: string;
  value: number;
  count: number;
  lastDate: string | null;
}

interface CustomerReport {
  type: ReportType;
  from: string;
  to: string;
  valueLabel: string;
  countLabel: string;
  rows: CustomerReportRow[];
}

function fmtMoney(n: number) {
  return 'Rs ' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null) {
  if (!s) return '-';
  return new Date(s).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' });
}
function initials(name: string) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function extractError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: string; errors?: Record<string, string[]> } } };
  const data = e?.response?.data;
  if (data?.errors) return Object.values(data.errors).flat().join(' ');
  if (data?.detail) return data.detail;
  return fallback;
}

const TYPE_META: Record<ReportType, { title: string; subtitle: string; heroH2: string; heroP: string }> = {
  'top-spenders': {
    title: 'Top spenders',
    subtitle: 'Customers who bought the most in the period.',
    heroH2: 'Who pays the bills.',
    heroP: 'Ranked by lifetime spend in the chosen window. Reach out to the top of the list with referral perks or thank-you discounts.',
  },
  'regulars': {
    title: 'Regulars',
    subtitle: 'Customers with the most repeat invoices.',
    heroH2: 'The familiar faces.',
    heroP: 'Counted by visits in the window. These are the people who keep coming back - make sure they\'re happy.',
  },
  'overdue': {
    title: 'Overdue credit',
    subtitle: 'Customers with unpaid invoices past their due date.',
    heroH2: 'Money on the table.',
    heroP: 'Invoices past their due date with money still owed. Use this list for collection calls or payment reminders.',
  },
};

const CustomerReportsPage = () => {
  const [type, setType] = useState<ReportType>('top-spenders');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [report, setReport] = useState<CustomerReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanningOverdue, setScanningOverdue] = useState(false);

  const lottieRef = useRef<HTMLDivElement>(null);

  const runOverdueScan = async () => {
    if (scanningOverdue) return;
    setScanningOverdue(true);
    try {
      const res = await api.post<{ found: number; sent: number; skipped: number; failed: number }>('/sales-invoices/scan-overdue');
      const r = res.data;
      if (r.sent > 0) {
        toast.success(`Sent ${r.sent} overdue reminder${r.sent === 1 ? '' : 's'}.`);
      } else if (r.found === 0) {
        toast.success('No overdue invoices right now - all clear.');
      } else {
        toast.message(`Found ${r.found} overdue, sent ${r.sent} (skipped ${r.skipped}, failed ${r.failed}).`);
      }
    } catch {
      toast.error('Could not run the overdue scan. Try again in a moment.');
    } finally {
      setScanningOverdue(false);
    }
  };

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
        path: '/lottie-contact.json',
      });
    };
    loadLottie();
    return () => { if (anim) anim.destroy(); };
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { type };
      if (from) params.from = from;
      if (to) params.to = to;
      const res = await api.get<CustomerReport>('/reports/customers', { params });
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
  }, [type]);

  const meta = TYPE_META[type];

  const totalValue = report?.rows.reduce((s, r) => s + r.value, 0) ?? 0;
  const totalCount = report?.rows.reduce((s, r) => s + r.count, 0) ?? 0;
  const customerCount = report?.rows.length ?? 0;

  return (
    <div className="customer-reports-page">
      <div className="page-header">
        <h1 className="page-title">Customer reports</h1>
        <p className="page-subtitle">{meta.subtitle}</p>
      </div>

      <div className="hero">
        <div className="hero-text">
          <h2>{meta.heroH2}</h2>
          <p>{meta.heroP}</p>
        </div>
        <div className="hero-illust">
          <div ref={lottieRef} className="lottie-hero hero-wide" aria-label="customer reports animation" />
        </div>
      </div>

      <div className="filter-row">
        <div className="type-toggle">
          {(['top-spenders', 'regulars', 'overdue'] as ReportType[]).map((t) => (
            <button
              key={t}
              className={`type-btn ${type === t ? 'active' : ''}`}
              onClick={() => setType(t)}
            >
              {TYPE_META[t].title}
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

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card accent-pop">
          <div className="stat-label">Customers in this view</div>
          <div className="stat-value">{customerCount}</div>
          <div className="stat-change">{report ? `${report.from} → ${report.to}` : '-'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{report?.valueLabel ?? 'Total'}</div>
          <div className="stat-value">{fmtMoney(totalValue)}</div>
          <div className="stat-change" style={{ color: type === 'overdue' && totalValue > 0 ? 'var(--accent-9)' : 'var(--neutral-9)' }}>
            {type === 'overdue' ? 'Outstanding balance' : 'Across the list'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{report?.countLabel ?? 'Total'}</div>
          <div className="stat-value">{totalCount}</div>
          <div className="stat-change">{type === 'overdue' ? 'Open invoices' : 'Across the list'}</div>
        </div>
      </div>

      <div className="table-wrap">
        <div className="table-header">
          <span className="table-header-title">{meta.title}</span>
          <div className="table-actions">
            <span className="table-header-meta">{report ? `${report.rows.length} rows` : ''}</span>
            {type === 'overdue' && (
              <button
                className="btn-primary"
                onClick={runOverdueScan}
                disabled={scanningOverdue}
                title="Email a polite reminder to every customer with an On-Credit invoice older than 30 days. Each invoice is reminded at most once per week."
              >
                {scanningOverdue ? 'Sending…' : 'Send reminders'}
              </button>
            )}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Customer</th>
              <th>Email</th>
              <th>{report?.valueLabel ?? 'Value'}</th>
              <th>{report?.countLabel ?? 'Count'}</th>
              <th>{type === 'overdue' ? 'Oldest due' : 'Last activity'}</th>
            </tr>
          </thead>
          <tbody>
            {!report || report.rows.length === 0 ? (
              <tr><td colSpan={6} className="empty">
                {loading ? 'Loading…' : 'No customer activity in this window.'}
              </td></tr>
            ) : (
              report.rows.map((r, idx) => (
                <tr key={r.customerUserId}>
                  <td className="rank-cell">
                    <span className={`rank ${idx < 3 ? 'top' : ''}`}>{idx + 1}</span>
                  </td>
                  <td>
                    <div className="customer-cell">
                      <div className="avatar">{initials(r.fullName)}</div>
                      <span className="customer-name">{r.fullName}</span>
                    </div>
                  </td>
                  <td className="muted">{r.email}</td>
                  <td className="mono strong">{fmtMoney(r.value)}</td>
                  <td className="mono">{r.count}</td>
                  <td>{fmtDate(r.lastDate)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CustomerReportsPage;
