import { StyleSheet, Text, View } from 'react-native';
import { radius, space, type } from '../theme';
import { useTheme } from '../theme-context';

export function Banner({
  message,
  tone = 'info',
}: {
  message: string;
  tone?: 'info' | 'warning' | 'danger';
}) {
  const { colors } = useTheme();
  const fg = tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : colors.info;
  return (
    <View style={[styles.box, { borderColor: colors.line, backgroundColor: colors.surface }]}>
      <Text style={[type.caption, { color: fg }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.panel,
    paddingHorizontal: space[12],
    paddingVertical: space[8],
    marginBottom: space[12],
  },
});
