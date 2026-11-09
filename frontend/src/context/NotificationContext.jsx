import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api, getAuthToken } from '../api';
import { useToast } from './ToastContext';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const toast = useToast();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const isFetchingRef = useRef(false);

  const fetchNotifications = useCallback(async (isBackground = false) => {
    const token = getAuthToken();
    if (!token) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (!isBackground) {
      setLoading(true);
    }

    try {
      const res = await api.notifications.list(20);
      if (res) {
        setNotifications(res.notifications || []);
        setUnreadCount(res.unread_count || 0);
      }
    } catch (err) {
      // Don't show toast for silent background polling
      if (!isBackground && err.status !== 401) {
        console.error('Failed to fetch notifications:', err);
      }
    } finally {
      if (!isBackground) {
        setLoading(false);
      }
      isFetchingRef.current = false;
    }
  }, []);

  // Poll every 60s while tab is visible, refetch when tab regains focus
  useEffect(() => {
    fetchNotifications();

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchNotifications(true);
      }
    }, 60000);

    const handleFocusOrVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchNotifications(true);
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
    };
  }, [fetchNotifications]);

  // Optimistic mark as read
  const markAsRead = useCallback(async (id) => {
    const prevNotifications = [...notifications];
    const prevCount = unreadCount;

    const target = notifications.find((n) => n.id === id);
    if (!target || target.read_at) return;

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));

    try {
      await api.notifications.markRead(id);
    } catch (err) {
      setNotifications(prevNotifications);
      setUnreadCount(prevCount);
      toast.error(err.message || 'Failed to mark notification as read.');
    }
  }, [notifications, unreadCount, toast]);

  // Optimistic mark all as read
  const markAllAsRead = useCallback(async () => {
    if (unreadCount === 0) return;

    const prevNotifications = [...notifications];
    const prevCount = unreadCount;
    const nowIso = new Date().toISOString();

    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at || nowIso }))
    );
    setUnreadCount(0);

    try {
      await api.notifications.markAllRead();
      toast.success('All notifications marked as read.');
    } catch (err) {
      setNotifications(prevNotifications);
      setUnreadCount(prevCount);
      toast.error(err.message || 'Failed to mark all notifications as read.');
    }
  }, [notifications, unreadCount, toast]);

  // Optimistic dismiss
  const dismiss = useCallback(async (id) => {
    const prevNotifications = [...notifications];
    const prevCount = unreadCount;

    const target = notifications.find((n) => n.id === id);
    if (!target) return;

    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (!target.read_at) {
      setUnreadCount((c) => Math.max(0, c - 1));
    }

    try {
      await api.notifications.dismiss(id);
    } catch (err) {
      setNotifications(prevNotifications);
      setUnreadCount(prevCount);
      toast.error(err.message || 'Failed to dismiss notification.');
    }
  }, [notifications, unreadCount, toast]);

  // Retry failed WhatsApp reminder
  const retryWhatsApp = useCallback(async (id) => {
    try {
      await api.notifications.retryWhatsApp(id);
      toast.success('WhatsApp reminder delivered successfully.');
      fetchNotifications(true);
    } catch (err) {
      toast.error(err.message || 'WhatsApp retry failed.');
      throw err;
    }
  }, [toast, fetchNotifications]);

  // Send birthday wishes
  const sendBirthdayWishes = useCallback(async (id, student) => {
    try {
      await api.notifications.sendBirthdayWishes(id);
      toast.success(`Birthday wishes sent to ${student?.full_name || 'student'}! 🎂`);
      fetchNotifications(true);
    } catch (err) {
      toast.error(err.message || 'Failed to send birthday wishes.');
      throw err;
    }
  }, [toast, fetchNotifications]);

  const value = {
    notifications,
    unreadCount,
    loading,
    isOpen,
    setIsOpen,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    dismiss,
    retryWhatsApp,
    sendBirthdayWishes,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return ctx;
}

