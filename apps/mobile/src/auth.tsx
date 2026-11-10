import { fieldErrors, loginSchema, type Me } from '@hos/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { api, ApiError, hydrateMockSession } from './api';
import { currentMockToken } from './api/mockClient';
import { copy } from './copy';
import { USE_MOCK } from './env';
import { clearSessionToken, getSessionToken, setSessionToken } from './session';

type AuthContextValue = {
  me: Me | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const restore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (USE_MOCK) {
        const token = await getSessionToken();
        if (!token) {
          setMe(null);
          return;
        }
        const restored = hydrateMockSession(token);
        setMe(restored);
        return;
      }
      if (Platform.OS !== 'web') {
        const token = await getSessionToken();
        if (!token) {
          setMe(null);
          return;
        }
      }
      const profile = await api.me();
      setMe(profile);
    } catch {
      await clearSessionToken();
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void restore();
  }, [restore]);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const fields = fieldErrors(parsed.error);
      throw new ApiError(
        400,
        'validation',
        fields.email ?? fields.password ?? copy.checkForm,
        fields,
      );
    }
    const profile = await api.login(parsed.data);
    if (USE_MOCK) {
      const token = currentMockToken();
      if (token) await setSessionToken(token);
    }
    setMe(profile);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      await clearSessionToken();
      setMe(null);
    }
  }, []);

  const value = useMemo(
    () => ({ me, loading, error, signIn, signOut, refresh: restore }),
    [me, loading, error, signIn, signOut, restore],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
