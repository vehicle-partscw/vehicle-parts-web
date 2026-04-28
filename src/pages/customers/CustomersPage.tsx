import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import Pagination, { type PageInfo } from '../../components/shared/Pagination';
import './CustomersPage.css';

interface Customer {
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  creditLimit: number | null;
  createdAt: string;
}

interface Vehicle {
  id: string;
  vehicleNumber: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  customerUserId: string;
}

interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  totalAmount: number;
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
}

interface PagedResult<T> {
  items: T[]; page: number; pageSize: number; totalCount: number;
  totalPages: number; hasPrevious: boolean; hasNext: boolean;
}

function fmtMoney(n: number | null) {
  if (n == null) return '—';
  return 'Rs ' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' });
}
function initials(name: string) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function statusClass(s: SalesInvoice['paymentStatus']) {
  switch (s) {
    case 'Paid': return 'badge-success';
    case 'PartiallyPaid': return 'badge-warn';
    case 'OnCredit': return 'badge-danger';
    default: return 'badge-muted';
  }
}
function apptClass(s: Appointment['status']) {
  switch (s) {
    case 'Confirmed': return 'badge-info';
    case 'Done': return 'badge-success';
    case 'Cancelled': return 'badge-muted';
    default: return 'badge-warn';
  }
}

function extractError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: string; errors?: Record<string, string[]> } } };
  const data = e?.response?.data;
  if (data?.errors) return Object.values(data.errors).flat().join(' ');
  if (data?.detail) return data.detail;
  return fallback;
}

const CustomersPage = () => {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'Admin';

  const [searchParams] = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState(searchParams.get('search') ?? '');

  // sync URL ?search= → input when it changes (topbar search lands here)
  useEffect(() => {
    const q = searchParams.get('search') ?? '';
    setSearch(q);
  }, [searchParams]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const [viewing, setViewing] = useState<Customer | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [recentSales, setRecentSales] = useState<SalesInvoice[]>([]);
  const [recentAppts, setRecentAppts] = useState<Appointment[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [creditTarget, setCreditTarget] = useState<Customer | null>(null);
  const [creditValue, setCreditValue] = useState<string>('');
  const [creditSaving, setCreditSaving] = useState(false);

  // add-customer modal state
  const [showAdd, setShowAdd] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addForm, setAddForm] = useState({
    fullName: '', email: '', password: '', confirmPassword: '',
    addVehicle: false,
    vehicleNumber: '', make: '', model: '', year: new Date().getFullYear().toString(), mileage: '0',
  });
  const resetAddForm = () => setAddForm({
    fullName: '', email: '', password: '', confirmPassword: '',
    addVehicle: false,
    vehicleNumber: '', make: '', model: '', year: new Date().getFullYear().toString(), mileage: '0',
  });

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
        path: '/lottie-contact.json',
      });
    };
    loadLottie();
    return () => { if (anim) anim.destroy(); };
  }, []);

  const fetchCustomers = async () => {
    try {
      const res = await api.get<Customer[]>('/customers');
      setCustomers(res.data || []);
    } catch (err) {
      toast.error(extractError(err, 'Could not load customers.'));
    }
  };

  useEffect(() => { fetchCustomers(); }, []);

  // client-side filter + pagination
  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const s = search.trim().toLowerCase();
    return customers.filter((c) =>
      c.fullName.toLowerCase().includes(s) ||
      c.email.toLowerCase().includes(s) ||
      (c.phone ?? '').toLowerCase().includes(s)
    );
  }, [customers, search]);

  useEffect(() => { setPage(1); }, [search, pageSize]);

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const pageRows = filtered.slice(startIdx, startIdx + pageSize);

  const pageInfo: PageInfo = {
    page: safePage,
    pageSize,
    totalCount,
    totalPages,
    hasPrevious: safePage > 1,
    hasNext: safePage < totalPages,
  };

  const totalActive = customers.filter((c) => c.isActive).length;
  const totalInactive = customers.length - totalActive;
  const customersWithCredit = customers.filter((c) => c.creditLimit != null && c.creditLimit > 0).length;

  const openView = async (c: Customer) => {
    setViewing(c);
    setDetailLoading(true);
    setVehicles([]);
    setRecentSales([]);
    setRecentAppts([]);
    try {
      const [v, s, a] = await Promise.all([
        api.get<PagedResult<Vehicle>>('/vehicles', { params: { customerUserId: c.userId, pageSize: 50 } }),
        api.get<PagedResult<SalesInvoice>>('/sales-invoices', { params: { customerUserId: c.userId, pageSize: 5 } }),
        api.get<PagedResult<Appointment>>('/appointments', { params: { customerUserId: c.userId, pageSize: 5 } }),
      ]);
      setVehicles(v.data.items || []);
      setRecentSales(s.data.items || []);
      setRecentAppts(a.data.items || []);
    } catch (err) {
      toast.error(extractError(err, 'Could not load customer details.'));
    } finally {
      setDetailLoading(false);
    }
  };

  const onToggleActive = async (c: Customer) => {
    try {
      await api.patch(`/customers/${c.userId}/toggle-active`);
      toast.success(c.isActive ? 'Customer deactivated.' : 'Customer reactivated.');
      fetchCustomers();
      if (viewing?.userId === c.userId) {
        setViewing({ ...viewing, isActive: !viewing.isActive });
      }
    } catch (err) {
      toast.error(extractError(err, 'Could not update status.'));
    }
  };

  const openCreditEdit = (c: Customer) => {
    setCreditTarget(c);
    setCreditValue(c.creditLimit?.toString() ?? '');
  };

  const onCreditSave = async () => {
    if (!creditTarget) return;
    setCreditSaving(true);
    const parsed = creditValue.trim() === '' ? null : Number(creditValue);
    if (parsed != null && (isNaN(parsed) || parsed < 0)) {
      toast.error('Credit limit must be a non-negative number.');
      setCreditSaving(false);
      return;
    }
    try {
      await api.patch(`/customers/${creditTarget.userId}/credit-limit`, { creditLimit: parsed });
      toast.success('Credit limit updated.');
      setCreditTarget(null);
      fetchCustomers();
      if (viewing?.userId === creditTarget.userId) {
        setViewing({ ...viewing, creditLimit: parsed });
      }
    } catch (err) {
      toast.error(extractError(err, 'Could not update credit limit.'));
    } finally {
      setCreditSaving(false);
    }
  };

  const onAddCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = addForm;
    if (!f.fullName.trim() || !f.email.trim()) {
      toast.error('Full name and email are required.');
      return;
    }
    if (f.password.length < 10) {
      toast.error('Password must be at least 10 characters.');
      return;
    }
    if (f.password !== f.confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }
    if (f.addVehicle) {
      if (!f.vehicleNumber.trim() || !f.make.trim() || !f.model.trim()) {
        toast.error('Vehicle number, make and model are required when adding a vehicle.');
        return;
      }
    }

    setAddSaving(true);
    try {
      const reg = await api.post<{ userId: string }>('/auth/register', {
        fullName: f.fullName.trim(),
        email: f.email.trim(),
        password: f.password,
        confirmPassword: f.confirmPassword,
      });
      const newUserId = reg.data?.userId;

      if (f.addVehicle && newUserId) {
        await api.post('/vehicles', {
          customerUserId: newUserId,
          vehicleNumber: f.vehicleNumber.trim().toUpperCase(),
          make: f.make.trim(),
          model: f.model.trim(),
          year: Number(f.year) || new Date().getFullYear(),
          mileage: Number(f.mileage) || 0,
        });
      }

      toast.success(f.addVehicle ? 'Customer and vehicle added.' : 'Customer added.');
      setShowAdd(false);
      resetAddForm();
      fetchCustomers();
    } catch (err) {
      toast.error(extractError(err, 'Could not register customer.'));
    } finally {
      setAddSaving(false);
    }
  };

  const totalSpentByCustomer = (rows: SalesInvoice[]) =>
    rows.reduce((sum, i) => sum + i.totalAmount, 0);
  const totalDueByCustomer = (rows: SalesInvoice[]) =>
    rows.reduce((sum, i) => sum + i.amountDue, 0);

  return (
    <div className="customers-page">
      <div className="page-header">
        <h1 className="page-title">Customers</h1>
        <p className="page-subtitle">Everyone you sell to. Click a row to see their vehicles and history.</p>
      </div>

      <div className="hero">
        <div className="hero-text">
          <h2>Know who you're serving.</h2>
          <p>Open a customer to see their vehicles, recent invoices, and upcoming appointments. Adjust credit limits or pause accounts when needed.</p>
        </div>
        <div className="hero-illust">
          <div ref={lottieRef} className="lottie-hero hero-wide" aria-label="customers animation" />
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card accent-pop">
          <div className="stat-label">Total Customers</div>
          <div className="stat-value">{customers.length}</div>
          <div className="stat-change">{totalActive} active</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">On credit</div>
          <div className="stat-value">{customersWithCredit}</div>
          <div className="stat-change">Have a credit limit set</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Inactive</div>
          <div className="stat-value">{totalInactive}</div>
          <div className="stat-change">{totalInactive > 0 ? 'Paused accounts' : 'All in good standing'}</div>
        </div>
      </div>

      <div className="table-wrap">
        <div className="table-header">
          <span className="table-header-title">All customers</span>
          <div className="table-actions">
            <input
              className="search-input"
              placeholder="Name, email or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="btn-primary" onClick={() => setShowAdd(true)}>
              + Add Customer
            </button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Credit limit</th>
              <th>Joined</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={7} className="empty">{customers.length === 0 ? 'No customers yet.' : 'No customers match this search.'}</td></tr>
            ) : (
              pageRows.map((c) => (
                <tr key={c.userId}>
                  <td>
                    <div className="customer-cell">
                      <div className="avatar">{initials(c.fullName)}</div>
                      <div className="customer-name">{c.fullName}</div>
                    </div>
                  </td>
                  <td>{c.email}</td>
                  <td className="mono">{c.phone || '—'}</td>
                  <td className="mono">{fmtMoney(c.creditLimit)}</td>
                  <td>{fmtDate(c.createdAt)}</td>
                  <td>
                    <span className={`badge ${c.isActive ? 'badge-success' : 'badge-muted'}`}>
                      {c.isActive ? 'Active' : 'Paused'}
                    </span>
                  </td>
                  <td className="row-actions">
                    <button className="btn-ghost" onClick={() => openView(c)}>View</button>
                    {isAdmin && (
                      <>
                        <button className="btn-ghost" onClick={() => openCreditEdit(c)}>Credit</button>
                        <button className="btn-ghost" onClick={() => onToggleActive(c)}>
                          {c.isActive ? 'Pause' : 'Resume'}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination
          meta={pageInfo}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        />
      </div>

      {/* Detail modal */}
      {viewing && (
        <div className="modal-backdrop" onClick={() => setViewing(null)}>
          <div className="modal modal-extra-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{viewing.fullName}</h3>
              <button className="modal-close" onClick={() => setViewing(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="customer-meta">
                <div className="customer-avatar-lg">{initials(viewing.fullName)}</div>
                <div className="customer-info">
                  <div className="info-row"><span className="info-label">Email</span><span>{viewing.email}</span></div>
                  <div className="info-row"><span className="info-label">Phone</span><span className="mono">{viewing.phone || '—'}</span></div>
                  <div className="info-row"><span className="info-label">Joined</span><span>{fmtDate(viewing.createdAt)}</span></div>
                  <div className="info-row">
                    <span className="info-label">Status</span>
                    <span><span className={`badge ${viewing.isActive ? 'badge-success' : 'badge-muted'}`}>{viewing.isActive ? 'Active' : 'Paused'}</span></span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Credit limit</span>
                    <span className="strong">{fmtMoney(viewing.creditLimit)}</span>
                  </div>
                </div>
                <div className="customer-rollup">
                  <div className="rollup-item">
                    <span className="rollup-label">Lifetime spend</span>
                    <span className="rollup-value">{fmtMoney(totalSpentByCustomer(recentSales))}</span>
                  </div>
                  <div className="rollup-item">
                    <span className="rollup-label">Outstanding</span>
                    <span className={`rollup-value ${totalDueByCustomer(recentSales) > 0 ? 'danger' : ''}`}>
                      {fmtMoney(totalDueByCustomer(recentSales))}
                    </span>
                  </div>
                </div>
              </div>

              {detailLoading ? (
                <div className="detail-loading">Loading customer history…</div>
              ) : (
                <>
                  <section className="detail-section">
                    <h4>Vehicles ({vehicles.length})</h4>
                    {vehicles.length === 0 ? (
                      <p className="muted">No vehicles registered.</p>
                    ) : (
                      <table className="mini-table">
                        <thead>
                          <tr><th>Number</th><th>Make / Model</th><th>Year</th><th>Mileage</th></tr>
                        </thead>
                        <tbody>
                          {vehicles.map((v) => (
                            <tr key={v.id}>
                              <td className="mono">{v.vehicleNumber}</td>
                              <td>{v.make} {v.model}</td>
                              <td>{v.year}</td>
                              <td className="mono">{new Intl.NumberFormat('en-US').format(v.mileage)} km</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </section>

                  <section className="detail-section">
                    <h4>Recent sales</h4>
                    {recentSales.length === 0 ? (
                      <p className="muted">No sales invoices yet.</p>
                    ) : (
                      <table className="mini-table">
                        <thead>
                          <tr><th>Number</th><th>Date</th><th>Total</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                          {recentSales.map((s) => (
                            <tr key={s.id}>
                              <td className="mono">{s.invoiceNumber}</td>
                              <td>{fmtDate(s.issueDate)}</td>
                              <td className="mono">{fmtMoney(s.totalAmount)}</td>
                              <td>
                                <span className={`badge ${statusClass(s.paymentStatus)}`}>
                                  {s.paymentStatus === 'PartiallyPaid' ? 'Partial' : s.paymentStatus === 'OnCredit' ? 'Overdue' : s.paymentStatus}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </section>

                  <section className="detail-section">
                    <h4>Recent appointments</h4>
                    {recentAppts.length === 0 ? (
                      <p className="muted">No appointments yet.</p>
                    ) : (
                      <table className="mini-table">
                        <thead>
                          <tr><th>When</th><th>Vehicle</th><th>Service</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                          {recentAppts.map((a) => (
                            <tr key={a.id}>
                              <td>{new Date(a.scheduledAt).toLocaleString('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                              <td className="mono">{a.vehicleNumber}</td>
                              <td>{a.serviceTypeName}</td>
                              <td><span className={`badge ${apptClass(a.status)}`}>{a.status}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </section>
                </>
              )}
            </div>
            <div className="form-actions">
              {isAdmin && (
                <>
                  <button className="btn-ghost" onClick={() => openCreditEdit(viewing)}>Edit credit limit</button>
                  <button className="btn-ghost" onClick={() => onToggleActive(viewing)}>
                    {viewing.isActive ? 'Pause account' : 'Resume account'}
                  </button>
                </>
              )}
              <button className="btn-primary" onClick={() => setViewing(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Credit limit modal */}
      {creditTarget && (
        <div className="modal-backdrop" onClick={() => setCreditTarget(null)}>
          <div className="modal modal-narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Credit limit</h3>
              <button className="modal-close" onClick={() => setCreditTarget(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 16 }}>
                Set the maximum credit balance for <strong>{creditTarget.fullName}</strong>. Leave blank to remove.
              </p>
              <label className="credit-input-label">
                <span>Credit limit (Rs)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={creditValue}
                  onChange={(e) => setCreditValue(e.target.value)}
                  placeholder="50000"
                  autoFocus
                />
              </label>
            </div>
            <div className="form-actions">
              <button className="btn-ghost" onClick={() => setCreditTarget(null)}>Cancel</button>
              <button className="btn-primary" onClick={onCreditSave} disabled={creditSaving}>
                {creditSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add customer modal */}
      {showAdd && (
        <div className="modal-backdrop" onClick={() => !addSaving && setShowAdd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Register a customer</h3>
              <button className="modal-close" onClick={() => !addSaving && setShowAdd(false)}>×</button>
            </div>
            <form onSubmit={onAddCustomerSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <label className="form-field">
                    <span>Full name</span>
                    <input
                      type="text"
                      placeholder="Customer's full name"
                      value={addForm.fullName}
                      onChange={(e) => setAddForm({ ...addForm, fullName: e.target.value })}
                      autoFocus
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label className="form-field">
                    <span>Email</span>
                    <input
                      type="email"
                      placeholder="Customer's email address"
                      value={addForm.email}
                      onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                    />
                  </label>
                </div>
                <div className="form-row form-row-2">
                  <label className="form-field">
                    <span>Password</span>
                    <input
                      type="password"
                      placeholder="At least 10 characters"
                      value={addForm.password}
                      onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                    />
                  </label>
                  <label className="form-field">
                    <span>Confirm password</span>
                    <input
                      type="password"
                      placeholder="Repeat password"
                      value={addForm.confirmPassword}
                      onChange={(e) => setAddForm({ ...addForm, confirmPassword: e.target.value })}
                    />
                  </label>
                </div>

                <label className="add-vehicle-toggle">
                  <input
                    type="checkbox"
                    checked={addForm.addVehicle}
                    onChange={(e) => setAddForm({ ...addForm, addVehicle: e.target.checked })}
                  />
                  <span>Also register their first vehicle</span>
                </label>

                {addForm.addVehicle && (
                  <div className="vehicle-fields">
                    <div className="form-row">
                      <label className="form-field">
                        <span>Vehicle number</span>
                        <input
                          type="text"
                          placeholder="BA-2-PA-1234"
                          value={addForm.vehicleNumber}
                          onChange={(e) => setAddForm({ ...addForm, vehicleNumber: e.target.value })}
                          style={{ textTransform: 'uppercase' }}
                        />
                      </label>
                    </div>
                    <div className="form-row form-row-2">
                      <label className="form-field">
                        <span>Make</span>
                        <input
                          type="text"
                          placeholder="Toyota"
                          value={addForm.make}
                          onChange={(e) => setAddForm({ ...addForm, make: e.target.value })}
                        />
                      </label>
                      <label className="form-field">
                        <span>Model</span>
                        <input
                          type="text"
                          placeholder="Yaris"
                          value={addForm.model}
                          onChange={(e) => setAddForm({ ...addForm, model: e.target.value })}
                        />
                      </label>
                    </div>
                    <div className="form-row form-row-2">
                      <label className="form-field">
                        <span>Year</span>
                        <input
                          type="number"
                          min="1980"
                          max={new Date().getFullYear() + 1}
                          value={addForm.year}
                          onChange={(e) => setAddForm({ ...addForm, year: e.target.value })}
                        />
                      </label>
                      <label className="form-field">
                        <span>Mileage (km)</span>
                        <input
                          type="number"
                          min="0"
                          value={addForm.mileage}
                          onChange={(e) => setAddForm({ ...addForm, mileage: e.target.value })}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
              <div className="form-actions">
                <button type="button" className="btn-ghost" onClick={() => !addSaving && setShowAdd(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={addSaving}>
                  {addSaving ? 'Saving…' : 'Register'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomersPage;
