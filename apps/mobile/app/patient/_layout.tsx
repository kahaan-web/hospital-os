import { Stack } from 'expo-router';
import { RoleGate } from '../../src/apps/RoleGate';
import { copy } from '../../src/copy';
import { fonts, type } from '../../src/theme';
import { useTheme } from '../../src/theme-context';

export default function PatientStack() {
  const { colors } = useTheme();
  return (
    <RoleGate role="patient">
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
        <Stack.Screen name="appointment/book" options={{ title: copy.bookAppointment }} />
        <Stack.Screen name="appointment/[id]" options={{ title: copy.appointment }} />
        <Stack.Screen name="visit/[id]" options={{ title: copy.visitDetail }} />
        <Stack.Screen name="bill/[id]" options={{ title: copy.billDetail }} />
      </Stack>
    </RoleGate>
  );
}
