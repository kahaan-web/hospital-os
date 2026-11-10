import { USE_MOCK } from '../env';
import type { MobileApi } from './client';
import { httpClient } from './httpClient';
import { mockClient } from './mockClient';

export { ApiError, type MobileApi } from './client';
export { hydrateMockSession, currentMockToken } from './mockClient';

export const api: MobileApi = USE_MOCK ? mockClient : httpClient;
