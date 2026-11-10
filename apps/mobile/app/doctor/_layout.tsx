import { Stack } from 'expo-router';
import { RoleGate } from '../../src/apps/RoleGate';
import { copy } from '../../src/copy';
import { fonts, type } from '../../src/theme';
import { useTheme } from '../../src/theme-context';

export default function DoctorStack() {
  const { colors } = useTheme();
  return (
    <RoleGate role="doctor">
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
        <Stack.Screen name="visit/[id]" options={{ title: copy.visitDetail }} />
        <Stack.Screen name="order" options={{ title: copy.placeOrder }} />
      </Stack>
    </RoleGate>
  );
}
