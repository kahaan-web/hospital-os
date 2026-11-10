import { icons, Package, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function moduleLucideIcon(iconName: string, size = 18): ReactNode {
  const Icon: LucideIcon =
    iconName in icons ? (icons[iconName as keyof typeof icons] as LucideIcon) : Package;
  return <Icon size={size} aria-hidden strokeWidth={1.5} />;
}
