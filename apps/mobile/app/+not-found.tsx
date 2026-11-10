import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { copy } from '../src/copy';
import { space, type } from '../src/theme';
import { useTheme } from '../src/theme-context';

export default function NotFound() {
  const { colors } = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: copy.notFoundTitle }} />
      <View style={{ padding: space[16], backgroundColor: colors.canvas, flex: 1 }}>
        <Text style={[type.section, { color: colors.ink, marginBottom: space[12] }]}>{copy.notFoundBody}</Text>
        <Link href="/" style={[type.label, { color: colors.teal }]}>
          {copy.goHome}
        </Link>
      </View>
    </>
  );
}
