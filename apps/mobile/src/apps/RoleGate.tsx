import type { Me, MobileRole } from '@hos/shared';
import { Redirect, type Href } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../auth';
import { copy } from '../copy';
import { useTheme } from '../theme-context';
import { appForMe, hrefForMe } from './index';

export function AuthGate({
  children,
  allow,
}: {
  children: React.ReactNode;
  allow?: (me: Me) => boolean;
}) {
  const { me, loading } = useAuth();
  const { colors } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, justifyContent: 'center', padding: 24 }}>
        <ActivityIndicator color={colors.teal} accessibilityLabel={copy.loading} />
      </View>
    );
  }
  if (!me) return <Redirect href="/login" />;
  if (allow && !allow(me)) return <Redirect href={hrefForMe(me) as Href} />;
  return <>{children}</>;
}

export function RoleGate({ role, children }: { role: MobileRole; children: React.ReactNode }) {
  return <AuthGate allow={(me) => appForMe(me)?.id === role}>{children}</AuthGate>;
}

export function comingSoonAllowed(me: Me): boolean {
  if (me.kind === 'platform') return true;
  return appForMe(me)?.ready === false;
}
