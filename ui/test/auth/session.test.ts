import { vi, describe, it, expect } from 'vitest';
import type { User } from 'oidc-client-ts';
import { getFreshAccessToken, withAuthRetry, type SessionManager } from '../../src/auth/session';

// Only the three fields the module reads; the real User carries far more.
const user = (access_token: string, expired = false) => ({ access_token, expired }) as User;

function makeManager(overrides: Partial<SessionManager> = {}) {
  return {
    getUser: vi.fn(async () => null as User | null),
    signinSilent: vi.fn(async () => null as User | null),
    signinRedirect: vi.fn(async () => {}),
    ...overrides,
  } satisfies SessionManager;
}

const resp = (status: number) => new Response(null, { status });

describe('getFreshAccessToken', () => {
  it('returns the stored token without renewing while it is valid', async () => {
    const mgr = makeManager({ getUser: vi.fn(async () => user('fresh')) });

    await expect(getFreshAccessToken(mgr)).resolves.toBe('fresh');
    expect(mgr.signinSilent).not.toHaveBeenCalled();
  });

  it('renews once when the stored token has expired', async () => {
    const mgr = makeManager({
      getUser: vi.fn(async () => user('stale', true)),
      signinSilent: vi.fn(async () => user('renewed')),
    });

    await expect(getFreshAccessToken(mgr)).resolves.toBe('renewed');
    expect(mgr.signinSilent).toHaveBeenCalledTimes(1);
  });

  it('returns undefined without throwing when renewal fails', async () => {
    const mgr = makeManager({
      getUser: vi.fn(async () => user('stale', true)),
      signinSilent: vi.fn(async () => {
        throw new Error('no refresh token');
      }),
    });

    await expect(getFreshAccessToken(mgr)).resolves.toBeUndefined();
  });

  it('does not attempt renewal when there is no stored session', async () => {
    const mgr = makeManager();

    await expect(getFreshAccessToken(mgr)).resolves.toBeUndefined();
    expect(mgr.signinSilent).not.toHaveBeenCalled();
  });
});

describe('withAuthRetry', () => {
  it('sends once with the current token when the server accepts it', async () => {
    const mgr = makeManager({ getUser: vi.fn(async () => user('fresh')) });
    const send = vi.fn(async () => resp(200));

    const res = await withAuthRetry(mgr, send);

    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('fresh');
    expect(mgr.signinRedirect).not.toHaveBeenCalled();
  });

  it('renews and retries exactly once on a 401', async () => {
    const mgr = makeManager({
      getUser: vi.fn(async () => user('stale')),
      signinSilent: vi.fn(async () => user('renewed')),
    });
    const send = vi.fn(async (token?: string) => resp(token === 'renewed' ? 200 : 401));

    const res = await withAuthRetry(mgr, send);

    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith('renewed');
    expect(mgr.signinRedirect).not.toHaveBeenCalled();
  });

  it('bounces to interactive login when renewal cannot rescue a 401', async () => {
    const mgr = makeManager({
      getUser: vi.fn(async () => user('stale')),
      signinSilent: vi.fn(async () => {
        throw new Error('refresh token expired');
      }),
    });
    const send = vi.fn(async () => resp(401));

    await expect(withAuthRetry(mgr, send)).rejects.toThrow('Session expired');
    expect(mgr.signinRedirect).toHaveBeenCalledTimes(1);
    // No pointless resend: renewal produced no new token to try.
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('passes non-401 failures straight through', async () => {
    const mgr = makeManager({ getUser: vi.fn(async () => user('fresh')) });
    const send = vi.fn(async () => resp(403));

    const res = await withAuthRetry(mgr, send);

    expect(res.status).toBe(403);
    expect(mgr.signinSilent).not.toHaveBeenCalled();
    expect(mgr.signinRedirect).not.toHaveBeenCalled();
  });
});

// Zitadel rotates refresh tokens: the grant invalidates the token it consumed.
// The app opens several queries at once, so an expired session used to fire one
// signinSilent per query — the second reused a spent refresh token, Zitadel's
// reuse detection killed the whole chain, and the app was left with no token at
// all. That is the "Auth: no token" the api logs during the loop.
describe('concurrent renewal', () => {
  it('renews once for callers that race on the same expired session', async () => {
    let resolveRenew: (u: User) => void = () => {};
    const renewal = new Promise<User>((r) => (resolveRenew = r));
    const mgr = makeManager({
      getUser: vi.fn(async () => user('stale', true)),
      signinSilent: vi.fn(() => renewal),
    });

    const both = Promise.all([getFreshAccessToken(mgr), getFreshAccessToken(mgr)]);
    resolveRenew(user('renewed'));

    await expect(both).resolves.toEqual(['renewed', 'renewed']);
    expect(mgr.signinSilent).toHaveBeenCalledTimes(1);
  });

  it('renews again after the in-flight renewal has settled', async () => {
    const mgr = makeManager({
      getUser: vi.fn(async () => user('stale', true)),
      signinSilent: vi.fn(async () => user('renewed')),
    });

    await getFreshAccessToken(mgr);
    await getFreshAccessToken(mgr);

    expect(mgr.signinSilent).toHaveBeenCalledTimes(2);
  });

  // Another tab may have rotated the refresh token a moment earlier and stored
  // the resulting session. That session is good; this tab's failure is not a
  // reason to sign out.
  it('falls back to a session another tab just stored', async () => {
    const getUser = vi
      .fn<() => Promise<User | null>>()
      .mockResolvedValueOnce(user('stale', true))
      .mockResolvedValue(user('from-other-tab'));
    const mgr = makeManager({
      getUser,
      signinSilent: vi.fn(async () => {
        throw new Error('token inactive');
      }),
    });

    await expect(getFreshAccessToken(mgr)).resolves.toBe('from-other-tab');
  });

  it('gives up when the stored session is expired too', async () => {
    const mgr = makeManager({
      getUser: vi.fn(async () => user('stale', true)),
      signinSilent: vi.fn(async () => {
        throw new Error('token inactive');
      }),
    });

    await expect(getFreshAccessToken(mgr)).resolves.toBeUndefined();
  });
});
