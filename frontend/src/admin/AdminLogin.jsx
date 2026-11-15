import React, { useState } from 'react';
import { ShieldCheck, Lock, Mail, KeyRound, Copy, Check, Download, AlertTriangle } from 'lucide-react';
import { adminApi, setAdminToken, setAdminInfo } from './adminApi';

export default function AdminLogin({ onLoginSuccess }) {
  const [step, setStep] = useState('credentials'); // 'credentials' | 'enroll' | 'recovery_codes' | 'verify'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [enrollData, setEnrollData] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [authResponse, setAuthResponse] = useState(null);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Submit Credentials
  const handleSubmitCredentials = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await adminApi.auth.login(email, password);
      setTempToken(res.temp_token);
      if (res.enrollment_required) {
        setEnrollData(res);
        setStep('enroll');
      } else {
        setStep('verify');
      }
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  // Step 2a: Enroll 2FA (First-time setup)
  const handleEnroll2FA = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await adminApi.auth.enroll2FA(tempToken, totpCode.trim());
      setAdminToken(res.access_token);
      setAdminInfo({ id: res.admin_id, email: res.email });
      setRecoveryCodes(res.recovery_codes || []);
      setAuthResponse(res);
      setStep('recovery_codes');
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  // Step 2b: Verify 2FA / Recovery Code
  const handleVerify2FA = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await adminApi.auth.verify2FA(tempToken, totpCode.trim());
      setAdminToken(res.access_token);
      setAdminInfo({ id: res.admin_id, email: res.email });
      onLoginSuccess(res);
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleCopySecret = () => {
    if (enrollData?.secret) {
      navigator.clipboard.writeText(enrollData.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  const handleCopyRecoveryCodes = () => {
    if (recoveryCodes.length) {
      navigator.clipboard.writeText(recoveryCodes.join('\n'));
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 2000);
    }
  };

  const handleDownloadCodes = () => {
    const text = `LibMa Platform Super Admin Recovery Codes\nAccount: ${email}\nDate: ${new Date().toISOString()}\n\nEach code can only be used once:\n\n${recoveryCodes.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `libma-admin-recovery-codes-${email}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--bg-canvas, #FAFAF9)',
      padding: 24,
      fontFamily: 'var(--font-body, sans-serif)'
    }}>
      <div style={{
        width: '100%',
        maxWidth: 440,
        backgroundColor: '#FFFFFF',
        border: '1px solid var(--color-border, #E7E5E4)',
        borderRadius: 20,
        padding: 36,
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06)'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: 'linear-gradient(135deg, #C2410C 0%, #EA580C 50%, #D97706 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px',
            boxShadow: '0 2px 8px rgba(194, 65, 12, 0.22)'
          }}>
            <img
              src="/brand/libma-icon.svg"
              alt="LibMa"
              style={{ width: 28, height: 28, filter: 'brightness(0) invert(1)' }}
            />
          </div>
          <div style={{
            display: 'inline-block',
            fontSize: '0.675rem',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-brand, #C2410C)',
            backgroundColor: 'var(--color-brand-50, #FFF7ED)',
            padding: '3px 10px',
            borderRadius: 9999,
            border: '1px solid var(--color-brand-border, #FED7AA)',
            marginBottom: 8
          }}>
            Platform Super Admin
          </div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--color-heading, #1C1917)', margin: 0, letterSpacing: '-0.02em' }}>
            {step === 'credentials' && 'Sign in to Platform'}
            {step === 'enroll' && 'Setup Two-Factor Auth'}
            {step === 'recovery_codes' && 'Emergency Recovery Codes'}
            {step === 'verify' && (isRecoveryMode ? 'Enter Recovery Code' : 'Two-Factor Authentication')}
          </h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary, #57534E)', marginTop: 6, lineHeight: 1.4 }}>
            {step === 'credentials' && 'Owner credentials required to access cross-library controls.'}
            {step === 'enroll' && 'Scan the QR code with your authenticator app to enable 2FA.'}
            {step === 'recovery_codes' && 'Store these 10 one-time recovery codes securely before proceeding.'}
            {step === 'verify' && (isRecoveryMode ? 'Enter one of your 10 unused recovery codes.' : 'Enter the 6-digit verification code from your authenticator.')}
          </p>
        </div>

        {error && (
          <div style={{
            backgroundColor: 'var(--danger-bg, #FEF2F2)',
            border: '1px solid var(--danger-border, #FECACA)',
            borderRadius: 10,
            padding: '10px 14px',
            color: 'var(--danger-text, #991B1B)',
            fontSize: '0.8125rem',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Credentials */}
        {step === 'credentials' && (
          <form onSubmit={handleSubmitCredentials}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-heading, #1C1917)', marginBottom: 6 }}>
                Admin Email
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--color-text-muted, #78716C)' }} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@libma.internal"
                  className="admin-input"
                  style={{ width: '100%', paddingLeft: 38, boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 22 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-heading, #1C1917)', marginBottom: 6 }}>
                Master Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--color-text-muted, #78716C)' }} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="admin-input"
                  style={{ width: '100%', paddingLeft: 38, boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="admin-btn admin-btn-primary"
              style={{ width: '100%', padding: '11px 0', fontSize: '0.875rem' }}
            >
              {loading ? 'Verifying Credentials…' : 'Continue to 2FA Verification'}
            </button>
          </form>
        )}

        {/* Step 2a: Enroll 2FA */}
        {step === 'enroll' && (
          <form onSubmit={handleEnroll2FA}>
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <div style={{
                background: '#FFFFFF',
                padding: 12,
                borderRadius: 14,
                border: '1px solid var(--color-border, #E7E5E4)',
                display: 'inline-block',
                marginBottom: 10,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)'
              }}>
                <img
                  src={enrollData?.qr_code}
                  alt="2FA QR Code"
                  style={{ width: 170, height: 170, display: 'block' }}
                />
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #78716C)', margin: '0 0 10px 0' }}>
                Scan with Google Authenticator, Authy, or 1Password
              </p>

              {/* Secret Backup */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                background: 'var(--bg-page, #FAFAF9)',
                border: '1px solid var(--color-border, #E7E5E4)',
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--color-heading, #1C1917)'
              }}>
                <span>Key: {enrollData?.secret}</span>
                <button
                  type="button"
                  onClick={handleCopySecret}
                  style={{ background: 'none', border: 'none', color: 'var(--color-brand, #C2410C)', cursor: 'pointer', padding: 2 }}
                  title="Copy Secret"
                >
                  {copiedSecret ? <Check size={14} style={{ color: 'var(--success-solid)' }} /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-heading, #1C1917)', marginBottom: 6 }}>
                Enter 6-digit Authenticator Code
              </label>
              <input
                type="text"
                required
                maxLength={6}
                autoFocus
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="admin-input"
                style={{ width: '100%', textAlign: 'center', fontSize: '1.35rem', fontWeight: 700, letterSpacing: '0.3em', boxSizing: 'border-box' }}
              />
            </div>

            <button
              type="submit"
              disabled={loading || totpCode.length !== 6}
              className="admin-btn admin-btn-primary"
              style={{ width: '100%', padding: '11px 0', fontSize: '0.875rem' }}
            >
              {loading ? 'Activating…' : 'Activate 2FA & Generate Recovery Codes'}
            </button>
          </form>
        )}

        {/* Step 2b: Recovery Codes Reveal */}
        {step === 'recovery_codes' && (
          <div>
            <div style={{
              backgroundColor: 'var(--warning-bg, #FFFBEB)',
              border: '1px solid var(--warning-border, #FDE68A)',
              borderRadius: 10,
              padding: '12px 14px',
              color: 'var(--warning-text, #92400E)',
              fontSize: '0.775rem',
              lineHeight: 1.4,
              marginBottom: 16
            }}>
              <strong>Save these recovery codes now.</strong> If you lose access to your phone or authenticator app, these are the ONLY way to log into the platform. Each code works once.
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              backgroundColor: 'var(--bg-page, #FAFAF9)',
              padding: 14,
              borderRadius: 10,
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '0.825rem',
              color: 'var(--color-heading, #1C1917)',
              marginBottom: 16,
              border: '1px solid var(--color-border, #E7E5E4)'
            }}>
              {recoveryCodes.map((code, idx) => (
                <div key={idx} style={{ padding: '3px 4px' }}>
                  <span style={{ color: 'var(--color-text-muted)', marginRight: 6 }}>{idx + 1}.</span>
                  <strong>{code}</strong>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <button
                type="button"
                onClick={handleCopyRecoveryCodes}
                className="admin-btn admin-btn-secondary"
                style={{ flex: 1 }}
              >
                {copiedCodes ? <Check size={14} style={{ color: 'var(--success-solid)' }} /> : <Copy size={14} />}
                <span>{copiedCodes ? 'Copied!' : 'Copy All'}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadCodes}
                className="admin-btn admin-btn-secondary"
                style={{ flex: 1 }}
              >
                <Download size={14} />
                <span>Download .txt</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => onLoginSuccess(authResponse)}
              className="admin-btn admin-btn-primary"
              style={{ width: '100%', padding: '11px 0', fontSize: '0.875rem' }}
            >
              I Have Saved My Recovery Codes — Open Dashboard
            </button>
          </div>
        )}

        {/* Step 2c: Standard 2FA Verification */}
        {step === 'verify' && (
          <form onSubmit={handleVerify2FA}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-heading, #1C1917)', marginBottom: 6 }}>
                {isRecoveryMode ? 'One-Time Recovery Code (XXXX-XXXX)' : '6-Digit TOTP Code'}
              </label>
              <div style={{ position: 'relative' }}>
                <KeyRound size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--color-text-muted, #78716C)' }} />
                <input
                  type="text"
                  required
                  autoFocus
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder={isRecoveryMode ? 'ABCD-EFGH' : '123456'}
                  className="admin-input"
                  style={{
                    width: '100%',
                    paddingLeft: 38,
                    textAlign: isRecoveryMode ? 'left' : 'center',
                    fontSize: isRecoveryMode ? '1rem' : '1.35rem',
                    fontWeight: 700,
                    letterSpacing: isRecoveryMode ? '0.1em' : '0.25em',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !totpCode.trim()}
              className="admin-btn admin-btn-primary"
              style={{ width: '100%', padding: '11px 0', fontSize: '0.875rem', marginBottom: 14 }}
            >
              {loading ? 'Verifying…' : (isRecoveryMode ? 'Verify Recovery Code' : 'Verify & Enter Control Center')}
            </button>

            <div style={{ textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  setIsRecoveryMode(!isRecoveryMode);
                  setTotpCode('');
                  setError('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-brand, #C2410C)',
                  fontSize: '0.775rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {isRecoveryMode ? 'Use Authenticator App 6-Digit Code' : 'Lost authenticator? Use a one-time recovery code'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
