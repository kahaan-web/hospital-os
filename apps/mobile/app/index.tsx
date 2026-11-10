import { Redirect, type Href } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { hrefForMe } from '../src/apps';
import { useAuth } from '../src/auth';
import { useTheme } from '../src/theme-context';

export default function Index() {
  const { me, loading } = useAuth();
  const { colors } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, justifyContent: 'center', padding: 24 }}>
        <ActivityIndicator color={colors.teal} accessibilityLabel="Loading" />
      </View>
    );
  }
  if (!me) return <Redirect href="/login" />;
  return <Redirect href={hrefForMe(me) as Href} />;
}
