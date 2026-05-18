import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'mock-jwks'),
  jwtVerify: vi.fn(),
}));

vi.mock('../env', () => ({
  env: { ZITADEL_DOMAIN: 'test.zitadel.cloud' },
}));

import { jwtVerify } from 'jose';
import { requireAuth } from './requireAuth';

function makeReq(authHeader?: string) {
  return { headers: { authorization: authHeader } } as any;
}

function makeRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

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
  });
});
