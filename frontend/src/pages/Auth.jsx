import React, { useState, useEffect, useRef } from 'react';
import {
  Building2,
  KeyRound,
  Mail,
  User,
  Phone,
  MapPin,
  Sparkles,
  Eye,
  EyeOff,
  ArrowRight,
  BookOpen,
  Users,
  BarChart3,
  Shield,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import { api, setAuthToken, setStoredUser } from '../api';

// ─── Google Client ID ────────────────────────────────────────────────────────
// Replace with your actual Google OAuth 2.0 client ID
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// ─── Feature highlights shown on the left panel ─────────────────────────────
const FEATURES = [
  { icon: Users, label: 'Student Management', desc: 'Enroll, track, and manage every student effortlessly.' },
  { icon: BookOpen, label: 'Desk & Shift Allocation', desc: 'Real-time visual seat map with multi-shift support.' },
  { icon: BarChart3, label: 'Fee Billing & Receipts', desc: 'Collect dues, send WhatsApp reminders, print GST receipts.' },
  { icon: Shield, label: 'Multi-tenant SaaS', desc: 'Isolated workspace for every library owner.' },
];

// ─── Animated floating orb component ────────────────────────────────────────
function FloatingOrb({ style }) {
  return <div className="auth-orb" style={style} />;
}

export default function Auth({ onLoginSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Login fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register fields
  const [libraryName, setLibraryName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  // Google new-user extra info modal
  const [googlePendingCred, setGooglePendingCred] = useState(null);
  const [googleExtraLibrary, setGoogleExtraLibrary] = useState('');
  const [googleExtraPhone, setGoogleExtraPhone] = useState('');
  const [googleExtraCity, setGoogleExtraCity] = useState('');

  const googleButtonRef = useRef(null);
  const gsiReady = useRef(false);

  // ─── Google credential callback ──────────────────────────────────────────
  // Defined with useRef so it's stable across renders (GSI callback reference)
  const handleGoogleCredential = async (response) => {
    setGoogleLoading(true);
    setError('');
    try {
      const res = await api.auth.googleAuth(response.credential);
      setAuthToken(res.access_token);
      setStoredUser(res.user, res.tenant);
      onLoginSuccess(res.user, res.tenant);
    } catch (err) {
      if (err.message?.includes('not configured')) {
        setError('Google Sign-In is not configured on this server. Please use email & password.');
      } else {
        setError(err.message || 'Google sign-in could not complete. Please try signing in with email.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  // ─── Google Identity Services — init + renderButton ─────────────────────
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;

    const initAndRender = () => {
      if (cancelled || !googleButtonRef.current) return;
      if (gsiReady.current) return; // already initialised
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      // Render the real Google button inside our styled wrapper div
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: googleButtonRef.current.offsetWidth || 400,
      });
      gsiReady.current = true;
    };

    // Poll until GSI script loads, then render
    const interval = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(interval);
        initAndRender();
      }
    }, 150);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [GOOGLE_CLIENT_ID]);

  // ─── Complete Google registration with extra info ─────────────────────────
  const handleGoogleExtraSubmit = async (e) => {
    e.preventDefault();
    setGoogleLoading(true);
    setError('');
    try {
      const res = await api.auth.googleAuth(googlePendingCred, {
        library_name: googleExtraLibrary,
        phone: googleExtraPhone,
        city: googleExtraCity,
      });
      setAuthToken(res.access_token);
      setStoredUser(res.user, res.tenant);
      onLoginSuccess(res.user, res.tenant);
    } catch (err) {
      setError(err.message);
    } finally {
      setGoogleLoading(false);
    }
  };

  // ─── Email login ──────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.auth.login(email, password);
      setAuthToken(res.access_token);
      setStoredUser(res.user, res.tenant);
      onLoginSuccess(res.user, res.tenant);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Email register ───────────────────────────────────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.auth.register({
        library_name: libraryName,
        owner_name: ownerName,
        email: regEmail,
        phone,
        city,
        password: regPassword,
      });
      setAuthToken(res.access_token);
      setStoredUser(res.user, res.tenant);
      onLoginSuccess(res.user, res.tenant);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = () => {
    setEmail('owner@apexlibrary.com');
    setPassword('admin123');
    setMode('login');
    setError('');
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setSuccess('');
  };

  // ─── Google Extra Info Modal ──────────────────────────────────────────────
  if (googlePendingCred) {
    return (
      <div className="auth-root">
        <AuthOrbs />
        <div className="auth-modal-overlay">
          <div className="auth-extra-card">
            <div className="auth-extra-header">
              <div className="auth-brand-icon">
                <Building2 size={24} />
              </div>
              <h2>One More Step</h2>
              <p>Tell us about your study center to complete setup</p>
            </div>
            {error && <div className="auth-alert auth-alert-error">{error}</div>}
            <form onSubmit={handleGoogleExtraSubmit} className="auth-extra-form">
              <div className="auth-field">
                <label>Library / Study Center Name *</label>
                <div className="auth-input-wrap">
                  <Building2 size={16} className="auth-input-icon" />
                  <input
                    type="text"
                    placeholder="Takshashila Reading Lounge"
                    value={googleExtraLibrary}
                    onChange={(e) => setGoogleExtraLibrary(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="auth-field-row">
                <div className="auth-field">
                  <label>Phone Number</label>
                  <div className="auth-input-wrap">
                    <Phone size={16} className="auth-input-icon" />
                    <input
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={googleExtraPhone}
                      onChange={(e) => setGoogleExtraPhone(e.target.value)}
                    />
                  </div>
                </div>
                <div className="auth-field">
                  <label>City</label>
                  <div className="auth-input-wrap">
                    <MapPin size={16} className="auth-input-icon" />
                    <input
                      type="text"
                      placeholder="Jaipur"
                      value={googleExtraCity}
                      onChange={(e) => setGoogleExtraCity(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <button type="submit" className="auth-btn-primary" disabled={googleLoading}>
                {googleLoading ? (
                  <span className="auth-spinner" />
                ) : (
                  <>Launch My Workspace <ArrowRight size={16} /></>
                )}
              </button>
            </form>
          </div>
        </div>
        <AuthStyles />
      </div>
    );
  }

  // ─── Main Auth Layout ─────────────────────────────────────────────────────
  return (
    <div className="auth-root">
      <AuthOrbs />

      <div className="auth-layout">
        {/* ── Left Panel ── */}
        <div className="auth-left">
          <div className="auth-left-content">
            {/* Logo */}
            <div className="auth-logo-row">
              <div className="auth-brand-icon large">
                <Building2 size={28} />
              </div>
              <div>
                <div className="auth-logo-title">StudyHub</div>
                <div className="auth-logo-sub">Self-Study Center OS</div>
              </div>
            </div>

            {/* Headline */}
            <div className="auth-headline">
              <h1>
                Manage your <span className="auth-gradient-text">study library</span> like a pro
              </h1>
              <p className="auth-headline-sub">
                The all-in-one platform for self-study centers — seats, students, fees, and WhatsApp reminders, unified.
              </p>
            </div>

            {/* Features */}
            <div className="auth-features">
              {FEATURES.map(({ icon: Icon, label, desc }) => (
                <div key={label} className="auth-feature-item">
                  <div className="auth-feature-dot">
                    <Icon size={14} />
                  </div>
                  <div>
                    <div className="auth-feature-label">{label}</div>
                    <div className="auth-feature-desc">{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Testimonial / Social Proof */}
            <div className="auth-proof">
              <div className="auth-proof-avatars">
                {['🧑🏫', '👩🏽‍💼', '👨🏻‍🎓'].map((e, i) => (
                  <div key={i} className="auth-proof-avatar">{e}</div>
                ))}
              </div>
              <div className="auth-proof-text">
                Trusted by <strong>200+</strong> study centers across India
              </div>
            </div>
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div className="auth-right">
          <div className="auth-card">
            {/* Tab switcher */}
            <div className="auth-tabs">
              <button
                id="auth-tab-login"
                className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
                onClick={() => switchMode('login')}
              >
                Sign In
              </button>
              <button
                id="auth-tab-register"
                className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
                onClick={() => switchMode('register')}
              >
                Create Account
              </button>
              <div className={`auth-tab-indicator ${mode === 'register' ? 'right' : ''}`} />
            </div>

            {/* Google Sign-In button — rendered by Google Identity Services */}
            <div className="auth-google-wrapper">
              {googleLoading && (
                <div className="auth-google-loading">
                  <span className="auth-spinner dark" />
                  <span>Signing in with Google...</span>
                </div>
              )}
              <div
                ref={googleButtonRef}
                id="auth-google-btn-container"
                style={{ display: googleLoading ? 'none' : 'block' }}
              />
              {!GOOGLE_CLIENT_ID && (
                <div className="auth-google-unconfigured">
                  <svg viewBox="0 0 24 24" width="18" height="18" style={{ flexShrink: 0 }}>
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Google Sign-In not configured
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="auth-divider">
              <span>or continue with email</span>
            </div>

            {/* Error */}
            {error && (
              <div className="auth-alert auth-alert-error" id="auth-error-banner">
                {error}
              </div>
            )}

            {/* ── Login Form ── */}
            {mode === 'login' && (
              <form onSubmit={handleLogin} id="auth-login-form">
                {/* Demo autofill */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                  <button
                    type="button"
                    className="auth-demo-banner"
                    onClick={fillDemo}
                    id="auth-demo-fill"
                    style={{ margin: 0, justifyContent: 'center' }}
                  >
                    <Sparkles size={14} color="var(--primary)" />
                    <span>Apex Demo</span>
                  </button>
                  <button
                    type="button"
                    className="auth-demo-banner"
                    onClick={() => {
                      setEmail('kumarsinghshivam325@gmail.com');
                      setPassword('admin123');
                      setMode('login');
                      setError('');
                    }}
                    id="auth-shivam-fill"
                    style={{ margin: 0, justifyContent: 'center' }}
                  >
                    <Sparkles size={14} color="var(--primary)" />
                    <span>Shivam Library</span>
                  </button>
                </div>

                <div className="auth-field">
                  <label htmlFor="login-email">Email Address</label>
                  <div className="auth-input-wrap">
                    <Mail size={15} className="auth-input-icon" />
                    <input
                      id="login-email"
                      type="email"
                      placeholder="owner@apexlibrary.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div className="auth-field">
                  <div className="auth-label-row">
                    <label htmlFor="login-password">Password</label>
                    <button type="button" className="auth-forgot-link" tabIndex={-1}>
                      Forgot password?
                    </button>
                  </div>
                  <div className="auth-input-wrap">
                    <KeyRound size={15} className="auth-input-icon" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      className="auth-eye-btn"
                      onClick={() => setShowPassword((v) => !v)}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <button
                  id="auth-login-submit"
                  type="submit"
                  className="auth-btn-primary"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="auth-spinner" />
                  ) : (
                    <>Sign In to Dashboard <ArrowRight size={16} /></>
                  )}
                </button>

                <p className="auth-switch-hint">
                  New library owner?{' '}
                  <button type="button" onClick={() => switchMode('register')}>
                    Create free workspace →
                  </button>
                </p>
              </form>
            )}

            {/* ── Register Form ── */}
            {mode === 'register' && (
              <form onSubmit={handleRegister} id="auth-register-form">
                <div className="auth-field">
                  <label htmlFor="reg-library">Library / Study Center Name *</label>
                  <div className="auth-input-wrap">
                    <Building2 size={15} className="auth-input-icon" />
                    <input
                      id="reg-library"
                      type="text"
                      placeholder="Takshashila Reading Lounge"
                      value={libraryName}
                      onChange={(e) => setLibraryName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="auth-field">
                  <label htmlFor="reg-owner">Your Full Name *</label>
                  <div className="auth-input-wrap">
                    <User size={15} className="auth-input-icon" />
                    <input
                      id="reg-owner"
                      type="text"
                      placeholder="Ramesh Patel"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="auth-field-row">
                  <div className="auth-field">
                    <label htmlFor="reg-phone">Phone Number *</label>
                    <div className="auth-input-wrap">
                      <Phone size={15} className="auth-input-icon" />
                      <input
                        id="reg-phone"
                        type="tel"
                        placeholder="+91 98765 43210"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="auth-field">
                    <label htmlFor="reg-city">City *</label>
                    <div className="auth-input-wrap">
                      <MapPin size={15} className="auth-input-icon" />
                      <input
                        id="reg-city"
                        type="text"
                        placeholder="Jaipur"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="auth-field">
                  <label htmlFor="reg-email">Email Address *</label>
                  <div className="auth-input-wrap">
                    <Mail size={15} className="auth-input-icon" />
                    <input
                      id="reg-email"
                      type="email"
                      placeholder="owner@library.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div className="auth-field">
                  <label htmlFor="reg-password">Create Password *</label>
                  <div className="auth-input-wrap">
                    <KeyRound size={15} className="auth-input-icon" />
                    <input
                      id="reg-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min. 8 characters"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      autoComplete="new-password"
                      minLength={6}
                      required
                    />
                    <button
                      type="button"
                      className="auth-eye-btn"
                      onClick={() => setShowPassword((v) => !v)}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {/* Perks checklist */}
                <div className="auth-perks">
                  {['Free forever plan', 'Instant desk & shift setup', 'No credit card required'].map((p) => (
                    <div key={p} className="auth-perk-item">
                      <CheckCircle2 size={13} color="var(--success)" />
                      <span>{p}</span>
                    </div>
                  ))}
                </div>

                <button
                  id="auth-register-submit"
                  type="submit"
                  className="auth-btn-primary"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="auth-spinner" />
                  ) : (
                    <>Launch My Library Workspace <ArrowRight size={16} /></>
                  )}
                </button>

                <p className="auth-switch-hint">
                  Already have a workspace?{' '}
                  <button type="button" onClick={() => switchMode('login')}>
                    Sign in →
                  </button>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>

      <AuthStyles />
    </div>
  );
}

// ─── Background accents ──────────────────────────────────────────────────────
function AuthOrbs() {
  return null;
}

// ─── Scoped styles ───────────────────────────────────────────────────────────
function AuthStyles() {
  return (
    <style>{`
      .auth-root {
        min-height: 100vh;
        background: #F7F5F2;
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: stretch;
      }

      /* ── Split layout ───────────────────────────────────────────────────── */
      .auth-layout {
        display: flex;
        width: 100%;
        min-height: 100vh;
        position: relative;
      }

      /* ── Left panel ─────────────────────────────────────────────────────── */
      .auth-left {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 64px 48px;
        background: #FFFFFF;
        border-right: 1px solid #E5E7EB;
      }

      .auth-left-content {
        max-width: 480px;
        width: 100%;
      }

      .auth-logo-row {
        display: flex;
        align-items: center;
        gap: 14px;
        margin-bottom: 48px;
      }

      .auth-brand-icon {
        width: 44px;
        height: 44px;
        border-radius: 6px;
        background: #C2410C;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #FFFFFF;
        flex-shrink: 0;
      }
      .auth-brand-icon.large {
        width: 48px;
        height: 48px;
        border-radius: 8px;
      }

      .auth-logo-title {
        font-family: 'Source Serif 4', Georgia, serif;
        font-size: 1.25rem;
        font-weight: 600;
        color: #1F2933;
      }
      .auth-logo-sub {
        font-size: 0.75rem;
        color: #5C5C5C;
        margin-top: 1px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 500;
      }

      .auth-headline h1 {
        font-family: 'Source Serif 4', Georgia, serif;
        font-size: clamp(1.8rem, 2.5vw, 2.35rem);
        font-weight: 600;
        line-height: 1.25;
        letter-spacing: -0.01em;
        color: #1F2933;
        margin-bottom: 16px;
      }
      .auth-gradient-text {
        color: #C2410C;
      }
      .auth-headline-sub {
        font-size: 0.95rem;
        color: #5C5C5C;
        line-height: 1.6;
        margin-bottom: 36px;
      }

      .auth-features {
        display: flex;
        flex-direction: column;
        gap: 18px;
        margin-bottom: 36px;
      }
      .auth-feature-item {
        display: flex;
        align-items: flex-start;
        gap: 12px;
      }
      .auth-feature-dot {
        width: 32px;
        height: 32px;
        border-radius: 6px;
        background: #FFF3E8;
        border: 1px solid #FED7AA;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #C2410C;
        flex-shrink: 0;
        margin-top: 2px;
      }
      .auth-feature-label {
        font-size: 0.875rem;
        font-weight: 600;
        color: #1F2933;
        margin-bottom: 2px;
      }
      .auth-feature-desc {
        font-size: 0.8125rem;
        color: #5C5C5C;
        line-height: 1.5;
      }

      .auth-proof {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: #F7F5F2;
        border: 1px solid #E5E7EB;
        border-radius: 8px;
      }
      .auth-proof-avatars {
        display: flex;
      }
      .auth-proof-avatar {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: #E5E7EB;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        margin-right: -6px;
        border: 2px solid #FFFFFF;
      }
      .auth-proof-text {
        font-size: 0.8125rem;
        color: #5C5C5C;
        padding-left: 8px;
      }
      .auth-proof-text strong {
        color: #1F2933;
      }

      /* ── Right panel / card ──────────────────────────────────────────────── */
      .auth-right {
        width: 500px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 48px 36px;
        background: #F7F5F2;
      }

      .auth-card {
        width: 100%;
        background: #FFFFFF;
        border: 1px solid #E5E7EB;
        border-radius: 8px;
        padding: 32px 28px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      }

      /* ── Tabs ────────────────────────────────────────────────────────────── */
      .auth-tabs {
        display: flex;
        background: #F7F5F2;
        border: 1px solid #E5E7EB;
        border-radius: 6px;
        padding: 3px;
        margin-bottom: 22px;
        position: relative;
      }
      .auth-tab {
        flex: 1;
        padding: 8px;
        font-size: 0.875rem;
        font-weight: 500;
        color: #5C5C5C;
        background: transparent;
        border: none;
        cursor: pointer;
        border-radius: 4px;
        transition: all 150ms ease;
        position: relative;
        z-index: 1;
        font-family: inherit;
      }
      .auth-tab.active {
        color: #C2410C;
        font-weight: 600;
      }
      .auth-tab-indicator {
        position: absolute;
        top: 3px;
        left: 3px;
        width: calc(50% - 3px);
        bottom: 3px;
        background: #FFFFFF;
        border-radius: 4px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        border: 1px solid #E5E7EB;
        transition: transform 200ms ease;
      }
      .auth-tab-indicator.right {
        transform: translateX(100%);
      }

      /* ── Google button wrapper ───────────────────────────────────────────── */
      .auth-google-wrapper {
        width: 100%;
        margin-bottom: 18px;
        border-radius: 6px;
        overflow: hidden;
      }
      .auth-google-wrapper > div,
      #auth-google-btn-container > div,
      #auth-google-btn-container iframe {
        width: 100% !important;
      }
      .auth-google-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 10px 16px;
        background: #F7F5F2;
        border: 1px solid #E5E7EB;
        border-radius: 6px;
        font-size: 0.875rem;
        color: #5C5C5C;
      }
      .auth-google-unconfigured {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 10px 16px;
        background: #F7F5F2;
        border: 1px solid #E5E7EB;
        border-radius: 6px;
        font-size: 0.875rem;
        color: #5C5C5C;
        cursor: not-allowed;
      }

      /* ── Divider ─────────────────────────────────────────────────────────── */
      .auth-divider {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 18px;
        font-size: 0.78rem;
      }
      .auth-divider::before,
      .auth-divider::after {
        content: '';
        flex: 1;
        height: 1px;
        background: #E5E7EB;
      }
      .auth-divider span {
        color: #767676;
        white-space: nowrap;
      }

      /* ── Alerts ──────────────────────────────────────────────────────────── */
      .auth-alert {
        padding: 10px 14px;
        border-radius: 6px;
        font-size: 0.83rem;
        margin-bottom: 16px;
        line-height: 1.5;
      }
      .auth-alert-error {
        background: #FEE2E2;
        border: 1px solid #FCA5A5;
        color: #991B1B;
      }
      .auth-alert-success {
        background: #DCFCE7;
        border: 1px solid #86EFAC;
        color: #166534;
      }

      /* ── Demo banner ─────────────────────────────────────────────────────── */
      .auth-demo-banner {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 9px 12px;
        margin-bottom: 16px;
        background: #FFF3E8;
        border: 1px solid #FED7AA;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.8125rem;
        color: #9A3412;
        font-family: inherit;
        transition: background 150ms ease, border-color 150ms ease;
        text-align: left;
      }
      .auth-demo-banner:hover {
        background: #FEE8D6;
        border-color: #FDBA74;
      }
      .auth-demo-banner span { flex: 1; }
      .auth-demo-banner strong { color: #C2410C; }

      /* ── Form fields ─────────────────────────────────────────────────────── */
      .auth-field {
        margin-bottom: 14px;
        flex: 1;
      }
      .auth-field label {
        display: block;
        font-size: 0.8125rem;
        font-weight: 600;
        color: #1F2933;
        margin-bottom: 5px;
      }
      .auth-field-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .auth-label-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 5px;
      }
      .auth-label-row label {
        margin-bottom: 0 !important;
      }
      .auth-forgot-link {
        font-size: 0.78rem;
        color: #C2410C;
        background: none;
        border: none;
        cursor: pointer;
        font-family: inherit;
        font-weight: 500;
        padding: 0;
      }
      .auth-forgot-link:hover {
        color: #9A3412;
        text-decoration: underline;
      }

      .auth-input-wrap {
        position: relative;
        display: flex;
        align-items: center;
      }
      .auth-input-icon {
        position: absolute;
        left: 12px;
        color: #5C5C5C;
        pointer-events: none;
        flex-shrink: 0;
      }
      .auth-input-wrap input {
        width: 100%;
        padding: 9px 12px 9px 36px;
        background: #FFFFFF;
        border: 1px solid #D1D5DB;
        border-radius: 6px;
        color: #1A1A1A;
        font-size: 0.9375rem;
        font-family: inherit;
        transition: border-color 150ms ease, box-shadow 150ms ease;
        outline: none;
      }
      .auth-input-wrap input::placeholder { color: #767676; }
      .auth-input-wrap input:focus {
        border-color: #C2410C;
        box-shadow: 0 0 0 3px rgba(194, 65, 12, 0.2);
      }

      .auth-eye-btn {
        position: absolute;
        right: 10px;
        background: none;
        border: none;
        cursor: pointer;
        color: #5C5C5C;
        display: flex;
        padding: 4px;
        transition: color 150ms ease;
      }
      .auth-eye-btn:hover { color: #1F2933; }

      /* ── Primary button ──────────────────────────────────────────────────── */
      .auth-btn-primary {
        width: 100%;
        padding: 10px 16px;
        background: #C2410C;
        border: 1px solid #C2410C;
        border-radius: 6px;
        color: #FFFFFF;
        font-size: 0.9375rem;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: background-color 150ms ease, border-color 150ms ease;
        margin-top: 6px;
      }
      .auth-btn-primary:hover:not(:disabled) {
        background: #9A3412;
        border-color: #9A3412;
      }
      .auth-btn-primary:focus-visible {
        outline: 2px solid #C2410C;
        outline-offset: 2px;
      }
      .auth-btn-primary:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      /* ── Perks ───────────────────────────────────────────────────────────── */
      .auth-perks {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 14px;
        margin-top: -2px;
      }
      .auth-perk-item {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 0.78rem;
        color: #5C5C5C;
      }

      /* ── Switch hint ─────────────────────────────────────────────────────── */
      .auth-switch-hint {
        text-align: center;
        font-size: 0.8125rem;
        color: #5C5C5C;
        margin-top: 16px;
      }
      .auth-switch-hint button {
        background: none;
        border: none;
        color: #C2410C;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
        font-size: 0.8125rem;
        padding: 0;
      }
      .auth-switch-hint button:hover {
        color: #9A3412;
        text-decoration: underline;
      }

      /* ── Spinner ─────────────────────────────────────────────────────────── */
      .auth-spinner {
        width: 18px;
        height: 18px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: #FFFFFF;
        border-radius: 50%;
        animation: authSpin 0.65s linear infinite;
        display: inline-block;
      }
      .auth-spinner.dark {
        border: 2px solid rgba(0, 0, 0, 0.15);
        border-top-color: #1F2933;
      }
      @keyframes authSpin {
        to { transform: rotate(360deg); }
      }

      /* ── Extra info modal overlay ────────────────────────────────────────── */
      .auth-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(31, 41, 51, 0.55);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        z-index: 100;
      }
      .auth-extra-card {
        width: 100%;
        max-width: 440px;
        background: #FFFFFF;
        border: 1px solid #E5E7EB;
        border-radius: 8px;
        padding: 32px 28px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
      }
      .auth-extra-header {
        text-align: center;
        margin-bottom: 24px;
      }
      .auth-extra-header .auth-brand-icon {
        margin: 0 auto 12px;
      }
      .auth-extra-header h2 {
        font-family: 'Source Serif 4', Georgia, serif;
        font-size: 1.35rem;
        color: #1F2933;
        margin-bottom: 6px;
      }
      .auth-extra-header p {
        font-size: 0.8125rem;
        color: #5C5C5C;
      }
      .auth-extra-form .auth-field {
        margin-bottom: 14px;
      }
      .auth-extra-form .auth-field-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-bottom: 14px;
      }

      /* ── Responsive ──────────────────────────────────────────────────────── */
      @media (max-width: 900px) {
        .auth-left { display: none; }
        .auth-right {
          width: 100%;
          padding: 32px 16px;
        }
      }
      @media (max-width: 480px) {
        .auth-field-row {
          grid-template-columns: 1fr;
        }
        .auth-card { padding: 24px 16px; }
      }
    `}</style>
  );
}
