import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import api from '../../lib/api';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import Pagination, { type PageInfo } from '../../components/shared/Pagination';
import CategoryQuickAdd from '../../components/shared/CategoryQuickAdd';
import './InventoryPage.css';

interface Part {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  categoryId: string;
  categoryName: string;
  vendorId: string;
  vendorName: string;
  unitPrice: number;
  stockQty: number;
  reorderLevel: number;
  isLowStock: boolean;
  imageUrl: string | null;
  createdAt: string;
}

interface Lookup { id: string; name: string }

interface PagedResult<T> {
  items: T[]; page: number; pageSize: number; totalCount: number;
  totalPages: number; hasPrevious: boolean; hasNext: boolean;
}

const partSchema = z.object({
  sku: z.string().min(3).max(40).regex(/^[A-Z0-9-]+$/, 'SKU: capital letters, digits or hyphens only'),
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional().or(z.literal('')),
  categoryId: z.string().min(1, 'Choose a category'),
  vendorId: z.string().min(1, 'Choose a vendor'),
  unitPrice: z.coerce.number().min(0, 'Cannot be negative'),
  stockQty: z.coerce.number().int().min(0),
  reorderLevel: z.coerce.number().int().min(0),
  imageUrl: z.string().max(512).optional().or(z.literal('')),
});

type PartFormData = z.infer<typeof partSchema>;

function fmtMoney(n: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}

function extractError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: string; errors?: Record<string, string[]> } } };
  const data = e?.response?.data;
  if (data?.errors) return Object.values(data.errors).flat().join(' ');
  if (data?.detail) return data.detail;
  return fallback;
}

const InventoryPage = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'Admin';

  const [searchParams] = useSearchParams();
  const [parts, setParts] = useState<Part[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [categories, setCategories] = useState<Lookup[]>([]);
  const [vendors, setVendors] = useState<Lookup[]>([]);
  const [search, setSearch] = useState(searchParams.get('search') ?? '');

  useEffect(() => {
    const q = searchParams.get('search') ?? '';
    setSearch(q);
    setPage(1);
    // fetchParts runs via effect after page changes
  }, [searchParams]);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterVendor, setFilterVendor] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Part | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Part | null>(null);
  const [loading, setLoading] = useState(false);

  const lottieRef = useRef<HTMLDivElement>(null);

  const addForm = useForm<PartFormData>({
    resolver: zodResolver(partSchema),
    defaultValues: { sku: '', name: '', description: '', categoryId: '', vendorId: '', unitPrice: 0, stockQty: 0, reorderLevel: 10, imageUrl: '' },
  });
  const editForm = useForm<PartFormData>({ resolver: zodResolver(partSchema) });

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
        path: '/lottie-inventory.json',
      });
    };
    loadLottie();
    return () => { if (anim) anim.destroy(); };
  }, []);

  const fetchParts = async () => {
    try {
      const params: Record<string, string | number | boolean> = { page, pageSize };
      if (search) params.search = search;
      if (filterCategory) params.categoryId = filterCategory;
      if (filterVendor) params.vendorId = filterVendor;
      if (lowStockOnly) params.lowStock = true;
      const res = await api.get<PagedResult<Part>>('/parts', { params });
      setParts(res.data.items || []);
      setPageInfo({
        page: res.data.page,
        pageSize: res.data.pageSize,
        totalCount: res.data.totalCount,
        totalPages: res.data.totalPages,
        hasPrevious: res.data.hasPrevious,
        hasNext: res.data.hasNext,
      });
    } catch (err) {
      toast.error(extractError(err, 'Could not load parts.'));
    }
  };

  const fetchLookups = async () => {
    try {
      const cats = await api.get<PagedResult<Lookup>>('/part-categories', { params: { pageSize: 100 } });
      setCategories(cats.data.items || []);
    } catch {
      // categories endpoint is public - silently ignore
    }
    if (isAdmin) {
      try {
        const vs = await api.get<PagedResult<Lookup>>('/vendors', { params: { pageSize: 100 } });
        setVendors(vs.data.items || []);
      } catch {
        // staff/customer can't fetch vendors - that's fine, they don't open the modal
      }
    }
  };

  useEffect(() => { fetchLookups(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { fetchParts(); /* eslint-disable-next-line */ }, [page, pageSize]);
  useEffect(() => { setPage(1); fetchParts(); /* eslint-disable-next-line */ }, [filterCategory, filterVendor, lowStockOnly]);

  const onAdd = async (data: PartFormData) => {
    setLoading(true);
    try {
      await api.post('/parts', { ...data, description: data.description || null, imageUrl: data.imageUrl || null });
      toast.success('Part added.');
      addForm.reset();
      setShowAdd(false);
      fetchParts();
    } catch (err) {
      toast.error(extractError(err, 'Could not add part.'));
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (p: Part) => {
    editForm.reset({
      sku: p.sku, name: p.name,
      description: p.description ?? '',
      categoryId: p.categoryId, vendorId: p.vendorId,
      unitPrice: p.unitPrice, stockQty: p.stockQty, reorderLevel: p.reorderLevel,
      imageUrl: p.imageUrl ?? '',
    });
    setEditing(p);
  };

  const onEdit = async (data: PartFormData) => {
    if (!editing) return;
    setLoading(true);
    try {
      // Update endpoint doesn't accept SKU/StockQty changes - sticks to the spec
      await api.put(`/parts/${editing.id}`, {
        name: data.name,
        description: data.description || null,
        categoryId: data.categoryId,
        vendorId: data.vendorId,
        unitPrice: data.unitPrice,
        reorderLevel: data.reorderLevel,
        imageUrl: data.imageUrl || null,
      });
      toast.success('Part updated.');
      setEditing(null);
      fetchParts();
    } catch (err) {
      toast.error(extractError(err, 'Could not update part.'));
    } finally {
      setLoading(false);
    }
  };

  const onConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/parts/${deleteTarget.id}`);
      toast.success('Part removed.');
      setDeleteTarget(null);
      fetchParts();
    } catch (err) {
      toast.error(extractError(err, 'Could not delete part.'));
    }
  };

  const lowStockCount = parts.filter((p) => p.isLowStock).length;
  const totalStockUnits = parts.reduce((sum, p) => sum + p.stockQty, 0);

  return (
    <div className="inventory-page">
      <div className="page-header">
        <h1 className="page-title">Inventory</h1>
        <p className="page-subtitle">Every part you stock, with live stock counts and reorder alerts.</p>
      </div>

      <div className="hero">
        <div className="hero-text">
          <h2>Stock you can trust at a glance.</h2>
          <p>Search by SKU or name, filter by category, vendor, or low-stock alerts. Sales decrement stock automatically; purchase invoices add it back.</p>
        </div>
        <div className="hero-illust">
          <div ref={lottieRef} className="lottie-hero hero-wide" aria-label="inventory animation" />
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card accent-pop">
          <div className="stat-label">SKUs in catalog</div>
          <div className="stat-value">{parts.length}</div>
          <div className="stat-change">{totalStockUnits} units total</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Low stock</div>
          <div className="stat-value">{lowStockCount}</div>
          <div className="stat-change" style={{ color: lowStockCount > 0 ? 'var(--accent-9)' : 'var(--success)' }}>
            {lowStockCount > 0 ? 'Needs reorder' : 'All healthy'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Categories</div>
          <div className="stat-value">{categories.length}</div>
          <div className="stat-change">{vendors.length || '-'} vendors</div>
        </div>
      </div>

      <div className="table-wrap">
        <div className="table-header">
          <span className="table-header-title">All parts</span>
          <div className="table-actions">
            <input
              className="search-input"
              placeholder="SKU or name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); fetchParts(); } }}
            />
            <select className="filter-select" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {isAdmin && (
              <select className="filter-select" value={filterVendor} onChange={(e) => setFilterVendor(e.target.value)}>
                <option value="">All vendors</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            )}
            <label className="low-stock-toggle">
              <input
                type="checkbox"
                checked={lowStockOnly}
                onChange={(e) => setLowStockOnly(e.target.checked)}
              />
              Low stock only
            </label>
            {(search || filterCategory || filterVendor || lowStockOnly) && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setSearch('');
                  setFilterCategory('');
                  setFilterVendor('');
                  setLowStockOnly(false);
                }}
              >
                Clear
              </button>
            )}
            {isAdmin && <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add part</button>}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Category</th>
              <th>Vendor</th>
              <th>Stock</th>
              <th>Price</th>
              <th>Status</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {parts.length === 0 ? (
              <tr><td colSpan={isAdmin ? 8 : 7} className="empty">No parts match these filters.</td></tr>
            ) : (
              parts.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.sku}</td>
                  <td className="strong">{p.name}</td>
                  <td>{p.categoryName}</td>
                  <td>{p.vendorName}</td>
                  <td>
                    <span className={`stock-cell ${p.isLowStock ? 'low' : ''}`}>
                      {p.stockQty} <span className="stock-meta">/ reorder at {p.reorderLevel}</span>
                    </span>
                  </td>
                  <td className="mono">Rs {fmtMoney(p.unitPrice)}</td>
                  <td>
                    {p.isLowStock
                      ? <span className="badge badge-warn">Low stock</span>
                      : <span className="badge badge-success">In stock</span>}
                  </td>
                  {isAdmin && (
                    <td className="row-actions">
                      {p.isLowStock && (
                        <button
                          className="btn-ghost"
                          onClick={() => navigate(`/purchases?reorderPartId=${encodeURIComponent(p.id)}`)}
                          title="Open a purchase invoice pre-filled with this part"
                        >
                          Reorder
                        </button>
                      )}
                      <button className="btn-ghost" onClick={() => openEdit(p)}>Edit</button>
                      <button className="btn-ghost danger" onClick={() => setDeleteTarget(p)}>Delete</button>
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

      {/* Add */}
      {showAdd && (
        <div className="modal-backdrop" onClick={() => setShowAdd(false)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add part</h3>
              <button className="modal-close" onClick={() => setShowAdd(false)}>×</button>
            </div>
            <form onSubmit={addForm.handleSubmit(onAdd)} className="form">
              <div className="form-row">
                <label>
                  <span>SKU</span>
                  <input {...addForm.register('sku')} placeholder="OIL-FLT-001" style={{ textTransform: 'uppercase' }} />
                  {addForm.formState.errors.sku && <em>{addForm.formState.errors.sku.message}</em>}
                </label>
                <label>
                  <span>Name</span>
                  <input {...addForm.register('name')} placeholder="Oil Filter (Toyota)" />
                  {addForm.formState.errors.name && <em>{addForm.formState.errors.name.message}</em>}
                </label>
              </div>
              <label>
                <span>Description (optional)</span>
                <input {...addForm.register('description')} placeholder="Standard 4-cylinder engines" />
              </label>
              <div className="form-row">
                <label>
                  <span>Category</span>
                  <div className="select-with-add">
                    <select {...addForm.register('categoryId')}>
                      <option value="">Pick one…</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <CategoryQuickAdd
                      onCreated={async (newId, newName) => {
                        setCategories((prev) => [...prev, { id: newId, name: newName }]);
                        addForm.setValue('categoryId', newId, { shouldValidate: true });
                      }}
                    />
                  </div>
                  {addForm.formState.errors.categoryId && <em>{addForm.formState.errors.categoryId.message}</em>}
                </label>
                <label>
                  <span>Vendor</span>
                  <select {...addForm.register('vendorId')}>
                    <option value="">Pick one…</option>
                    {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                  {addForm.formState.errors.vendorId && <em>{addForm.formState.errors.vendorId.message}</em>}
                </label>
              </div>
              <div className="form-row form-row-3">
                <label>
                  <span>Unit price (Rs)</span>
                  <input type="number" step="0.01" {...addForm.register('unitPrice')} />
                </label>
                <label>
                  <span>Stock qty</span>
                  <input type="number" {...addForm.register('stockQty')} />
                </label>
                <label>
                  <span>Reorder at</span>
                  <input type="number" {...addForm.register('reorderLevel')} />
                </label>
              </div>
              <label>
                <span>Image URL (optional)</span>
                <input {...addForm.register('imageUrl')} placeholder="https://…" />
              </label>
              <div className="form-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Saving…' : 'Add part'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit */}
      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit part</h3>
              <button className="modal-close" onClick={() => setEditing(null)}>×</button>
            </div>
            <form onSubmit={editForm.handleSubmit(onEdit)} className="form">
              <div className="form-row">
                <label>
                  <span>SKU (read-only)</span>
                  <input value={editing.sku} disabled />
                </label>
                <label>
                  <span>Name</span>
                  <input {...editForm.register('name')} />
                  {editForm.formState.errors.name && <em>{editForm.formState.errors.name.message}</em>}
                </label>
              </div>
              <label>
                <span>Description</span>
                <input {...editForm.register('description')} />
              </label>
              <div className="form-row">
                <label>
                  <span>Category</span>
                  <div className="select-with-add">
                    <select {...editForm.register('categoryId')}>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <CategoryQuickAdd
                      onCreated={async (newId, newName) => {
                        setCategories((prev) => [...prev, { id: newId, name: newName }]);
                        editForm.setValue('categoryId', newId, { shouldValidate: true });
                      }}
                    />
                  </div>
                </label>
                <label>
                  <span>Vendor</span>
                  <select {...editForm.register('vendorId')}>
                    {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="form-row form-row-3">
                <label>
                  <span>Unit price (Rs)</span>
                  <input type="number" step="0.01" {...editForm.register('unitPrice')} />
                </label>
                <label>
                  <span>Stock qty (read-only)</span>
                  <input type="number" value={editing.stockQty} disabled />
                </label>
                <label>
                  <span>Reorder at</span>
                  <input type="number" {...editForm.register('reorderLevel')} />
                </label>
              </div>
              <label>
                <span>Image URL</span>
                <input {...editForm.register('imageUrl')} />
              </label>
              <div className="form-actions">
                <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="modal modal-narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Delete part?</h3>
              <button className="modal-close" onClick={() => setDeleteTarget(null)}>×</button>
            </div>
            <div className="modal-body">
              <p>
                Remove <strong>{deleteTarget.sku}</strong> - {deleteTarget.name}?
                Existing invoices keep their references.
              </p>
            </div>
            <div className="form-actions">
              <button className="btn-ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn-danger" onClick={onConfirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryPage;
