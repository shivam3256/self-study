import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Building2, History, LogOut, ShieldCheck } from 'lucide-react';
import { adminApi, getAdminToken, clearAdminSession, setAdminInfo } from './adminApi';
import AdminLogin from './AdminLogin';
import AdminDashboard from './AdminDashboard';
import AdminLibraries from './AdminLibraries';
import AdminAuditLogs from './AdminAuditLogs';
import './admin.css';

export default function SuperAdminApp() {
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'libraries' | 'audit'
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  // Invalidate web crawlers with noindex dynamically
  useEffect(() => {
    let meta = document.querySelector('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      document.head.appendChild(meta);
    }
    meta.content = 'noindex, nofollow';

    const originalTitle = document.title;
    document.title = 'LibMa — Platform Super Admin';

    return () => {
      document.title = originalTitle;
    };
  }, []);

  // Validate existing admin session on mount
  useEffect(() => {
    const verifySession = async () => {
      const token = getAdminToken();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const me = await adminApi.auth.getMe();
        setAdmin(me);
        setAdminInfo(me);
      } catch {
        clearAdminSession();
        setAdmin(null);
      } finally {
        setLoading(false);
      }
    };
    verifySession();
  }, []);

  const handleLogout = async () => {
    try {
      await adminApi.auth.logout();
    } catch {
      // ignore network errors on signout
    } finally {
      clearAdminSession();
      setAdmin(null);
    }
  };

  const handleLoginSuccess = (authData) => {
    setAdmin({ id: authData.admin_id, email: authData.email });
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--bg-canvas, #FAFAF9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-secondary, #57534E)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'linear-gradient(135deg, #C2410C 0%, #EA580C 50%, #D97706 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px',
            boxShadow: '0 2px 8px rgba(194, 65, 12, 0.22)'
          }}>
            <img
              src="/brand/libma-icon.svg"
              alt="LibMa"
              style={{ width: 26, height: 26, filter: 'brightness(0) invert(1)' }}
            />
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-heading, #1C1917)', marginBottom: 4 }}>
            LibMa Control Center
          </div>
          <div style={{ fontSize: '0.8125rem' }}>Verifying admin credentials…</div>
        </div>
      </div>
    );
  }

  // If not authenticated, render 2FA Login view matching LibMa style
  if (!admin) {
    return <AdminLogin onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="admin-layout">
      {/* Top Navigation Bar matching LibMa style */}
      <header className="admin-header">
        <div className="admin-brand">
          <div className="admin-brand-icon">
            <img
              src="/brand/libma-icon.svg"
              alt="LibMa"
              style={{ width: 22, height: 22, filter: 'brightness(0) invert(1)' }}
            />
          </div>
          <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-heading, #1C1917)', letterSpacing: '-0.02em' }}>
            LibMa
          </span>
          <span className="admin-badge">Super Admin</span>
        </div>

        {/* Center Pill Nav Bar */}
        <nav className="admin-nav">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`admin-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          >
            <LayoutDashboard size={15} />
            <span>Dashboard</span>
          </button>
          <button
            onClick={() => setActiveTab('libraries')}
            className={`admin-nav-item ${activeTab === 'libraries' ? 'active' : ''}`}
          >
            <Building2 size={15} />
            <span>Libraries</span>
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`admin-nav-item ${activeTab === 'audit' ? 'active' : ''}`}
          >
            <History size={15} />
            <span>Audit Trail</span>
          </button>
        </nav>

        {/* User profile & Logout */}
        <div className="admin-user-menu">
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-heading, #1C1917)' }}>
              {admin.email}
            </div>
            <div style={{ fontSize: '0.675rem', color: 'var(--color-brand, #C2410C)', fontWeight: 600 }}>
              Platform Owner
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="admin-btn admin-btn-secondary"
            title="Sign out of Super Admin"
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="admin-content">
        {activeTab === 'dashboard' && (
          <AdminDashboard
            onNavigateToLibraries={() => setActiveTab('libraries')}
            onNavigateToAuditLogs={() => setActiveTab('audit')}
          />
        )}
        {activeTab === 'libraries' && <AdminLibraries />}
        {activeTab === 'audit' && <AdminAuditLogs />}
      </main>
    </div>
  );
}
