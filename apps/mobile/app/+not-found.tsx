import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { space, type } from '../src/theme';
import { useTheme } from '../src/theme-context';

export default function NotFound() {
  const { colors } = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={{ padding: space[16], backgroundColor: colors.canvas, flex: 1 }}>
        <Text style={[type.section, { color: colors.ink, marginBottom: space[12] }]}>This screen does not exist.</Text>
        <Link href="/" style={[type.label, { color: colors.teal }]}>
          Go to home
        </Link>
      </View>
    </>
  );
}
