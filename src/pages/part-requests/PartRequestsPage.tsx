import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import Pagination, { type PageInfo } from '../../components/shared/Pagination';
import CategoryQuickAdd from '../../components/shared/CategoryQuickAdd';
import './PartRequestsPage.css';

type RequestStatus = 'Pending' | 'Sourced' | 'Rejected';

interface PartRequest {
  id: string;
  customerUserId: string;
  customerName: string | null;
  customerPhone: string | null;
  partName: string;
  description: string | null;
  status: RequestStatus;
  requestedAt: string;
  resolvedAt: string | null;
  resolvedPartId: string | null;
  resolvedPartSku: string | null;
  resolvedPartName: string | null;
}

interface CategoryOption { id: string; name: string }
interface VendorOption { id: string; name: string }

interface PagedResult<T> {
  items: T[]; page: number; pageSize: number; totalCount: number;
  totalPages: number; hasPrevious: boolean; hasNext: boolean;
}

const requestSchema = z.object({
  partName: z.string().min(2, 'Tell us what part').max(120),
  description: z.string().max(500).optional().or(z.literal('')),
});

type RequestFormData = z.infer<typeof requestSchema>;

function fmtWhen(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString('en', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function statusClass(s: RequestStatus) {
  switch (s) {
    case 'Sourced': return 'badge-success';
    case 'Rejected': return 'badge-muted';
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

const PartRequestsPage = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const isCustomer = user?.role === 'Customer';
  const isStaff = user?.role === 'Staff' || user?.role === 'Admin';

  const [requests, setRequests] = useState<PartRequest[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [filterStatus, setFilterStatus] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);

  // staff source-flow state
  const [sourceTarget, setSourceTarget] = useState<PartRequest | null>(null);
  const [sourceForm, setSourceForm] = useState({
    sku: '', name: '', description: '',
    categoryId: '', vendorId: '',
    unitPrice: '0', initialStock: '0', reorderLevel: '10',
  });
  const [sourceSaving, setSourceSaving] = useState(false);

  // staff reject-flow state
  const [rejectTarget, setRejectTarget] = useState<PartRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSaving, setRejectSaving] = useState(false);

  // catalog lookups (only fetched for staff)
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);

  const lottieRef = useRef<HTMLDivElement>(null);

  const form = useForm<RequestFormData>({
    resolver: zodResolver(requestSchema),
    defaultValues: { partName: '', description: '' },
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
        path: '/lottie-search.json',
      });
    };
    loadLottie();
    return () => { if (anim) anim.destroy(); };
  }, []);

  const fetchRequests = async () => {
    try {
      const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
      if (filterStatus) params.status = filterStatus;
      const res = await api.get<PagedResult<PartRequest>>('/part-requests', { params });
      setRequests(res.data.items || []);
      setPageInfo({
        page: res.data.page,
        pageSize: res.data.pageSize,
        totalCount: res.data.totalCount,
        totalPages: res.data.totalPages,
        hasPrevious: res.data.hasPrevious,
        hasNext: res.data.hasNext,
      });
    } catch (err) {
      toast.error(extractError(err, 'Could not load part requests.'));
    }
  };

  useEffect(() => { fetchRequests(); /* eslint-disable-next-line */ }, [page, pageSize]);
  useEffect(() => { setPage(1); fetchRequests(); /* eslint-disable-next-line */ }, [filterStatus]);

  // staff need category + vendor dropdowns to source a request
  useEffect(() => {
    if (!isStaff) return;
    Promise.all([
      api.get<{ items: CategoryOption[] } | CategoryOption[]>('/part-categories', { params: { pageSize: 100 } }).catch(() => null),
      api.get<{ items: VendorOption[] }>('/vendors', { params: { pageSize: 100, isActive: true } }).catch(() => null),
    ]).then(([cats, vens]) => {
      if (cats?.data) {
        const items = Array.isArray(cats.data) ? cats.data : (cats.data as { items: CategoryOption[] }).items ?? [];
        setCategories(items);
      }
      if (vens?.data) setVendors(vens.data.items ?? []);
    });
  }, [isStaff]);

  const openCreate = () => {
    form.reset({ partName: '', description: '' });
    setShowCreate(true);
  };

  const onCreate = async (data: RequestFormData) => {
    setLoading(true);
    try {
      await api.post('/part-requests', {
        partName: data.partName.trim(),
        description: data.description || null,
      });
      toast.success('Request submitted. We\'ll get back to you.');
      setShowCreate(false);
      fetchRequests();
    } catch (err) {
      toast.error(extractError(err, 'Could not submit request.'));
    } finally {
      setLoading(false);
    }
  };

  const openSource = (r: PartRequest) => {
    setSourceTarget(r);
    // suggest a sku based on the part name (uppercase, dashes)
    const skuSuggest = r.partName.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
    setSourceForm({
      sku: skuSuggest,
      name: r.partName,
      description: r.description ?? '',
      categoryId: categories[0]?.id ?? '',
      vendorId: vendors[0]?.id ?? '',
      unitPrice: '0',
      initialStock: '0',
      reorderLevel: '10',
    });
  };

  const onSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceTarget) return;
    const f = sourceForm;
    if (!f.sku.trim() || !f.name.trim() || !f.categoryId || !f.vendorId) {
      toast.error('SKU, name, category and vendor are required.');
      return;
    }
    setSourceSaving(true);
    try {
      await api.post(`/part-requests/${sourceTarget.id}/source`, {
        sku: f.sku.trim().toUpperCase(),
        name: f.name.trim(),
        description: f.description.trim() || null,
        categoryId: f.categoryId,
        vendorId: f.vendorId,
        unitPrice: Number(f.unitPrice) || 0,
        initialStock: Number(f.initialStock) || 0,
        reorderLevel: Number(f.reorderLevel) || 10,
      });
      toast.success('Added to catalogue. Customer notified.');
      setSourceTarget(null);
      fetchRequests();
    } catch (err) {
      toast.error(extractError(err, 'Could not source the request.'));
    } finally {
      setSourceSaving(false);
    }
  };

  const openReject = (r: PartRequest) => {
    setRejectTarget(r);
    setRejectReason('');
  };

  const onReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    setRejectSaving(true);
    try {
      await api.post(`/part-requests/${rejectTarget.id}/reject`, {
        reason: rejectReason.trim() || null,
      });
      toast.success('Request rejected. Customer notified.');
      setRejectTarget(null);
      fetchRequests();
    } catch (err) {
      toast.error(extractError(err, 'Could not reject the request.'));
    } finally {
      setRejectSaving(false);
    }
  };

  const goToCatalogue = (r: PartRequest) => {
    if (!r.resolvedPartSku) return;
    navigate(`/inventory?search=${encodeURIComponent(r.resolvedPartSku)}`);
  };

  const totalPending = requests.filter((r) => r.status === 'Pending').length;
  const totalSourced = requests.filter((r) => r.status === 'Sourced').length;
  const totalRejected = requests.filter((r) => r.status === 'Rejected').length;

  return (
    <div className="part-requests-page">
      <div className="page-header">
        <h1 className="page-title">Part requests</h1>
        <p className="page-subtitle">
          {isCustomer ? 'Need a part we don\'t have? Tell us what to source.' : 'Customers asking for parts we don\'t stock yet.'}
        </p>
      </div>

      <div className="hero">
        <div className="hero-text">
          <h2>{isCustomer ? 'Can\'t find it on the shelf?' : 'Sourcing queue.'}</h2>
          <p>
            {isCustomer
              ? 'Submit a request with the make, model, or part number, and we\'ll get back when we have it (or know we can\'t).'
              : 'Triage incoming customer requests. Mark them Sourced when stock arrives, or Rejected if you can\'t supply.'}
          </p>
        </div>
        <div className="hero-illust">
          <div ref={lottieRef} className="lottie-hero hero-wide" aria-label="search animation" />
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card accent-pop">
          <div className="stat-label">Pending</div>
          <div className="stat-value">{totalPending}</div>
          <div className="stat-change" style={{ color: totalPending > 0 ? 'var(--accent-9)' : 'var(--success)' }}>
            {totalPending > 0 ? 'Needs triage' : 'All caught up'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Sourced</div>
          <div className="stat-value">{totalSourced}</div>
          <div className="stat-change" style={{ color: 'var(--success)' }}>Customer notified</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Rejected</div>
          <div className="stat-value">{totalRejected}</div>
          <div className="stat-change">Couldn't source</div>
        </div>
      </div>

      <div className="table-wrap">
        <div className="table-header">
          <span className="table-header-title">{isCustomer ? 'My requests' : 'All requests'}</span>
          <div className="table-actions">
            <select className="filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="Pending">Pending</option>
              <option value="Sourced">Sourced</option>
              <option value="Rejected">Rejected</option>
            </select>
            {isCustomer && <button className="btn-primary" onClick={openCreate}>+ Request part</button>}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Part</th>
              <th>Description</th>
              {!isCustomer && <th>Customer</th>}
              <th>Requested</th>
              <th>Resolved</th>
              <th>Status</th>
              {isStaff && <th></th>}
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr><td colSpan={isCustomer ? 5 : (isStaff ? 7 : 6)} className="empty">
                {isCustomer ? 'No requests yet. Click "+ Request part" to ask us to source something.' : 'No requests to triage.'}
              </td></tr>
            ) : (
              requests.map((r) => (
                <tr key={r.id}>
                  <td className="strong">{r.partName}</td>
                  <td className="muted">{r.description ? r.description.slice(0, 80) : '—'}</td>
                  {!isCustomer && (
                    <td>
                      <div className="customer-cell-stack">
                        <span className="strong">{r.customerName || '—'}</span>
                        {r.customerPhone && <span className="mono muted">{r.customerPhone}</span>}
                      </div>
                    </td>
                  )}
                  <td>{fmtWhen(r.requestedAt)}</td>
                  <td>{fmtWhen(r.resolvedAt)}</td>
                  <td>
                    <span className={`badge ${statusClass(r.status)}`}>{r.status}</span>
                    {isCustomer && r.status === 'Sourced' && (
                      <button
                        className="btn-link"
                        onClick={() => navigate('/appointments')}
                        title="Book a service appointment to have it fitted"
                      >
                        Now in stock — book a service appointment
                      </button>
                    )}
                  </td>
                  {isStaff && (
                    <td className="row-actions">
                      {r.status === 'Pending' && (
                        <>
                          <button className="btn-primary btn-small" onClick={() => openSource(r)}>Source</button>
                          <button className="btn-ghost btn-small" onClick={() => openReject(r)}>Reject</button>
                        </>
                      )}
                      {r.status === 'Sourced' && r.resolvedPartSku && (
                        <button className="btn-ghost btn-small" onClick={() => goToCatalogue(r)}>View in catalogue</button>
                      )}
                    </td>
                  )}
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
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Request a part</h3>
              <button className="modal-close" onClick={() => setShowCreate(false)}>×</button>
            </div>
            <form onSubmit={form.handleSubmit(onCreate)} className="form">
              <label>
                <span>Part name</span>
                <input {...form.register('partName')} placeholder="e.g. Honda CR-V 2018 timing belt" />
                {form.formState.errors.partName && <em>{form.formState.errors.partName.message}</em>}
              </label>
              <label>
                <span>Details (optional)</span>
                <textarea
                  {...form.register('description')}
                  rows={4}
                  placeholder="OEM part number, vehicle VIN, or anything that helps us find it…"
                />
                {form.formState.errors.description && <em>{form.formState.errors.description.message}</em>}
              </label>
              <div className="form-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Submitting…' : 'Submit request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Source request modal — adds part to catalogue and notifies customer */}
      {sourceTarget && (
        <div className="modal-backdrop" onClick={() => !sourceSaving && setSourceTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add to catalogue</h3>
              <button className="modal-close" onClick={() => !sourceSaving && setSourceTarget(null)}>×</button>
            </div>
            <form onSubmit={onSource} className="form">
              <div className="source-summary">
                <div className="source-summary-label">Customer requested</div>
                <div className="source-summary-name">{sourceTarget.partName}</div>
                {sourceTarget.description && <div className="source-summary-desc">{sourceTarget.description}</div>}
                {sourceTarget.customerName && (
                  <div className="source-summary-customer">for <strong>{sourceTarget.customerName}</strong></div>
                )}
              </div>

              <div className="form-row-2">
                <label>
                  <span>SKU</span>
                  <input
                    value={sourceForm.sku}
                    onChange={(e) => setSourceForm({ ...sourceForm, sku: e.target.value })}
                    style={{ textTransform: 'uppercase' }}
                  />
                </label>
                <label>
                  <span>Catalogue name</span>
                  <input
                    value={sourceForm.name}
                    onChange={(e) => setSourceForm({ ...sourceForm, name: e.target.value })}
                  />
                </label>
              </div>

              <label>
                <span>Description (optional)</span>
                <textarea
                  rows={2}
                  value={sourceForm.description}
                  onChange={(e) => setSourceForm({ ...sourceForm, description: e.target.value })}
                />
              </label>

              <div className="form-row-2">
                <label>
                  <span>Category</span>
                  <div className="select-with-add">
                    <select
                      className="filter-select"
                      value={sourceForm.categoryId}
                      onChange={(e) => setSourceForm({ ...sourceForm, categoryId: e.target.value })}
                    >
                      <option value="">Pick category…</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <CategoryQuickAdd
                      onCreated={async (newId, newName) => {
                        setCategories((prev) => [...prev, { id: newId, name: newName }]);
                        setSourceForm((f) => ({ ...f, categoryId: newId }));
                      }}
                    />
                  </div>
                </label>
                <label>
                  <span>Vendor</span>
                  <select
                    className="filter-select"
                    value={sourceForm.vendorId}
                    onChange={(e) => setSourceForm({ ...sourceForm, vendorId: e.target.value })}
                  >
                    <option value="">Pick vendor…</option>
                    {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </label>
              </div>

              <div className="form-row-3">
                <label>
                  <span>Unit price (Rs)</span>
                  <input
                    type="number" min="0" step="1"
                    value={sourceForm.unitPrice}
                    onChange={(e) => setSourceForm({ ...sourceForm, unitPrice: e.target.value })}
                  />
                </label>
                <label>
                  <span>Initial stock</span>
                  <input
                    type="number" min="0"
                    value={sourceForm.initialStock}
                    onChange={(e) => setSourceForm({ ...sourceForm, initialStock: e.target.value })}
                  />
                </label>
                <label>
                  <span>Reorder level</span>
                  <input
                    type="number" min="0"
                    value={sourceForm.reorderLevel}
                    onChange={(e) => setSourceForm({ ...sourceForm, reorderLevel: e.target.value })}
                  />
                </label>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-ghost" onClick={() => !sourceSaving && setSourceTarget(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={sourceSaving}>
                  {sourceSaving ? 'Adding…' : 'Add to catalogue & notify'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject request modal */}
      {rejectTarget && (
        <div className="modal-backdrop" onClick={() => !rejectSaving && setRejectTarget(null)}>
          <div className="modal modal-narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Reject request</h3>
              <button className="modal-close" onClick={() => !rejectSaving && setRejectTarget(null)}>×</button>
            </div>
            <form onSubmit={onReject} className="form">
              <div className="source-summary">
                <div className="source-summary-label">Customer requested</div>
                <div className="source-summary-name">{rejectTarget.partName}</div>
              </div>
              <label>
                <span>Reason (optional, sent to customer)</span>
                <textarea
                  rows={3}
                  placeholder="e.g. Not currently in production, no compatible vendor in stock…"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
              </label>
              <div className="form-actions">
                <button type="button" className="btn-ghost" onClick={() => !rejectSaving && setRejectTarget(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={rejectSaving}>
                  {rejectSaving ? 'Saving…' : 'Reject and notify'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PartRequestsPage;
