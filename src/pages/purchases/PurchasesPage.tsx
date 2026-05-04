import { useEffect, useRef, useState } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import type { Control, UseFormRegister } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import api from '../../lib/api';
import Pagination, { type PageInfo } from '../../components/shared/Pagination';
import './PurchasesPage.css';

interface PurchaseLine {
  partId: string;
  sku: string;
  partName: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  vendorId: string;
  vendorName: string;
  createdByUserId: string;
  issueDate: string;
  totalAmount: number;
  notes: string | null;
  items: PurchaseLine[];
  createdAt: string;
}

interface Lookup { id: string; name: string }
interface PartLookup { id: string; sku: string; name: string; unitPrice: number; stockQty: number; reorderLevel: number; vendorId?: string }

interface PagedResult<T> {
  items: T[]; page: number; pageSize: number; totalCount: number;
  totalPages: number; hasPrevious: boolean; hasNext: boolean;
}

const lineSchema = z.object({
  partId: z.string().min(1, 'Pick a part'),
  quantity: z.coerce.number().int().min(1, 'Min 1'),
  unitCost: z.coerce.number().min(0, 'Cannot be negative'),
});

const purchaseSchema = z.object({
  invoiceNumber: z.string().min(2).max(32),
  vendorId: z.string().min(1, 'Pick a vendor'),
  issueDate: z.string().min(1, 'Required'),
  notes: z.string().max(500).optional().or(z.literal('')),
  items: z.array(lineSchema).min(1, 'Add at least one line item'),
});

type PurchaseFormData = z.infer<typeof purchaseSchema>;

function fmtMoney(n: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string) {
  if (!s) return '';
  return s.length > 10 ? s.slice(0, 10) : s;
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// gives staff a starting invoice number like "PUR-2026-4821" so they don't have to invent one,
// but it stays editable in case they prefer their own numbering format
function buildSuggestedInvoiceNumber() {
  const yr = new Date().getFullYear();
  return `PUR-${yr}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function extractError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: string; errors?: Record<string, string[]> } } };
  const data = e?.response?.data;
  if (data?.errors) return Object.values(data.errors).flat().join(' ');
  if (data?.detail) return data.detail;
  return fallback;
}

const PurchasesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [vendors, setVendors] = useState<Lookup[]>([]);
  const [parts, setParts] = useState<PartLookup[]>([]);
  const [filterVendor, setFilterVendor] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [viewing, setViewing] = useState<PurchaseInvoice | null>(null);
  const [loading, setLoading] = useState(false);

  const lottieRef = useRef<HTMLDivElement>(null);

  const form = useForm<PurchaseFormData>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      invoiceNumber: '',
      vendorId: '',
      issueDate: todayIso(),
      notes: '',
      items: [{ partId: '', quantity: 1, unitCost: 0 }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });
  const selectedVendorId = useWatch({ control: form.control, name: 'vendorId' });

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
        path: '/lottie-purchases.json',
      });
    };
    loadLottie();
    return () => { if (anim) anim.destroy(); };
  }, []);

  const fetchInvoices = async () => {
    try {
      const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
      if (filterVendor) params.vendorId = filterVendor;
      if (filterFrom) params.from = filterFrom;
      if (filterTo) params.to = filterTo;
      const res = await api.get<PagedResult<PurchaseInvoice>>('/purchase-invoices', { params });
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
      toast.error(extractError(err, 'Could not load purchase invoices.'));
    }
  };

  const fetchLookups = async () => {
    try {
      const vs = await api.get<PagedResult<Lookup>>('/vendors', { params: { pageSize: 100 } });
      setVendors(vs.data.items || []);
    } catch { /* ignore */ }
    try {
      const ps = await api.get<PagedResult<PartLookup>>('/parts', { params: { pageSize: 200 } });
      setParts(ps.data.items || []);
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchLookups(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { fetchInvoices(); /* eslint-disable-next-line */ }, [page, pageSize]);
  useEffect(() => { setPage(1); fetchInvoices(); /* eslint-disable-next-line */ }, [filterVendor, filterFrom, filterTo]);

  // when vendor changes, clear any selected parts on lines because they may belong to a different vendor.
  // we keep the qty/cost since the user might be re-using their numbers.
  useEffect(() => {
    if (!showCreate) return;
    const currentItems = form.getValues('items');
    const cleared = currentItems.map((it) => ({ ...it, partId: '' }));
    form.setValue('items', cleared);
    /* eslint-disable-next-line */
  }, [selectedVendorId]);

  // pre-fill the create form when arriving via /purchases?reorderPartId=<id>
  // (the inventory page's reorder button uses this to drop straight into a new purchase invoice
  // for the low-stock part with a sensible default quantity)
  useEffect(() => {
    const reorderId = searchParams.get('reorderPartId');
    if (!reorderId || parts.length === 0) return;
    const part = parts.find((p) => p.id === reorderId);
    if (!part) return;
    // suggest enough stock to comfortably cover the next reorder cycle
    const suggestedQty = Math.max(1, (part.reorderLevel || 1) * 2 - (part.stockQty || 0));
    form.reset({
      invoiceNumber: buildSuggestedInvoiceNumber(),
      vendorId: part.vendorId ?? '',
      issueDate: todayIso(),
      notes: '',
      items: [{ partId: part.id, quantity: suggestedQty, unitCost: part.unitPrice }],
    });
    setShowCreate(true);
    // strip the query param so a refresh doesn't reopen the modal
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('reorderPartId');
      return next;
    }, { replace: true });
    /* eslint-disable-next-line */
  }, [parts, searchParams.toString()]);

  const openCreate = () => {
    form.reset({
      // pre-suggest a number so the field has a hint of the expected format; user can overwrite it
      invoiceNumber: buildSuggestedInvoiceNumber(),
      vendorId: '',
      issueDate: todayIso(),
      notes: '',
      items: [{ partId: '', quantity: 1, unitCost: 0 }],
    });
    setShowCreate(true);
  };

  const onCreate = async (data: PurchaseFormData) => {
    setLoading(true);
    try {
      await api.post('/purchase-invoices', {
        invoiceNumber: data.invoiceNumber.trim(),
        vendorId: data.vendorId,
        issueDate: data.issueDate,
        notes: data.notes || null,
        items: data.items,
      });
      toast.success('Purchase invoice recorded - stock updated.');
      setShowCreate(false);
      fetchInvoices();
    } catch (err) {
      toast.error(extractError(err, 'Could not save invoice.'));
    } finally {
      setLoading(false);
    }
  };

  const openView = async (id: string) => {
    try {
      const res = await api.get<PurchaseInvoice>(`/purchase-invoices/${id}`);
      setViewing(res.data);
    } catch (err) {
      toast.error(extractError(err, 'Could not load invoice.'));
    }
  };

  const totalSpent = invoices.reduce((sum, i) => sum + i.totalAmount, 0);
  const thisMonth = (() => {
    const cutoff = new Date();
    cutoff.setDate(1);
    return invoices
      .filter((i) => new Date(i.issueDate) >= cutoff)
      .reduce((sum, i) => sum + i.totalAmount, 0);
  })();

  return (
    <div className="purchases-page">
      <div className="page-header">
        <h1 className="page-title">Purchases</h1>
        <p className="page-subtitle">Invoices for stock you've bought from your vendors.</p>
      </div>

      <div className="hero">
        <div className="hero-text">
          <h2>Restock with confidence.</h2>
          <p>Record each vendor invoice and we'll bump the part stock counts in the same transaction. Margins on the reports page will reflect it instantly.</p>
        </div>
        <div className="hero-illust">
          <div ref={lottieRef} className="lottie-hero hero-wide" aria-label="purchases animation" />
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card accent-pop">
          <div className="stat-label">Invoices on file</div>
          <div className="stat-value">{invoices.length}</div>
          <div className="stat-change">All vendors</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total spent</div>
          <div className="stat-value">Rs {fmtMoney(totalSpent)}</div>
          <div className="stat-change">In this filter window</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">This month</div>
          <div className="stat-value">Rs {fmtMoney(thisMonth)}</div>
          <div className="stat-change">From {new Date().toLocaleString('en', { month: 'long' })}</div>
        </div>
      </div>

      <div className="table-wrap">
        <div className="table-header">
          <span className="table-header-title">All purchase invoices</span>
          <div className="table-actions">
            <select className="filter-select" value={filterVendor} onChange={(e) => setFilterVendor(e.target.value)}>
              <option value="">All vendors</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <input
              className="search-input"
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              title="From"
            />
            <input
              className="search-input"
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              title="To"
            />
            {(filterVendor || filterFrom || filterTo) && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => { setFilterVendor(''); setFilterFrom(''); setFilterTo(''); }}
              >
                Clear
              </button>
            )}
            <button className="btn-primary" onClick={openCreate}>+ New invoice</button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Vendor</th>
              <th>Issue date</th>
              <th>Lines</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr><td colSpan={6} className="empty">No purchase invoices yet.</td></tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="mono strong">{inv.invoiceNumber}</td>
                  <td>{inv.vendorName}</td>
                  <td>{fmtDate(inv.issueDate)}</td>
                  <td>{inv.items?.length ?? '-'}</td>
                  <td className="mono">Rs {fmtMoney(inv.totalAmount)}</td>
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
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal modal-extra-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>New purchase invoice</h3>
              <button className="modal-close" onClick={() => setShowCreate(false)}>×</button>
            </div>
            <form onSubmit={form.handleSubmit(onCreate)} className="form">
              <div className="form-row form-row-3">
                <label>
                  <span>Invoice number</span>
                  <input {...form.register('invoiceNumber')} placeholder="PUR-2026-001" />
                  {form.formState.errors.invoiceNumber && <em>{form.formState.errors.invoiceNumber.message}</em>}
                </label>
                <label>
                  <span>Vendor</span>
                  <select {...form.register('vendorId')}>
                    <option value="">Pick one…</option>
                    {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                  {form.formState.errors.vendorId && <em>{form.formState.errors.vendorId.message}</em>}
                </label>
                <label>
                  <span>Issue date</span>
                  <input type="date" {...form.register('issueDate')} />
                </label>
              </div>
              <label>
                <span>Notes (optional)</span>
                <input {...form.register('notes')} placeholder="Quarterly bulk order, etc." />
              </label>

              <div className="lines-section">
                <div className="lines-header">
                  <span>Line items</span>
                  <button type="button" className="btn-ghost" onClick={() => append({ partId: '', quantity: 1, unitCost: 0 })}>
                    + Add line
                  </button>
                </div>
                {form.formState.errors.items && typeof form.formState.errors.items.message === 'string' && (
                  <em className="lines-error">{form.formState.errors.items.message}</em>
                )}
                <div className="lines-table">
                  <div className="lines-row lines-head">
                    <span>Part</span>
                    <span>Qty</span>
                    <span>Unit cost</span>
                    <span>Line total</span>
                    <span></span>
                  </div>
                  {fields.map((field, idx) => (
                    <LineRow
                      key={field.id}
                      idx={idx}
                      control={form.control}
                      register={form.register}
                      parts={selectedVendorId ? parts.filter((p) => p.vendorId === selectedVendorId) : []}
                      vendorPicked={!!selectedVendorId}
                      onRemove={() => remove(idx)}
                      canRemove={fields.length > 1}
                      errors={form.formState.errors.items?.[idx] as LineRowErrors | undefined}
                    />
                  ))}
                </div>
                <FormTotals control={form.control} />
              </div>

              <div className="form-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
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
                <div><span className="meta-label">Vendor</span><span>{viewing.vendorName}</span></div>
                <div><span className="meta-label">Issue date</span><span>{fmtDate(viewing.issueDate)}</span></div>
                <div><span className="meta-label">Total</span><span className="strong">Rs {fmtMoney(viewing.totalAmount)}</span></div>
              </div>
              {viewing.notes && <p className="invoice-notes">{viewing.notes}</p>}

              <table className="invoice-table">
                <thead>
                  <tr><th>SKU</th><th>Part</th><th>Qty</th><th>Unit cost</th><th>Line total</th></tr>
                </thead>
                <tbody>
                  {viewing.items.map((line, i) => (
                    <tr key={i}>
                      <td className="mono">{line.sku}</td>
                      <td>{line.partName}</td>
                      <td>{line.quantity}</td>
                      <td className="mono">Rs {fmtMoney(line.unitCost)}</td>
                      <td className="mono">Rs {fmtMoney(line.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

type LineRowErrors = {
  partId?: { message?: string };
  quantity?: { message?: string };
  unitCost?: { message?: string };
};

interface LineRowProps {
  idx: number;
  control: Control<PurchaseFormData>;
  register: UseFormRegister<PurchaseFormData>;
  parts: PartLookup[];
  vendorPicked: boolean;
  onRemove: () => void;
  canRemove: boolean;
  errors?: LineRowErrors;
}

const LineRow = ({ idx, control, register, parts, vendorPicked, onRemove, canRemove, errors }: LineRowProps) => {
  const qty = useWatch({ control, name: `items.${idx}.quantity` }) || 0;
  const cost = useWatch({ control, name: `items.${idx}.unitCost` }) || 0;
  const total = Number(qty) * Number(cost);

  return (
    <div className="lines-row">
      <div>
        <select {...register(`items.${idx}.partId` as const)} disabled={!vendorPicked}>
          <option value="">{vendorPicked ? 'Pick a part…' : 'Pick a vendor first'}</option>
          {parts.map((p) => <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>)}
        </select>
        {errors?.partId && <em>{errors.partId.message}</em>}
        {vendorPicked && parts.length === 0 && (
          <em style={{ color: 'var(--neutral-9)', fontStyle: 'italic' }}>
            This vendor has no parts on file yet.
          </em>
        )}
      </div>
      <div>
        <input type="number" min={1} {...register(`items.${idx}.quantity` as const)} />
        {errors?.quantity && <em>{errors.quantity.message}</em>}
      </div>
      <div>
        <input type="number" step="0.01" min={0} {...register(`items.${idx}.unitCost` as const)} />
        {errors?.unitCost && <em>{errors.unitCost.message}</em>}
      </div>
      <div className="line-total">Rs {fmtMoney(total)}</div>
      <div>
        {canRemove && (
          <button type="button" className="btn-ghost danger" onClick={onRemove}>Remove</button>
        )}
      </div>
    </div>
  );
};

const FormTotals = ({ control }: { control: Control<PurchaseFormData> }) => {
  const items = useWatch({ control, name: 'items' }) || [];
  const total = items.reduce(
    (sum, l) => sum + (Number(l?.quantity) || 0) * (Number(l?.unitCost) || 0),
    0
  );
  return (
    <div className="lines-totals">
      <span>Invoice total</span>
      <span className="lines-total-value">Rs {fmtMoney(total)}</span>
    </div>
  );
};

export default PurchasesPage;
