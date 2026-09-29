'use client';

import { useDialog } from './useDialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Modal({
  open,
  onClose,
  children,
  width = 'max-w-lg',
  bare,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
  bare?: boolean;
}) {
  const dialogRef = useDialog(open, onClose);

  if (!open) return null;
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Workspace details" tabIndex={-1} className="fixed inset-0 z-[90] flex items-center justify-center p-4 anim-fade-in">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          'relative w-full card anim-fade-up max-h-[calc(100dvh-32px)] overflow-y-auto',
          width,
          bare && 'bg-transparent border-0 shadow-none'
        )}
        style={{ background: bare ? 'transparent' : undefined }}
      >
        {!bare && (
          <button
            onClick={onClose}
            className="absolute right-3 top-3 z-10 p-1.5 rounded-lg text-ink3 hover:text-ink hover:bg-panel2 transition"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
