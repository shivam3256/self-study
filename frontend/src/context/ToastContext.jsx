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
          let icon = <CheckCircle2 size={18} style={{ flexShrink: 0 }} />;
          if (t.type === 'error') icon = <AlertCircle size={18} style={{ flexShrink: 0 }} />;
          else if (t.type === 'warning') icon = <AlertTriangle size={18} style={{ flexShrink: 0 }} />;
          else if (t.type === 'info') icon = <Info size={18} style={{ flexShrink: 0 }} />;

          return (
            <div
              key={t.id}
              role="alert"
              className={`toast-item ${t.type}`}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 }}>
                <div className={`toast-icon-box ${t.type}`}>
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
                className="toast-close-btn"
                onClick={() => removeToast(t.id)}
                aria-label="Dismiss notification"
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
