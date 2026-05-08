import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import api from '../../lib/api';
import './ForgotPasswordModal.css';

type Step = 'email' | 'code' | 'password' | 'done';

interface Props {
  open: boolean;
  onClose: () => void;
  /** When provided, pre-fills the email field. */
  initialEmail?: string;
  /** Callback fired after a successful password reset (e.g. to force-logout the user). */
  onResetComplete?: () => void;
  /** Optional callback invoked when the user clicks "Register" inside the modal. */
  onRegister?: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function extractError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: string; errors?: Record<string, string[]> } } };
  const data = e?.response?.data;
  if (data?.errors) return Object.values(data.errors).flat().join(' ');
  if (data?.detail) return data.detail;
  return fallback;
}

const ForgotPasswordModal = ({ open, onClose, initialEmail = '', onResetComplete, onRegister }: Props) => {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);

  // touched flags so we don't show errors on first render
  const [touched, setTouched] = useState({ email: false, code: false, pw: false, confirm: false });

  // re-pre-fill whenever the modal opens with a new initialEmail
  useEffect(() => {
    if (open) {
      setStep('email');
      setEmail(initialEmail);
      setCode('');
      setResetToken('');
      setNewPassword('');
      setConfirmPassword('');
      setBusy(false);
      setTouched({ email: false, code: false, pw: false, confirm: false });
    }
  }, [open, initialEmail]);

  const close = () => {
    if (busy) return;
    onClose();
  };

  // live validation
  const emailErr = touched.email && !email.trim()
    ? 'Email is required.'
    : touched.email && !EMAIL_RE.test(email.trim())
      ? 'Enter a valid email address.'
      : '';
  const codeErr = touched.code && code.length === 0
    ? 'Enter the 6-digit code.'
    : touched.code && code.length !== 6
      ? 'The code is exactly 6 digits.'
      : '';
  const pwErr = touched.pw && newPassword.length === 0
    ? 'Password is required.'
    : touched.pw && newPassword.length < 10
      ? 'Password must be at least 10 characters.'
      : '';
  const confirmErr = touched.confirm && confirmPassword.length === 0
    ? 'Please confirm your password.'
    : touched.confirm && confirmPassword !== newPassword
      ? 'Passwords do not match.'
      : '';

  // step handlers
  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched((t) => ({ ...t, email: true }));
    if (!email.trim() || !EMAIL_RE.test(email.trim())) {
      toast.error('Enter a valid email.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      // For security we don't reveal whether the address exists. The next step's screen reminds the
      // user that if they're not registered, no email will arrive.
      toast.success("If that email is on file, we've sent a code.");
      setStep('code');
    } catch (err) {
      toast.error(extractError(err, 'Could not send code.'));
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched((t) => ({ ...t, code: true }));
    if (code.length !== 6) {
      toast.error('Enter the 6-digit code.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ resetToken: string }>('/auth/verify-reset-code', {
        email: email.trim(),
        code,
      });
      setResetToken(res.data.resetToken);
      setStep('password');
    } catch (err) {
      toast.error(extractError(err, 'Code is invalid or expired.'));
    } finally {
      setBusy(false);
    }
  };

  const submitNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched((t) => ({ ...t, pw: true, confirm: true }));
    if (newPassword.length < 10 || newPassword !== confirmPassword) {
      toast.error('Fix the password fields and try again.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/reset-password', {
        email: email.trim(),
        resetToken,
        newPassword,
        confirmPassword,
      });
      setStep('done');
      onResetComplete?.();
    } catch (err) {
      toast.error(extractError(err, 'Could not reset password.'));
    } finally {
      setBusy(false);
    }
  };

  const goRegister = () => {
    onRegister?.();
    close();
  };

  if (!open) return null;

  return (
    <div className="fp-backdrop" onClick={close}>
      <div className="fp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fp-header">
          <div>
            <h3>Reset password</h3>
            <div className="fp-step-indicator">
              <span className={step === 'email' ? 'active' : 'done'}>1. Email</span>
              <span className={step === 'code' ? 'active' : (step === 'email' ? '' : 'done')}>2. Code</span>
              <span className={step === 'password' ? 'active' : (step === 'done' ? 'done' : '')}>3. New password</span>
            </div>
          </div>
          <button type="button" className="fp-close" onClick={close}>×</button>
        </div>

        {step === 'email' && (
          <form onSubmit={sendCode} className="fp-body" noValidate>
            <p className="fp-help">Enter your account email. We'll send a 6-digit code that's valid for 15 minutes.</p>
            <label className="fp-field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                placeholder="your.email@example.com"
                className={emailErr ? 'has-error' : ''}
                autoFocus
              />
              {emailErr && <em className="fp-error">{emailErr}</em>}
            </label>
            <div className="fp-actions">
              <button type="button" className="fp-btn-ghost" onClick={close}>Cancel</button>
              <button type="submit" className="fp-btn-primary" disabled={busy || !!emailErr}>
                {busy ? 'Sending…' : 'Send code'}
              </button>
            </div>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={verifyCode} className="fp-body" noValidate>
            <p className="fp-help">
              We sent a 6-digit code to <strong>{email}</strong>. Check your inbox (and spam folder) and enter it below.
            </p>
            <label className="fp-field">
              <span>6-digit code</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                onBlur={() => setTouched((t) => ({ ...t, code: true }))}
                placeholder="123456"
                className={`fp-otp ${codeErr ? 'has-error' : ''}`}
                autoFocus
              />
              {codeErr && <em className="fp-error">{codeErr}</em>}
            </label>

            <div className="fp-meta">
              <button type="button" className="fp-link" onClick={() => setStep('email')} disabled={busy}>
                Use a different email or resend
              </button>
              {onRegister && (
                <span className="fp-meta-divider">·</span>
              )}
              {onRegister && (
                <button type="button" className="fp-link" onClick={goRegister} disabled={busy}>
                  Don't have an account? Register
                </button>
              )}
            </div>

            <div className="fp-info-box">
              No email arrived? Either it's still on the way (give it a minute), it's in spam, or that email
              isn't registered with us. We don't reveal which for security reasons - if you're not signed up
              yet, click <strong>Register</strong> instead.
            </div>

            <div className="fp-actions">
              <button type="button" className="fp-btn-ghost" onClick={close}>Cancel</button>
              <button type="submit" className="fp-btn-primary" disabled={busy || !!codeErr || code.length !== 6}>
                {busy ? 'Verifying…' : 'Verify code'}
              </button>
            </div>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={submitNewPassword} className="fp-body" noValidate>
            <p className="fp-help">Pick a new password. After this you'll be signed out from any other devices.</p>
            <label className="fp-field">
              <span>New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, pw: true }))}
                placeholder="At least 10 characters"
                className={pwErr ? 'has-error' : ''}
                autoFocus
              />
              {pwErr && <em className="fp-error">{pwErr}</em>}
            </label>
            <label className="fp-field">
              <span>Confirm password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
                placeholder="Repeat the password"
                className={confirmErr ? 'has-error' : ''}
              />
              {confirmErr && <em className="fp-error">{confirmErr}</em>}
            </label>
            <div className="fp-actions">
              <button type="button" className="fp-btn-ghost" onClick={close}>Cancel</button>
              <button
                type="submit"
                className="fp-btn-primary"
                disabled={busy || !!pwErr || !!confirmErr || newPassword.length < 10 || newPassword !== confirmPassword}
              >
                {busy ? 'Saving…' : 'Set new password'}
              </button>
            </div>
          </form>
        )}

        {step === 'done' && (
          <div className="fp-body fp-done">
            <div className="fp-done-tick">✓</div>
            <h4>Password updated</h4>
            <p>Your password has been changed. You can now sign in with your new password.</p>
            <div className="fp-actions">
              <button type="button" className="fp-btn-primary" onClick={close}>Continue</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordModal;
