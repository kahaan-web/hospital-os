import type { ExpoConfig } from 'expo/config';

/** Later each Android app (A1–A7) can be a variant: EXPO_PUBLIC_APP_VARIANT=patient|doctor|… */
const variant = process.env.EXPO_PUBLIC_APP_VARIANT ?? 'hospital-os';

const NAMES: Record<string, string> = {
  'hospital-os': 'Hospital OS',
  patient: 'Hospital OS — Patient',
  doctor: 'Hospital OS — Doctor',
  nurse: 'Hospital OS — Nurses',
  mis: 'Hospital OS — MIS',
  equipment: 'Hospital OS — Equipment',
  hr: 'Hospital OS — HR',
  maintenance: 'Hospital OS — Maintenance',
};

const config: ExpoConfig = {
  name: NAMES[variant] ?? 'Hospital OS',
  slug: 'hospital-os',
  scheme: 'hospital-os',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  splash: {
    image: './assets/icon.png',
    resizeMode: 'contain',
    backgroundColor: '#EEF2F2',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'in.hospitalos.app',
  },
  android: {
    package: 'in.hospitalos.app',
    adaptiveIcon: {
      foregroundImage: './assets/icon.png',
      backgroundColor: '#0E6B66',
    },
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/icon.png',
  },
  plugins: ['expo-router', 'expo-secure-store', 'expo-font', 'expo-splash-screen'],
  extra: { variant },
  experiments: { typedRoutes: false },
};

export default config;
