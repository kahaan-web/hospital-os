const rawUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:4400';
export const API_ORIGIN = rawUrl.replace(/\/$/, '');
export const API_BASE = `${API_ORIGIN}/api/v1`;

/** Mock is on unless explicitly set to "0" or "false". */
export const USE_MOCK = !['0', 'false', 'off'].includes(
  (process.env.EXPO_PUBLIC_USE_MOCK ?? '1').toLowerCase(),
);

export const APP_VARIANT = process.env.EXPO_PUBLIC_APP_VARIANT ?? 'hospital-os';
