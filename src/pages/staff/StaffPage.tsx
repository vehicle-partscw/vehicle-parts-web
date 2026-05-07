import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import api from '../../lib/api';
import { useThemeStore } from '../../stores/themeStore';
import './StaffPage.css';

/* ── Types matching backend StaffDto ── */
interface StaffMember {
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: 'Admin' | 'Staff';
  isActive: boolean;
  createdAt: string;
}

/* ── Schemas ── */
const addStaffSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(10, 'Password must be at least 10 characters'),
  role: z.enum(['Admin', 'Staff']),
});

type AddStaffFormData = z.infer<typeof addStaffSchema>;

/* ── Helper: extract error message from ProblemDetails ── */
function extractError(error: any, fallback: string): string {
  const data = error.response?.data;
  const errors = data?.errors;
  if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
    return Object.values(errors).flat().join(' ');
  }
  if (Array.isArray(errors) && errors.length > 0) return errors[0];
  if (data?.detail) return data.detail;
  if (data?.message) return data.message;
  return fallback;
}

/* ── Component ── */
const StaffPage = () => {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [roleModal, setRoleModal] = useState<{ open: boolean; member: StaffMember | null }>({
    open: false,
    member: null,
  });
  const [newRole, setNewRole] = useState<'Admin' | 'Staff'>('Staff');
  const lottieRef = useRef<HTMLDivElement>(null);
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddStaffFormData>({
    resolver: zodResolver(addStaffSchema),
    defaultValues: { role: 'Staff' },
  });

  useEffect(() => {
    fetchStaff();
  }, []);

  /* Load Lottie animation */
  useEffect(() => {
    let anim: any;
    const loadLottie = async () => {
      if (!lottieRef.current) return;
      const lottie = (await import('lottie-web')).default;
      anim = lottie.loadAnimation({
        container: lottieRef.current,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: '/lottie-team.json',
      });
    };
    loadLottie();
    return () => { if (anim) anim.destroy(); };
  }, []);

  /* ── GET /staff ── */
  const fetchStaff = async () => {
    try {
      const response = await api.get('/staff');
      setStaff(response.data || []);
    } catch {
      toast.error('Failed to load staff members');
    }
  };

  /* ── POST /staff ── */
  const onAddStaff = async (data: AddStaffFormData) => {
    setIsLoading(true);
    try {
      await api.post('/staff', {
        fullName: data.fullName,
        email: data.email,
        password: data.password,
        role: data.role,
      });
      toast.success('Staff member added successfully!');
      reset();
      setShowAddModal(false);
      fetchStaff();
    } catch (error: any) {
      toast.error(extractError(error, 'Failed to add staff member'));
    } finally {
      setIsLoading(false);
    }
  };

  /* ── PATCH /staff/{userId}/toggle-active ── */
  const toggleActive = async (userId: string) => {
    try {
      await api.patch(`/staff/${userId}/toggle-active`);
      toast.success('Staff active status updated');
      fetchStaff();
    } catch (error: any) {
      toast.error(extractError(error, 'Failed to toggle staff status'));
    }
  };

  /* ── PATCH /staff/{userId}/role ── */
  const updateRole = async () => {
    if (!roleModal.member) return;
    try {
      await api.patch(`/staff/${roleModal.member.userId}/role`, { newRole });
      toast.success(`Role updated to ${newRole}`);
      setRoleModal({ open: false, member: null });
      fetchStaff();
    } catch (error: any) {
      toast.error(extractError(error, 'Failed to update role'));
    }
  };

  const openRoleModal = (member: StaffMember) => {
    setNewRole(member.role === 'Admin' ? 'Staff' : 'Admin');
    setRoleModal({ open: true, member });
  };

  return (
    <div className="staff-page">
      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title">Staff</h1>
        <p className="page-subtitle">Manage your team members and roles.</p>
      </div>

      {/* Hero Banner */}
      <div className="hero">
        <div className="hero-text">
          <h2>Staff Management</h2>
          <p>Organize your team, assign roles, and track performance metrics.</p>
        </div>
        <div className="hero-illust">
          <div ref={lottieRef} className="lottie-hero hero-wide" aria-label="team animation" />
        </div>
      </div>

      {/* Insight Cards */}
      <div className="insight-row">
        <div className="insight-card">
          <img
            src={isDark ? '/illust-checking-dark.svg' : '/illust-checking-light.svg'}
            alt="checking"
            style={{ maxHeight: 100, width: 'auto' }}
          />
          <div className="insight-card-text">
            <h4>Attendance</h4>
            <p>All team members checked in today — 100% attendance rate</p>
          </div>
        </div>
        <div className="insight-card">
          <img
            src={isDark ? '/illust-navigating-dark.svg' : '/illust-navigating-light.svg'}
            alt="navigating"
            style={{ maxHeight: 100, width: 'auto' }}
          />
          <div className="insight-card-text">
            <h4>Task Allocation</h4>
            <p>8 active tasks distributed across 3 staff members evenly</p>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="action-bar">
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>+ Add Staff</button>
      </div>

      {/* Staff Table */}
      <div className="table-wrap">
        <div className="table-header">
          <div className="table-header-title">Team Members</div>
        </div>
        {staff.length === 0 ? (
          <div className="empty-state">
            <p>No staff members yet</p>
            <div className="sub">Add your first staff member to get started.</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.userId}>
                  <td>{member.fullName}</td>
                  <td>{member.role === 'Admin' ? 'Administrator' : 'Staff'}</td>
                  <td>{member.email}</td>
                  <td>{member.phone || '—'}</td>
                  <td>
                    <span className={`badge ${member.isActive ? 'badge-success' : 'badge-error'}`}>
                      {member.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => toggleActive(member.userId)}
                      >
                        {member.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => openRoleModal(member)}
                      >
                        Change Role
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Add Staff Modal ── */}
      {showAddModal && (
        <div className="modal-overlay active" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Add Staff Member</div>
                <div className="modal-subtitle">Create a new account for a team member</div>
              </div>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>×</button>
            </div>

            <form onSubmit={handleSubmit(onAddStaff)}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input className="form-input" type="text" placeholder="John Doe" {...register('fullName')} />
                  {errors.fullName && <span className="form-error">{errors.fullName.message}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" placeholder="john@autoparts.com" {...register('email')} />
                  {errors.email && <span className="form-error">{errors.email.message}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input className="form-input" type="password" placeholder="••••••••••" {...register('password')} />
                  {errors.password && <span className="form-error">{errors.password.message}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-select" {...register('role')}>
                    <option value="Staff">Staff</option>
                    <option value="Admin">Admin</option>
                  </select>
                  {errors.role && <span className="form-error">{errors.role.message}</span>}
                </div>
              </div>

              <div className="modal-footer">
                <button type="submit" className="btn btn-primary" disabled={isLoading}>
                  {isLoading ? 'Adding...' : 'Add Staff Member'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Change Role Modal ── */}
      {roleModal.open && roleModal.member && (
        <div className="modal-overlay active" onClick={() => setRoleModal({ open: false, member: null })}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Change Role</div>
                <div className="modal-subtitle">Update role for {roleModal.member.fullName}</div>
              </div>
              <button className="modal-close" onClick={() => setRoleModal({ open: false, member: null })}>×</button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">New Role</label>
                <select
                  className="form-select"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'Admin' | 'Staff')}
                >
                  <option value="Staff">Staff</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-primary" onClick={updateRole}>
                Update Role
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setRoleModal({ open: false, member: null })}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffPage;
