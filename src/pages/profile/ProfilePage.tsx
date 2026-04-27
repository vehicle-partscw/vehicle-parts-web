import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';
import ForgotPasswordModal from '../../components/shared/ForgotPasswordModal';
import './ProfilePage.css';

interface MyProfile {
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
  vin: string | null;
  mileage: number;
  customerUserId: string;
}

interface PagedResult<T> {
  items: T[]; page: number; pageSize: number; totalCount: number;
  totalPages: number; hasPrevious: boolean; hasNext: boolean;
}

function extractError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: string; errors?: Record<string, string[]> } } };
  const data = e?.response?.data;
  if (data?.errors) return Object.values(data.errors).flat().join(' ');
  if (data?.detail) return data.detail;
  return fallback;
}

const blankVehicleForm = () => ({
  id: '' as string,
  vehicleNumber: '',
  make: '',
  model: '',
  year: new Date().getFullYear().toString(),
  vin: '',
  mileage: '0',
});

const ProfilePage = () => {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [forgotOpen, setForgotOpen] = useState(false);

  const isCustomer = user?.role === 'Customer';

  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [profileForm, setProfileForm] = useState({ fullName: '', phone: '' });
  const [profileSaving, setProfileSaving] = useState(false);

  // change-email modal
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailForm, setEmailForm] = useState({ newEmail: '', currentPassword: '' });
  const [emailSaving, setEmailSaving] = useState(false);

  // change-password modal
  const [pwOpen, setPwOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwSaving, setPwSaving] = useState(false);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);

  const [vehicleModal, setVehicleModal] = useState<{ open: boolean; mode: 'create' | 'edit' }>({ open: false, mode: 'create' });
  const [vehicleForm, setVehicleForm] = useState(blankVehicleForm());
  const [vehicleSaving, setVehicleSaving] = useState(false);

  const fetchProfile = async () => {
    try {
      const res = await api.get<MyProfile>('/me');
      setProfile(res.data);
      setProfileForm({ fullName: res.data.fullName ?? '', phone: res.data.phone ?? '' });
    } catch (err) {
      toast.error(extractError(err, 'Could not load your profile.'));
    }
  };

  const fetchVehicles = async () => {
    setVehiclesLoading(true);
    try {
      const res = await api.get<PagedResult<Vehicle>>('/vehicles', { params: { pageSize: 100 } });
      setVehicles(res.data.items || []);
    } catch (err) {
      toast.error(extractError(err, 'Could not load your vehicles.'));
    } finally {
      setVehiclesLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
    if (isCustomer) fetchVehicles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailForm.newEmail.trim() || !emailForm.currentPassword) {
      toast.error('Enter the new email and your current password.');
      return;
    }
    setEmailSaving(true);
    try {
      await api.put('/me/email', {
        newEmail: emailForm.newEmail.trim(),
        currentPassword: emailForm.currentPassword,
      });
      toast.success('Email updated. Sign in again with your new email.');
      setEmailOpen(false);
      setEmailForm({ newEmail: '', currentPassword: '' });
      fetchProfile();
    } catch (err) {
      toast.error(extractError(err, 'Could not update email.'));
    } finally {
      setEmailSaving(false);
    }
  };

  const onChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.newPassword.length < 10) {
      toast.error('New password must be at least 10 characters.');
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }
    setPwSaving(true);
    try {
      await api.put('/me/password', pwForm);
      toast.success('Password updated. Other devices have been signed out.');
      setPwOpen(false);
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      toast.error(extractError(err, 'Could not update password.'));
    } finally {
      setPwSaving(false);
    }
  };

  const onSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileForm.fullName.trim()) {
      toast.error('Full name is required.');
      return;
    }
    setProfileSaving(true);
    try {
      await api.put('/me', {
        fullName: profileForm.fullName.trim(),
        phone: profileForm.phone.trim() || null,
      });
      toast.success('Profile updated.');
      fetchProfile();
    } catch (err) {
      toast.error(extractError(err, 'Could not update profile.'));
    } finally {
      setProfileSaving(false);
    }
  };

  const openAddVehicle = () => {
    setVehicleForm(blankVehicleForm());
    setVehicleModal({ open: true, mode: 'create' });
  };

  const openEditVehicle = (v: Vehicle) => {
    setVehicleForm({
      id: v.id,
      vehicleNumber: v.vehicleNumber,
      make: v.make,
      model: v.model,
      year: v.year.toString(),
      vin: v.vin ?? '',
      mileage: v.mileage.toString(),
    });
    setVehicleModal({ open: true, mode: 'edit' });
  };

  const onSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = vehicleForm;
    if (vehicleModal.mode === 'create' && !f.vehicleNumber.trim()) {
      toast.error('Vehicle number is required.');
      return;
    }
    if (!f.make.trim() || !f.model.trim()) {
      toast.error('Make and model are required.');
      return;
    }
    setVehicleSaving(true);
    try {
      if (vehicleModal.mode === 'create') {
        await api.post('/vehicles', {
          vehicleNumber: f.vehicleNumber.trim().toUpperCase(),
          make: f.make.trim(),
          model: f.model.trim(),
          year: Number(f.year) || new Date().getFullYear(),
          vin: f.vin.trim() || null,
          mileage: Number(f.mileage) || 0,
        });
        toast.success('Vehicle added.');
      } else {
        await api.put(`/vehicles/${f.id}`, {
          make: f.make.trim(),
          model: f.model.trim(),
          year: Number(f.year) || new Date().getFullYear(),
          vin: f.vin.trim() || null,
          mileage: Number(f.mileage) || 0,
        });
        toast.success('Vehicle updated.');
      }
      setVehicleModal({ open: false, mode: 'create' });
      fetchVehicles();
    } catch (err) {
      toast.error(extractError(err, 'Could not save vehicle.'));
    } finally {
      setVehicleSaving(false);
    }
  };

  const onDeleteVehicle = async (v: Vehicle) => {
    if (!window.confirm(`Remove ${v.vehicleNumber} (${v.make} ${v.model})? This cannot be undone.`)) return;
    try {
      await api.delete(`/vehicles/${v.id}`);
      toast.success('Vehicle removed.');
      fetchVehicles();
    } catch (err) {
      toast.error(extractError(err, 'Could not remove vehicle.'));
    }
  };

  return (
    <div className="profile-page">
      <div className="page-header">
        <h1 className="page-title">My Profile</h1>
        <p className="page-subtitle">Update your details and keep your registered vehicles in order.</p>
      </div>


      {/* HERO — original My Account banner with figuring illustration */}
      <div className="hero">
        <div className="hero-text">
          <h2>My Account</h2>
          <p>Edit the details we have on file{isCustomer ? ' and add or remove the vehicles linked to your account' : ''}.</p>
        </div>
        <div className="hero-illust">
          <img
            className="hero-sq"
            src={isDark ? '/illust-figuring-dark.svg' : '/illust-figuring-light.svg'}
            alt="figuring it out"
          />
        </div>
      </div>

      {/* Profile information — full-width chunky card with 2-col form */}
      <div className="profile-card profile-card-spaced">
        <div className="profile-card-head">
          <div>
            <div className="profile-card-title">Profile information</div>
            <div className="profile-card-sub">Your name and phone are visible to staff when you book a service.</div>
          </div>
        </div>
        <form onSubmit={onSaveProfile} className="profile-form-grid">
          <label className="profile-field">
            <span>Full name</span>
            <input
              type="text"
              value={profileForm.fullName}
              onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
              placeholder="Your full name"
            />
          </label>
          <label className="profile-field">
            <span>Phone</span>
            <input
              type="tel"
              value={profileForm.phone}
              onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
              placeholder="Your phone number"
            />
          </label>
          <label className="profile-field profile-field-wide">
            <span>Email</span>
            <input
              type="email"
              value={profile?.email ?? ''}
              disabled
              title="Email cannot be changed"
            />
            <small>Email is used to sign in and cannot be changed here.</small>
          </label>
          <div className="profile-form-meta profile-field-wide">
            <span className="meta-row">
              <span className="meta-label">Role</span>
              <span className="meta-value">{user?.role ?? '—'}</span>
            </span>
            {profile?.creditLimit != null && (
              <span className="meta-row">
                <span className="meta-label">Credit limit</span>
                <span className="meta-value">Rs {Number(profile.creditLimit).toLocaleString()}</span>
              </span>
            )}
            {profile?.createdAt && (
              <span className="meta-row">
                <span className="meta-label">Member since</span>
                <span className="meta-value">{new Date(profile.createdAt).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
              </span>
            )}
          </div>
          <div className="profile-field-wide profile-form-actions">
            <button className="btn-primary" type="submit" disabled={profileSaving}>
              {profileSaving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>

      {/* Security — change email + change password */}
      <div className="profile-card profile-card-spaced">
        <div className="profile-card-head">
          <div>
            <div className="profile-card-title">Security</div>
            <div className="profile-card-sub">Change the email you sign in with or update your password.</div>
          </div>
        </div>
        <div className="security-actions">
          <button type="button" className="btn-ghost" onClick={() => { setEmailForm({ newEmail: profile?.email ?? '', currentPassword: '' }); setEmailOpen(true); }}>
            Change email
          </button>
          <button type="button" className="btn-ghost" onClick={() => setPwOpen(true)}>
            Change password
          </button>
        </div>
      </div>

      {/* My vehicles — full width below for customers */}
      {isCustomer && (
        <div className="profile-card profile-card-spaced">
          <div className="profile-card-head">
            <div>
              <div className="profile-card-title">My vehicles</div>
              <div className="profile-card-sub">{vehicles.length} {vehicles.length === 1 ? 'vehicle' : 'vehicles'} linked to your account.</div>
            </div>
            <button className="btn-primary btn-small" onClick={openAddVehicle}>+ Add vehicle</button>
          </div>
          {vehiclesLoading ? (
            <div className="profile-empty">Loading…</div>
          ) : vehicles.length === 0 ? (
            <div className="profile-empty">No vehicles yet. Click <strong>Add vehicle</strong> to register one.</div>
          ) : (
            <ul className="vehicle-list">
              {vehicles.map((v) => (
                <li className="vehicle-row" key={v.id}>
                  <div className="vehicle-plate">{v.vehicleNumber}</div>
                  <div className="vehicle-info">
                    <div className="vehicle-make">{v.make} {v.model}</div>
                    <div className="vehicle-meta">
                      <span>{v.year}</span>
                      <span>•</span>
                      <span>{v.mileage.toLocaleString()} km</span>
                      {v.vin && (<><span>•</span><span className="vin">VIN {v.vin}</span></>)}
                    </div>
                  </div>
                  <div className="vehicle-actions">
                    <button className="btn-ghost btn-small" onClick={() => openEditVehicle(v)}>Edit</button>
                    <button className="btn-ghost btn-small btn-danger" onClick={() => onDeleteVehicle(v)}>Remove</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {vehicleModal.open && (
        <div className="modal-backdrop" onClick={() => !vehicleSaving && setVehicleModal({ open: false, mode: 'create' })}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{vehicleModal.mode === 'create' ? 'Add a vehicle' : 'Edit vehicle'}</h3>
              <button className="modal-close" onClick={() => !vehicleSaving && setVehicleModal({ open: false, mode: 'create' })}>×</button>
            </div>
            <form onSubmit={onSaveVehicle}>
              <div className="modal-body">
                {vehicleModal.mode === 'create' ? (
                  <label className="profile-field">
                    <span>Vehicle number</span>
                    <input
                      type="text"
                      value={vehicleForm.vehicleNumber}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, vehicleNumber: e.target.value })}
                      placeholder="BA-2-PA-1234"
                      style={{ textTransform: 'uppercase' }}
                    />
                  </label>
                ) : (
                  <div className="profile-readonly">
                    <span className="meta-label">Vehicle number</span>
                    <span className="meta-value mono">{vehicleForm.vehicleNumber}</span>
                  </div>
                )}
                <div className="modal-row-2">
                  <label className="profile-field">
                    <span>Make</span>
                    <input
                      type="text"
                      value={vehicleForm.make}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, make: e.target.value })}
                      placeholder="Toyota"
                    />
                  </label>
                  <label className="profile-field">
                    <span>Model</span>
                    <input
                      type="text"
                      value={vehicleForm.model}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
                      placeholder="Yaris"
                    />
                  </label>
                </div>
                <div className="modal-row-2">
                  <label className="profile-field">
                    <span>Year</span>
                    <input
                      type="number"
                      min="1980"
                      max={new Date().getFullYear() + 1}
                      value={vehicleForm.year}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, year: e.target.value })}
                    />
                  </label>
                  <label className="profile-field">
                    <span>Mileage (km)</span>
                    <input
                      type="number"
                      min="0"
                      value={vehicleForm.mileage}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, mileage: e.target.value })}
                    />
                  </label>
                </div>
                <label className="profile-field">
                  <span>VIN (optional)</span>
                  <input
                    type="text"
                    value={vehicleForm.vin}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, vin: e.target.value })}
                    placeholder="17-character VIN"
                    style={{ textTransform: 'uppercase' }}
                  />
                </label>
              </div>
              <div className="form-actions">
                <button type="button" className="btn-ghost" onClick={() => !vehicleSaving && setVehicleModal({ open: false, mode: 'create' })}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={vehicleSaving}>
                  {vehicleSaving ? 'Saving…' : (vehicleModal.mode === 'create' ? 'Add vehicle' : 'Save changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change email modal */}
      {emailOpen && (
        <div className="modal-backdrop" onClick={() => !emailSaving && setEmailOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Change email</h3>
              <button className="modal-close" onClick={() => !emailSaving && setEmailOpen(false)}>×</button>
            </div>
            <form onSubmit={onChangeEmail}>
              <div className="modal-body">
                <p style={{ margin: 0, fontSize: 13, color: 'var(--neutral-9)' }}>
                  Your email is also your sign-in name. After this change, you'll be signed out everywhere and need to sign in with the new email.
                </p>
                <label className="profile-field">
                  <span>New email</span>
                  <input
                    type="email"
                    value={emailForm.newEmail}
                    onChange={(e) => setEmailForm({ ...emailForm, newEmail: e.target.value })}
                    autoFocus
                  />
                </label>
                <label className="profile-field">
                  <span>Current password</span>
                  <input
                    type="password"
                    value={emailForm.currentPassword}
                    onChange={(e) => setEmailForm({ ...emailForm, currentPassword: e.target.value })}
                    placeholder="To confirm it's really you"
                  />
                </label>
              </div>
              <div className="form-actions">
                <button type="button" className="btn-ghost" onClick={() => !emailSaving && setEmailOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={emailSaving}>
                  {emailSaving ? 'Saving…' : 'Change email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change password modal */}
      {pwOpen && (
        <div className="modal-backdrop" onClick={() => !pwSaving && setPwOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Change password</h3>
              <button className="modal-close" onClick={() => !pwSaving && setPwOpen(false)}>×</button>
            </div>
            <form onSubmit={onChangePassword}>
              <div className="modal-body">
                <label className="profile-field">
                  <span>Current password</span>
                  <input
                    type="password"
                    value={pwForm.currentPassword}
                    onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                    autoFocus
                  />
                </label>
                <label className="profile-field">
                  <span>New password</span>
                  <input
                    type="password"
                    value={pwForm.newPassword}
                    onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                    placeholder="At least 10 characters"
                  />
                </label>
                <label className="profile-field">
                  <span>Confirm new password</span>
                  <input
                    type="password"
                    value={pwForm.confirmPassword}
                    onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="pw-forgot-link"
                  onClick={() => {
                    setPwOpen(false);
                    setForgotOpen(true);
                  }}
                >
                  Don't remember your current password? Reset via email instead
                </button>
              </div>
              <div className="form-actions">
                <button type="button" className="btn-ghost" onClick={() => !pwSaving && setPwOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={pwSaving}>
                  {pwSaving ? 'Saving…' : 'Change password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ForgotPasswordModal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        initialEmail={profile?.email ?? ''}
        onResetComplete={() => {
          // their refresh tokens have been revoked server-side; sign out so they re-login
          toast.success('Password reset. Please sign in again.');
          logout();
          navigate('/login', { replace: true });
        }}
      />
    </div>
  );
};

export default ProfilePage;
