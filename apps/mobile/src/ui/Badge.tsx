import { StyleSheet, Text, View } from 'react-native';
import { radius, space, type } from '../theme';
import { useTheme } from '../theme-context';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'teal';

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const { colors } = useTheme();
  const map: Record<BadgeTone, { fg: string; bg: string }> = {
    neutral: { fg: colors.ink, bg: colors.surfaceMuted },
    success: { fg: colors.success, bg: colors.surfaceMuted },
    warning: { fg: colors.warning, bg: colors.surfaceMuted },
    danger: { fg: colors.danger, bg: colors.surfaceMuted },
    info: { fg: colors.info, bg: colors.surfaceMuted },
    teal: { fg: colors.teal, bg: colors.tealSubtle },
  };
  const c = map[tone];
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <Text style={[type.caption, { color: c.fg, fontVariant: ['tabular-nums'] }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: space[8],
    paddingVertical: space[4],
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
});
