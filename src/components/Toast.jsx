/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

let counter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const show = useCallback((message, opts = {}) => {
    const id = ++counter;
    const variant = opts.variant || 'info';
    const duration = opts.duration ?? 4000;
    setToasts(prev => [...prev, { id, message, variant }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
    return id;
  }, []);

  const api = {
    info: (m, o) => show(m, { ...o, variant: 'info' }),
    success: (m, o) => show(m, { ...o, variant: 'success' }),
    error: (m, o) => show(m, { ...o, variant: 'error' }),
    dismiss
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" role="region" aria-label="Notifikasi">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`toast toast--${t.variant}`}
            role={t.variant === 'error' ? 'alert' : 'status'}
            onClick={() => dismiss(t.id)}
          >
            <span className="toast__icon">
              {t.variant === 'success' ? '✓' : t.variant === 'error' ? '!' : 'i'}
            </span>
            <span className="toast__message">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
