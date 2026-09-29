'use client';

// Minimal toast system — success / error / info, auto-dismiss.

import { createContext, useCallback, useContext, useState } from 'react';

type ToastTone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  detail?: string;
}

const ToastContext = createContext<{ toast: (tone: ToastTone, title: string, detail?: string) => void }>({
  toast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((tone: ToastTone, title: string, detail?: string) => {
    const id = nextId++;
    setToasts((t) => [...t, { id, tone, title, detail }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="anim-fade-up card px-4 py-3 min-w-[260px] max-w-[360px] pointer-events-auto"
            style={{
              borderColor: t.tone === 'success' ? 'rgba(4,120,87,.5)' : t.tone === 'error' ? 'rgba(244,91,105,.5)' : 'var(--color-line2)',
              background: 'rgba(13,17,24,.97)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div className="flex items-start gap-3">
              <span
                className="mt-0.5 inline-block w-2 h-2 rounded-full shrink-0"
                style={{
                  background: t.tone === 'success' ? 'var(--color-accent)' : t.tone === 'error' ? 'var(--color-danger)' : 'var(--color-info)',
                }}
              />
              <div>
                <div className="text-sm font-semibold text-ink">{t.title}</div>
                {t.detail && <div className="text-xs text-ink2 mt-0.5 leading-relaxed">{t.detail}</div>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
