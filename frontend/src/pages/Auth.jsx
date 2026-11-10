import React, { useState, useEffect, useRef } from 'react';
import {
  KeyRound,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  BookOpen,
  Users,
  BarChart3,
  Shield,
  CheckCircle2,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import { api, setAuthToken, setStoredUser, parseApiError } from '../api';

// ─── Google Client ID ────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// ─── Feature highlights shown on the left panel ─────────────────────────────
const FEATURES = [
  { icon: Users, label: 'Student Management', desc: 'Enroll, track, and manage every student effortlessly.' },
  { icon: BookOpen, label: 'Desk & Shift Allocation', desc: 'Real-time visual seat map with multi-shift support.' },
  { icon: BarChart3, label: 'Fee Billing & Receipts', desc: 'Collect dues, send WhatsApp reminders, print GST receipts.' },
  { icon: Shield, label: 'Multi-tenant SaaS', desc: 'Isolated workspace for every library owner.' },
];

export function AuthLeftPanel() {
  return (
    <div className="auth-left">
      <div className="auth-left-content">
        {/* Logo */}
        <div className="auth-logo-row">
          <div className="auth-brand-icon large">
            <img
              src="/brand/libma-icon.svg"
              alt="LibMa"
              className="brand-badge-icon"
              style={{ width: 30, height: 30 }}
            />
          </div>
          <div>
            <div className="auth-logo-title">LibMa</div>
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
            {['🧑‍🏫', '👩🏽‍💼', '👨🏻‍🎓'].map((e, i) => (
              <div key={i} className="auth-proof-avatar">{e}</div>
            ))}
          </div>
          <div className="auth-proof-text">
            Trusted by <strong>200+</strong> study centers across India
          </div>
        </div>
      </div>
    </div>
  );
}

export function StepIndicator({ path, currentStep }) {
  if (path !== 'email' && path !== 'google') {
    return (
      <div className="auth-step-container">
        <div className="auth-step-badge">
          <span>Final step — Workspace details</span>
        </div>
      </div>
    );
  }

  const steps = path === 'email'
    ? [
        { id: 'account', label: 'Account', num: 1 },
        { id: 'verify', label: 'Verify', num: 2 },
        { id: 'details', label: 'Details', num: 3 },
      ]
    : [
        { id: 'account', label: 'Account', num: 1 },
        { id: 'details', label: 'Details', num: 2 },
      ];

  const currentIdx = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="auth-step-container">
      <div className="auth-step-bar">
        {steps.map((step, idx) => {
          const isCompleted = idx < currentIdx;
          const isActive = idx === currentIdx;
          return (
            <React.Fragment key={step.id}>
              <div className={`auth-step-node ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                <div className="auth-step-node-bubble">
                  {isCompleted ? (
                    <CheckCircle2 size={13} strokeWidth={2.5} />
                  ) : (
                    <span>{step.num}</span>
                  )}
                </div>
                <span className="auth-step-node-label">{step.label}</span>
              </div>
              {idx < steps.length - 1 && (
                <div className={`auth-step-line ${idx < currentIdx ? 'completed' : ''}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

export default function Auth({ onLoginSuccess, initialMessage = '', onNoticeCleared }) {
  const [verifyEmail, setVerifyEmail] = useState(() => sessionStorage.getItem('study_pending_verify_email') || '');
  const [mode, setMode] = useState(() => sessionStorage.getItem('study_pending_verify_email') ? 'verify' : 'login');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);

  const [resendCooldown, setResendCooldown] = useState(() => {
    const stored = sessionStorage.getItem('study_resend_cooldown_expires');
    if (stored) {
      return Math.max(0, Math.ceil((Number(stored) - Date.now()) / 1000));
    }
    return 60;
  });

  const [error, setError] = useState(initialMessage || '');
  const [accountExistsError, setAccountExistsError] = useState(false);
  const [success, setSuccess] = useState('');

  // Consume initialMessage once and clear from parent so it only displays once
  useEffect(() => {
    if (initialMessage) {
      setError(initialMessage);
      if (typeof onNoticeCleared === 'function') {
        onNoticeCleared();
      }
    }
  }, [initialMessage, onNoticeCleared]);

  // Login fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Register fields (only Email and Password)
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regEmailError, setRegEmailError] = useState('');
  const [regPasswordError, setRegPasswordError] = useState('');

  // OTP Digits (6 individual boxes)
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const otpInputsRef = useRef([]);

  const googleButtonRef = useRef(null);

  // ─── Forgot / Reset password state ──────────────────────────────────────
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // ─── Resend Cooldown Countdown (verify + reset modes) ──────────────────
  useEffect(() => {
    if (mode !== 'verify' && mode !== 'reset') return;
    const checkCooldown = () => {
      const stored = sessionStorage.getItem('study_resend_cooldown_expires');
      if (stored) {
        const remaining = Math.max(0, Math.ceil((Number(stored) - Date.now()) / 1000));
        setResendCooldown(remaining);
      } else {
        setResendCooldown((prev) => Math.max(0, prev - 1));
      }
    };
    checkCooldown();
    const timer = setInterval(checkCooldown, 1000);
    return () => clearInterval(timer);
  }, [mode]);

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
    setAccountExistsError(false);
    try {
      const res = await api.auth.googleAuth(response.credential);
      sessionStorage.removeItem('study_pending_verify_email');
      sessionStorage.removeItem('study_resend_cooldown_expires');
      sessionStorage.setItem('study_onboarding_path', 'google');
      setAuthToken(res.access_token);
      setStoredUser(res.user, res.tenant);
      onLoginSuccess(res.user, res.tenant, res.access_token);
    } catch (err) {
      if (err.message?.includes('not configured')) {
        setError('Google Sign-In is not configured on this server. Please use email & password.');
      } else {
        setError(parseApiError(err) || 'Google sign-in could not complete. Please try signing in with email.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  // ─── Google Identity Services — init + renderButton ─────────────────────
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || mode === 'verify' || mode === 'forgot' || mode === 'reset') return;
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
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
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

  // ─── Email login ──────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    let hasError = false;
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setEmailError('Please enter your email address.');
      hasError = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setEmailError('Please enter a valid email address.');
      hasError = true;
    } else {
      setEmailError('');
    }

    if (!password) {
      setPasswordError('Please enter your password.');
      hasError = true;
    } else {
      setPasswordError('');
    }

    if (hasError) return;

    setLoading(true);
    setError('');
    setAccountExistsError(false);
    setSuccess('');
    try {
      const res = await api.auth.login(cleanEmail, password);
      sessionStorage.removeItem('study_pending_verify_email');
      sessionStorage.removeItem('study_resend_cooldown_expires');
      setAuthToken(res.access_token);
      setStoredUser(res.user, res.tenant);
      onLoginSuccess(res.user, res.tenant, res.access_token);
    } catch (err) {
      if (err.status === 403 && (err.code === 'EMAIL_NOT_VERIFIED' || err.detail?.code === 'EMAIL_NOT_VERIFIED')) {
        const pending = err.detail?.email || cleanEmail;
        const cooldown = err.detail?.resend_cooldown_seconds || 60;
        sessionStorage.setItem('study_pending_verify_email', pending);
        sessionStorage.setItem('study_onboarding_path', 'email');
        sessionStorage.setItem('study_resend_cooldown_expires', String(Date.now() + cooldown * 1000));
        setVerifyEmail(pending);
        setResendCooldown(cooldown);
        setMode('verify');
        setOtpDigits(['', '', '', '', '', '']);
        setSuccess(err.detail?.message || 'Your email address is not verified yet. We sent a verification code to your email.');
      } else {
        setError(parseApiError(err) || 'Incorrect email or password.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Email register (Step 1 -> OTP screen) ────────────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault();
    let hasError = false;
    const cleanEmail = regEmail.trim().toLowerCase();

    if (!cleanEmail) {
      setRegEmailError('Please enter your email address.');
      hasError = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setRegEmailError('Please enter a valid email address.');
      hasError = true;
    } else {
      setRegEmailError('');
    }

    if (!regPassword) {
      setRegPasswordError('Please enter a password.');
      hasError = true;
    } else if (regPassword.length < 8) {
      setRegPasswordError('Password must be at least 8 characters long.');
      hasError = true;
    } else {
      setRegPasswordError('');
    }

    if (hasError) return;

    setLoading(true);
    setError('');
    setAccountExistsError(false);
    setSuccess('');
    try {
      const res = await api.auth.signup({
        email: cleanEmail,
        password: regPassword,
      });
      sessionStorage.setItem('study_pending_verify_email', cleanEmail);
      sessionStorage.setItem('study_onboarding_path', 'email');
      const cooldown = res.resend_cooldown_seconds || 60;
      sessionStorage.setItem('study_resend_cooldown_expires', String(Date.now() + cooldown * 1000));
      setVerifyEmail(cleanEmail);
      setResendCooldown(cooldown);
      setMode('verify');
      setOtpDigits(['', '', '', '', '', '']);
      setSuccess(`We've sent a 6-digit verification code to ${cleanEmail}`);
    } catch (err) {
      if (err.status === 409 || err.message?.toLowerCase().includes('already exists') || err.message?.toLowerCase().includes('registered')) {
        setAccountExistsError(true);
        setError('An account with this email already exists.');
      } else {
        setError(parseApiError(err) || 'Registration failed. Please check your details.');
      }
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
      sessionStorage.removeItem('study_resend_cooldown_expires');
      setAuthToken(res.access_token);
      setStoredUser(res.user, res.tenant);
      onLoginSuccess(res.user, res.tenant, res.access_token);
    } catch (err) {
      if (err.status === 429) {
        setError('Too many failed attempts. Please request a new verification code.');
      } else {
        setError(parseApiError(err) || 'Invalid or expired verification code.');
      }
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
      const cooldown = res.resend_cooldown_seconds || 60;
      sessionStorage.setItem('study_resend_cooldown_expires', String(Date.now() + cooldown * 1000));
      setResendCooldown(cooldown);
      setSuccess('A fresh verification code has been sent to your email.');
      setOtpDigits(['', '', '', '', '', '']);
      otpInputsRef.current[0]?.focus();
    } catch (err) {
      setError(parseApiError(err) || 'Failed to resend code. Please try again.');
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleBackFromVerify = () => {
    sessionStorage.removeItem('study_pending_verify_email');
    sessionStorage.removeItem('study_resend_cooldown_expires');
    sessionStorage.removeItem('study_onboarding_path');
    setMode('register');
    setError('');
    setAccountExistsError(false);
    setSuccess('');
    setOtpDigits(['', '', '', '', '', '']);
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setAccountExistsError(false);
    setEmailError('');
    setPasswordError('');
    setRegEmailError('');
    setRegPasswordError('');
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
      await api.auth.forgotPassword(cleanEmail);
      setVerifyEmail(cleanEmail);
      const cooldown = 60;
      sessionStorage.setItem('study_resend_cooldown_expires', String(Date.now() + cooldown * 1000));
      setResendCooldown(cooldown);
      setOtpDigits(['', '', '', '', '', '']);
      setResetNewPassword('');
      setResetConfirmPassword('');
      setMode('reset');
      setSuccess(`If an account exists for ${cleanEmail}, a 6-digit code was sent.`);
    } catch {
      // Generic message to avoid email enumeration
      setVerifyEmail(cleanEmail);
      setResendCooldown(60);
      setOtpDigits(['', '', '', '', '', '']);
      setMode('reset');
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
      setMode('login');
      setOtpDigits(['', '', '', '', '', '']);
      setResetNewPassword('');
      setResetConfirmPassword('');
      setForgotEmail('');
      setVerifyEmail('');
      setSuccess('Password reset successfully! You can now sign in with your new password.');
    } catch (err) {
      setError(parseApiError(err) || 'Reset failed. Please check your code and try again.');
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
      const cooldown = 60;
      sessionStorage.setItem('study_resend_cooldown_expires', String(Date.now() + cooldown * 1000));
      setResendCooldown(cooldown);
      setSuccess('A fresh code has been sent to your email.');
      setOtpDigits(['', '', '', '', '', '']);
      otpInputsRef.current[0]?.focus();
    } catch (err) {
      setError(parseApiError(err) || 'Failed to resend code. Please try again.');
    } finally {
      setVerifyLoading(false);
    }
  };

  const onboardingPath = sessionStorage.getItem('study_onboarding_path') || 'email';

  // ─── Main Auth Layout ─────────────────────────────────────────────────────
  return (
    <div className="auth-root">
      <div className="auth-layout">
        <AuthLeftPanel />

        {/* ── Right Panel ── */}
        <div className="auth-right">
          <div className="auth-card">
            {/* Step indicator for register and verify modes */}
            {mode === 'register' && (
              <StepIndicator path="email" currentStep="account" />
            )}
            {mode === 'verify' && (
              <StepIndicator path={onboardingPath} currentStep="verify" />
            )}

            {/* Header hierarchy (shown for login / register) */}
            {mode === 'login' && (
              <div className="auth-card-header">
                <h2 className="auth-card-title">Welcome back!</h2>
                <p className="auth-card-sub">Please enter your details to sign in</p>
              </div>
            )}
            {mode === 'register' && (
              <div className="auth-card-header">
                <h2 className="auth-card-title">Create your workspace</h2>
                <p className="auth-card-sub">Start managing your library and students</p>
              </div>
            )}

            {/* Google Sign-In button (only shown for login/register) */}
            {mode !== 'verify' && mode !== 'forgot' && mode !== 'reset' && (
              <>
                <div className="auth-google-wrapper">
                  {googleLoading ? (
                    <div className="auth-google-loading" role="status">
                      <span className="auth-spinner dark" aria-hidden="true" />
                      <span>Signing in with Google…</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      id="auth-google-btn"
                      className="auth-google-pill-btn"
                      disabled={loading || googleLoading}
                      onClick={() => {
                        if (!GOOGLE_CLIENT_ID) {
                          setError('Google Sign-In is not configured on this server. Please use email & password.');
                        }
                      }}
                      aria-label="Continue with Google"
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18" className="auth-google-icon" aria-hidden="true" style={{ flexShrink: 0 }}>
                        <path fill="var(--google-blue)" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="var(--google-green)" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="var(--google-yellow)" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="var(--google-red)" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      <span>Continue with Google</span>
                      <div
                        ref={googleButtonRef}
                        id="auth-google-btn-container"
                        className="auth-google-gsi-layer"
                      />
                    </button>
                  )}
                  {!GOOGLE_CLIENT_ID && (
                    <div className="auth-google-unconfigured-note">
                      Google Sign-In not configured
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="auth-divider" aria-hidden="true">
                  <span>or continue with email</span>
                </div>
              </>
            )}

            {/* Success Banner */}
            {success && (
              <div className="auth-alert auth-alert-success" id="auth-success-banner" role="status">
                {success}
              </div>
            )}

            {/* Conflict 409 Notice with Link */}
            {accountExistsError && (
              <div className="auth-alert auth-alert-error" role="alert">
                An account with this email already exists.{' '}
                <button
                  type="button"
                  onClick={() => {
                    setEmail(regEmail);
                    switchMode('login');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'var(--color-primary)',
                    fontWeight: 700,
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    fontSize: 'inherit',
                  }}
                >
                  Sign in instead
                </button>
              </div>
            )}

            {/* General Error Banner (if not already handled by 409) */}
            {error && !accountExistsError && (
              <div
                className="auth-alert auth-alert-error"
                id="auth-error-banner"
                role="alert"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    if (typeof onNoticeCleared === 'function') onNoticeCleared();
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--danger-text)',
                    cursor: 'pointer',
                    fontSize: '1.15rem',
                    lineHeight: 1,
                    padding: '0 4px',
                    fontWeight: 600,
                  }}
                  aria-label="Dismiss message"
                >
                  ×
                </button>
              </div>
            )}

            {/* ── Login Form ── */}
            {mode === 'login' && (
              <form onSubmit={handleLogin} id="auth-login-form" noValidate>
                <div className="auth-field">
                  <label htmlFor="login-email">Email Address</label>
                  <div className={`auth-input-wrap ${emailError ? 'has-error' : ''}`}>
                    <Mail size={15} className="auth-input-icon" aria-hidden="true" />
                    <input
                      id="login-email"
                      type="email"
                      inputMode="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (emailError) setEmailError('');
                        if (error) setError('');
                      }}
                      autoComplete="email"
                      required
                      aria-invalid={emailError ? 'true' : 'false'}
                      aria-describedby={emailError ? 'login-email-error' : undefined}
                    />
                  </div>
                  {emailError && (
                    <p id="login-email-error" className="auth-field-error" role="alert">
                      {emailError}
                    </p>
                  )}
                </div>

                <div className="auth-field">
                  <label htmlFor="login-password">Password</label>
                  <div className={`auth-input-wrap ${passwordError ? 'has-error' : ''}`}>
                    <KeyRound size={15} className="auth-input-icon" aria-hidden="true" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (passwordError) setPasswordError('');
                        if (error) setError('');
                      }}
                      autoComplete="current-password"
                      required
                      aria-invalid={passwordError ? 'true' : 'false'}
                      aria-describedby={passwordError ? 'login-password-error' : undefined}
                    />
                    <button
                      type="button"
                      className="auth-eye-btn"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                    </button>
                  </div>
                  {passwordError && (
                    <p id="login-password-error" className="auth-field-error" role="alert">
                      {passwordError}
                    </p>
                  )}
                  <div className="auth-forgot-row">
                    <button
                      type="button"
                      className="auth-forgot-link"
                      id="auth-forgot-link"
                      onClick={() => {
                        setForgotEmail(email || '');
                        setError('');
                        setEmailError('');
                        setPasswordError('');
                        setSuccess('');
                        setMode('forgot');
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>

                <button
                  id="auth-login-submit"
                  type="submit"
                  className="auth-btn-primary"
                  disabled={loading}
                  aria-busy={loading}
                >
                  {loading ? (
                    <>
                      <span className="auth-spinner" aria-hidden="true" />
                      <span>Signing in…</span>
                    </>
                  ) : (
                    <>Sign In <ArrowRight size={16} aria-hidden="true" /></>
                  )}
                </button>

                <p className="auth-switch-hint">
                  New library owner?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      switchMode('register');
                    }}
                  >
                    Create free workspace →
                  </button>
                </p>
              </form>
            )}

            {/* ── Register Form (Only Email & Password) ── */}
            {mode === 'register' && (
              <form onSubmit={handleRegister} id="auth-register-form" noValidate>
                <div className="auth-field">
                  <label htmlFor="reg-email">
                    Email Address <span className="auth-req-star">*</span>
                  </label>
                  <div className={`auth-input-wrap ${regEmailError ? 'has-error' : ''}`}>
                    <Mail size={15} className="auth-input-icon" aria-hidden="true" />
                    <input
                      id="reg-email"
                      type="email"
                      inputMode="email"
                      placeholder="owner@library.com"
                      value={regEmail}
                      onChange={(e) => {
                        setRegEmail(e.target.value);
                        if (regEmailError) setRegEmailError('');
                        if (error) setError('');
                        if (accountExistsError) setAccountExistsError(false);
                      }}
                      autoComplete="email"
                      required
                      aria-invalid={regEmailError ? 'true' : 'false'}
                    />
                  </div>
                  {regEmailError && (
                    <p className="auth-field-error" role="alert">
                      {regEmailError}
                    </p>
                  )}
                </div>

                <div className="auth-field">
                  <label htmlFor="reg-password">
                    Create Password <span className="auth-req-star">*</span>
                  </label>
                  <div className={`auth-input-wrap ${regPasswordError ? 'has-error' : ''}`}>
                    <KeyRound size={15} className="auth-input-icon" aria-hidden="true" />
                    <input
                      id="reg-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min. 8 characters"
                      value={regPassword}
                      onChange={(e) => {
                        setRegPassword(e.target.value);
                        if (regPasswordError) setRegPasswordError('');
                        if (error) setError('');
                      }}
                      autoComplete="new-password"
                      required
                      aria-invalid={regPasswordError ? 'true' : 'false'}
                    />
                    <button
                      type="button"
                      className="auth-eye-btn"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                    </button>
                  </div>
                  {regPasswordError ? (
                    <p className="auth-field-error" role="alert">
                      {regPasswordError}
                    </p>
                  ) : (
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: '4px 0 0 2px' }}>
                      Must be at least 8 characters long
                    </p>
                  )}
                </div>

                <div className="auth-perks">
                  {['Free forever plan', 'Instant desk & shift setup', 'No credit card required'].map((p) => (
                    <div key={p} className="auth-perk-item">
                      <CheckCircle2 size={14} className="auth-perk-icon" />
                      <span>{p}</span>
                    </div>
                  ))}
                </div>

                <button
                  id="auth-register-submit"
                  type="submit"
                  className="auth-btn-primary"
                  disabled={loading}
                  aria-busy={loading}
                >
                  {loading ? (
                    <>
                      <span className="auth-spinner" aria-hidden="true" />
                      <span>Creating Account…</span>
                    </>
                  ) : (
                    <>Continue <ArrowRight size={16} /></>
                  )}
                </button>

                <p className="auth-switch-hint">
                  Already have an account?{' '}
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
                    <span style={{ color: 'var(--color-text-secondary)' }}>Didn't get the code?</span>
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
                      Use a different email
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ── Forgot Password Screen ── */}
            {mode === 'forgot' && (
              <div className="auth-verify-view" id="auth-forgot-screen">
                <div className="auth-verify-header">
                  <div className="auth-brand-icon" style={{ margin: '0 auto 16px', background: 'var(--info-solid)' }}>
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
                      onClick={() => { switchMode('login'); }}
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
                  <div className="auth-brand-icon" style={{ margin: '0 auto 16px', background: 'var(--info-solid)' }}>
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
                    <span style={{ color: 'var(--color-text-secondary)' }}>Didn't receive the code?</span>
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
// Migrated to index.css Stitch design system tokens
export function AuthStyles() {
  return null;
}
