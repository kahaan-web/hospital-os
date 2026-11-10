import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans';
import {
  IBMPlexSansDevanagari_400Regular,
  IBMPlexSansDevanagari_500Medium,
  IBMPlexSansDevanagari_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans-devanagari';
import { useFonts } from 'expo-font';
import { Slot, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AuthProvider } from '../src/auth';
import { ThemeProvider, useTheme } from '../src/theme-context';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function ThemedChrome() {
  const { dark, colors } = useTheme();
  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} backgroundColor={colors.surface} />
      <Slot />
    </>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSansDevanagari_400Regular,
    IBMPlexSansDevanagari_500Medium,
    IBMPlexSansDevanagari_600SemiBold,
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => undefined);
  }, [loaded]);

  if (!loaded) return null;

  return (
    <ThemeProvider>
      <AuthProvider>
        <ThemedChrome />
      </AuthProvider>
    </ThemeProvider>
  );
}
