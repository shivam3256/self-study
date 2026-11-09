import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  Cake,
  X,
  RotateCcw,
  Receipt,
  MessageSquare,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';

function getRelativeTime(dateString) {
  if (!dateString) return '';
  const now = new Date();
  const d = new Date(dateString);
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function isTodayDate(dateString) {
  if (!dateString) return false;
  const d = new Date(dateString);
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

export default function NotificationsPopover({
  anchorRef,
  onClose,
  onNavigateStudent,
  onOpenPayment,
}) {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    dismiss,
    retryWhatsApp,
    sendBirthdayWishes,
  } = useNotifications();

  const popoverRef = useRef(null);
  const [retryingId, setRetryingId] = useState(null);
  const [wishingId, setWishingId] = useState(null);

  // Close on outside click or Esc
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        anchorRef?.current?.focus?.();
      }
    };

    const handleClickOutside = (e) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        anchorRef?.current &&
        !anchorRef.current.contains(e.target)
      ) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose, anchorRef]);

  // Group notifications into "Today" and "Earlier"
  const todayItems = notifications.filter((n) => isTodayDate(n.created_at));
  const earlierItems = notifications.filter((n) => !isTodayDate(n.created_at));

  const handleItemClick = (n) => {
    markAsRead(n.id);
    if (n.student_id && onNavigateStudent) {
      onNavigateStudent(n.student_id);
      onClose();
    }
  };

  const handleRetry = async (e, n) => {
    e.stopPropagation();
    setRetryingId(n.id);
    try {
      await retryWhatsApp(n.id);
    } catch {
      // toast shown by context
    } finally {
      setRetryingId(null);
    }
  };

  const handleRemindWhatsApp = (e, n) => {
    e.stopPropagation();
    markAsRead(n.id);
    if (!n.student_phone || n.student_phone === 'N/A') {
      alert(`No contact phone available for this student.`);
      return;
    }
    let digits = n.student_phone.replace(/\D/g, '');
    if (digits.length === 10) digits = `91${digits}`;
    const text = encodeURIComponent(
      `Hello ${n.student_name || 'Member'}, this is a gentle reminder that your membership at the library expires today. Please renew to avoid any interruption to your seat access.`
    );
    window.open(`https://wa.me/${digits}?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const handleSendWishes = async (e, n) => {
    e.stopPropagation();
    setWishingId(n.id);
    try {
      await sendBirthdayWishes(n.id, { full_name: n.student_name, phone: n.student_phone });
    } catch {
      // toast shown by context
    } finally {
      setWishingId(null);
    }
  };

  const handleCollectFee = (e, n) => {
    e.stopPropagation();
    markAsRead(n.id);
    if (onOpenPayment && n.student_id) {
      onOpenPayment(n.student_id);
      onClose();
    }
  };

  const handleDismiss = (e, n) => {
    e.stopPropagation();
    dismiss(n.id);
  };

  const renderItem = (n) => {
    const isUnread = !n.read_at;
    const isRetrying = retryingId === n.id;
    const isWishing = wishingId === n.id;

    let icon = <Clock size={16} />;
    let iconClass = 'notif-icon-orange';

    if (n.type === 'whatsapp_failed') {
      icon = <AlertTriangle size={16} />;
      iconClass = 'notif-icon-danger';
    } else if (n.type === 'birthday') {
      icon = <Cake size={16} />;
      iconClass = 'notif-icon-birthday';
    }

    return (
      <div
        key={n.id}
        className={`notif-item ${isUnread ? 'unread' : ''}`}
        onClick={() => handleItemClick(n)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleItemClick(n);
        }}
      >
        <div className={`notif-icon-badge ${iconClass}`}>
          {icon}
        </div>

        <div className="notif-content">
          <div className="notif-title-row">
            <span className="notif-title">{n.title}</span>
            <button
              type="button"
              className="notif-dismiss-btn"
              onClick={(e) => handleDismiss(e, n)}
              aria-label="Dismiss notification"
              title="Dismiss"
            >
              <X size={13} />
            </button>
          </div>

          <div className="notif-body">{n.body}</div>

          <div className="notif-footer">
            <span className="notif-time">{getRelativeTime(n.created_at)}</span>

            {/* Quick action buttons */}
            <div className="notif-actions" onClick={(e) => e.stopPropagation()}>
              {n.type === 'whatsapp_failed' && (
                <button
                  type="button"
                  className="btn btn-sm btn-secondary notif-action-btn"
                  onClick={(e) => handleRetry(e, n)}
                  disabled={isRetrying}
                >
                  <RotateCcw size={12} className={isRetrying ? 'spin-icon' : ''} />
                  <span>{isRetrying ? 'Retrying…' : 'Retry'}</span>
                </button>
              )}

              {n.type === 'membership_expiring' && (
                <>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary notif-action-btn"
                    onClick={(e) => handleRemindWhatsApp(e, n)}
                  >
                    <MessageSquare size={12} />
                    <span>Remind</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary notif-action-btn"
                    onClick={(e) => handleCollectFee(e, n)}
                  >
                    <Receipt size={12} />
                    <span>Collect fee</span>
                  </button>
                </>
              )}

              {n.type === 'birthday' && (
                <button
                  type="button"
                  className="btn btn-sm btn-primary notif-action-btn"
                  onClick={(e) => handleSendWishes(e, n)}
                  disabled={isWishing}
                >
                  <Sparkles size={12} className={isWishing ? 'spin-icon' : ''} />
                  <span>{isWishing ? 'Sending…' : 'Send wishes'}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {isUnread && <span className="notif-unread-dot" />}
      </div>
    );
  };

  return (
    <div
      ref={popoverRef}
      className="notif-popover"
      role="region"
      aria-label="Notifications panel"
    >
      {/* Header */}
      <div className="notif-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 className="notif-header-title">Notifications</h3>
          {unreadCount > 0 && (
            <span className="notif-count-pill">{unreadCount}</span>
          )}
        </div>

        <button
          type="button"
          className="notif-mark-all-btn"
          onClick={markAllAsRead}
          disabled={unreadCount === 0}
        >
          Mark all as read
        </button>
      </div>

      {/* Body */}
      <div className="notif-list-container">
        {notifications.length === 0 ? (
          <div className="notif-empty-state">
            <div className="notif-empty-icon">
              <CheckCircle2 size={24} color="var(--success-solid)" />
            </div>
            <div className="notif-empty-title">You're all caught up</div>
            <div className="notif-empty-subtitle">
              No new alerts or pending tasks right now.
            </div>
          </div>
        ) : (
          <>
            {todayItems.length > 0 && (
              <div className="notif-section">
                <div className="notif-section-label">Today</div>
                {todayItems.map(renderItem)}
              </div>
            )}

            {earlierItems.length > 0 && (
              <div className="notif-section">
                <div className="notif-section-label">Earlier</div>
                {earlierItems.map(renderItem)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
