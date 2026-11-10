import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { copy } from '../copy';
import { USE_MOCK } from '../env';
import { space, type } from '../theme';
import { useTheme } from '../theme-context';
import { Banner } from './Banner';
import { EmptyState } from './EmptyState';

export function Screen({
  title,
  locationName,
  children,
  loading,
  error,
  onRetry,
  empty,
  emptyActionLabel,
  onEmptyAction,
  footer,
}: {
  title: string;
  locationName?: string | null;
  children?: React.ReactNode;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  footer?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.canvas }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.line, backgroundColor: colors.surface }]}>
        <Text style={[type.caption, { color: colors.inkMuted }]}>{copy.appName}</Text>
        <Text style={[type.section, { color: colors.ink }]} accessibilityRole="header">
          {title}
        </Text>
        <Text style={[type.caption, { color: colors.ink, marginTop: 2 }]}>
          {locationName ? locationName : 'Location not set'}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Banner message={USE_MOCK ? copy.mockBanner : copy.liveBanner} tone={USE_MOCK ? 'warning' : 'info'} />
        {loading ? (
          <View style={styles.center} accessibilityLabel={copy.loading}>
            <ActivityIndicator color={colors.teal} />
            <Text style={[type.caption, { color: colors.inkMuted, marginTop: space[8] }]}>{copy.loading}</Text>
          </View>
        ) : error ? (
          <View>
            <Banner message={error} tone="danger" />
            {onRetry ? (
              <Pressable
                onPress={onRetry}
                accessibilityRole="button"
                accessibilityLabel={copy.tryAgain}
                style={{ minHeight: 48, justifyContent: 'center' }}
              >
                <Text style={[type.label, { color: colors.teal }]}>{copy.tryAgain}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : empty ? (
          <EmptyState message={empty} actionLabel={emptyActionLabel} onAction={onEmptyAction} />
        ) : (
          children
        )}
      </ScrollView>
      {footer}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: space[16],
    paddingTop: space[8],
    paddingBottom: space[12],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: { padding: space[16], paddingBottom: space[48] },
  center: { paddingVertical: space[32], alignItems: 'flex-start' },
});
