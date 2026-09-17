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
  { icon: BarChart3, label: 'Fee Billing & Receipts', desc: 'Collect dues, send SMS reminders, print GST receipts.' },
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
        // New user — collect extra library info
        setGooglePendingCred(response.credential);
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
                The all-in-one platform for self-study centers — seats, students, fees, and SMS reminders, unified.
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
                <button
                  type="button"
                  className="auth-demo-banner"
                  onClick={fillDemo}
                  id="auth-demo-fill"
                >
                  <Sparkles size={14} color="var(--primary)" />
                  <span>Auto-fill <strong>Apex Library</strong> demo credentials</span>
                  <ChevronRight size={14} />
                </button>

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

// ─── Animated background orbs ────────────────────────────────────────────────
function AuthOrbs() {
  return (
    <>
      <FloatingOrb style={{ width: 500, height: 500, top: '-120px', left: '-180px', background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)' }} />
      <FloatingOrb style={{ width: 400, height: 400, bottom: '-100px', right: '-120px', background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)' }} />
      <FloatingOrb style={{ width: 300, height: 300, top: '40%', left: '40%', background: 'radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)' }} />
    </>
  );
}

// ─── Scoped styles ───────────────────────────────────────────────────────────
function AuthStyles() {
  return (
    <style>{`
      .auth-root {
        min-height: 100vh;
        background: #090d16;
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: stretch;
      }

      .auth-orb {
        position: fixed;
        border-radius: 50%;
        pointer-events: none;
        z-index: 0;
        animation: authOrbFloat 8s ease-in-out infinite alternate;
      }

      @keyframes authOrbFloat {
        from { transform: translateY(0px) scale(1); }
        to   { transform: translateY(20px) scale(1.04); }
      }

      /* ── Split layout ───────────────────────────────────────────────────── */
      .auth-layout {
        display: flex;
        width: 100%;
        min-height: 100vh;
        position: relative;
        z-index: 1;
      }

      /* ── Left panel ─────────────────────────────────────────────────────── */
      .auth-left {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 60px 48px;
        background: linear-gradient(145deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.06) 50%, transparent 100%);
        border-right: 1px solid rgba(255,255,255,0.06);
      }

      .auth-left-content {
        max-width: 460px;
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
        border-radius: 12px;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        box-shadow: 0 4px 20px rgba(99,102,241,0.4);
        flex-shrink: 0;
      }
      .auth-brand-icon.large {
        width: 52px;
        height: 52px;
        border-radius: 14px;
      }

      .auth-logo-title {
        font-family: 'Outfit', sans-serif;
        font-size: 1.3rem;
        font-weight: 800;
        color: #fff;
        letter-spacing: -0.02em;
      }
      .auth-logo-sub {
        font-size: 0.75rem;
        color: #64748b;
        margin-top: 1px;
      }

      .auth-headline h1 {
        font-family: 'Outfit', sans-serif;
        font-size: clamp(1.8rem, 3vw, 2.6rem);
        font-weight: 800;
        line-height: 1.2;
        letter-spacing: -0.03em;
        color: #fff;
        margin-bottom: 16px;
      }
      .auth-gradient-text {
        background: linear-gradient(135deg, #818cf8 0%, #c084fc 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .auth-headline-sub {
        font-size: 0.95rem;
        color: #94a3b8;
        line-height: 1.65;
        margin-bottom: 40px;
      }

      .auth-features {
        display: flex;
        flex-direction: column;
        gap: 20px;
        margin-bottom: 40px;
      }
      .auth-feature-item {
        display: flex;
        align-items: flex-start;
        gap: 14px;
      }
      .auth-feature-dot {
        width: 30px;
        height: 30px;
        border-radius: 8px;
        background: rgba(99,102,241,0.15);
        border: 1px solid rgba(99,102,241,0.25);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #818cf8;
        flex-shrink: 0;
        margin-top: 1px;
      }
      .auth-feature-label {
        font-size: 0.88rem;
        font-weight: 600;
        color: #e2e8f0;
        margin-bottom: 2px;
      }
      .auth-feature-desc {
        font-size: 0.8rem;
        color: #64748b;
        line-height: 1.5;
      }

      .auth-proof {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 18px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 12px;
      }
      .auth-proof-avatars {
        display: flex;
      }
      .auth-proof-avatar {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: rgba(99,102,241,0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        margin-right: -8px;
        border: 2px solid #090d16;
      }
      .auth-proof-text {
        font-size: 0.8rem;
        color: #94a3b8;
        padding-left: 8px;
      }
      .auth-proof-text strong {
        color: #e2e8f0;
      }

      /* ── Right panel / card ──────────────────────────────────────────────── */
      .auth-right {
        width: 480px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px 32px;
      }

      .auth-card {
        width: 100%;
        background: rgba(18, 26, 44, 0.85);
        border: 1px solid rgba(255,255,255,0.09);
        border-radius: 20px;
        padding: 32px 28px;
        backdrop-filter: blur(20px);
        box-shadow: 0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04);
      }

      /* ── Tabs ────────────────────────────────────────────────────────────── */
      .auth-tabs {
        display: flex;
        background: rgba(255,255,255,0.04);
        border-radius: 10px;
        padding: 4px;
        margin-bottom: 22px;
        position: relative;
      }
      .auth-tab {
        flex: 1;
        padding: 9px;
        font-size: 0.85rem;
        font-weight: 600;
        color: #64748b;
        background: transparent;
        border: none;
        cursor: pointer;
        border-radius: 7px;
        transition: color 0.2s;
        position: relative;
        z-index: 1;
        font-family: 'Inter', sans-serif;
      }
      .auth-tab.active {
        color: #fff;
      }
      .auth-tab-indicator {
        position: absolute;
        top: 4px;
        left: 4px;
        width: calc(50% - 4px);
        bottom: 4px;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        border-radius: 7px;
        transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        box-shadow: 0 2px 12px rgba(99,102,241,0.4);
      }
      .auth-tab-indicator.right {
        transform: translateX(100%);
      }

      /* ── Google button wrapper ───────────────────────────────────────────── */
      .auth-google-wrapper {
        width: 100%;
        margin-bottom: 18px;
        border-radius: 10px;
        overflow: hidden;
      }
      /* Make Google's rendered iframe/button fill full width */
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
        padding: 11px 16px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.09);
        border-radius: 10px;
        font-size: 0.85rem;
        color: #64748b;
      }
      .auth-google-unconfigured {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 11px 16px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 10px;
        font-size: 0.85rem;
        color: #475569;
        cursor: not-allowed;
      }

      /* ── Divider ─────────────────────────────────────────────────────────── */
      .auth-divider {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 18px;
        color: #334155;
        font-size: 0.78rem;
      }
      .auth-divider::before,
      .auth-divider::after {
        content: '';
        flex: 1;
        height: 1px;
        background: rgba(255,255,255,0.07);
      }
      .auth-divider span {
        color: #475569;
        white-space: nowrap;
      }

      /* ── Alerts ──────────────────────────────────────────────────────────── */
      .auth-alert {
        padding: 10px 14px;
        border-radius: 8px;
        font-size: 0.83rem;
        margin-bottom: 16px;
        line-height: 1.5;
      }
      .auth-alert-error {
        background: rgba(239,68,68,0.12);
        border: 1px solid rgba(239,68,68,0.3);
        color: #fca5a5;
      }
      .auth-alert-success {
        background: rgba(16,185,129,0.12);
        border: 1px solid rgba(16,185,129,0.3);
        color: #6ee7b7;
      }

      /* ── Demo banner ─────────────────────────────────────────────────────── */
      .auth-demo-banner {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 9px 12px;
        margin-bottom: 16px;
        background: linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.1));
        border: 1px solid rgba(99,102,241,0.3);
        border-radius: 8px;
        cursor: pointer;
        font-size: 0.8rem;
        color: #c7d2fe;
        font-family: 'Inter', sans-serif;
        transition: all 0.2s;
        text-align: left;
      }
      .auth-demo-banner:hover {
        background: linear-gradient(135deg, rgba(99,102,241,0.18), rgba(139,92,246,0.15));
        border-color: rgba(99,102,241,0.5);
      }
      .auth-demo-banner span { flex: 1; }
      .auth-demo-banner strong { color: #a5b4fc; }

      /* ── Form fields ─────────────────────────────────────────────────────── */
      .auth-field {
        margin-bottom: 14px;
        flex: 1;
      }
      .auth-field label {
        display: block;
        font-size: 0.78rem;
        font-weight: 600;
        color: #94a3b8;
        margin-bottom: 6px;
        letter-spacing: 0.02em;
        text-transform: uppercase;
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
        margin-bottom: 6px;
      }
      .auth-label-row label {
        margin-bottom: 0 !important;
      }
      .auth-forgot-link {
        font-size: 0.75rem;
        color: #6366f1;
        background: none;
        border: none;
        cursor: pointer;
        font-family: 'Inter', sans-serif;
        font-weight: 500;
        padding: 0;
      }
      .auth-forgot-link:hover { color: #818cf8; }

      .auth-input-wrap {
        position: relative;
        display: flex;
        align-items: center;
      }
      .auth-input-icon {
        position: absolute;
        left: 12px;
        color: #475569;
        pointer-events: none;
        flex-shrink: 0;
      }
      .auth-input-wrap input {
        width: 100%;
        padding: 10px 12px 10px 36px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.09);
        border-radius: 9px;
        color: #f8fafc;
        font-size: 0.88rem;
        font-family: 'Inter', sans-serif;
        transition: all 0.2s;
        outline: none;
      }
      .auth-input-wrap input::placeholder { color: #334155; }
      .auth-input-wrap input:focus {
        border-color: rgba(99,102,241,0.5);
        background: rgba(99,102,241,0.06);
        box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
      }

      .auth-eye-btn {
        position: absolute;
        right: 10px;
        background: none;
        border: none;
        cursor: pointer;
        color: #475569;
        display: flex;
        padding: 4px;
        transition: color 0.15s;
      }
      .auth-eye-btn:hover { color: #94a3b8; }

      /* ── Primary button ──────────────────────────────────────────────────── */
      .auth-btn-primary {
        width: 100%;
        padding: 12px;
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
        border: none;
        border-radius: 10px;
        color: white;
        font-size: 0.9rem;
        font-weight: 700;
        cursor: pointer;
        font-family: 'Inter', sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: all 0.2s;
        box-shadow: 0 4px 20px rgba(99,102,241,0.35);
        margin-top: 4px;
      }
      .auth-btn-primary:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 8px 28px rgba(99,102,241,0.5);
        filter: brightness(1.08);
      }
      .auth-btn-primary:disabled {
        opacity: 0.65;
        cursor: not-allowed;
        transform: none;
      }

      /* ── Perks ───────────────────────────────────────────────────────────── */
      .auth-perks {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 14px;
        margin-top: -4px;
      }
      .auth-perk-item {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 0.76rem;
        color: #64748b;
      }

      /* ── Switch hint ─────────────────────────────────────────────────────── */
      .auth-switch-hint {
        text-align: center;
        font-size: 0.82rem;
        color: #475569;
        margin-top: 16px;
      }
      .auth-switch-hint button {
        background: none;
        border: none;
        color: #818cf8;
        font-weight: 600;
        cursor: pointer;
        font-family: 'Inter', sans-serif;
        font-size: 0.82rem;
        padding: 0;
      }
      .auth-switch-hint button:hover { color: #a5b4fc; }

      /* ── Spinner ─────────────────────────────────────────────────────────── */
      .auth-spinner {
        width: 18px;
        height: 18px;
        border: 2px solid rgba(255,255,255,0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: authSpin 0.65s linear infinite;
        display: inline-block;
      }
      .auth-spinner.dark {
        border: 2px solid rgba(0,0,0,0.15);
        border-top-color: #334155;
      }
      @keyframes authSpin {
        to { transform: rotate(360deg); }
      }

      /* ── Extra info modal overlay ────────────────────────────────────────── */
      .auth-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(9,13,22,0.85);
        backdrop-filter: blur(12px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        z-index: 100;
      }
      .auth-extra-card {
        width: 100%;
        max-width: 440px;
        background: rgba(18,26,44,0.95);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 20px;
        padding: 36px 32px;
        box-shadow: 0 32px 80px rgba(0,0,0,0.7);
      }
      .auth-extra-header {
        text-align: center;
        margin-bottom: 28px;
      }
      .auth-extra-header .auth-brand-icon {
        margin: 0 auto 14px;
      }
      .auth-extra-header h2 {
        font-family: 'Outfit', sans-serif;
        font-size: 1.5rem;
        color: #fff;
        margin-bottom: 6px;
      }
      .auth-extra-header p {
        font-size: 0.85rem;
        color: #64748b;
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
          padding: 32px 20px;
        }
      }
      @media (max-width: 480px) {
        .auth-field-row {
          grid-template-columns: 1fr;
        }
        .auth-card { padding: 24px 18px; }
      }
    `}</style>
  );
}
