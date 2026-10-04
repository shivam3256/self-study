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
  ShieldCheck,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { api, setAuthToken, setStoredUser } from '../api';

// ─── Google Client ID ────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// ─── Feature highlights shown on the left panel ─────────────────────────────
const FEATURES = [
  { icon: Users, label: 'Student Management', desc: 'Enroll, track, and manage every student effortlessly.' },
  { icon: BookOpen, label: 'Desk & Shift Allocation', desc: 'Real-time visual seat map with multi-shift support.' },
  { icon: BarChart3, label: 'Fee Billing & Receipts', desc: 'Collect dues, send WhatsApp reminders, print GST receipts.' },
  { icon: Shield, label: 'Multi-tenant SaaS', desc: 'Isolated workspace for every library owner.' },
];

export default function Auth({ onLoginSuccess }) {
  const [verifyEmail, setVerifyEmail] = useState(() => sessionStorage.getItem('study_pending_verify_email') || '');
  const [mode, setMode] = useState(() => sessionStorage.getItem('study_pending_verify_email') ? 'verify' : 'login');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
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

  // OTP Digits (6 individual boxes)
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const otpInputsRef = useRef([]);

  // Google new-user extra info modal
  const [googlePendingCred, setGooglePendingCred] = useState(null); // stores credential JWT
  const [googleNewUserInfo, setGoogleNewUserInfo] = useState(null); // { email, name } from Google
  const [googleExtraLibrary, setGoogleExtraLibrary] = useState('');
  const [googleExtraPhone, setGoogleExtraPhone] = useState('');
  const [googleExtraAddress, setGoogleExtraAddress] = useState('');
  const [googleExtraCity, setGoogleExtraCity] = useState('');
  const [googleExtraAdditionalEmail, setGoogleExtraAdditionalEmail] = useState('');

  const googleButtonRef = useRef(null);
  const gsiReady = useRef(false);

  // ─── Forgot / Reset password state ──────────────────────────────────────
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // ─── Resend Cooldown Countdown (verify + reset modes) ──────────────────
  useEffect(() => {
    if ((mode !== 'verify' && mode !== 'reset') || resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [mode, resendCooldown]);

  // ─── Focus first empty OTP box when entering verify or reset mode ───────
  useEffect(() => {
    if (mode === 'verify' || mode === 'reset') {
      const firstEmpty = otpDigits.findIndex((d) => !d);
      const targetIdx = firstEmpty !== -1 ? firstEmpty : 0;
      setTimeout(() => {
        otpInputsRef.current[targetIdx]?.focus();
      }, 50);
    }
  }, [mode]);

  // ─── Google credential callback ──────────────────────────────────────────
  const handleGoogleCredential = async (response) => {
    setGoogleLoading(true);
    setError('');
    try {
      const res = await api.auth.googleAuth(response.credential);

      if (res.is_new_user) {
        setGooglePendingCred(response.credential);
        setGoogleNewUserInfo({ email: res.email, name: res.name });
        setGoogleLoading(false);
        return;
      }

      sessionStorage.removeItem('study_pending_verify_email');
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
    if (!GOOGLE_CLIENT_ID || mode === 'verify') return;
    let cancelled = false;

    const renderGsi = () => {
      if (cancelled || !googleButtonRef.current || !window.google?.accounts?.id) return;
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleCredential,
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: googleButtonRef.current.offsetWidth || 360,
        });
      } catch (err) {
        console.warn('GSI render error:', err);
      }
    };

    if (window.google?.accounts?.id) {
      renderGsi();
    } else {
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval);
          renderGsi();
        }
      }, 150);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }
  }, [GOOGLE_CLIENT_ID, mode]);

  // ─── Complete Google registration with extra info ─────────────────────────
  const handleGoogleExtraSubmit = async (e) => {
    e.preventDefault();
    setGoogleLoading(true);
    setError('');
    try {
      const res = await api.auth.googleAuth(googlePendingCred, {
        library_name: googleExtraLibrary,
        phone: googleExtraPhone,
        address: googleExtraAddress,
        city: googleExtraCity,
        additional_email: googleExtraAdditionalEmail || undefined,
      });
      if (res.is_new_user) {
        setError('Please fill in all required details.');
        return;
      }
      sessionStorage.removeItem('study_pending_verify_email');
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
    setSuccess('');
    const cleanEmail = email.trim().toLowerCase();
    try {
      const res = await api.auth.login(cleanEmail, password);
      sessionStorage.removeItem('study_pending_verify_email');
      setAuthToken(res.access_token);
      setStoredUser(res.user, res.tenant);
      onLoginSuccess(res.user, res.tenant);
    } catch (err) {
      if (err.code === 'EMAIL_NOT_VERIFIED' || err.detail?.code === 'EMAIL_NOT_VERIFIED') {
        const pending = err.detail?.email || cleanEmail;
        setVerifyEmail(pending);
        sessionStorage.setItem('study_pending_verify_email', pending);
        setResendCooldown(60);
        setMode('verify');
        setOtpDigits(['', '', '', '', '', '']);
        setSuccess('Your email address is not verified yet. We sent a verification code to your email.');
      } else {
        setError(err.message || 'Invalid email or password.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Email register (Step 1 -> OTP screen) ────────────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    const cleanEmail = regEmail.trim().toLowerCase();
    try {
      const res = await api.auth.signup({
        library_name: libraryName,
        owner_name: ownerName,
        email: cleanEmail,
        phone,
        city,
        password: regPassword,
      });
      setVerifyEmail(cleanEmail);
      sessionStorage.setItem('study_pending_verify_email', cleanEmail);
      setResendCooldown(res.resend_cooldown_seconds || 60);
      setMode('verify');
      setOtpDigits(['', '', '', '', '', '']);
      setSuccess(`We've sent a 6-digit verification code to ${cleanEmail}`);
    } catch (err) {
      setError(err.message || 'Registration failed. Please check your details.');
    } finally {
      setLoading(false);
    }
  };

  // ─── OTP Digit Handlers ───────────────────────────────────────────────────
  const handleDigitChange = (index, value) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = digit;
    setOtpDigits(newDigits);
    setError('');

    if (digit && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }

    if (newDigits.every((d) => d !== '')) {
      if (mode === 'reset') {
        handleResetPassword(newDigits.join(''));
      } else {
        handleVerifyCode(newDigits.join(''));
      }
    }
  };

  const handleDigitKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0) {
        otpInputsRef.current[index - 1]?.focus();
        const newDigits = [...otpDigits];
        newDigits[index - 1] = '';
        setOtpDigits(newDigits);
      } else {
        const newDigits = [...otpDigits];
        newDigits[index] = '';
        setOtpDigits(newDigits);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').trim();
    const digits = pasted.replace(/\D/g, '').slice(0, 6).split('');
    if (digits.length === 0) return;

    const newDigits = [...otpDigits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = digits[i] || '';
    }
    setOtpDigits(newDigits);
    setError('');

    const nextEmpty = newDigits.findIndex((d) => !d);
    if (nextEmpty !== -1) {
      otpInputsRef.current[nextEmpty]?.focus();
    } else {
      otpInputsRef.current[5]?.focus();
    }

    if (newDigits.every((d) => d !== '')) {
      if (mode === 'reset') {
        handleResetPassword(newDigits.join(''));
      } else {
        handleVerifyCode(newDigits.join(''));
      }
    }
  };

  // ─── Verify Email Submit (Step 2) ─────────────────────────────────────────
  const handleVerifyCode = async (codeOverride) => {
    const code = codeOverride || otpDigits.join('');
    if (code.length !== 6) {
      setError('Please enter all 6 digits of the verification code.');
      return;
    }

    setVerifyLoading(true);
    setError('');
    try {
      const res = await api.auth.verifyEmail(verifyEmail, code);
      sessionStorage.removeItem('study_pending_verify_email');
      setAuthToken(res.access_token);
      setStoredUser(res.user, res.tenant);
      onLoginSuccess(res.user, res.tenant);
    } catch (err) {
      setError(err.message || 'Verification failed. Please check your code.');
    } finally {
      setVerifyLoading(false);
    }
  };

  // ─── Resend Verification Code ─────────────────────────────────────────────
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || verifyLoading) return;
    setVerifyLoading(true);
    setError('');
    try {
      const res = await api.auth.resendOtp(verifyEmail);
      setResendCooldown(res.resend_cooldown_seconds || 60);
      setSuccess('A fresh verification code has been sent to your email.');
      setOtpDigits(['', '', '', '', '', '']);
      otpInputsRef.current[0]?.focus();
    } catch (err) {
      setError(err.message || 'Failed to resend code. Please try again.');
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleBackFromVerify = () => {
    sessionStorage.removeItem('study_pending_verify_email');
    setMode('register');
    setError('');
    setSuccess('');
    setOtpDigits(['', '', '', '', '', '']);
  };

  const fillDemo = () => {
    setEmail('owner@apexlibrary.com');
    setPassword('admin123');
    setMode('login');
    setError('');
    setSuccess('');
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setSuccess('');
  };

  // ─── Forgot Password: Step 1 — email submission ───────────────────────
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    const cleanEmail = forgotEmail.trim().toLowerCase();
    try {
      const res = await api.auth.forgotPassword(cleanEmail);
      // Store the email so the reset screen can use it
      setVerifyEmail(cleanEmail);
      setResendCooldown(60);
      setOtpDigits(['', '', '', '', '', '']);
      setResetNewPassword('');
      setResetConfirmPassword('');
      setMode('reset');
      setSuccess(`If an account exists for ${cleanEmail}, a 6-digit code was sent.`);
    } catch (err) {
      // Even on error, show a generic message to avoid enumeration
      setSuccess(`If an account exists for ${cleanEmail}, a 6-digit code was sent.`);
    } finally {
      setLoading(false);
    }
  };

  // ─── Forgot Password: Step 2 — code + new password submission ────────────
  const handleResetPassword = async (codeOverride) => {
    const code = codeOverride || otpDigits.join('');
    if (code.length !== 6) {
      setError('Please enter all 6 digits of the verification code.');
      return;
    }
    if (resetNewPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setVerifyLoading(true);
    setError('');
    try {
      await api.auth.resetPassword(verifyEmail, code, resetNewPassword);
      // Clear all reset state and go back to login with a success message
      setMode('login');
      setOtpDigits(['', '', '', '', '', '']);
      setResetNewPassword('');
      setResetConfirmPassword('');
      setForgotEmail('');
      setVerifyEmail('');
      setSuccess('Password reset successfully! You can now sign in with your new password.');
    } catch (err) {
      setError(err.message || 'Reset failed. Please check your code and try again.');
      setOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => otpInputsRef.current[0]?.focus(), 50);
    } finally {
      setVerifyLoading(false);
    }
  };

  // ─── Resend reset OTP ─────────────────────────────────────────────────────
  const handleResendForgotOtp = async () => {
    if (resendCooldown > 0 || verifyLoading) return;
    setVerifyLoading(true);
    setError('');
    try {
      await api.auth.forgotPassword(verifyEmail);
      setResendCooldown(60);
      setSuccess('A fresh code has been sent to your email.');
      setOtpDigits(['', '', '', '', '', '']);
      otpInputsRef.current[0]?.focus();
    } catch (err) {
      setError(err.message || 'Failed to resend code. Please try again.');
    } finally {
      setVerifyLoading(false);
    }
  };

  // ─── Google Extra Info Modal (new-user onboarding) ───────────────────────
  if (googlePendingCred) {
    return (
      <div className="auth-root">
        <div className="auth-modal-overlay">
          <div className="auth-extra-card">
            <div className="auth-extra-header">
              <div className="auth-brand-icon">
                <Building2 size={24} />
              </div>
              <h2>Set Up Your Workspace</h2>
              {googleNewUserInfo?.email && (
                <div className="auth-google-id-badge">
                  <span className="auth-google-id-avatar">
                    {(googleNewUserInfo.name || googleNewUserInfo.email)[0].toUpperCase()}
                  </span>
                  <span>{googleNewUserInfo.email}</span>
                </div>
              )}
              <p>Tell us about your study center to complete your account setup</p>
            </div>

            {error && <div className="auth-alert auth-alert-error">{error}</div>}

            <form onSubmit={handleGoogleExtraSubmit} className="auth-extra-form">
              <div className="auth-field">
                <label>Library / Study Center Name *</label>
                <div className="auth-input-wrap">
                  <Building2 size={16} className="auth-input-icon" />
                  <input
                    id="gextra-library"
                    type="text"
                    placeholder="e.g. Takshashila Reading Lounge"
                    value={googleExtraLibrary}
                    onChange={(e) => setGoogleExtraLibrary(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
              </div>

              <div className="auth-field-row">
                <div className="auth-field">
                  <label>Mobile Number *</label>
                  <div className="auth-input-wrap">
                    <Phone size={16} className="auth-input-icon" />
                    <input
                      id="gextra-phone"
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={googleExtraPhone}
                      onChange={(e) => setGoogleExtraPhone(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="auth-field">
                  <label>City *</label>
                  <div className="auth-input-wrap">
                    <MapPin size={16} className="auth-input-icon" />
                    <input
                      id="gextra-city"
                      type="text"
                      placeholder="e.g. Jaipur"
                      value={googleExtraCity}
                      onChange={(e) => setGoogleExtraCity(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="auth-field">
                <label>Address / Locality</label>
                <div className="auth-input-wrap">
                  <MapPin size={16} className="auth-input-icon" />
                  <input
                    id="gextra-address"
                    type="text"
                    placeholder="Plot no., Street, Landmark"
                    value={googleExtraAddress}
                    onChange={(e) => setGoogleExtraAddress(e.target.value)}
                  />
                </div>
              </div>

              <div className="auth-field">
                <label>Additional Contact Email</label>
                <div className="auth-input-wrap">
                  <Mail size={16} className="auth-input-icon" />
                  <input
                    id="gextra-additional-email"
                    type="email"
                    placeholder="billing@mylibrary.com (optional)"
                    value={googleExtraAdditionalEmail}
                    onChange={(e) => setGoogleExtraAdditionalEmail(e.target.value)}
                  />
                </div>
              </div>

              <button
                id="gextra-submit"
                type="submit"
                className="auth-btn-primary"
                disabled={googleLoading}
                style={{ marginTop: 8 }}
              >
                {googleLoading ? (
                  <span className="auth-spinner" />
                ) : (
                  <>Launch My Workspace <ArrowRight size={16} /></>
                )}
              </button>

              <p className="auth-switch-hint" style={{ marginTop: 12 }}>
                Wrong account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setGooglePendingCred(null);
                    setGoogleNewUserInfo(null);
                    setGoogleExtraLibrary('');
                    setGoogleExtraPhone('');
                    setGoogleExtraAddress('');
                    setGoogleExtraCity('');
                    setGoogleExtraAdditionalEmail('');
                    setError('');
                  }}
                >
                  Go back
                </button>
              </p>
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
            {/* Tab switcher (Visible only for Login and Register) */}
            {mode !== 'verify' && mode !== 'forgot' && mode !== 'reset' && (
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
            )}

            {/* Google Sign-In button (only shown for login/register) */}
            {mode !== 'verify' && mode !== 'forgot' && mode !== 'reset' && (
              <>
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
              </>
            )}

            {/* Error Banner */}
            {error && (
              <div className="auth-alert auth-alert-error" id="auth-error-banner">
                {error}
              </div>
            )}

            {/* Success Banner */}
            {success && (
              <div className="auth-alert auth-alert-success" id="auth-success-banner">
                {success}
              </div>
            )}

            {/* ── Login Form ── */}
            {mode === 'login' && (
              <form onSubmit={handleLogin} id="auth-login-form">
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
                    <button
                      type="button"
                      className="auth-forgot-link"
                      tabIndex={-1}
                      id="auth-forgot-link"
                      onClick={() => {
                        setForgotEmail(email || '');
                        setError('');
                        setSuccess('');
                        setMode('forgot');
                      }}
                    >
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

            {/* ── Verify Email Screen (Step 2 of signup / login re-verify) ── */}
            {mode === 'verify' && (
              <div className="auth-verify-view" id="auth-verify-screen">
                <div className="auth-verify-header">
                  <div className="auth-brand-icon" style={{ margin: '0 auto 16px' }}>
                    <ShieldCheck size={24} />
                  </div>
                  <h2 className="auth-verify-title">Verify your email</h2>
                  <p className="auth-verify-sub">
                    We sent a 6-digit verification code to
                    <br />
                    <span className="auth-verify-email-badge">{verifyEmail}</span>
                  </p>
                </div>

                <form onSubmit={(e) => { e.preventDefault(); handleVerifyCode(); }}>
                  {/* 6 Digit Input Boxes */}
                  <div className="auth-otp-row">
                    {otpDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => (otpInputsRef.current[idx] = el)}
                        id={`otp-digit-${idx}`}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                        value={digit}
                        onChange={(e) => handleDigitChange(idx, e.target.value)}
                        onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                        onPaste={handleOtpPaste}
                        className={`auth-otp-input ${digit ? 'filled' : ''}`}
                        disabled={verifyLoading}
                        required
                      />
                    ))}
                  </div>

                  <p className="auth-otp-hint">
                    Enter the 6-digit code or paste it directly. Code expires in 10 minutes.
                  </p>

                  <button
                    id="auth-verify-submit"
                    type="submit"
                    className="auth-btn-primary"
                    disabled={verifyLoading || otpDigits.join('').length !== 6}
                    style={{ marginTop: 20 }}
                  >
                    {verifyLoading ? (
                      <span className="auth-spinner" />
                    ) : (
                      <>Verify &amp; Continue <ArrowRight size={16} /></>
                    )}
                  </button>

                  <div className="auth-resend-row">
                    <span style={{ color: '#6B7280' }}>Didn't get the code?</span>
                    <button
                      id="auth-resend-btn"
                      type="button"
                      className="auth-link-btn"
                      onClick={handleResendOtp}
                      disabled={verifyLoading || resendCooldown > 0}
                    >
                      {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
                    </button>
                  </div>

                  <div className="auth-verify-footer">
                    <button
                      id="auth-back-to-signup"
                      type="button"
                      className="auth-back-link"
                      onClick={handleBackFromVerify}
                    >
                      Wrong email? Go back
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ── Forgot Password Screen ── */}
            {mode === 'forgot' && (
              <div className="auth-verify-view" id="auth-forgot-screen">
                <div className="auth-verify-header">
                  <div className="auth-brand-icon" style={{ margin: '0 auto 16px', background: '#1D4ED8' }}>
                    <Lock size={22} />
                  </div>
                  <h2 className="auth-verify-title">Forgot your password?</h2>
                  <p className="auth-verify-sub">
                    Enter your account email and we'll send you a 6-digit reset code.
                  </p>
                </div>

                <form onSubmit={handleForgotPassword} id="auth-forgot-form">
                  <div className="auth-field" style={{ marginBottom: 20 }}>
                    <label htmlFor="forgot-email">Email Address</label>
                    <div className="auth-input-wrap">
                      <Mail size={15} className="auth-input-icon" />
                      <input
                        id="forgot-email"
                        type="email"
                        placeholder="owner@library.com"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        autoComplete="email"
                        autoFocus
                        required
                      />
                    </div>
                  </div>

                  <button
                    id="auth-forgot-submit"
                    type="submit"
                    className="auth-btn-primary"
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="auth-spinner" />
                    ) : (
                      <>Send Reset Code <ArrowRight size={16} /></>
                    )}
                  </button>

                  <div className="auth-verify-footer">
                    <button
                      id="auth-back-to-login-from-forgot"
                      type="button"
                      className="auth-back-link"
                      onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
                    >
                      ← Back to Sign In
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ── Reset Password Screen ── */}
            {mode === 'reset' && (
              <div className="auth-verify-view" id="auth-reset-screen">
                <div className="auth-verify-header">
                  <div className="auth-brand-icon" style={{ margin: '0 auto 16px', background: '#1D4ED8' }}>
                    <Lock size={22} />
                  </div>
                  <h2 className="auth-verify-title">Reset your password</h2>
                  <p className="auth-verify-sub">
                    Enter the 6-digit code sent to<br />
                    <span className="auth-verify-email-badge">{verifyEmail}</span>
                    <br />then choose a new password.
                  </p>
                </div>

                <form onSubmit={(e) => { e.preventDefault(); handleResetPassword(); }} id="auth-reset-form">
                  {/* 6-digit OTP boxes — reuse existing component */}
                  <div className="auth-otp-row">
                    {otpDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => (otpInputsRef.current[idx] = el)}
                        id={`reset-otp-digit-${idx}`}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                        value={digit}
                        onChange={(e) => handleDigitChange(idx, e.target.value)}
                        onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                        onPaste={handleOtpPaste}
                        className={`auth-otp-input ${digit ? 'filled' : ''}`}
                        disabled={verifyLoading}
                      />
                    ))}
                  </div>

                  <p className="auth-otp-hint">Enter or paste the 6-digit code. Expires in 10 minutes.</p>

                  {/* New Password */}
                  <div className="auth-field" style={{ marginTop: 16 }}>
                    <label htmlFor="reset-new-password">New Password</label>
                    <div className="auth-input-wrap">
                      <KeyRound size={15} className="auth-input-icon" />
                      <input
                        id="reset-new-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Min. 8 characters"
                        value={resetNewPassword}
                        onChange={(e) => setResetNewPassword(e.target.value)}
                        autoComplete="new-password"
                        minLength={8}
                        required
                        disabled={verifyLoading}
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

                  {/* Confirm Password */}
                  <div className="auth-field">
                    <label htmlFor="reset-confirm-password">Confirm Password</label>
                    <div className="auth-input-wrap">
                      <KeyRound size={15} className="auth-input-icon" />
                      <input
                        id="reset-confirm-password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="Re-enter new password"
                        value={resetConfirmPassword}
                        onChange={(e) => setResetConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        minLength={8}
                        required
                        disabled={verifyLoading}
                      />
                      <button
                        type="button"
                        className="auth-eye-btn"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        tabIndex={-1}
                      >
                        {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    {resetNewPassword && resetConfirmPassword && resetNewPassword !== resetConfirmPassword && (
                      <p className="auth-field-hint-error">Passwords do not match.</p>
                    )}
                  </div>

                  <button
                    id="auth-reset-submit"
                    type="submit"
                    className="auth-btn-primary"
                    disabled={
                      verifyLoading ||
                      otpDigits.join('').length !== 6 ||
                      resetNewPassword.length < 8 ||
                      resetNewPassword !== resetConfirmPassword
                    }
                    style={{ marginTop: 4 }}
                  >
                    {verifyLoading ? (
                      <span className="auth-spinner" />
                    ) : (
                      <>Set New Password <ArrowRight size={16} /></>
                    )}
                  </button>

                  <div className="auth-resend-row">
                    <span style={{ color: '#6B7280' }}>Didn't receive the code?</span>
                    <button
                      id="auth-reset-resend-btn"
                      type="button"
                      className="auth-link-btn"
                      onClick={handleResendForgotOtp}
                      disabled={verifyLoading || resendCooldown > 0}
                    >
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                    </button>
                  </div>

                  <div className="auth-verify-footer">
                    <button
                      id="auth-back-to-forgot"
                      type="button"
                      className="auth-back-link"
                      onClick={() => {
                        setMode('forgot');
                        setError('');
                        setSuccess('');
                        setOtpDigits(['', '', '', '', '', '']);
                        setResetNewPassword('');
                        setResetConfirmPassword('');
                      }}
                    >
                      ← Use a different email
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>

      <AuthStyles />
    </div>
  );
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

      .auth-layout {
        display: flex;
        width: 100%;
        min-height: 100vh;
        position: relative;
      }

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
        border-radius: 8px;
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
        border-radius: 10px;
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
      }
      .auth-feature-desc {
        font-size: 0.8125rem;
        color: #5C5C5C;
        margin-top: 1px;
      }

      .auth-proof {
        display: flex;
        align-items: center;
        gap: 12px;
        padding-top: 24px;
        border-top: 1px solid #F0ECE6;
      }
      .auth-proof-avatars {
        display: flex;
      }
      .auth-proof-avatar {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: #F3F4F6;
        border: 2px solid #FFFFFF;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        margin-left: -6px;
      }
      .auth-proof-avatar:first-child {
        margin-left: 0;
      }
      .auth-proof-text {
        font-size: 0.8125rem;
        color: #5C5C5C;
      }

      .auth-right {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 48px 32px;
      }

      .auth-card {
        background: #FFFFFF;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
        border: 1px solid #E5E7EB;
        padding: 40px;
        width: 100%;
        max-width: 440px;
      }

      .auth-tabs {
        display: flex;
        position: relative;
        background: #F3F4F6;
        padding: 4px;
        border-radius: 8px;
        margin-bottom: 24px;
      }
      .auth-tab {
        flex: 1;
        padding: 8px;
        text-align: center;
        font-size: 0.875rem;
        font-weight: 500;
        color: #4B5563;
        border: none;
        background: none;
        cursor: pointer;
        z-index: 1;
        transition: color 0.15s ease;
      }
      .auth-tab.active {
        color: #111827;
        font-weight: 600;
      }
      .auth-tab-indicator {
        position: absolute;
        top: 4px;
        left: 4px;
        width: calc(50% - 4px);
        height: calc(100% - 8px);
        background: #FFFFFF;
        border-radius: 6px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        transition: transform 0.2s ease;
      }
      .auth-tab-indicator.right {
        transform: translateX(100%);
      }

      .auth-google-wrapper {
        margin-bottom: 20px;
      }
      .auth-google-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 10px;
        background: #F3F4F6;
        border-radius: 6px;
        font-size: 0.875rem;
        color: #4B5563;
      }
      .auth-google-unconfigured {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 10px;
        background: #F9FAFB;
        border: 1px dashed #D1D5DB;
        border-radius: 6px;
        font-size: 0.8125rem;
        color: #6B7280;
      }

      .auth-divider {
        display: flex;
        align-items: center;
        text-align: center;
        margin: 20px 0;
        color: #9CA3AF;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .auth-divider::before,
      .auth-divider::after {
        content: '';
        flex: 1;
        border-bottom: 1px solid #E5E7EB;
      }
      .auth-divider span {
        padding: 0 12px;
      }

      .auth-field {
        margin-bottom: 16px;
      }
      .auth-field label {
        display: block;
        font-size: 0.8125rem;
        font-weight: 500;
        color: #374151;
        margin-bottom: 6px;
      }
      .auth-label-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
      }
      .auth-label-row label {
        margin-bottom: 0;
      }
      .auth-forgot-link {
        font-size: 0.75rem;
        color: #C2410C;
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
      }

      .auth-input-wrap {
        position: relative;
        display: flex;
        align-items: center;
      }
      .auth-input-icon {
        position: absolute;
        left: 12px;
        color: #9CA3AF;
        pointer-events: none;
      }
      .auth-input-wrap input {
        width: 100%;
        padding: 10px 12px 10px 36px;
        font-size: 0.875rem;
        border: 1px solid #D1D5DB;
        border-radius: 6px;
        background: #FFFFFF;
        color: #111827;
        outline: none;
        transition: border-color 0.15s, box-shadow 0.15s;
      }
      .auth-input-wrap input:focus {
        border-color: #C2410C;
        box-shadow: 0 0 0 3px rgba(194, 65, 12, 0.15);
      }
      .auth-eye-btn {
        position: absolute;
        right: 12px;
        background: none;
        border: none;
        color: #9CA3AF;
        cursor: pointer;
        padding: 0;
        display: flex;
        align-items: center;
      }

      .auth-field-row {
        display: grid;
        grid-templateColumns: 1fr 1fr;
        gap: 12px;
      }

      .auth-perks {
        margin: 16px 0 20px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .auth-perk-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.8125rem;
        color: #4B5563;
      }

      .auth-btn-primary {
        width: 100%;
        padding: 11px 16px;
        background: #C2410C;
        color: #FFFFFF;
        border: none;
        border-radius: 6px;
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: background 0.15s;
      }
      .auth-btn-primary:hover:not(:disabled) {
        background: #9A3412;
      }
      .auth-btn-primary:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .auth-switch-hint {
        text-align: center;
        margin-top: 16px;
        font-size: 0.8125rem;
        color: #6B7280;
      }
      .auth-switch-hint button {
        background: none;
        border: none;
        color: #C2410C;
        font-weight: 600;
        cursor: pointer;
        padding: 0;
        margin-left: 4px;
      }

      .auth-alert {
        padding: 10px 14px;
        border-radius: 6px;
        font-size: 0.8125rem;
        margin-bottom: 16px;
      }
      .auth-alert-error {
        background: #FEF2F2;
        color: #991B1B;
        border: 1px solid #FCA5A5;
      }
      .auth-alert-success {
        background: #ECFDF5;
        color: #065F46;
        border: 1px solid #A7F3D0;
      }

      .auth-demo-banner {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        background: #FFF7ED;
        border: 1px solid #FED7AA;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 500;
        color: #9A3412;
        cursor: pointer;
      }

      .auth-spinner {
        width: 18px;
        height: 18px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: #FFFFFF;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }
      .auth-spinner.dark {
        border-color: rgba(0, 0, 0, 0.1);
        border-top-color: #111827;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      /* ── Verification Screen Styles ──────────────────────────────────────── */
      .auth-verify-view {
        text-align: center;
      }
      .auth-verify-header {
        margin-bottom: 24px;
      }
      .auth-verify-title {
        font-family: 'Source Serif 4', Georgia, serif;
        font-size: 1.4rem;
        font-weight: 600;
        color: #1F2933;
        margin: 0 0 8px;
      }
      .auth-verify-sub {
        font-size: 0.875rem;
        color: #5C5C5C;
        line-height: 1.5;
        margin: 0;
      }
      .auth-verify-email-badge {
        font-weight: 600;
        color: #111827;
        background: #F3F4F6;
        padding: 2px 8px;
        border-radius: 4px;
        display: inline-block;
        margin-top: 4px;
      }

      .auth-otp-row {
        display: flex;
        gap: 8px;
        justify-content: center;
        margin: 20px 0 12px;
      }
      .auth-otp-input {
        width: 48px;
        height: 54px;
        font-size: 1.5rem;
        font-weight: 700;
        text-align: center;
        border: 1.5px solid #D1D5DB;
        border-radius: 8px;
        background: #FFFFFF;
        color: #111827;
        font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
        transition: all 0.15s ease;
        outline: none;
      }
      .auth-otp-input:focus {
        border-color: #C2410C;
        box-shadow: 0 0 0 3px rgba(194, 65, 12, 0.2);
        background: #FFF7ED;
      }
      .auth-otp-input.filled {
        border-color: #9CA3AF;
        background: #FAFAFA;
      }

      .auth-otp-hint {
        font-size: 0.75rem;
        color: #9CA3AF;
        margin: 0 0 16px;
      }

      .auth-resend-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 18px;
        font-size: 0.8125rem;
      }

      .auth-link-btn {
        background: none;
        border: none;
        color: #C2410C;
        font-weight: 600;
        cursor: pointer;
        padding: 0;
        font-size: 0.8125rem;
        text-decoration: underline;
      }
      .auth-link-btn:disabled {
        color: #9CA3AF;
        cursor: not-allowed;
        text-decoration: none;
      }

      .auth-verify-footer {
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid #F3F4F6;
      }
      .auth-back-link {
        background: none;
        border: none;
        color: #6B7280;
        font-size: 0.8125rem;
        cursor: pointer;
        padding: 0;
      }
      .auth-back-link:hover {
        color: #111827;
        text-decoration: underline;
      }

      .auth-field-hint-error {
        font-size: 0.75rem;
        color: #991B1B;
        margin: 4px 0 0;
      }

      /* ── Modal Overlay for Onboarding ────────────────────────────────────── */
      .auth-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(17, 24, 39, 0.6);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 50;
        padding: 20px;
      }
      .auth-extra-card {
        background: #FFFFFF;
        border-radius: 12px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        padding: 32px;
        width: 100%;
        max-width: 480px;
        max-height: 90vh;
        overflow-y: auto;
      }
      .auth-extra-header {
        text-align: center;
        margin-bottom: 24px;
      }
      .auth-extra-header h2 {
        font-family: 'Source Serif 4', Georgia, serif;
        font-size: 1.35rem;
        font-weight: 600;
        color: #1F2933;
        margin: 12px 0 6px;
      }
      .auth-extra-header p {
        font-size: 0.875rem;
        color: #5C5C5C;
        margin: 0;
      }
      .auth-google-id-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: #F3F4F6;
        padding: 4px 10px;
        border-radius: 20px;
        font-size: 0.8125rem;
        color: #374151;
        margin-top: 8px;
      }
      .auth-google-id-avatar {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #C2410C;
        color: #FFFFFF;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 700;
      }

      @media (max-width: 900px) {
        .auth-left {
          display: none;
        }
        .auth-right {
          padding: 24px 16px;
        }
      }
    `}</style>
  );
}
