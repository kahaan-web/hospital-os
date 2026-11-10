'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface TabDef {
  value: string;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabDef[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}

export function Tabs({ tabs, defaultValue, value, onValueChange, className }: TabsProps) {
  const initial = defaultValue ?? tabs[0]?.value;
  return (
    <TabsPrimitive.Root
      className={className}
      defaultValue={initial}
      value={value}
      onValueChange={onValueChange}
    >
      <TabsPrimitive.List className="hos-tabs__list" aria-label="Tabs">
        {tabs.map((tab) => (
          <TabsPrimitive.Trigger
            key={tab.value}
            value={tab.value}
            disabled={tab.disabled}
            className="hos-tabs__trigger hos-focus-visible"
          >
            {tab.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {tabs.map((tab) => (
        <TabsPrimitive.Content key={tab.value} value={tab.value} className="hos-tabs__content">
          {tab.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
