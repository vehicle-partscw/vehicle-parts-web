import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import api from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import logoSvg from '../../assets/logo.svg';
import './AuthPages.css';

/* ── Schemas ── */
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z
  .object({
    fullName: z.string().min(2, 'Full name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(10, 'Password must be at least 10 characters'),
    confirmPassword: z.string(),
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
  const [isLoading, setIsLoading] = useState(false);
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
    formState: { errors: loginErrors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  /* Register form */
  const {
    register: registerSignup,
    handleSubmit: handleRegisterSubmit,
    formState: { errors: registerErrors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onLogin = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const response = await api.post('/auth/login', data);
      const { accessToken, refreshToken } = response.data;
      // API doesn't return a user object — the store decodes it from the JWT
      login(accessToken, refreshToken);
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
      }
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const onRegister = async (data: RegisterFormData) => {
    setIsLoading(true);
    try {
      const response = await api.post('/auth/register', {
        fullName: data.fullName,
        email: data.email,
        password: data.password,
        confirmPassword: data.confirmPassword,
      });
      const { accessToken, refreshToken } = response.data;
      login(accessToken, refreshToken);
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
      }
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

          {/* Lottie illustration — exact animation from prototype */}
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
              onClick={() => setActiveTab('signin')}
              type="button"
            >
              Sign In
            </button>
            <button
              className={`login-tab ${activeTab === 'register' ? 'active' : ''}`}
              onClick={() => setActiveTab('register')}
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
                    <input type="checkbox" defaultChecked />
                    Remember me
                  </label>
                  <a className="login-forgot">Forgot password?</a>
                </div>

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
                <button type="button" className="login-social-btn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
                  </svg>
                  Google
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
    </div>
  );
};

export default LoginPage;
