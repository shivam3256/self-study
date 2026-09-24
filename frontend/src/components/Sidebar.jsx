import React from 'react';
import {
  LayoutDashboard,
  Grid,
  Users,
  CreditCard,
  QrCode,
  BellRing,
  LogOut,
  Building2,
  Settings as SettingsIcon,
  Sparkles
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, user, tenant, onLogout }) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'seatmap', label: 'Visual Seat Map', icon: Grid },
    { id: 'students', label: 'Students', icon: Users },
    { id: 'billing', label: 'Fee & Billing', icon: CreditCard },
    { id: 'attendance', label: 'Attendance & QR', icon: QrCode },
    { id: 'reminders', label: 'WhatsApp Reminders', icon: BellRing },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];


  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand-badge">
          <Building2 size={22} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="brand-name">{tenant?.name || 'StudyHub Pro'}</div>
          <div className="brand-sub">Multi-Tenant SaaS</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="user-profile-badge">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div className="user-avatar">
              {user?.full_name ? user.full_name[0].toUpperCase() : 'U'}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.full_name || 'Owner'}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', textTransform: 'capitalize' }}>
                {user?.role || 'Admin'}
              </div>
            </div>
          </div>
          <button
            onClick={onLogout}
            title="Sign Out"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              padding: 6,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
