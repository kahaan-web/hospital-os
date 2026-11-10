/** Reject open redirects from `?next=` (only same-origin relative paths). */
export function safeNextPath(raw: string | null, fallback: string): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return fallback;
  return raw;
}
