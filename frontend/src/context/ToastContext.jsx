import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((type, message, duration = 4000) => {
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    setToasts((prev) => [...prev, { id, type, message }]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
    return id;
  }, [removeToast]);

  const toast = useMemo(() => ({
    success: (msg, dur = 3500) => addToast('success', msg, dur),
    error: (msg, dur = 5000) => addToast('error', msg, dur),
    info: (msg, dur = 4000) => addToast('info', msg, dur),
    warning: (msg, dur = 4500) => addToast('warning', msg, dur),
    dismiss: removeToast,
  }), [addToast, removeToast]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Toast Notification Container */}
      <aside
        aria-live="polite"
        aria-atomic="true"
        className="toast-container"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          pointerEvents: 'none',
          maxWidth: 'calc(100vw - 32px)',
          width: 380,
        }}
      >
        {toasts.map((t) => {
          let icon = <CheckCircle2 size={18} style={{ color: '#16A34A', flexShrink: 0 }} />;
          let borderColor = '#BBF7D0';
          let accentBg = '#F0FDF4';

          if (t.type === 'error') {
            icon = <AlertCircle size={18} style={{ color: '#DC2626', flexShrink: 0 }} />;
            borderColor = '#FECACA';
            accentBg = '#FEF2F2';
          } else if (t.type === 'warning') {
            icon = <AlertTriangle size={18} style={{ color: '#D97706', flexShrink: 0 }} />;
            borderColor = '#FDE68A';
            accentBg = '#FFFBEB';
          } else if (t.type === 'info') {
            icon = <Info size={18} style={{ color: '#2563EB', flexShrink: 0 }} />;
            borderColor = '#BFDBFE';
            accentBg = '#EFF6FF';
          }

          return (
            <div
              key={t.id}
              role="alert"
              className="toast-item"
              style={{
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
                padding: '12px 14px',
                backgroundColor: '#FFFFFF',
                borderRadius: 'var(--radius-lg)',
                border: `1px solid ${borderColor}`,
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
                animation: 'toastSlideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    backgroundColor: accentBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {icon}
                </div>
                <div
                  style={{
                    fontSize: '0.86rem',
                    color: 'var(--color-heading)',
                    lineHeight: 1.45,
                    paddingTop: 3,
                    wordBreak: 'break-word',
                  }}
                >
                  {t.message}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                aria-label="Dismiss notification"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  padding: 4,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-heading)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </aside>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    // Graceful fallback if invoked outside ToastProvider
    return {
      success: (m) => console.log('Toast success:', m),
      error: (m) => console.error('Toast error:', m),
      info: (m) => console.log('Toast info:', m),
      warning: (m) => console.warn('Toast warning:', m),
      dismiss: () => {},
    };
  }
  return context;
}

export default useToast;
