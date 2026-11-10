'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton } from './IconButton';

export interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
}: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="hos-overlay" />
        <DialogPrimitive.Content
          className="hos-dialog"
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--hos-space-4)', alignItems: 'flex-start' }}>
            <div>
              <DialogPrimitive.Title className="hos-dialog__title">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description style={{ color: 'var(--hos-fg-secondary)', fontSize: 'var(--hos-text-sm)' }}>
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close asChild>
              <IconButton label="Close dialog" size="sm">
                <X size={18} />
              </IconButton>
            </DialogPrimitive.Close>
          </div>
          <div style={{ marginTop: 'var(--hos-space-5)' }}>{children}</div>
          {footer ? <div style={{ marginTop: 'var(--hos-space-5)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--hos-space-2)' }}>{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
