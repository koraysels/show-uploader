import { vi, describe, it, expect } from 'vitest';

// No jose mock here on purpose: tokenShape's whole job is decoding a real JWT
// header, and classifyAuthError reads real jose error codes.
vi.mock('../../src/env', () => ({
  env: { ZITADEL_DOMAIN: 'test.zitadel.cloud', ZITADEL_CLIENT_ID: 'test-client-id' },
}));

import { classifyAuthError, tokenShape } from '../../src/middleware/requireAuth';

const joseError = (code: string) => Object.assign(new Error(code), { code });

describe('classifyAuthError', () => {
  it('401s an expired token — signing in again is the right answer', () => {
    expect(classifyAuthError(joseError('ERR_JWT_EXPIRED'))).toEqual({
      status: 401,
      code: 'ERR_JWT_EXPIRED',
    });
  });

  it('401s a bad signature', () => {
    expect(classifyAuthError(joseError('ERR_JWS_SIGNATURE_VERIFICATION_FAILED')).status).toBe(401);
  });

  it('401s a wrong audience or issuer', () => {
    expect(classifyAuthError(joseError('ERR_JWT_CLAIM_VALIDATION_FAILED')).status).toBe(401);
  });

  it('503s a JWKS timeout — nothing about the token is known', () => {
    expect(classifyAuthError(joseError('ERR_JWKS_TIMEOUT'))).toEqual({
      status: 503,
      code: 'ERR_JWKS_TIMEOUT',
    });
  });

  it('503s ambiguous keys during a rotation', () => {
    expect(classifyAuthError(joseError('ERR_JWKS_MULTIPLE_MATCHING_KEYS')).status).toBe(503);
  });

  it('503s a failed key fetch, which arrives as a bare TypeError', () => {
    expect(classifyAuthError(new TypeError('fetch failed'))).toEqual({
      status: 503,
      code: 'ERR_UNKNOWN',
    });
  });

  it('401s an unrecognised non-network error', () => {
    expect(classifyAuthError(new Error('boom'))).toEqual({ status: 401, code: 'ERR_UNKNOWN' });
  });

  it('401s a thrown non-error value', () => {
    expect(classifyAuthError('nope').status).toBe(401);
  });
});

describe('tokenShape', () => {
  it('reports alg and kid for a JWT', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'key-1' })).toString('base64url');
    expect(tokenShape(`${header}.body.sig`)).toBe('alg=RS256 kid=key-1');
  });

  // The one misconfiguration that rejects every token forever: a Zitadel app set
  // to opaque bearer tokens, which jwtVerify can never accept.
  it('names the opaque-token case when the header will not decode', () => {
    expect(tokenShape('v2_opaque_zitadel_token')).toContain('not-a-jwt');
  });

  it('never echoes the token itself', () => {
    const secret = 'v2_super_secret_token';
    expect(tokenShape(secret)).not.toContain(secret);
  });
});
