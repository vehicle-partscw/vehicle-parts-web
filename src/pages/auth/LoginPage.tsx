import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import api from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { useGoogleLogin } from '@react-oauth/google';
import logoSvg from '../../assets/logo.svg';
import ForgotPasswordModal from '../../components/shared/ForgotPasswordModal';
import './AuthPages.css';

/* ── Schemas ── */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const loginSchema = z.object({
  email: z.string()
    .min(1, 'Email is required')
    .regex(EMAIL_RE, 'Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z
  .object({
    fullName: z.string()
      .min(2, 'Full name must be at least 2 characters')
      .max(120, 'That name is too long'),
    email: z.string()
      .min(1, 'Email is required')
      .regex(EMAIL_RE, 'Enter a valid email address'),
    password: z.string()
      .min(10, 'Password must be at least 10 characters')
      .regex(/[A-Za-z]/, 'Password must contain at least one letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type LoginFormData = z.infer<typeof loginSchema>;
type RegisterFormData = z.infer<typeof registerSchema>;

/* ── Component ── */
const LoginPage = () => {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const [activeTab, setActiveTab] = useState<'signin' | 'register'>('signin');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  // toasts disappear after a few seconds; we also surface the most recent API failure inline
  // above the submit button so users don't miss it (especially on slow taps / accessibility setups)
  const [loginApiError, setLoginApiError] = useState<string | null>(null);
  const [registerApiError, setRegisterApiError] = useState<string | null>(null);
  const lottieRef = useRef<HTMLDivElement>(null);

  /* Load Lottie animation dynamically */
  useEffect(() => {
    if (!lottieRef.current) return;
    let destroyed = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let anim: any = null;

    import('lottie-web').then(async (mod) => {
      if (destroyed || !lottieRef.current) return;
      const lottiePlayer = mod.default;
      anim = lottiePlayer.loadAnimation({
        container: lottieRef.current,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: '/lottie-login.json',
      });
    }).catch((err) => console.error('Lottie failed:', err));

    return () => {
      destroyed = true;
      anim?.destroy();
    };
  }, []);

  /* Login form */
  const {
    register: registerLogin,
    handleSubmit: handleLoginSubmit,
    formState: { errors: loginErrors, isDirty: loginDirty },
    watch: watchLogin,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
  });
  const loginEmailValue = watchLogin('email') ?? '';
  const loginPasswordValue = watchLogin('password') ?? '';

  /* Register form */
  const {
    register: registerSignup,
    handleSubmit: handleRegisterSubmit,
    formState: { errors: registerErrors },
    watch: watchRegister,
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    mode: 'onTouched',
  });
  const registerEmailValue = watchRegister('email') ?? '';
  const registerPasswordValue = watchRegister('password') ?? '';

  // dismiss the inline API alert as soon as the user starts editing again - feels like a
  // normal "you saw the error, now fixing it" interaction
  useEffect(() => {
    if (loginApiError) setLoginApiError(null);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [loginEmailValue, loginPasswordValue]);

  useEffect(() => {
    if (registerApiError) setRegisterApiError(null);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [registerEmailValue, registerPasswordValue]);

  // silence the lint warning if loginDirty isn't used elsewhere - kept here in case future
  // logic needs to know whether the form has been touched
  void loginDirty;

  const handleGoogleAuth = useGoogleLogin({
    flow: 'auth-code',
    onSuccess: async ({ code }) => {
      setIsLoading(true);
      try {
        const res = await api.post('/auth/google', { code });
        const { accessToken, refreshToken } = res.data;
        login(accessToken, refreshToken, rememberMe);
        toast.success('Signed in with Google.');
        navigate('/dashboard');
      } catch (error: any) {
        const data = error.response?.data;
        const errors = data?.errors;
        let message = 'Google sign-in failed.';
        if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
          message = Object.values(errors).flat().join(' ');
        } else if (Array.isArray(errors) && errors.length > 0) {
          message = errors[0];
        } else if (data?.detail) {
          message = data.detail;
        }
        toast.error(message);
      } finally {
        setIsLoading(false);
      }
    },
    onError: () => toast.error('Google sign-in was cancelled or failed.'),
  });

  const onLogin = async (data: LoginFormData) => {
    setIsLoading(true);
    setLoginApiError(null);
    try {
      const response = await api.post('/auth/login', data);
      const { accessToken, refreshToken } = response.data;
      // API doesn't return a user object - the store decodes it from the JWT
      login(accessToken, refreshToken, rememberMe);
      toast.success('Logged in successfully!');
      navigate('/dashboard');
    } catch (error: any) {
      const data = error.response?.data;
      // Handle ProblemDetails validation errors (dict of field -> string[])
      const errors = data?.errors;
      let message = 'Login failed. Please try again.';
      if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
        message = Object.values(errors).flat().join(' ');
      } else if (Array.isArray(errors) && errors.length > 0) {
        message = errors[0];
      } else if (data?.detail) {
        message = data.detail;
      } else if (error.response?.status === 401) {
        // some 401s come back without a body (e.g. when the SPA is offline / api hibernating);
        // fall back to a clear message instead of the generic one
        message = 'Invalid email or password.';
      } else if (error.code === 'ERR_NETWORK') {
        message = "Couldn't reach the server. Check your connection and try again.";
      }
      setLoginApiError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const onRegister = async (data: RegisterFormData) => {
    setIsLoading(true);
    setRegisterApiError(null);
    try {
      const response = await api.post('/auth/register', {
        fullName: data.fullName,
        email: data.email,
        password: data.password,
        confirmPassword: data.confirmPassword,
      });
      const { accessToken, refreshToken } = response.data;
      login(accessToken, refreshToken, true);
      toast.success('Account created successfully!');
      navigate('/dashboard');
    } catch (error: any) {
      const data = error.response?.data;
      const errors = data?.errors;
      let message = 'Registration failed. Please try again.';
      if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
        message = Object.values(errors).flat().join(' ');
      } else if (Array.isArray(errors) && errors.length > 0) {
        message = errors[0];
      } else if (data?.detail) {
        message = data.detail;
      } else if (error.code === 'ERR_NETWORK') {
        message = "Couldn't reach the server. Check your connection and try again.";
      }
      setRegisterApiError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-overlay">
      {/* ── LEFT SIDE ── */}
      <div className="login-left">
        {/* Decorative circles */}
        <div className="login-decor-circle" style={{ top: '-80px', right: '-80px', width: 360, height: 360, borderColor: 'var(--accent-6)', opacity: 0.35 }} />
        <div className="login-decor-circle" style={{ bottom: '-60px', left: '-60px', width: 280, height: 280, borderColor: 'var(--accent-7)', opacity: 0.25 }} />
        <div className="login-decor-circle" style={{ top: '15%', left: '5%', width: 120, height: 120, borderColor: 'var(--accent-5)', opacity: 0.2 }} />
        <div className="login-decor-circle" style={{ bottom: '20%', right: '10%', width: 60, height: 60, borderColor: 'var(--accent-8)', opacity: 0.15 }} />

        <div className="login-left-content">
          {/* Brand */}
          <div className="login-brand">
            <img
              src={logoSvg}
              alt="AutoParts logo"
              className="login-brand-logo"
            />
            <span className="login-brand-text">AutoParts</span>
          </div>

          <p className="login-subtitle">
            Vehicle Parts Selling &amp; Inventory Management System
          </p>

          {/* Lottie illustration - exact animation from prototype */}
          <div className="login-illustration" ref={lottieRef} />

          {/* Stat cards */}
          <div className="login-stats">
            <div className="login-stat">
              <div className="login-stat-value">1,245</div>
              <div className="login-stat-label">Parts</div>
            </div>
            <div className="login-stat">
              <div className="login-stat-value">128</div>
              <div className="login-stat-label">Clients</div>
            </div>
            <div className="login-stat login-stat-accent">
              <div className="login-stat-value" style={{ color: 'var(--accent-9)' }}>4.6★</div>
              <div className="login-stat-label" style={{ color: 'var(--accent-11)' }}>Rating</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT SIDE ── */}
      <div className="login-right">
        <div className="login-form-card">
          {/* Tab bar */}
          <div className="login-tab-bar">
            <button
              className={`login-tab ${activeTab === 'signin' ? 'active' : ''}`}
              onClick={() => { setActiveTab('signin'); setRegisterApiError(null); }}
              type="button"
            >
              Sign In
            </button>
            <button
              className={`login-tab ${activeTab === 'register' ? 'active' : ''}`}
              onClick={() => { setActiveTab('register'); setLoginApiError(null); }}
              type="button"
            >
              Register
            </button>
          </div>

          {/* ── SIGN IN TAB ── */}
          {activeTab === 'signin' && (
            <div className="login-tab-content">
              <div className="login-form-header">
                <h1>Welcome Back</h1>
                <p>Sign in to access your dashboard</p>
              </div>

              <form onSubmit={handleLoginSubmit(onLogin)}>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    className="form-input"
                    type="email"
                    placeholder="admin@autoparts.com"
                    {...registerLogin('email')}
                  />
                  {loginErrors.email && (
                    <span className="error-message">{loginErrors.email.message}</span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input
                    className="form-input"
                    type="password"
                    placeholder="••••••••"
                    {...registerLogin('password')}
                  />
                  {loginErrors.password && (
                    <span className="error-message">{loginErrors.password.message}</span>
                  )}
                </div>

                <div className="login-form-options">
                  <label className="login-remember">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    Remember me
                  </label>
                  <button
                    type="button"
                    className="login-forgot"
                    onClick={() => setForgotOpen(true)}
                  >
                    Forgot password?
                  </button>
                </div>

                {loginApiError && (
                  <div className="auth-alert" role="alert">
                    <span className="auth-alert-dot" aria-hidden="true">!</span>
                    <span>{loginApiError}</span>
                  </div>
                )}

                <button type="submit" disabled={isLoading} className="login-submit-btn">
                  {isLoading ? (
                    <>
                      <span className="spinner" />
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </button>
              </form>

              <div className="login-social-divider">
                <p>Or continue with</p>
                <button
                  type="button"
                  className="login-social-btn"
                  onClick={() => handleGoogleAuth()}
                  disabled={isLoading}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M21.35 11.1H12v3.83h5.34c-.49 2.4-2.5 3.83-5.34 3.83-3.18 0-5.78-2.6-5.78-5.78s2.6-5.78 5.78-5.78c1.43 0 2.7.51 3.7 1.36l2.88-2.88C16.85 4.07 14.6 3 12 3 6.97 3 3 6.97 3 12s3.97 9 9 9c5.2 0 8.6-3.66 8.6-8.79 0-.59-.07-1.17-.25-1.71z"/>
                  </svg>
                  Continue with Google
                </button>
              </div>

              <p className="login-switch-text">
                Don't have an account?{' '}
                <a onClick={() => setActiveTab('register')}>Register</a>
              </p>
            </div>
          )}

          {/* ── REGISTER TAB ── */}
          {activeTab === 'register' && (
            <div className="login-tab-content">
              <div className="login-form-header">
                <h1>Create Account</h1>
                <p>Sign up to start managing your parts</p>
              </div>

              <form onSubmit={handleRegisterSubmit(onRegister)}>
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="Your full name"
                    {...registerSignup('fullName')}
                  />
                  {registerErrors.fullName && (
                    <span className="error-message">{registerErrors.fullName.message}</span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    className="form-input"
                    type="email"
                    placeholder="Your email address"
                    {...registerSignup('email')}
                  />
                  {registerErrors.email && (
                    <span className="error-message">{registerErrors.email.message}</span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input
                    className="form-input"
                    type="password"
                    placeholder="••••••••"
                    {...registerSignup('password')}
                  />
                  {registerErrors.password && (
                    <span className="error-message">{registerErrors.password.message}</span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Confirm Password</label>
                  <input
                    className="form-input"
                    type="password"
                    placeholder="••••••••"
                    {...registerSignup('confirmPassword')}
                  />
                  {registerErrors.confirmPassword && (
                    <span className="error-message">{registerErrors.confirmPassword.message}</span>
                  )}
                </div>

                {registerApiError && (
                  <div className="auth-alert" role="alert">
                    <span className="auth-alert-dot" aria-hidden="true">!</span>
                    <span>{registerApiError}</span>
                  </div>
                )}

                <button type="submit" disabled={isLoading} className="login-submit-btn" style={{ marginTop: 12 }}>
                  {isLoading ? (
                    <>
                      <span className="spinner" />
                      Creating account...
                    </>
                  ) : (
                    'Register'
                  )}
                </button>
              </form>

              <p className="login-switch-text">
                Already have an account?{' '}
                <a onClick={() => setActiveTab('signin')}>Sign In</a>
              </p>
            </div>
          )}
        </div>
      </div>

      <ForgotPasswordModal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        initialEmail={loginEmailValue}
        onRegister={() => {
          setForgotOpen(false);
          setActiveTab('register');
        }}
      />
    </div>
  );
};

export default LoginPage;
