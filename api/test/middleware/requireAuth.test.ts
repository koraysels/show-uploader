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

function makeReq(authHeader?: string, query: Record<string, unknown> = {}) {
  return { headers: { authorization: authHeader }, query } as any;
}

const memberPayload = {
  payload: { 'urn:zitadel:iam:org:project:roles': { member: { orgId: 'org' } } },
} as any;

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

  // Sessions now survive for weeks on a refresh token, so a role can be revoked
  // long after sign-in. Authorization must come from the token presented on THIS
  // request — nothing about the earlier, still-authorized token may carry over.
  it('rejects a renewed token whose member role has since been removed', async () => {
    const res = makeRes();

    vi.mocked(jwtVerify).mockResolvedValueOnce(memberPayload);
    await requireAuth(makeReq('Bearer token-before'), res, next);
    expect(next).toHaveBeenCalledTimes(1);

    // Same session, token renewed after an admin revoked the role.
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: { 'urn:zitadel:iam:org:project:roles': {} },
    } as any);
    await requireAuth(makeReq('Bearer token-after'), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).toHaveBeenCalledTimes(1);
  });

  // EventSource can't set headers, so both SSE streams authenticate this way.
  describe('access_token query param (SSE)', () => {
    it('accepts a member token passed as a query param', async () => {
      vi.mocked(jwtVerify).mockResolvedValue(memberPayload);
      const res = makeRes();
      await requireAuth(makeReq(undefined, { access_token: 'sse-token' }), res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(vi.mocked(jwtVerify)).toHaveBeenCalledWith(
        'sse-token',
        'mock-jwks',
        { issuer: 'https://test.zitadel.cloud', audience: 'test-client-id' }
      );
    });

    it('returns 401 when the query-param token fails verification', async () => {
      vi.mocked(jwtVerify).mockRejectedValue(new Error('expired'));
      const res = makeRes();
      await requireAuth(makeReq(undefined, { access_token: 'stale-token' }), res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('prefers the Authorization header over the query param', async () => {
      vi.mocked(jwtVerify).mockResolvedValue(memberPayload);
      const res = makeRes();
      await requireAuth(makeReq('Bearer header-token', { access_token: 'query-token' }), res, next);
      expect(vi.mocked(jwtVerify)).toHaveBeenCalledWith(
        'header-token',
        'mock-jwks',
        expect.anything()
      );
    });
  });
});
