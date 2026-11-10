import { Stack } from 'expo-router';
import { fonts, type } from '../theme';
import { useTheme } from '../theme-context';

export function PlaceholderStack({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        title,
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.teal,
        headerTitleStyle: { fontFamily: fonts.semibold, fontSize: type.label.fontSize, color: colors.ink },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.canvas },
      }}
    />
  );
}
