'use client';

import { Button, DropdownMenu, type DropdownMenuItem } from '@hos/ui';
import { ChevronDown, LogOut, Settings, User } from 'lucide-react';
import type { ReactNode } from 'react';

export interface UserMenuProps {
  name: string;
  email?: string;
  onSignOut?: () => void;
  onSettings?: () => void;
  extraItems?: { id: string; label: ReactNode; onSelect?: () => void }[];
}

export function UserMenu({ name, email, onSignOut, onSettings, extraItems = [] }: UserMenuProps) {
  const items: DropdownMenuItem[] = [
    ...(email
      ? [{ id: 'email', label: email, disabled: true } satisfies DropdownMenuItem]
      : []),
    ...extraItems.map((x) => ({ id: x.id, label: x.label, onSelect: x.onSelect })),
    ...(onSettings ? [{ id: 'settings', label: 'Settings', onSelect: onSettings }] : []),
    ...(onSignOut
      ? [{ id: 'signout', label: 'Sign out', onSelect: onSignOut, destructive: true }]
      : []),
  ];

  return (
    <DropdownMenu
      label="User account menu"
      trigger={
        <Button variant="secondary" size="sm" aria-label={email ? `${name}, ${email}` : name}>
          <User size={16} aria-hidden strokeWidth={1.5} />
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.2 }}>
            <span style={{ maxWidth: '8rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
            {email ? (
              <span style={{ fontSize: 'var(--hos-text-xs)', color: 'var(--hos-fg-muted)', fontWeight: 400 }}>
                {email}
              </span>
            ) : null}
          </span>
          <ChevronDown size={14} aria-hidden strokeWidth={1.5} />
        </Button>
      }
      items={items.map((item) => ({
        ...item,
        label:
          item.id === 'email' ? (
            <span style={{ fontSize: 'var(--hos-text-xs)', color: 'var(--hos-fg-muted)' }}>{item.label}</span>
          ) : (
            <span style={{ display: 'inline-flex', gap: 'var(--hos-space-2)', alignItems: 'center' }}>
              {item.id === 'signout' ? <LogOut size={14} strokeWidth={1.5} /> : item.id === 'settings' ? <Settings size={14} strokeWidth={1.5} /> : null}
              {item.label}
            </span>
          ),
      }))}
    />
  );
}
