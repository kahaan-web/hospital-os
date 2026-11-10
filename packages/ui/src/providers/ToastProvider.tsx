'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { cn } from '../lib/cn';

export type ToastTone = 'default' | 'success' | 'error';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
}

type ToastContextValue = {
  toasts: ToastMessage[];
  toast: (msg: Omit<ToastMessage, 'id'>) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let toastCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (msg: Omit<ToastMessage, 'id'>) => {
      const id = `toast-${++toastCounter}`;
      const entry: ToastMessage = { id, ...msg };
      setToasts((t) => [...t, entry]);
      const ms = msg.durationMs ?? 4500;
      window.setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toasts, toast, dismiss }), [toasts, toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="hos-toast-viewport" aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'hos-toast',
              t.tone === 'success' && 'hos-toast--success',
              t.tone === 'error' && 'hos-toast--error',
            )}
            role="status"
          >
            <strong style={{ display: 'block' }}>{t.title}</strong>
            {t.description ? (
              <p style={{ margin: '4px 0 0', color: 'var(--hos-fg-secondary)' }}>{t.description}</p>
            ) : null}
            <button
              type="button"
              className="hos-btn hos-btn--ghost hos-btn--sm"
              style={{ marginTop: 'var(--hos-space-2)' }}
              onClick={() => dismiss(t.id)}
            >
              Dismiss
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
