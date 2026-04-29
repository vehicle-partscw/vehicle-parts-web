import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import api from '../../lib/api';
import Pagination, { type PageInfo } from '../../components/shared/Pagination';
import './VendorsPage.css';

interface Vendor {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string | null;
  isActive: boolean;
  createdAt: string;
}

interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

const vendorSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(120),
  contactPerson: z.string().min(2, 'Contact person is required').max(80),
  phone: z.string().min(6, 'Phone is too short').max(20),
  email: z.string().email('Invalid email address').max(256),
  address: z.string().max(255).optional().or(z.literal('')),
});

type VendorFormData = z.infer<typeof vendorSchema>;

function extractError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: string; errors?: Record<string, string[]> } } };
  const data = e?.response?.data;
  if (data?.errors) return Object.values(data.errors).flat().join(' ');
  if (data?.detail) return data.detail;
  return fallback;
}

const VendorsPage = () => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(false);
  const lottieRef = useRef<HTMLDivElement>(null);

  const addForm = useForm<VendorFormData>({
    resolver: zodResolver(vendorSchema),
    defaultValues: { name: '', contactPerson: '', phone: '', email: '', address: '' },
  });

  const editForm = useForm<VendorFormData>({
    resolver: zodResolver(vendorSchema),
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
        path: '/lottie-vendors.json',
      });
    };
    loadLottie();
    return () => { if (anim) anim.destroy(); };
  }, []);

  const fetchVendors = async () => {
    try {
      const res = await api.get<PagedResult<Vendor>>('/vendors', {
        params: { page, pageSize, search: search || undefined },
      });
      setVendors(res.data.items || []);
      setPageInfo({
        page: res.data.page,
        pageSize: res.data.pageSize,
        totalCount: res.data.totalCount,
        totalPages: res.data.totalPages,
        hasPrevious: res.data.hasPrevious,
        hasNext: res.data.hasNext,
      });
    } catch (err) {
      toast.error(extractError(err, 'Could not load vendors.'));
    }
  };

  useEffect(() => {
    fetchVendors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  const onAdd = async (data: VendorFormData) => {
    setLoading(true);
    try {
      await api.post('/vendors', { ...data, address: data.address || null });
      toast.success('Vendor added.');
      addForm.reset();
      setShowAdd(false);
      fetchVendors();
    } catch (err) {
      toast.error(extractError(err, 'Could not add vendor.'));
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (v: Vendor) => {
    editForm.reset({
      name: v.name,
      contactPerson: v.contactPerson,
      phone: v.phone,
      email: v.email,
      address: v.address ?? '',
    });
    setEditing(v);
  };

  const onEdit = async (data: VendorFormData) => {
    if (!editing) return;
    setLoading(true);
    try {
      await api.put(`/vendors/${editing.id}`, {
        ...data,
        address: data.address || null,
        isActive: editing.isActive,
      });
      toast.success('Vendor updated.');
      setEditing(null);
      fetchVendors();
    } catch (err) {
      toast.error(extractError(err, 'Could not update vendor.'));
    } finally {
      setLoading(false);
    }
  };

  const onToggleActive = async (v: Vendor) => {
    try {
      await api.put(`/vendors/${v.id}`, {
        name: v.name,
        contactPerson: v.contactPerson,
        phone: v.phone,
        email: v.email,
        address: v.address,
        isActive: !v.isActive,
      });
      toast.success(v.isActive ? 'Vendor deactivated.' : 'Vendor reactivated.');
      fetchVendors();
    } catch (err) {
      toast.error(extractError(err, 'Could not update status.'));
    }
  };

  const onConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/vendors/${deleteTarget.id}`);
      toast.success('Vendor removed.');
      setDeleteTarget(null);
      fetchVendors();
    } catch (err) {
      toast.error(extractError(err, 'Could not delete vendor.'));
    }
  };

  const totalActive = vendors.filter((v) => v.isActive).length;
  const totalInactive = vendors.length - totalActive;

  return (
    <div className="vendors-page">
      <div className="page-header">
        <h1 className="page-title">Vendors</h1>
        <p className="page-subtitle">Suppliers you buy parts from. Keep contact info current.</p>
      </div>

      <div className="hero">
        <div className="hero-text">
          <h2>Your supply chain, on one page.</h2>
          <p>Add new vendors, refresh contacts, and pause anyone you've stopped buying from. Linked to every part and purchase invoice.</p>
        </div>
        <div className="hero-illust">
          <div ref={lottieRef} className="lottie-hero hero-wide" aria-label="vendors animation" />
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card accent-pop">
          <div className="stat-label">Total Vendors</div>
          <div className="stat-value">{vendors.length}</div>
          <div className="stat-change">{totalActive} active</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active</div>
          <div className="stat-value">{totalActive}</div>
          <div className="stat-change" style={{ color: 'var(--success)' }}>Currently supplying</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Inactive</div>
          <div className="stat-value">{totalInactive}</div>
          <div className="stat-change">Paused or removed</div>
        </div>
      </div>

      <div className="table-wrap">
        <div className="table-header">
          <span className="table-header-title">All vendors</span>
          <div className="table-actions">
            <input
              className="search-input"
              placeholder="Search by name, contact, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); fetchVendors(); } }}
            />
            <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add vendor</button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {vendors.length === 0 ? (
              <tr><td colSpan={6} className="empty">No vendors yet. Click "+ Add vendor" to register one.</td></tr>
            ) : (
              vendors.map((v) => (
                <tr key={v.id}>
                  <td className="strong">{v.name}</td>
                  <td>{v.contactPerson}</td>
                  <td className="mono">{v.phone}</td>
                  <td>{v.email}</td>
                  <td>
                    <span className={`badge ${v.isActive ? 'badge-success' : 'badge-muted'}`}>
                      {v.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="row-actions">
                    <button className="btn-ghost" onClick={() => openEdit(v)}>Edit</button>
                    <button className="btn-ghost" onClick={() => onToggleActive(v)}>
                      {v.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                    <button className="btn-ghost danger" onClick={() => setDeleteTarget(v)}>Delete</button>
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

      {/* Add modal */}
      {showAdd && (
        <div className="modal-backdrop" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add vendor</h3>
              <button className="modal-close" onClick={() => setShowAdd(false)}>×</button>
            </div>
            <form onSubmit={addForm.handleSubmit(onAdd)} className="form">
              <label>
                <span>Name</span>
                <input {...addForm.register('name')} placeholder="Bosch Auto Parts" />
                {addForm.formState.errors.name && <em>{addForm.formState.errors.name.message}</em>}
              </label>
              <label>
                <span>Contact person</span>
                <input {...addForm.register('contactPerson')} placeholder="Ravi Shrestha" />
                {addForm.formState.errors.contactPerson && <em>{addForm.formState.errors.contactPerson.message}</em>}
              </label>
              <div className="form-row">
                <label>
                  <span>Phone</span>
                  <input {...addForm.register('phone')} placeholder="+977 9801234567" />
                  {addForm.formState.errors.phone && <em>{addForm.formState.errors.phone.message}</em>}
                </label>
                <label>
                  <span>Email</span>
                  <input {...addForm.register('email')} placeholder="vendor@example.com" />
                  {addForm.formState.errors.email && <em>{addForm.formState.errors.email.message}</em>}
                </label>
              </div>
              <label>
                <span>Address (optional)</span>
                <input {...addForm.register('address')} placeholder="Putalisadak, Kathmandu" />
              </label>
              <div className="form-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Saving…' : 'Add vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit vendor</h3>
              <button className="modal-close" onClick={() => setEditing(null)}>×</button>
            </div>
            <form onSubmit={editForm.handleSubmit(onEdit)} className="form">
              <label>
                <span>Name</span>
                <input {...editForm.register('name')} />
                {editForm.formState.errors.name && <em>{editForm.formState.errors.name.message}</em>}
              </label>
              <label>
                <span>Contact person</span>
                <input {...editForm.register('contactPerson')} />
                {editForm.formState.errors.contactPerson && <em>{editForm.formState.errors.contactPerson.message}</em>}
              </label>
              <div className="form-row">
                <label>
                  <span>Phone</span>
                  <input {...editForm.register('phone')} />
                </label>
                <label>
                  <span>Email</span>
                  <input {...editForm.register('email')} />
                </label>
              </div>
              <label>
                <span>Address</span>
                <input {...editForm.register('address')} />
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
              <h3>Delete vendor?</h3>
              <button className="modal-close" onClick={() => setDeleteTarget(null)}>×</button>
            </div>
            <div className="modal-body">
              <p>
                Are you sure you want to remove <strong>{deleteTarget.name}</strong>?
                Parts and purchase invoices linked to this vendor will keep their references.
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

export default VendorsPage;
