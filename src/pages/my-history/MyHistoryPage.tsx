import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import api from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import './MyHistoryPage.css';

interface Vehicle {
  id: string;
  vehicleNumber: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
}

interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string | null;
  totalAmount: number;
  amountPaid: number;
  amountDue: number;
  paymentStatus: 'Unpaid' | 'PartiallyPaid' | 'Paid' | 'OnCredit';
  loyaltyTierName: string | null;
}

interface Appointment {
  id: string;
  vehicleNumber: string;
  serviceTypeName: string;
  scheduledAt: string;
  status: 'Pending' | 'Confirmed' | 'Done' | 'Cancelled';
  notes: string | null;
}

interface PartRequest {
  id: string;
  partName: string;
  status: 'Pending' | 'Sourced' | 'Rejected';
  requestedAt: string;
  resolvedAt: string | null;
}

interface PagedResult<T> {
  items: T[]; page: number; pageSize: number; totalCount: number;
  totalPages: number; hasPrevious: boolean; hasNext: boolean;
}

function fmtMoney(n: number) {
  return 'Rs ' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null) {
  if (!s) return '-';
  return new Date(s).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtDateTime(s: string) {
  return new Date(s).toLocaleString('en', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function statusClassSale(s: SalesInvoice['paymentStatus']) {
  switch (s) {
    case 'Paid': return 'badge-success';
    case 'PartiallyPaid': return 'badge-warn';
    case 'OnCredit': return 'badge-danger';
    default: return 'badge-muted';
  }
}
function statusLabelSale(s: SalesInvoice['paymentStatus']) {
  if (s === 'PartiallyPaid') return 'Partial';
  if (s === 'OnCredit') return 'Overdue';
  return s;
}
function statusClassAppt(s: Appointment['status']) {
  switch (s) {
    case 'Confirmed': return 'badge-info';
    case 'Done': return 'badge-success';
    case 'Cancelled': return 'badge-muted';
    default: return 'badge-warn';
  }
}
function statusClassRequest(s: PartRequest['status']) {
  switch (s) {
    case 'Sourced': return 'badge-success';
    case 'Rejected': return 'badge-muted';
    default: return 'badge-warn';
  }
}

const MyHistoryPage = () => {
  const { user } = useAuthStore();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [sales, setSales] = useState<SalesInvoice[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [requests, setRequests] = useState<PartRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const lottieRef = useRef<HTMLDivElement>(null);

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
        path: '/lottie-teaching.json',
      });
    };
    loadLottie();
    return () => { if (anim) anim.destroy(); };
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [v, s, a, r] = await Promise.all([
        api.get<PagedResult<Vehicle>>('/vehicles', { params: { pageSize: 50 } }),
        api.get<PagedResult<SalesInvoice>>('/sales-invoices', { params: { pageSize: 50 } }),
        api.get<PagedResult<Appointment>>('/appointments', { params: { pageSize: 50 } }),
        api.get<PagedResult<PartRequest>>('/part-requests', { params: { pageSize: 50 } }),
      ]);
      setVehicles(v.data.items || []);
      setSales(s.data.items || []);
      setAppointments(a.data.items || []);
      setRequests(r.data.items || []);
    } catch {
      toast.error('Could not load your history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const totalSpent = sales.reduce((sum, s) => sum + s.totalAmount, 0);
  const openBalance = sales.reduce((sum, s) => sum + s.amountDue, 0);
  const completedVisits = appointments.filter((a) => a.status === 'Done').length;
  const upcoming = appointments.filter((a) =>
    (a.status === 'Pending' || a.status === 'Confirmed') && new Date(a.scheduledAt) >= new Date()
  );
  const past = appointments.filter((a) =>
    a.status === 'Done' || a.status === 'Cancelled' || new Date(a.scheduledAt) < new Date()
  );

  return (
    <div className="my-history-page">
      <div className="page-header">
        <h1 className="page-title">My history</h1>
        <p className="page-subtitle">
          Everything we have on file - your purchases, services, and the parts you've asked us to source.
        </p>
      </div>

      <div className="hero">
        <div className="hero-text">
          <h2>Welcome back{user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}.</h2>
          <p>
            All your invoices, appointments, vehicles, and outstanding part requests live here. Outstanding balances and upcoming services show first.
          </p>
        </div>
        <div className="hero-illust">
          <div ref={lottieRef} className="lottie-hero hero-wide" aria-label="dashboard animation" />
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card accent-pop">
          <div className="stat-label">Lifetime spend</div>
          <div className="stat-value">{fmtMoney(totalSpent)}</div>
          <div className="stat-change">{sales.length} invoice{sales.length === 1 ? '' : 's'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Open balance</div>
          <div className="stat-value">{fmtMoney(openBalance)}</div>
          <div className="stat-change" style={{ color: openBalance > 0 ? 'var(--accent-9)' : 'var(--success)' }}>
            {openBalance > 0 ? 'Owed' : 'All settled'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Completed visits</div>
          <div className="stat-value">{completedVisits}</div>
          <div className="stat-change">Services done</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Vehicles on file</div>
          <div className="stat-value">{vehicles.length}</div>
          <div className="stat-change">{vehicles.length > 0 ? vehicles[0].make : 'Add one'}</div>
        </div>
      </div>

      {loading ? (
        <div className="loading-block">Loading your history…</div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className="history-section">
              <div className="section-head">
                <h2>Upcoming services</h2>
                <span className="section-count">{upcoming.length} scheduled</span>
              </div>
              <div className="upcoming-cards">
                {upcoming.map((a) => (
                  <div key={a.id} className="upcoming-card">
                    <div className="upcoming-when">{fmtDateTime(a.scheduledAt)}</div>
                    <div className="upcoming-service">{a.serviceTypeName}</div>
                    <div className="upcoming-meta">
                      <span className="mono">{a.vehicleNumber}</span>
                      <span className={`badge ${statusClassAppt(a.status)}`}>{a.status}</span>
                    </div>
                    {a.notes && <div className="upcoming-notes">{a.notes}</div>}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="history-section">
            <div className="section-head">
              <h2>Purchase history</h2>
              <span className="section-count">{sales.length} invoice{sales.length === 1 ? '' : 's'}</span>
            </div>
            <div className="table-wrap">
              {sales.length === 0 ? (
                <div className="empty-state">No purchases yet.</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Date</th>
                      <th>Total</th>
                      <th>Paid</th>
                      <th>Due</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((s) => (
                      <tr key={s.id}>
                        <td className="mono strong">{s.invoiceNumber}</td>
                        <td>{fmtDate(s.issueDate)}</td>
                        <td className="mono">{fmtMoney(s.totalAmount)}</td>
                        <td className="mono">{fmtMoney(s.amountPaid)}</td>
                        <td className="mono">{s.amountDue > 0 ? fmtMoney(s.amountDue) : '-'}</td>
                        <td>
                          <span className={`badge ${statusClassSale(s.paymentStatus)}`}>
                            {statusLabelSale(s.paymentStatus)}
                          </span>
                          {s.loyaltyTierName && <span className="badge-loyalty">Loyalty</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="history-section">
            <div className="section-head">
              <h2>Past services</h2>
              <span className="section-count">{past.length} on record</span>
            </div>
            <div className="table-wrap">
              {past.length === 0 ? (
                <div className="empty-state">No past appointments yet.</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Vehicle</th>
                      <th>Service</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {past.map((a) => (
                      <tr key={a.id}>
                        <td>{fmtDateTime(a.scheduledAt)}</td>
                        <td className="mono">{a.vehicleNumber}</td>
                        <td>{a.serviceTypeName}</td>
                        <td><span className={`badge ${statusClassAppt(a.status)}`}>{a.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <div className="two-col-history">
            <section className="history-section">
              <div className="section-head">
                <h2>My vehicles</h2>
                <span className="section-count">{vehicles.length} on file</span>
              </div>
              <div className="table-wrap">
                {vehicles.length === 0 ? (
                  <div className="empty-state">No vehicles registered.</div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Number</th>
                        <th>Make / Model</th>
                        <th>Year</th>
                        <th>Mileage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vehicles.map((v) => (
                        <tr key={v.id}>
                          <td className="mono strong">{v.vehicleNumber}</td>
                          <td>{v.make} {v.model}</td>
                          <td>{v.year}</td>
                          <td className="mono">{new Intl.NumberFormat('en-US').format(v.mileage)} km</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section className="history-section">
              <div className="section-head">
                <h2>My part requests</h2>
                <span className="section-count">{requests.length} total</span>
              </div>
              <div className="table-wrap">
                {requests.length === 0 ? (
                  <div className="empty-state">No requests yet.</div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Part</th>
                        <th>Requested</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requests.map((r) => (
                        <tr key={r.id}>
                          <td className="strong">{r.partName}</td>
                          <td>{fmtDate(r.requestedAt)}</td>
                          <td><span className={`badge ${statusClassRequest(r.status)}`}>{r.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
};

export default MyHistoryPage;
