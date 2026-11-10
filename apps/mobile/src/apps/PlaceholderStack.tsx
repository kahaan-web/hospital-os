import type { MobileRole } from '@hos/shared';
import { Stack } from 'expo-router';
import { useTheme } from '../theme-context';
import { RoleGate } from './RoleGate';

export function AppStack({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        title,
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
      }}
    />
  );
}

export function PlaceholderStack({ title, role }: { title: string; role: MobileRole }) {
  return (
    <RoleGate role={role}>
      <AppStack title={title} />
    </RoleGate>
  );
}
