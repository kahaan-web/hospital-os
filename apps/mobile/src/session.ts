import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const SESSION_COOKIE = 'hos_session';
const STORE_KEY = 'hos_session';

function webGet(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromStore = window.localStorage.getItem(STORE_KEY);
    if (fromStore) return fromStore;
  } catch {
    /* private mode */
  }
  return readCookie(SESSION_COOKIE);
}

function webSet(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORE_KEY, token);
  } catch {
    /* ignore */
  }
  writeCookie(SESSION_COOKIE, token);
}

function webClear(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }
  writeCookie(SESSION_COOKIE, '', 0);
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function writeCookie(name: string, value: string, maxAgeSec = 60 * 60 * 12): void {
  if (typeof document === 'undefined') return;
  const encoded = encodeURIComponent(value);
  document.cookie = `${name}=${encoded}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax`;
}

export async function getSessionToken(): Promise<string | null> {
  if (Platform.OS === 'web') return webGet();
  try {
    if (await SecureStore.isAvailableAsync()) return SecureStore.getItemAsync(STORE_KEY);
  } catch {
    /* web fallback inside native test */
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
