import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { ThemePreference } from './theme';

const KEY = 'hos_theme';

function webGet(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function webSet(value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    /* private mode */
  }
}

export async function getThemePreference(): Promise<ThemePreference | null> {
  let raw: string | null = null;
  if (Platform.OS === 'web') {
    raw = webGet();
  } else {
    try {
      if (await SecureStore.isAvailableAsync()) raw = await SecureStore.getItemAsync(KEY);
    } catch {
      raw = webGet();
    }
  }
  return raw === 'light' || raw === 'dark' ? raw : null;
}

export async function saveThemePreference(value: ThemePreference): Promise<void> {
  if (Platform.OS === 'web') {
    webSet(value);
    return;
  }
  try {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.setItemAsync(KEY, value);
      return;
    }
  } catch {
    /* fall through */
  }
  webSet(value);
}
