import { Stack } from 'expo-router';
import { fonts, type } from '../../src/theme';
import { useTheme } from '../../src/theme-context';

export default function DoctorStack() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.teal,
        headerTitleStyle: { fontFamily: fonts.semibold, fontSize: type.label.fontSize, color: colors.ink },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="visit/[id]" options={{ title: 'Visit' }} />
      <Stack.Screen name="order" options={{ title: 'Place order' }} />
    </Stack>
  );
}
