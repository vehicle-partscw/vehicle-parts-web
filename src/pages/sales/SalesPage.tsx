import { useEffect, useRef, useState } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import type { Control, UseFormRegister } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import api from '../../lib/api';
import Pagination, { type PageInfo } from '../../components/shared/Pagination';
import './SalesPage.css';

interface SalesLine {
  partId: string;
  sku: string;
  partName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  customerUserId: string;
  createdByUserId: string;
  loyaltyTierId: string | null;
  loyaltyTierName: string | null;
  issueDate: string;
  dueDate: string | null;
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  amountPaid: number;
  amountDue: number;
  paymentStatus: 'Unpaid' | 'PartiallyPaid' | 'Paid' | 'OnCredit';
  items: SalesLine[];
  createdAt: string;
}

interface Customer { userId: string; fullName: string; email: string; isActive: boolean }
interface PartLookup { id: string; sku: string; name: string; unitPrice: number; stockQty: number }

interface PagedResult<T> {
  items: T[]; page: number; pageSize: number; totalCount: number;
  totalPages: number; hasPrevious: boolean; hasNext: boolean;
}

const lineSchema = z.object({
  partId: z.string().min(1, 'Pick a part'),
  quantity: z.coerce.number().int().min(1, 'Min 1'),
});

const salesSchema = z.object({
  invoiceNumber: z.string().min(2).max(32),
  customerUserId: z.string().min(1, 'Pick a customer'),
  issueDate: z.string().min(1, 'Required'),
  dueDate: z.string().optional().or(z.literal('')),
  items: z.array(lineSchema).min(1, 'Add at least one line item'),
});

type SalesFormData = z.infer<typeof salesSchema>;

function fmtMoney(n: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null) {
  if (!s) return '—';
  return s.length > 10 ? s.slice(0, 10) : s;
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function plus30() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

function statusClass(status: SalesInvoice['paymentStatus']) {
  switch (status) {
    case 'Paid': return 'badge-success';
    case 'PartiallyPaid': return 'badge-warn';
    case 'OnCredit': return 'badge-danger';
    default: return 'badge-muted';
  }
}

function statusLabel(status: SalesInvoice['paymentStatus']) {
  switch (status) {
    case 'PartiallyPaid': return 'Partial';
    case 'OnCredit': return 'Overdue';
    default: return status;
  }
}

function extractError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: string; errors?: Record<string, string[]> } } };
  const data = e?.response?.data;
  if (data?.errors) return Object.values(data.errors).flat().join(' ');
  if (data?.detail) return data.detail;
  return fallback;
}

const SalesPage = () => {
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [parts, setParts] = useState<PartLookup[]>([]);
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterOverdue, setFilterOverdue] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [viewing, setViewing] = useState<SalesInvoice | null>(null);
  const [loading, setLoading] = useState(false);

  const lottieRef = useRef<HTMLDivElement>(null);

  const form = useForm<SalesFormData>({
    resolver: zodResolver(salesSchema),
    defaultValues: {
      invoiceNumber: '',
      customerUserId: '',
      issueDate: todayIso(),
      dueDate: plus30(),
      items: [{ partId: '', quantity: 1 }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });

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
        path: '/lottie-sales.json',
      });
    };
    loadLottie();
    return () => { if (anim) anim.destroy(); };
  }, []);

  const fetchInvoices = async () => {
    try {
      const params: Record<string, string | number | boolean> = { page, pageSize };
      if (filterCustomer) params.customerUserId = filterCustomer;
      if (filterStatus) params.status = filterStatus;
      if (filterFrom) params.from = filterFrom;
      if (filterTo) params.to = filterTo;
      if (filterOverdue) params.overdue = true;
      const res = await api.get<PagedResult<SalesInvoice>>('/sales-invoices', { params });
      setInvoices(res.data.items || []);
      setPageInfo({
        page: res.data.page,
        pageSize: res.data.pageSize,
        totalCount: res.data.totalCount,
        totalPages: res.data.totalPages,
        hasPrevious: res.data.hasPrevious,
        hasNext: res.data.hasNext,
      });
    } catch (err) {
      toast.error(extractError(err, 'Could not load sales invoices.'));
    }
  };

  const fetchLookups = async () => {
    try {
      const cs = await api.get<Customer[]>('/customers');
      setCustomers(cs.data || []);
    } catch { /* ignore */ }
    try {
      const ps = await api.get<PagedResult<PartLookup>>('/parts', { params: { pageSize: 200 } });
      setParts(ps.data.items || []);
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchLookups(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { fetchInvoices(); /* eslint-disable-next-line */ }, [page, pageSize]);
  useEffect(() => { setPage(1); fetchInvoices(); /* eslint-disable-next-line */ }, [filterCustomer, filterStatus, filterFrom, filterTo, filterOverdue]);

  const [searchParams, setSearchParams] = useSearchParams();
  const [linkedAppointmentId, setLinkedAppointmentId] = useState<string | null>(null);
  const [linkedAppointmentInfo, setLinkedAppointmentInfo] = useState<{
    customerName: string;
    serviceTypeName: string;
    vehicleNumber: string;
    scheduledAt: string;
  } | null>(null);
  const [pendingPrefill, setPendingPrefill] = useState<{
    customerUserId: string;
    appointmentId?: string;
  } | null>(null);

  const buildSuggestedInvoiceNumber = () => {
    const yr = new Date().getFullYear();
    return `SAL-${yr}-${Math.floor(Math.random() * 9000 + 1000)}`;
  };

  const openCreate = (prefillCustomer?: string, appointmentId?: string) => {
    form.reset({
      invoiceNumber: prefillCustomer ? buildSuggestedInvoiceNumber() : '',
      customerUserId: prefillCustomer ?? '',
      issueDate: todayIso(),
      dueDate: plus30(),
      items: [{ partId: '', quantity: 1 }],
    });
    setLinkedAppointmentId(appointmentId ?? null);
    setShowCreate(true);
  };

  // capture the prefill from URL on mount; the actual open waits for customers to load
  useEffect(() => {
    const customerId = searchParams.get('customerUserId');
    const appointmentId = searchParams.get('appointmentId');
    const auto = searchParams.get('newSale');
    if (auto === '1' && customerId) {
      setPendingPrefill({ customerUserId: customerId, appointmentId: appointmentId ?? undefined });
      const next = new URLSearchParams(searchParams);
      next.delete('newSale');
      next.delete('customerUserId');
      next.delete('vehicleId');
      next.delete('appointmentId');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // open the modal once customers list has arrived; also fetch appointment context
  useEffect(() => {
    if (!pendingPrefill || customers.length === 0) return;
    const exists = customers.some((c) => c.userId === pendingPrefill.customerUserId);
    if (!exists) {
      // customer not in list (deactivated or different scope) — still open empty modal so staff can pick
      openCreate('', pendingPrefill.appointmentId);
    } else {
      openCreate(pendingPrefill.customerUserId, pendingPrefill.appointmentId);
    }

    if (pendingPrefill.appointmentId) {
      api.get(`/appointments`, { params: { customerUserId: pendingPrefill.customerUserId, pageSize: 50 } })
        .then((res) => {
          const items: Array<{
            id: string; customerName?: string | null;
            serviceTypeName: string; vehicleNumber: string; scheduledAt: string;
          }> = res.data?.items ?? [];
          const appt = items.find((a) => a.id === pendingPrefill.appointmentId);
          if (appt) {
            setLinkedAppointmentInfo({
              customerName: appt.customerName ?? customers.find((c) => c.userId === pendingPrefill.customerUserId)?.fullName ?? 'Customer',
              serviceTypeName: appt.serviceTypeName,
              vehicleNumber: appt.vehicleNumber,
              scheduledAt: appt.scheduledAt,
            });
          }
        })
        .catch(() => { /* banner stays generic */ });
    }
    setPendingPrefill(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrefill, customers]);

  const onCreate = async (data: SalesFormData) => {
    setLoading(true);
    try {
      await api.post('/sales-invoices', {
        invoiceNumber: data.invoiceNumber.trim(),
        customerUserId: data.customerUserId,
        issueDate: data.issueDate,
        dueDate: data.dueDate || null,
        relatedAppointmentId: linkedAppointmentId,
        items: data.items,
      });
      toast.success(linkedAppointmentId
        ? 'Invoice created and linked to the appointment.'
        : 'Sales invoice recorded — stock decremented.');
      setShowCreate(false);
      setLinkedAppointmentId(null);
      setLinkedAppointmentInfo(null);
      fetchInvoices();
      fetchLookups(); // refresh part stock counts
    } catch (err) {
      toast.error(extractError(err, 'Could not save invoice.'));
    } finally {
      setLoading(false);
    }
  };

  const openView = async (id: string) => {
    try {
      const res = await api.get<SalesInvoice>(`/sales-invoices/${id}`);
      setViewing(res.data);
    } catch (err) {
      toast.error(extractError(err, 'Could not load invoice.'));
    }
  };

  const totalRevenue = invoices.reduce((s, i) => s + i.totalAmount, 0);
  const totalDue = invoices.reduce((s, i) => s + i.amountDue, 0);
  const overdueCount = invoices.filter((i) => i.paymentStatus === 'OnCredit').length;

  // For computing live preview in create modal
  const customerName = (id: string) => customers.find((c) => c.userId === id)?.fullName ?? id.slice(0, 8) + '…';

  return (
    <div className="sales-page">
      <div className="page-header">
        <h1 className="page-title">Sales</h1>
        <p className="page-subtitle">Invoices for parts sold to customers. Loyalty discount auto-applies.</p>
      </div>

      <div className="hero">
        <div className="hero-text">
          <h2>Every sale, end-to-end.</h2>
          <p>Pick a customer, add the parts they bought, and we'll check stock, decrement it, apply the loyalty discount if their cart qualifies, and bake the totals into reports.</p>
        </div>
        <div className="hero-illust">
          <div ref={lottieRef} className="lottie-hero hero-wide" aria-label="sales animation" />
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card accent-pop">
          <div className="stat-label">Revenue</div>
          <div className="stat-value">Rs {fmtMoney(totalRevenue)}</div>
          <div className="stat-change">{invoices.length} invoice{invoices.length === 1 ? '' : 's'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Outstanding</div>
          <div className="stat-value">Rs {fmtMoney(totalDue)}</div>
          <div className="stat-change" style={{ color: totalDue > 0 ? 'var(--accent-9)' : 'var(--success)' }}>
            {totalDue > 0 ? 'Awaiting payment' : 'All settled'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Overdue</div>
          <div className="stat-value">{overdueCount}</div>
          <div className="stat-change" style={{ color: overdueCount > 0 ? 'var(--accent-9)' : 'var(--success)' }}>
            {overdueCount > 0 ? 'Needs follow-up' : 'On track'}
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <div className="table-header">
          <span className="table-header-title">All sales invoices</span>
          <div className="table-actions">
            <select className="filter-select" value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)}>
              <option value="">All customers</option>
              {customers.map((c) => <option key={c.userId} value={c.userId}>{c.fullName}</option>)}
            </select>
            <select className="filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="Unpaid">Unpaid</option>
              <option value="PartiallyPaid">Partial</option>
              <option value="Paid">Paid</option>
              <option value="OnCredit">Overdue</option>
            </select>
            <input className="search-input" type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} title="From" />
            <input className="search-input" type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} title="To" />
            <label className="overdue-toggle">
              <input type="checkbox" checked={filterOverdue} onChange={(e) => setFilterOverdue(e.target.checked)} />
              Overdue only
            </label>
            <button className="btn-primary" onClick={() => openCreate()}>+ New sale</button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Customer</th>
              <th>Issue date</th>
              <th>Total</th>
              <th>Due</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr><td colSpan={7} className="empty">No sales invoices match these filters.</td></tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="mono strong">{inv.invoiceNumber}</td>
                  <td>{customerName(inv.customerUserId)}</td>
                  <td>{fmtDate(inv.issueDate)}</td>
                  <td className="mono">Rs {fmtMoney(inv.totalAmount)}</td>
                  <td className="mono">{inv.amountDue > 0 ? `Rs ${fmtMoney(inv.amountDue)}` : '—'}</td>
                  <td>
                    <span className={`badge ${statusClass(inv.paymentStatus)}`}>
                      {statusLabel(inv.paymentStatus)}
                    </span>
                    {inv.loyaltyTierId && <span className="badge-loyalty">Loyalty</span>}
                  </td>
                  <td className="row-actions">
                    <button className="btn-ghost" onClick={() => openView(inv.id)}>View</button>
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

      {/* Create modal */}
      {showCreate && (
        <div className="modal-backdrop" onClick={() => { setShowCreate(false); setLinkedAppointmentId(null); setLinkedAppointmentInfo(null); }}>
          <div className="modal modal-extra-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>New sale</h3>
              <button className="modal-close" onClick={() => { setShowCreate(false); setLinkedAppointmentId(null); setLinkedAppointmentInfo(null); }}>×</button>
            </div>
            <form onSubmit={form.handleSubmit(onCreate)} className="form">
              {linkedAppointmentId && (
                <div className="appointment-link-banner">
                  {linkedAppointmentInfo ? (
                    <>
                      <div className="appointment-link-title">Linked to a completed appointment</div>
                      <div className="appointment-link-detail">
                        <strong>{linkedAppointmentInfo.customerName}</strong> · {linkedAppointmentInfo.serviceTypeName} ·{' '}
                        Vehicle <span className="mono">{linkedAppointmentInfo.vehicleNumber}</span> ·{' '}
                        {new Date(linkedAppointmentInfo.scheduledAt).toLocaleString('en', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </>
                  ) : (
                    <div>This invoice will be linked to the completed appointment.</div>
                  )}
                </div>
              )}
              <div className="form-row form-row-2-2">
                <label>
                  <span>Invoice number</span>
                  <input {...form.register('invoiceNumber')} placeholder="SAL-2026-001" />
                  {form.formState.errors.invoiceNumber && <em>{form.formState.errors.invoiceNumber.message}</em>}
                </label>
                <label>
                  <span>Customer</span>
                  <select {...form.register('customerUserId')}>
                    <option value="">Pick one…</option>
                    {customers.filter((c) => c.isActive).map((c) => (
                      <option key={c.userId} value={c.userId}>{c.fullName} ({c.email})</option>
                    ))}
                  </select>
                  {form.formState.errors.customerUserId && <em>{form.formState.errors.customerUserId.message}</em>}
                </label>
              </div>
              <div className="form-row">
                <label>
                  <span>Issue date</span>
                  <input type="date" {...form.register('issueDate')} />
                </label>
                <label>
                  <span>Due date (optional)</span>
                  <input type="date" {...form.register('dueDate')} />
                </label>
              </div>

              <div className="lines-section">
                <div className="lines-header">
                  <span>Line items</span>
                  <button type="button" className="btn-ghost" onClick={() => append({ partId: '', quantity: 1 })}>
                    + Add line
                  </button>
                </div>
                {form.formState.errors.items && typeof form.formState.errors.items.message === 'string' && (
                  <em className="lines-error">{form.formState.errors.items.message}</em>
                )}
                <div className="lines-table">
                  <div className="lines-row lines-head">
                    <span>Part</span>
                    <span>Stock</span>
                    <span>Qty</span>
                    <span>Unit price</span>
                    <span>Line total</span>
                    <span></span>
                  </div>
                  {fields.map((field, idx) => (
                    <SalesLineRow
                      key={field.id}
                      idx={idx}
                      control={form.control}
                      register={form.register}
                      parts={parts}
                      onRemove={() => remove(idx)}
                      canRemove={fields.length > 1}
                      errors={form.formState.errors.items?.[idx] as { partId?: { message?: string }; quantity?: { message?: string } } | undefined}
                    />
                  ))}
                </div>
                <SalesTotals control={form.control} parts={parts} />
              </div>

              <div className="form-actions">
                <button type="button" className="btn-ghost" onClick={() => { setShowCreate(false); setLinkedAppointmentId(null); setLinkedAppointmentInfo(null); }}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Saving…' : 'Save invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View modal */}
      {viewing && (
        <div className="modal-backdrop" onClick={() => setViewing(null)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{viewing.invoiceNumber}</h3>
              <button className="modal-close" onClick={() => setViewing(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="invoice-meta">
                <div><span className="meta-label">Customer</span><span>{customerName(viewing.customerUserId)}</span></div>
                <div><span className="meta-label">Issue date</span><span>{fmtDate(viewing.issueDate)}</span></div>
                <div><span className="meta-label">Due date</span><span>{fmtDate(viewing.dueDate)}</span></div>
                <div><span className="meta-label">Status</span>
                  <span>
                    <span className={`badge ${statusClass(viewing.paymentStatus)}`}>{statusLabel(viewing.paymentStatus)}</span>
                  </span>
                </div>
              </div>

              <table className="invoice-table">
                <thead>
                  <tr><th>SKU</th><th>Part</th><th>Qty</th><th>Unit price</th><th>Line total</th></tr>
                </thead>
                <tbody>
                  {viewing.items.map((line, i) => (
                    <tr key={i}>
                      <td className="mono">{line.sku}</td>
                      <td>{line.partName}</td>
                      <td>{line.quantity}</td>
                      <td className="mono">Rs {fmtMoney(line.unitPrice)}</td>
                      <td className="mono">Rs {fmtMoney(line.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="totals-block">
                <div className="totals-row">
                  <span>Subtotal</span>
                  <span className="mono">Rs {fmtMoney(viewing.subtotal)}</span>
                </div>
                {viewing.discountAmount > 0 && (
                  <div className="totals-row totals-discount">
                    <span>Loyalty discount{viewing.loyaltyTierName ? ` (${viewing.loyaltyTierName})` : ''}</span>
                    <span className="mono">− Rs {fmtMoney(viewing.discountAmount)}</span>
                  </div>
                )}
                <div className="totals-row totals-grand">
                  <span>Total</span>
                  <span className="mono">Rs {fmtMoney(viewing.totalAmount)}</span>
                </div>
                <div className="totals-row">
                  <span>Paid</span>
                  <span className="mono">Rs {fmtMoney(viewing.amountPaid)}</span>
                </div>
                {viewing.amountDue > 0 && (
                  <div className="totals-row totals-due">
                    <span>Amount due</span>
                    <span className="mono">Rs {fmtMoney(viewing.amountDue)}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="form-actions">
              <button className="btn-ghost" onClick={() => setViewing(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface SalesLineRowProps {
  idx: number;
  control: Control<SalesFormData>;
  register: UseFormRegister<SalesFormData>;
  parts: PartLookup[];
  onRemove: () => void;
  canRemove: boolean;
  errors?: { partId?: { message?: string }; quantity?: { message?: string } };
}

const SalesLineRow = ({ idx, control, register, parts, onRemove, canRemove, errors }: SalesLineRowProps) => {
  const partId = useWatch({ control, name: `items.${idx}.partId` });
  const qty = Number(useWatch({ control, name: `items.${idx}.quantity` }) || 0);
  const part = parts.find((p) => p.id === partId);
  const unitPrice = part?.unitPrice ?? 0;
  const stock = part?.stockQty ?? 0;
  const lineTotal = qty * unitPrice;
  const overStock = part && qty > stock;

  return (
    <div className={`lines-row ${overStock ? 'over-stock' : ''}`}>
      <div>
        <select {...register(`items.${idx}.partId` as const)}>
          <option value="">Pick a part…</option>
          {parts.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
        </select>
        {errors?.partId && <em>{errors.partId.message}</em>}
      </div>
      <div className={`stock-cell ${stock < 5 ? 'low' : ''}`}>{part ? stock : '—'}</div>
      <div>
        <input type="number" min={1} {...register(`items.${idx}.quantity` as const)} />
        {errors?.quantity && <em>{errors.quantity.message}</em>}
        {overStock && <em>Only {stock} in stock</em>}
      </div>
      <div className="line-readonly mono">Rs {new Intl.NumberFormat('en-US').format(unitPrice)}</div>
      <div className="line-total">Rs {new Intl.NumberFormat('en-US').format(lineTotal)}</div>
      <div>
        {canRemove && <button type="button" className="btn-ghost danger" onClick={onRemove}>Remove</button>}
      </div>
    </div>
  );
};

const SalesTotals = ({ control, parts }: { control: Control<SalesFormData>; parts: PartLookup[] }) => {
  const items = useWatch({ control, name: 'items' }) || [];
  const subtotal = items.reduce((sum, l) => {
    const p = parts.find((x) => x.id === l?.partId);
    return sum + (p?.unitPrice ?? 0) * (Number(l?.quantity) || 0);
  }, 0);
  const willGetDiscount = subtotal >= 5000;
  const estDiscount = willGetDiscount ? Math.round(subtotal * 0.1) : 0;
  const estTotal = subtotal - estDiscount;

  return (
    <div className="lines-totals-block">
      <div className="totals-line">
        <span>Subtotal</span>
        <span className="mono">Rs {new Intl.NumberFormat('en-US').format(subtotal)}</span>
      </div>
      {willGetDiscount && (
        <div className="totals-line totals-discount">
          <span>Loyalty discount (10% over Rs 5,000)</span>
          <span className="mono">− Rs {new Intl.NumberFormat('en-US').format(estDiscount)}</span>
        </div>
      )}
      <div className="totals-line totals-grand">
        <span>Estimated total</span>
        <span className="mono">Rs {new Intl.NumberFormat('en-US').format(estTotal)}</span>
      </div>
      <p className="totals-note">Final discount + total are computed by the server based on the active loyalty tier.</p>
    </div>
  );
};

export default SalesPage;
