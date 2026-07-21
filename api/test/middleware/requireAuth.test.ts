import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'mock-jwks'),
  jwtVerify: vi.fn(),
}));

vi.mock('../../src/env', () => ({
  env: { ZITADEL_DOMAIN: 'test.zitadel.cloud', ZITADEL_CLIENT_ID: 'test-client-id' },
}));

// Import AFTER mocking so the module uses mocked versions
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { requireAuth } from '../../src/middleware/requireAuth';

function makeReq(authHeader?: string) {
  return { headers: { authorization: authHeader } } as any;
}

function makeRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

// Test that createRemoteJWKSet was called at module load time
// This must be outside the describe block to verify module initialization
it('uses the correct JWKS URL from ZITADEL_DOMAIN', () => {
  expect(vi.mocked(createRemoteJWKSet)).toHaveBeenCalledWith(
    new URL('https://test.zitadel.cloud/oauth/v2/keys')
  );
});

describe('requireAuth', () => {
  const next = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when Authorization header is missing', async () => {
    const res = makeRes();
    await requireAuth(makeReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token verification throws', async () => {
    vi.mocked(jwtVerify).mockRejectedValue(new Error('bad token'));
    const res = makeRes();
    await requireAuth(makeReq('Bearer badtoken'), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when roles claim is absent from payload', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({ payload: {} } as any);
    const res = makeRes();
    await requireAuth(makeReq('Bearer token'), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when member key is not in roles', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { 'urn:zitadel:iam:org:project:roles': {} },
    } as any);
    const res = makeRes();
    await requireAuth(makeReq('Bearer token'), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when token has member role', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: {
        'urn:zitadel:iam:org:project:roles': { member: { orgId: 'org' } },
      },
    } as any);
    const res = makeRes();
    await requireAuth(makeReq('Bearer token'), res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(vi.mocked(jwtVerify)).toHaveBeenCalledWith(
      'token',
      'mock-jwks',
      { issuer: 'https://test.zitadel.cloud', audience: 'test-client-id' }
    );
  });
});
