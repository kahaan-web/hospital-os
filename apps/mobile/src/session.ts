import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** Cookie name on the API. Web live sessions use this httpOnly cookie; native sends it as a header. */
export const SESSION_COOKIE = 'hos_session';
const STORE_KEY = 'hos_session';

function webGet(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}

function webSet(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORE_KEY, token);
  } catch {
    /* private mode */
  }
}

function webClear(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }
}

/** Mock (any platform) and live native only. Live web uses the httpOnly cookie. */
export async function getSessionToken(): Promise<string | null> {
  if (Platform.OS === 'web') return webGet();
  try {
    if (await SecureStore.isAvailableAsync()) return SecureStore.getItemAsync(STORE_KEY);
  } catch {
    /* fall through */
  }
  return webGet();
}

export async function setSessionToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    webSet(token);
    return;
  }
  try {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.setItemAsync(STORE_KEY, token);
      return;
    }
  } catch {
    /* fall through */
  }
  webSet(token);
}

export async function clearSessionToken(): Promise<void> {
  if (Platform.OS === 'web') {
    webClear();
    return;
  }
  try {
    if (await SecureStore.isAvailableAsync()) await SecureStore.deleteItemAsync(STORE_KEY);
  } catch {
    /* ignore */
  }
  webClear();
}
