import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import ServiceTypeQuickAdd from '../../components/shared/ServiceTypeQuickAdd';
import Pagination, { type PageInfo } from '../../components/shared/Pagination';
import './AppointmentsPage.css';

type AppointmentStatus = 'Pending' | 'Confirmed' | 'Done' | 'Cancelled';

interface Appointment {
  id: string;
  customerUserId: string;
  customerName: string | null;
  customerPhone: string | null;
  vehicleId: string;
  vehicleNumber: string;
  serviceTypeId: string;
  serviceTypeName: string;
  assignedStaffUserId: string | null;
  scheduledAt: string;
  status: AppointmentStatus;
  notes: string | null;
  createdAt: string;
  linkedInvoiceId: string | null;
  linkedInvoiceNumber: string | null;
}

interface VehicleLookup {
  id: string;
  customerUserId: string;
  vehicleNumber: string;
  make: string;
  model: string;
}

interface ServiceTypeLookup {
  id: string;
  code: string;
  name: string;
  basePrice: number;
  estimatedMinutes: number;
  isActive: boolean;
}

interface PagedResult<T> {
  items: T[]; page: number; pageSize: number; totalCount: number;
  totalPages: number; hasPrevious: boolean; hasNext: boolean;
}

const bookSchema = z.object({
  vehicleId: z.string().min(1, 'Pick a vehicle'),
  serviceTypeId: z.string().min(1, 'Pick a service type'),
  scheduledAt: z.string().min(1, 'When?'),
  notes: z.string().max(500).optional().or(z.literal('')),
});

type BookFormData = z.infer<typeof bookSchema>;

function fmtWhen(s: string) {
  const d = new Date(s);
  return d.toLocaleString('en', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function statusClass(s: AppointmentStatus) {
  switch (s) {
    case 'Confirmed': return 'badge-info';
    case 'Done': return 'badge-success';
    case 'Cancelled': return 'badge-muted';
    default: return 'badge-warn';
  }
}

function nextPossibleStatuses(current: AppointmentStatus): AppointmentStatus[] {
  // simple workflow: Pending → Confirmed → Done; Pending/Confirmed → Cancelled
  if (current === 'Pending') return ['Confirmed', 'Cancelled'];
  if (current === 'Confirmed') return ['Done', 'Cancelled'];
  return [];
}

function defaultScheduled(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}

function extractError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: string; errors?: Record<string, string[]> } } };
  const data = e?.response?.data;
  if (data?.errors) return Object.values(data.errors).flat().join(' ');
  if (data?.detail) return data.detail;
  return fallback;
}

const AppointmentsPage = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const isCustomer = user?.role === 'Customer';

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [vehicles, setVehicles] = useState<VehicleLookup[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeLookup[]>([]);
  const [filterStatus, setFilterStatus] = useState('');

  const [showBook, setShowBook] = useState(false);
  const [statusTarget, setStatusTarget] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(false);

  const lottieRef = useRef<HTMLDivElement>(null);

  const bookForm = useForm<BookFormData>({
    resolver: zodResolver(bookSchema),
    defaultValues: { vehicleId: '', serviceTypeId: '', scheduledAt: defaultScheduled(), notes: '' },
  });

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
        path: '/lottie-appointments.json',
      });
    };
    loadLottie();
    return () => { if (anim) anim.destroy(); };
  }, []);

  const fetchAppointments = async () => {
    try {
      const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
      if (filterStatus) params.status = filterStatus;
      const res = await api.get<PagedResult<Appointment>>('/appointments', { params });
      setAppointments(res.data.items || []);
      setPageInfo({
        page: res.data.page,
        pageSize: res.data.pageSize,
        totalCount: res.data.totalCount,
        totalPages: res.data.totalPages,
        hasPrevious: res.data.hasPrevious,
        hasNext: res.data.hasNext,
      });
    } catch (err) {
      toast.error(extractError(err, 'Could not load appointments.'));
    }
  };

  const fetchLookups = async () => {
    try {
      const v = await api.get<PagedResult<VehicleLookup>>('/vehicles', { params: { pageSize: 100 } });
      setVehicles(v.data.items || []);
    } catch { /* ignore */ }
    try {
      const s = await api.get<PagedResult<ServiceTypeLookup>>('/service-types', { params: { pageSize: 100, isActive: true } });
      setServiceTypes((s.data.items || []).filter((x) => x.isActive));
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchLookups(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { fetchAppointments(); /* eslint-disable-next-line */ }, [page, pageSize]);
  useEffect(() => { setPage(1); fetchAppointments(); /* eslint-disable-next-line */ }, [filterStatus]);

  const openBook = () => {
    bookForm.reset({ vehicleId: '', serviceTypeId: '', scheduledAt: defaultScheduled(), notes: '' });
    setShowBook(true);
  };

  const onBook = async (data: BookFormData) => {
    setLoading(true);
    try {
      await api.post('/appointments', {
        vehicleId: data.vehicleId,
        serviceTypeId: data.serviceTypeId,
        scheduledAt: new Date(data.scheduledAt).toISOString(),
        notes: data.notes || null,
      });
      toast.success('Appointment booked.');
      setShowBook(false);
      fetchAppointments();
    } catch (err) {
      toast.error(extractError(err, 'Could not book appointment.'));
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (newStatus: AppointmentStatus) => {
    if (!statusTarget) return;
    try {
      await api.patch(`/appointments/${statusTarget.id}/status`, { newStatus });
      toast.success(`Marked as ${newStatus}.`);
      setStatusTarget(null);
      fetchAppointments();
    } catch (err) {
      toast.error(extractError(err, 'Could not update status.'));
    }
  };

  const upcoming = appointments.filter(
    (a) => (a.status === 'Pending' || a.status === 'Confirmed') && new Date(a.scheduledAt) >= new Date()
  ).length;
  const pendingCount = appointments.filter((a) => a.status === 'Pending').length;
  const doneCount = appointments.filter((a) => a.status === 'Done').length;

  return (
    <div className="appointments-page">
      <div className="page-header">
        <h1 className="page-title">Appointments</h1>
        <p className="page-subtitle">
          {isCustomer
            ? 'Book a service and we\'ll confirm it shortly.'
            : 'Confirm, complete, or cancel customer service bookings.'}
        </p>
      </div>

      <div className="hero">
        <div className="hero-text">
          <h2>{isCustomer ? 'Pick a time, leave the rest to us.' : 'Service queue, in one view.'}</h2>
          <p>
            {isCustomer
              ? 'Choose your vehicle, the service you need, and a slot. We\'ll send a confirmation as soon as a mechanic locks it in.'
              : 'Pending bookings move to Confirmed when a mechanic accepts; mark them Done when finished. Cancellations free the slot.'}
          </p>
        </div>
        <div className="hero-illust">
          <div ref={lottieRef} className="lottie-hero hero-wide" aria-label="appointments animation" />
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card accent-pop">
          <div className="stat-label">Upcoming</div>
          <div className="stat-value">{upcoming}</div>
          <div className="stat-change">Pending or confirmed</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Awaiting confirmation</div>
          <div className="stat-value">{pendingCount}</div>
          <div className="stat-change" style={{ color: pendingCount > 0 ? 'var(--accent-9)' : 'var(--success)' }}>
            {pendingCount > 0 ? 'Needs attention' : 'All caught up'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Completed</div>
          <div className="stat-value">{doneCount}</div>
          <div className="stat-change">All time, in this view</div>
        </div>
      </div>

      <div className="table-wrap">
        <div className="table-header">
          <span className="table-header-title">{isCustomer ? 'My appointments' : 'All appointments'}</span>
          <div className="table-actions">
            <select className="filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="Pending">Pending</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Done">Done</option>
              <option value="Cancelled">Cancelled</option>
            </select>
            {filterStatus && (
              <button type="button" className="btn-ghost" onClick={() => setFilterStatus('')}>Clear</button>
            )}
            <button className="btn-primary" onClick={openBook}>+ Book appointment</button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Vehicle</th>
              <th>Service</th>
              {!isCustomer && <th>Customer</th>}
              <th>Status</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {appointments.length === 0 ? (
              <tr><td colSpan={isCustomer ? 6 : 7} className="empty">
                {isCustomer ? 'No appointments yet. Click "+ Book appointment" to get started.' : 'No appointments to show.'}
              </td></tr>
            ) : (
              appointments.map((a) => {
                const transitions = !isCustomer ? nextPossibleStatuses(a.status) : [];
                return (
                  <tr key={a.id}>
                    <td className="strong">{fmtWhen(a.scheduledAt)}</td>
                    <td className="mono">{a.vehicleNumber}</td>
                    <td>{a.serviceTypeName}</td>
                    {!isCustomer && (
                      <td>
                        <div className="customer-cell-stack">
                          <span className="strong">{a.customerName || '-'}</span>
                          {a.customerPhone && <span className="mono muted">{a.customerPhone}</span>}
                        </div>
                      </td>
                    )}
                    <td><span className={`badge ${statusClass(a.status)}`}>{a.status}</span></td>
                    <td className="muted">{a.notes ? a.notes.slice(0, 60) : '-'}</td>
                    <td className="row-actions">
                      {transitions.length > 0 && (
                        <button className="btn-ghost" onClick={() => setStatusTarget(a)}>Change status</button>
                      )}
                      {!isCustomer && a.status === 'Done' && !a.linkedInvoiceId && (
                        <button
                          className="btn-primary"
                          onClick={() => navigate(`/sales?newSale=1&customerUserId=${encodeURIComponent(a.customerUserId)}&vehicleId=${encodeURIComponent(a.vehicleId)}&appointmentId=${encodeURIComponent(a.id)}`)}
                          title="Create a sales invoice for this appointment"
                        >
                          Create invoice
                        </button>
                      )}
                      {!isCustomer && a.linkedInvoiceId && (
                        <button
                          className="btn-ghost"
                          onClick={() => navigate(`/sales?invoice=${encodeURIComponent(a.linkedInvoiceId!)}`)}
                          title="Open the linked sales invoice"
                        >
                          Invoiced ({a.linkedInvoiceNumber})
                        </button>
                      )}
                      {isCustomer && a.linkedInvoiceId && (
                        <span className="invoiced-pill">Invoiced ({a.linkedInvoiceNumber})</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <Pagination
          meta={pageInfo}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        />
      </div>

      {/* Book modal */}
      {showBook && (
        <div className="modal-backdrop" onClick={() => setShowBook(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Book appointment</h3>
              <button className="modal-close" onClick={() => setShowBook(false)}>×</button>
            </div>
            <form onSubmit={bookForm.handleSubmit(onBook)} className="form">
              <label>
                <span>Vehicle</span>
                <select {...bookForm.register('vehicleId')}>
                  <option value="">Pick one…</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.vehicleNumber} - {v.make} {v.model}
                    </option>
                  ))}
                </select>
                {vehicles.length === 0 && (
                  <em>No vehicles registered. Add one in your profile first.</em>
                )}
                {bookForm.formState.errors.vehicleId && <em>{bookForm.formState.errors.vehicleId.message}</em>}
              </label>
              <label>
                <span>Service type</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                  <select {...bookForm.register('serviceTypeId')} style={{ flex: 1 }}>
                    <option value="">Pick one…</option>
                    {serviceTypes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.estimatedMinutes} min, Rs {new Intl.NumberFormat('en-US').format(s.basePrice)})
                      </option>
                    ))}
                  </select>
                  <ServiceTypeQuickAdd
                    onCreated={async (newId, newName) => {
                      // refresh the lookup list and auto-select the new one
                      setServiceTypes((prev) => [
                        ...prev,
                        { id: newId, name: newName, estimatedMinutes: 60, basePrice: 0, isActive: true },
                      ]);
                      bookForm.setValue('serviceTypeId', newId, { shouldValidate: true });
                    }}
                  />
                </div>
                {bookForm.formState.errors.serviceTypeId && <em>{bookForm.formState.errors.serviceTypeId.message}</em>}
              </label>
              <label>
                <span>When</span>
                <input type="datetime-local" {...bookForm.register('scheduledAt')} />
                {bookForm.formState.errors.scheduledAt && <em>{bookForm.formState.errors.scheduledAt.message}</em>}
              </label>
              <label>
                <span>Notes (optional)</span>
                <input {...bookForm.register('notes')} placeholder="Anything we should know?" />
              </label>
              <div className="form-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowBook(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={loading || vehicles.length === 0}>
                  {loading ? 'Booking…' : 'Book it'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Status change modal */}
      {statusTarget && (
        <div className="modal-backdrop" onClick={() => setStatusTarget(null)}>
          <div className="modal modal-narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Update status</h3>
              <button className="modal-close" onClick={() => setStatusTarget(null)}>×</button>
            </div>
            <div className="modal-body">
              <p>
                Currently: <span className={`badge ${statusClass(statusTarget.status)}`}>{statusTarget.status}</span>
              </p>
              <p style={{ marginTop: 8, color: 'var(--neutral-9)', fontSize: 13 }}>
                {statusTarget.serviceTypeName} on {statusTarget.vehicleNumber}, {fmtWhen(statusTarget.scheduledAt)}
              </p>
              <div className="status-buttons">
                {nextPossibleStatuses(statusTarget.status).map((s) => (
                  <button
                    key={s}
                    className={`btn-status btn-status-${s.toLowerCase()}`}
                    onClick={() => updateStatus(s)}
                  >
                    Mark {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-actions">
              <button className="btn-ghost" onClick={() => setStatusTarget(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppointmentsPage;
