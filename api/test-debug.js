import { vi } from 'vitest';

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'mock-jwks'),
  jwtVerify: vi.fn(),
}));

vi.mock('../src/env', () => ({
  env: { ZITADEL_DOMAIN: 'test.zitadel.cloud' },
}));

const { createRemoteJWKSet } = await import('jose');
console.log('Before import:', createRemoteJWKSet.mock?.calls?.length);

await import('./src/middleware/requireAuth.js');
console.log('After import:', createRemoteJWKSet.mock?.calls?.length);
console.log('Call args:', createRemoteJWKSet.mock?.calls);
