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
  Settings as SettingsIcon,
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

  const managementNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'seatmap', label: 'Visual Seat Map', icon: Grid },
    { id: 'lockers', label: 'Locker Management', icon: Lock },
    { id: 'students', label: 'Students', icon: Users },
    { id: 'billing', label: 'Fee & Billing', icon: CreditCard },
    { id: 'budget', label: 'Budget & Profit', icon: Wallet },
    { id: 'attendance', label: 'Attendance & QR', icon: QrCode },
    { id: 'reminders', label: 'WhatsApp Reminders', icon: BellRing },
  ];

  const configNavItems = [
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
            <img
              src="/brand/libma-icon.svg"
              alt="LibMa"
              className="brand-badge-icon"
            />
          </div>
          <div className="brand-info">
            <div
              className="brand-name"
              title="LibMa"
              aria-label="LibMa"
            >
              LibMa
            </div>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Sidebar Navigation">
          <div className="sidebar-section-label">Management</div>
          {managementNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                <div className="nav-indicator" />
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}

          <div className="sidebar-section-label">Configuration</div>
          {configNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                <div className="nav-indicator" />
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Expandable Sidebar Footer */}
        <div className="sidebar-footer">
          {/* Header Row (Click to toggle expansion) */}
          <div
            className="sidebar-account-toggle"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Collapse account menu' : 'Expand account menu'}
          >
            <div className="sidebar-user-info">
              <div className="user-avatar">
                {getInitials(displayName)}
              </div>
              <div className="sidebar-user-details">
                <div className="sidebar-user-name-row">
                  <span className="sidebar-user-name">{displayName}</span>
                  <span className="sidebar-user-crown" title="Owner">👑</span>
                </div>
                <div className="sidebar-user-email">{displayEmail}</div>
              </div>
            </div>

            <div className="sidebar-chevron">
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
              >
                <LogOut size={16} />
                <span>Sign Out</span>
              </button>

              <div className="sidebar-version">
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
