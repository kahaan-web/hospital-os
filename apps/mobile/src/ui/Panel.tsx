import { StyleSheet, View } from 'react-native';
import { radius, space } from '../theme';
import { useTheme } from '../theme-context';

export function Panel({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.line }]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.panel,
    overflow: 'hidden',
    marginBottom: space[16],
  },
});
