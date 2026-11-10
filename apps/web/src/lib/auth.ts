'use client';

import type { Me, PlatformMe, TenantMe } from '@hos/shared';
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from './api';

export function isTenantMe(me: Me | null): me is TenantMe {
  return me?.kind === 'tenant';
}

export function isPlatformMe(me: Me | null): me is PlatformMe {
  return me?.kind === 'platform';
}

export async function fetchMe(): Promise<Me | null> {
  try {
    return await apiGet<Me>('/auth/me');
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return null;
    }
    throw e;
  }
}

export async function signOut(): Promise<void> {
  await apiPost('/auth/logout');
}

export function useMe(): { me: Me | null; loading: boolean; error: string | null; refresh: () => void } {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchMe()
      .then(setMe)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load session'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { me, loading, error, refresh };
}

export async function switchLocation(locationId: string): Promise<TenantMe> {
  return apiPost<TenantMe>('/auth/switch-location', { locationId });
}
