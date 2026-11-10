'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton } from './IconButton';

export interface DrawerProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  title: ReactNode;
  children: ReactNode;
  side?: 'right' | 'left';
}

export function Drawer({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  children,
  side = 'right',
}: DrawerProps) {
  const sideStyle =
    side === 'right'
      ? { right: 0, animationName: 'hos-slide-in' }
      : { left: 0, borderLeft: undefined, borderRight: '1px solid var(--hos-border-default)' };

  return (
    <DialogPrimitive.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="hos-overlay" />
        <DialogPrimitive.Content
          className="hos-drawer"
          style={{
            ...(side === 'left' ? { left: 0, right: 'auto', borderLeft: 'none', borderRight: '1px solid var(--hos-border-default)' } : sideStyle),
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--hos-space-4)' }}>
            <DialogPrimitive.Title className="hos-dialog__title" style={{ margin: 0 }}>
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <IconButton label="Close drawer" size="sm">
                <X size={18} />
              </IconButton>
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
