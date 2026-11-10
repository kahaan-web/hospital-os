import { StyleSheet, Text, View } from 'react-native';
import { space, type } from '../theme';
import { useTheme } from '../theme-context';

export function FieldRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.row,
        { borderBottomColor: colors.line, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth },
      ]}
    >
      <Text style={[type.caption, { color: colors.inkMuted }]}>{label}</Text>
      <Text style={[type.body, { color: colors.ink, fontVariant: ['tabular-nums'] }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: space[16], paddingVertical: space[12], gap: 2 },
});
