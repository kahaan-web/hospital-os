import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { space, touchMin, type } from '../theme';
import { useTheme } from '../theme-context';

export function ListRow({
  title,
  subtitle,
  meta,
  onPress,
  last,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  onPress?: () => void;
  last?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const inner = (
    <View
      style={[
        styles.row,
        { borderBottomColor: colors.line, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth },
      ]}
    >
      <View style={styles.text}>
        <Text style={[type.label, { color: colors.ink }]}>{title}</Text>
        {subtitle ? (
          <Text style={[type.caption, { color: colors.inkMuted, marginTop: 2 }]}>{subtitle}</Text>
        ) : null}
      </View>
      {meta ? (
        <Text style={[type.caption, { color: colors.inkMuted, fontVariant: ['tabular-nums'] }]}>{meta}</Text>
      ) : null}
      {onPress ? <ChevronRight size={16} color={colors.inkMuted} strokeWidth={1.5} /> : null}
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => ({ backgroundColor: pressed ? colors.tealSubtle : 'transparent' })}
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: touchMin,
    paddingVertical: space[12],
    paddingHorizontal: space[16],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[8],
  },
  text: { flex: 1 },
});
