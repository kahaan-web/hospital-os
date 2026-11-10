'use client';

import { Dialog, Input } from '@hos/ui';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

export interface CommandItem {
  id: string;
  label: string;
  keywords?: string;
  onSelect: () => void;
}

export interface CommandPaletteProps {
  items: CommandItem[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CommandPalette({ items, open, onOpenChange }: CommandPaletteProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [query, setQuery] = useState('');
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.keywords?.toLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQuery('');
      }}
      title="Command palette"
      description="Jump to a page or action. Press Ctrl+K to open."
    >
      <div style={{ display: 'flex', gap: 'var(--hos-space-2)', alignItems: 'center' }}>
        <Search size={18} aria-hidden style={{ color: 'var(--hos-fg-muted)' }} />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search commands…"
          aria-label="Search commands"
          autoFocus
        />
      </div>
      <ul
        role="listbox"
        aria-label="Commands"
        style={{ listStyle: 'none', margin: 'var(--hos-space-4) 0 0', padding: 0 }}
      >
        {filtered.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="hos-dropdown__item"
              style={{ width: '100%' }}
              onClick={() => {
                item.onSelect();
                setOpen(false);
                setQuery('');
              }}
            >
              {item.label}
            </button>
          </li>
        ))}
        {filtered.length === 0 ? (
          <li style={{ padding: 'var(--hos-space-3)', color: 'var(--hos-fg-muted)', fontSize: 'var(--hos-text-sm)' }}>
            No matching commands.
          </li>
        ) : null}
      </ul>
    </Dialog>
  );
}
