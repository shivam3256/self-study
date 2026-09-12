import React, { useState } from 'react';
import { Building2, KeyRound, Mail, User, Phone, MapPin, Sparkles, ShieldCheck } from 'lucide-react';
import { api, setAuthToken, setStoredUser } from '../api';

export default function Auth({ onLoginSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register form state
  const [libraryName, setLibraryName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.auth.register({
        library_name: libraryName,
        owner_name: ownerName,
        email,
        phone,
        city,
        password,
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
    setIsRegister(false);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'radial-gradient(circle at 50% 10%, rgba(99, 102, 241, 0.15) 0%, transparent 60%), #090d16',
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: '460px',
          width: '100%',
          padding: '36px 32px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.7)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            className="brand-badge"
            style={{ margin: '0 auto 16px auto', width: 52, height: 52 }}
          >
            <Building2 size={28} />
          </div>
          <h2 style={{ fontSize: '1.6rem', color: '#fff', marginBottom: 6 }}>
            {isRegister ? 'Create Library Workspace' : 'Self-Study SaaS Portal'}
          </h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {isRegister
              ? 'Join as a library owner to manage desks, students & fees'
              : 'Sign in to access your self-study center dashboard'}
          </div>
        </div>

        {/* Demo Fill Shortcut Banner */}
        {!isRegister && (
          <div
            onClick={fillDemo}
            style={{
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%)',
              border: '1px solid var(--border-active)',
              padding: '10px 14px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 20,
              transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#c7d2fe' }}>
              <Sparkles size={16} color="var(--primary)" />
              <span>Click to auto-fill <strong>Apex Library Demo</strong> credentials</span>
            </div>
          </div>
        )}

        {error && (
          <div
            style={{
              background: 'var(--danger-bg)',
              border: '1px solid var(--danger-border)',
              color: '#f87171',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: '0.85rem',
              marginBottom: 18,
            }}
          >
            {error}
          </div>
        )}

        {isRegister ? (
          <form onSubmit={handleRegister}>
            <div className="form-group">
              <label className="form-label">Library / Study Center Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="Takshashila Reading Lounge"
                value={libraryName}
                onChange={(e) => setLibraryName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Owner Full Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ramesh Patel"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Phone Number *</label>
                <input
                  type="tel"
                  className="form-input"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">City *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Jaipur / Delhi"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Email Address *</label>
              <input
                type="email"
                className="form-input"
                placeholder="owner@library.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Create Password *</label>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 8 }}
              disabled={loading}
            >
              {loading ? 'Creating Workspace...' : 'Sign Up & Launch Library'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-input"
                placeholder="owner@apexlibrary.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 8 }}
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In to Dashboard'}
            </button>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {isRegister ? (
            <span>
              Already have a workspace?{' '}
              <button
                onClick={() => setIsRegister(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer' }}
              >
                Sign In
              </button>
            </span>
          ) : (
            <span>
              New library owner?{' '}
              <button
                onClick={() => setIsRegister(true)}
                style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer' }}
              >
                Create Workspace
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
