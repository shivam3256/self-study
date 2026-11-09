import React, { useState, useEffect, useRef } from 'react';
import { MapPin, UserPlus, Search, Bell } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import NotificationsPopover from './NotificationsPopover';
import GlobalSearchModal from './GlobalSearchModal';

function getShortcutLabel() {
  if (typeof navigator !== 'undefined') {
    const isMac = /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform || navigator.userAgent);
    return isMac ? '⌘ K' : 'Ctrl K';
  }
  return 'Ctrl K';
}

export default function TopBar({
  title,
  subtitle,
  tenant,
  pageTool = null,
  primaryAction = null,
  onOpenNewStudent,
  onOpenPayment,
  onOpenNewPayment,
  onNavigateStudent,
  onRefreshData,
}) {
  const { unreadCount, isOpen: isBellOpen, setIsOpen: setIsBellOpen } = useNotifications();
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const searchBtnRef = useRef(null);
  const bellBtnRef = useRef(null);

  const shortcutHint = getShortcutLabel();

  // Listen for global keyboard shortcuts (Ctrl+K, Cmd+K, and "/")
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
        return;
      }

      // '/' shortcut (only when not inside input, textarea, select, or contenteditable)
      if (e.key === '/') {
        const tag = e.target?.tagName?.toLowerCase();
        const isEditable = e.target?.isContentEditable;
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || isEditable) {
          return;
        }
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handlePayment = onOpenPayment || onOpenNewPayment;

  const bellAriaLabel =
    unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications';

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          {/* Left: title, subtitle, status chips */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 className="topbar-title" style={{ margin: 0 }}>
                <span>{title}</span>
              </h2>
              {tenant?.city && (
                <div className="location-pill">
                  <MapPin size={13} color="var(--color-brand)" />
                  <span>{tenant.city}</span>
                </div>
              )}
            </div>
            {subtitle && <div className="topbar-subtitle">{subtitle}</div>}
          </div>

          {/* Right: [page-specific tool] [one orange primary button] | divider | [search] [bell] */}
          <div className="topbar-actions">
            {pageTool}

            {primaryAction ? (
              primaryAction
            ) : onOpenNewStudent ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onOpenNewStudent}
                aria-label="Register New Student"
              >
                <UserPlus size={14} />
                <span>New Student</span>
              </button>
            ) : null}

            {/* Thin vertical divider */}
            <div
              className="topbar-divider"
              role="separator"
              aria-orientation="vertical"
            />

            {/* Global Search Icon Button */}
            <button
              ref={searchBtnRef}
              type="button"
              className="topbar-icon-btn"
              onClick={() => setIsSearchOpen(true)}
              title={`Search students (${shortcutHint})`}
              aria-label={`Search students (${shortcutHint})`}
            >
              <Search size={16} />
            </button>

            {/* Bell Notifications Icon Button & Popover */}
            <div className="topbar-bell-wrapper">
              <button
                ref={bellBtnRef}
                type="button"
                className="topbar-icon-btn"
                onClick={() => setIsBellOpen((prev) => !prev)}
                aria-label={bellAriaLabel}
                aria-expanded={isBellOpen}
                aria-haspopup="dialog"
              >
                <Bell size={16} />
                {unreadCount > 0 && (
                  <span className="bell-badge" aria-hidden="true">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {isBellOpen && (
                <NotificationsPopover
                  anchorRef={bellBtnRef}
                  onClose={() => setIsBellOpen(false)}
                  onNavigateStudent={onNavigateStudent}
                  onOpenPayment={handlePayment}
                />
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Global Search Command-Palette Modal */}
      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        triggerRef={searchBtnRef}
        tenant={tenant}
        onOpenPayment={handlePayment}
        onSelectStudent={onNavigateStudent}
        onRefreshData={onRefreshData}
      />
    </>
  );
}
