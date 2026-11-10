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

export function UserMenu({ name, email: _email, onSignOut, onSettings, extraItems = [] }: UserMenuProps) {
  const items: DropdownMenuItem[] = [
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
        <Button variant="secondary" size="sm">
          <User size={16} aria-hidden />
          <span style={{ maxWidth: '8rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
          <ChevronDown size={14} aria-hidden />
        </Button>
      }
      items={items.map((item) => ({
        ...item,
        label: (
          <span style={{ display: 'inline-flex', gap: 'var(--hos-space-2)', alignItems: 'center' }}>
            {item.id === 'signout' ? <LogOut size={14} /> : item.id === 'settings' ? <Settings size={14} /> : null}
            {item.label}
          </span>
        ),
      }))}
    />
  );
}
