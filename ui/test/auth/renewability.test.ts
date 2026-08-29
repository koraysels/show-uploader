import { describe, it, expect } from 'vitest';
import {
  canRenewSilently,
  renewFailureAction,
  NO_REFRESH_TOKEN_HINT,
} from '../../src/auth/renewability';

describe('canRenewSilently', () => {
  it('is true with a refresh token — renewal is a token-endpoint call', () => {
    expect(canRenewSilently({ refresh_token: 'rt' })).toBe(true);
  });

  it('is false without one — renewal falls back to the blockable iframe', () => {
    expect(canRenewSilently({})).toBe(false);
    expect(canRenewSilently(null)).toBe(false);
    expect(canRenewSilently(undefined)).toBe(false);
  });

  it('treats an empty refresh token as no refresh token', () => {
    expect(canRenewSilently({ refresh_token: '' })).toBe(false);
  });
});

describe('renewFailureAction', () => {
  // One blocked iframe with a still-valid token is not a dead session; dropping
  // it here is what produced the checking↔signing-in flip.
  it('ignores a failure while the access token is still valid', () => {
    expect(renewFailureAction({ expired: false })).toBe('ignore');
    expect(renewFailureAction({ expired: false, refresh_token: 'rt' })).toBe('ignore');
  });

  it('re-authenticates when expired but renewal could work', () => {
    expect(renewFailureAction({ expired: true, refresh_token: 'rt' })).toBe('reauth');
  });

  // The loop case: expired, and every future renewal will fail the same way.
  it('fails outright when expired and renewal can never succeed', () => {
    expect(renewFailureAction({ expired: true })).toBe('fail');
  });

  it('fails when there is no session left at all', () => {
    expect(renewFailureAction(null)).toBe('fail');
  });
});

describe('NO_REFRESH_TOKEN_HINT', () => {
  it('names the setting the operator has to change', () => {
    expect(NO_REFRESH_TOKEN_HINT).toContain('Refresh Token');
    expect(NO_REFRESH_TOKEN_HINT).toContain('Zitadel');
  });
});
