import { StyleSheet, Text, View } from 'react-native';
import { space, type } from '../theme';
import { useTheme } from '../theme-context';
import { Button } from './Button';

export function EmptyState({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[type.bodyComfortable, { color: colors.ink }]}>{message}</Text>
      {actionLabel && onAction ? (
        <View style={{ marginTop: space[16], alignSelf: 'flex-start' }}>
          <Button label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space[16] },
});
