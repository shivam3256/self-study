import React, { useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
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

export default function Sidebar({ _activeTab, setActiveTab, user, tenant, onLogout }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const navigate = useNavigate();

  const managementNavItems = [
    { id: 'dashboard', path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'seatmap', path: '/seatmap', label: 'Visual Seat Map', icon: Grid },
    { id: 'lockers', path: '/lockers', label: 'Locker Management', icon: Lock },
    { id: 'students', path: '/students', label: 'Students', icon: Users },
    { id: 'billing', path: '/billing', label: 'Fee & Billing', icon: CreditCard },
    { id: 'budget', path: '/budget', label: 'Budget & Profit', icon: Wallet },
    { id: 'attendance', path: '/attendance', label: 'Attendance & QR', icon: QrCode },
    { id: 'reminders', path: '/reminders', label: 'WhatsApp Reminders', icon: BellRing },
  ];

  const configNavItems = [
    { id: 'settings', path: '/settings', label: 'Settings', icon: SettingsIcon },
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
    if (setActiveTab) setActiveTab('account-settings');
    navigate('/account-settings');
    setIsExpanded(false);
  };

  const handleAccountSettings = () => {
    if (setActiveTab) setActiveTab('account-settings');
    navigate('/account-settings');
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
          <Link
            to="/dashboard"
            style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}
            title="LibMa — Dashboard"
          >
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
          </Link>
        </div>

        <nav className="sidebar-nav" aria-label="Sidebar Navigation">
          <div className="sidebar-section-label">Management</div>
          {managementNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.id}
                to={item.path}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  if (setActiveTab) setActiveTab(item.id);
                }}
              >
                <div className="nav-indicator" />
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}

          <div className="sidebar-section-label">Configuration</div>
          {configNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.id}
                to={item.path}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  if (setActiveTab) setActiveTab(item.id);
                }}
              >
                <div className="nav-indicator" />
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
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
