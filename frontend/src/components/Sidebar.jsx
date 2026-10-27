import React, { useState } from 'react';
import {
  LayoutDashboard,
  Grid,
  Lock,
  Users,
  CreditCard,
  QrCode,
  BellRing,
  LogOut,
  Building2,
  Settings as SettingsIcon,
  Sparkles,
  Wallet,
  ChevronDown,
  ChevronUp,
  User,
  Info,
} from 'lucide-react';
import PlanDetailsModal from './PlanDetailsModal';
import SupportModal from './SupportModal';

export default function Sidebar({ activeTab, setActiveTab, user, tenant, onLogout }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'seatmap', label: 'Visual Seat Map', icon: Grid },
    { id: 'lockers', label: 'Locker Management', icon: Lock },
    { id: 'students', label: 'Students', icon: Users },
    { id: 'billing', label: 'Fee & Billing', icon: CreditCard },
    { id: 'budget', label: 'Budget & Profit', icon: Wallet },
    { id: 'attendance', label: 'Attendance & QR', icon: QrCode },
    { id: 'reminders', label: 'WhatsApp Reminders', icon: BellRing },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  const getInitials = (name) => {
    if (!name) return 'SS';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const displayName = user?.full_name || tenant?.owner_name || 'shivam kumar singh';
  const displayEmail = user?.email || 'kumarsinghshivam325@gmail.com';

  const handleEditProfile = () => {
    setActiveTab('account-settings');
    setIsExpanded(false);
  };

  const handleAccountSettings = () => {
    setActiveTab('account-settings');
    setIsExpanded(false);
  };

  const handleOpenSupport = () => {
    setShowSupportModal(true);
  };

  const handleOpenMyPlan = () => {
    setShowPlanModal(true);
  };

  return (
    <>
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

        {/* Expandable Sidebar Footer */}
        <div className="sidebar-footer" style={{ padding: '10px 12px' }}>
          {/* Header Row (Click to toggle expansion) */}
          <div
            className="sidebar-account-toggle"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Collapse account menu' : 'Expand account menu'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
              <div
                className="user-avatar"
                style={{
                  background: 'linear-gradient(135deg, #C2410C 0%, #EA580C 100%)',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  letterSpacing: '0.02em',
                  flexShrink: 0,
                  boxShadow: '0 2px 8px rgba(194, 65, 12, 0.28)',
                }}
              >
                {getInitials(displayName)}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: 'var(--color-heading)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {displayName}
                  </span>
                  <span title="Owner" style={{ fontSize: '0.85rem', flexShrink: 0 }}>
                    👑
                  </span>
                </div>
                <div
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--color-text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {displayEmail}
                </div>
              </div>
            </div>

            <div style={{ color: 'var(--color-text-secondary)', padding: '2px', display: 'flex', alignItems: 'center' }}>
              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </div>

          {/* Expanded Menu Options */}
          {isExpanded && (
            <div className="sidebar-account-menu">
              <button
                type="button"
                className="sidebar-account-item"
                onClick={handleEditProfile}
              >
                <User size={16} />
                <span>Edit profile</span>
              </button>

              <button
                type="button"
                className="sidebar-account-item"
                onClick={handleAccountSettings}
              >
                <SettingsIcon size={16} />
                <span>Account settings</span>
              </button>

              <button
                type="button"
                className="sidebar-account-item"
                onClick={handleOpenSupport}
              >
                <Info size={16} />
                <span>Support</span>
              </button>

              <button
                type="button"
                className="sidebar-account-item"
                onClick={handleOpenMyPlan}
              >
                <CreditCard size={16} />
                <span>My Plan</span>
              </button>

              <button
                type="button"
                className="sidebar-account-item danger"
                onClick={onLogout}
                style={{ marginTop: 2, borderTop: '1px solid #F1F5F9', paddingTop: 8 }}
              >
                <LogOut size={16} />
                <span>Sign Out</span>
              </button>

              <div
                style={{
                  fontSize: '0.72rem',
                  color: '#94A3B8',
                  textAlign: 'center',
                  paddingTop: 6,
                  userSelect: 'none',
                }}
              >
                v1.1
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Plan Details Modal */}
      {showPlanModal && (
        <PlanDetailsModal
          tenant={tenant}
          onClose={() => setShowPlanModal(false)}
        />
      )}

      {/* Support Help Modal */}
      {showSupportModal && (
        <SupportModal
          onClose={() => setShowSupportModal(false)}
        />
      )}
    </>
  );
}
