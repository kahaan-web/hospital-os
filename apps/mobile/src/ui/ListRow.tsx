import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { space, touchMin, type } from '../theme';
import { useTheme } from '../theme-context';
import { isFocused, webFocusRing } from './focus';

export function ListRow({
  title,
  subtitle,
  meta,
  onPress,
  last,
  accessibilityLabel,
  disabled,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  onPress?: () => void;
  last?: boolean;
  accessibilityLabel?: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const inner = (
    <View
      style={[
        styles.row,
        { borderBottomColor: colors.line, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth },
        disabled ? { opacity: 0.6 } : null,
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
      {onPress && !disabled ? <ChevronRight size={16} color={colors.inkMuted} strokeWidth={1.5} /> : null}
    </View>
  );
  if (!onPress || disabled) return inner;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={(state) => [
        { backgroundColor: state.pressed ? colors.tealSubtle : 'transparent' },
        webFocusRing(colors.teal, isFocused(state)),
      ]}
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
