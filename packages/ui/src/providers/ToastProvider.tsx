'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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

function ToastItem({
  toast: t,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef = useRef(t.durationMs ?? 4500);
  const pausedRef = useRef(false);
  const startedRef = useRef(Date.now());

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const schedule = useCallback(
    (ms: number) => {
      clearTimer();
      timerRef.current = setTimeout(() => onDismiss(t.id), ms);
    },
    [onDismiss, t.id],
  );

  useEffect(() => {
    schedule(remainingRef.current);
    return clearTimer;
  }, [schedule]);

  const pause = () => {
    if (pausedRef.current) return;
    pausedRef.current = true;
    clearTimer();
    remainingRef.current -= Date.now() - startedRef.current;
  };

  const resume = () => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    startedRef.current = Date.now();
    schedule(Math.max(remainingRef.current, 1000));
  };

  return (
    <div
      className={cn(
        'hos-toast',
        t.tone === 'success' && 'hos-toast--success',
        t.tone === 'error' && 'hos-toast--error',
      )}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      <strong style={{ display: 'block' }}>{t.title}</strong>
      {t.description ? (
        <p style={{ margin: '4px 0 0', color: 'var(--hos-fg-secondary)' }}>{t.description}</p>
      ) : null}
      <button
        type="button"
        className="hos-btn hos-btn--ghost hos-btn--sm"
        style={{ marginTop: 'var(--hos-space-2)' }}
        onClick={() => onDismiss(t.id)}
      >
        Dismiss
      </button>
    </div>
  );
}

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
    },
    [],
  );

  const value = useMemo(() => ({ toasts, toast, dismiss }), [toasts, toast, dismiss]);

  const liveTone = toasts.some((t) => t.tone === 'error') ? 'assertive' : 'polite';

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="hos-toast-viewport" aria-live={liveTone} aria-atomic="true">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
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
