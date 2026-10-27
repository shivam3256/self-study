import { useEffect } from 'react';

/**
 * Custom hook to dismiss modals or overlays when the Escape key is pressed.
 * @param {Function} onClose - Callback invoked on Escape press.
 * @param {boolean} [enabled=true] - Whether the listener is active.
 */
export function useEscapeDismiss(onClose, enabled = true) {
  useEffect(() => {
    if (!enabled || typeof onClose !== 'function') return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, enabled]);
}

export default useEscapeDismiss;
