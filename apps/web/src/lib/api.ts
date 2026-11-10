import type { ApiErrorBody } from '@hos/shared';

export const API_BASE = '/api/v1';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields?: Record<string, string>;
  readonly details?: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.error.code;
    this.fields = body.error.fields;
    this.details = body.error.details;
  }
}

export type RequestOpts = {
  method?: string;
  body?: unknown;
  formData?: FormData;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  signal?: AbortSignal;
};

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function apiRequest<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined || opts.formData ? 'POST' : 'GET');
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };

  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
  if (mutating) {
    headers['x-hos-csrf'] = '1';
  }
  if (opts.idempotencyKey) {
    headers['Idempotency-Key'] = opts.idempotencyKey;
  }

  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers,
    body,
    signal: opts.signal,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok) {
    if (contentType.includes('application/json')) {
      const errBody = await parseJson<ApiErrorBody>(res);
      throw new ApiError(res.status, errBody);
    }
    throw new ApiError(res.status, { error: { code: 'http_error', message: res.statusText || `HTTP ${res.status}` } });
  }

  if (contentType.includes('application/pdf') || contentType.includes('text/html')) {
    return res as unknown as T;
  }

  return parseJson<T>(res);
}

export function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(path, { method: 'GET', signal });
}

export function apiPost<T>(path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', body, idempotencyKey });
}

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'PUT', body });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'PATCH', body });
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'DELETE' });
}

export async function apiBlob(path: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  if (!res.ok) {
    if (res.headers.get('content-type')?.includes('application/json')) {
      const errBody = (await res.json()) as ApiErrorBody;
      throw new ApiError(res.status, errBody);
    }
    throw new ApiError(res.status, { error: { code: 'http_error', message: res.statusText } });
  }
  return res.blob();
}

export async function apiText(path: string): Promise<string> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  if (!res.ok) {
    throw new ApiError(res.status, { error: { code: 'http_error', message: res.statusText } });
  }
  return res.text();
}
