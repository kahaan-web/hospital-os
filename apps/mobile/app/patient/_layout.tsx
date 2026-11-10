import { Stack } from 'expo-router';
import { useTheme } from '../../src/theme-context';
import { fonts, type } from '../../src/theme';

export default function PatientStack() {
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
      <Stack.Screen name="appointment/book" options={{ title: 'Book appointment' }} />
      <Stack.Screen name="appointment/[id]" options={{ title: 'Appointment' }} />
      <Stack.Screen name="visit/[id]" options={{ title: 'Visit' }} />
      <Stack.Screen name="bill/[id]" options={{ title: 'Bill' }} />
    </Stack>
  );
}
