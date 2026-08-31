import { describe, it, expect } from 'vitest';
import {
  ATTEMPTS_KEY,
  clearAttempts,
  recentAttempts,
  recordAttempt,
  type AttemptStore,
  HISTORY_WINDOW_MS,
  resetGuard,
} from '../../src/auth/loop-guard';

// ui's vitest run has no jsdom, so sessionStorage is faked with a plain map.
function makeStore(initial: Record<string, string> = {}): AttemptStore & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const T0 = 1_800_000_000_000;

describe('recordAttempt', () => {
  it('allows the first signin', () => {
    const store = makeStore();
    expect(recordAttempt(store, T0)).toEqual({ allowed: true, attempts: 1 });
  });

  it('allows attempts up to the limit', () => {
    const store = makeStore();
    expect(recordAttempt(store, T0).allowed).toBe(true);
    expect(recordAttempt(store, T0 + 1_000).allowed).toBe(true);
    expect(recordAttempt(store, T0 + 2_000).allowed).toBe(true);
  });

  it('refuses the attempt past the limit inside the window', () => {
    const store = makeStore();
    recordAttempt(store, T0);
    recordAttempt(store, T0 + 1_000);
    recordAttempt(store, T0 + 2_000);
    expect(recordAttempt(store, T0 + 3_000)).toEqual({ allowed: false, attempts: 4 });
  });

  it('keeps refusing while the caller retries — a refused attempt still counts', () => {
    const store = makeStore();
    for (let i = 0; i < 4; i++) recordAttempt(store, T0 + i * 1_000);
    expect(recordAttempt(store, T0 + 5_000).allowed).toBe(false);
    expect(recordAttempt(store, T0 + 6_000).allowed).toBe(false);
  });

  it('allows again once the window has passed', () => {
    const store = makeStore();
    for (let i = 0; i < 4; i++) recordAttempt(store, T0 + i * 1_000);
    // 61s after the last recorded attempt: nothing is inside the window.
    expect(recordAttempt(store, T0 + 64_000).allowed).toBe(true);
  });

  it('ages out only the attempts older than the window', () => {
    const store = makeStore();
    recordAttempt(store, T0);
    recordAttempt(store, T0 + 59_000);
    recordAttempt(store, T0 + 59_500);
    // T0 has aged out, so this is the third live attempt, not the fourth.
    expect(recordAttempt(store, T0 + 60_500)).toEqual({ allowed: true, attempts: 3 });
  });

  it('honours an explicit max and window', () => {
    const store = makeStore();
    expect(recordAttempt(store, T0, { max: 1 }).allowed).toBe(true);
    expect(recordAttempt(store, T0 + 100, { max: 1 }).allowed).toBe(false);
    expect(recordAttempt(store, T0 + 5_000, { max: 1, windowMs: 1_000 }).allowed).toBe(true);
  });

  it('starts from zero when the stored value is corrupt', () => {
    const store = makeStore({ [ATTEMPTS_KEY]: 'not json' });
    expect(recordAttempt(store, T0)).toEqual({ allowed: true, attempts: 1 });
  });

  it('ignores non-numeric entries in the stored list', () => {
    const store = makeStore({ [ATTEMPTS_KEY]: JSON.stringify([T0, 'nope', null]) });
    expect(recordAttempt(store, T0 + 1_000).attempts).toBe(2);
  });

  it('still allows the redirect when storage throws', () => {
    const store: AttemptStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(recordAttempt(store, T0).allowed).toBe(true);
    expect(() => clearAttempts(store)).not.toThrow();
  });
});

describe('clearAttempts', () => {
  it('resets the counter after a proven-good session', () => {
    const store = makeStore();
    for (let i = 0; i < 4; i++) recordAttempt(store, T0 + i * 1_000);
    clearAttempts(store);
    expect(recentAttempts(store, T0 + 5_000)).toEqual([]);
    expect(recordAttempt(store, T0 + 5_000).allowed).toBe(true);
  });
});

// A loop that succeeds between bounces cleared the short counter every pass, so
// it could redirect forever without the guard ever seeing more than one attempt.
describe('resetGuard', () => {
  it('clears the history too, so signing out is never refused', () => {
    const data = new Map<string, string>();
    const s = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
    let now = 0;
    for (let i = 0; i < 6; i++) {
      recordAttempt(s, now);
      clearAttempts(s);
      now += 60_000;
    }
    expect(recordAttempt(s, now).allowed).toBe(false);

    resetGuard(s);
    expect(recordAttempt(s, now).allowed).toBe(true);
  });
});

describe('long-window history', () => {
  const store = () => {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
  };

  it('stops a slow loop that clears the short counter on every pass', () => {
    const s = store();
    let now = 0;
    const results = [];
    for (let i = 0; i < 7; i++) {
      results.push(recordAttempt(s, now).allowed);
      clearAttempts(s); // the session proved healthy in between
      now += 60_000; // one redirect a minute — never 3 inside the short window
    }
    expect(results.slice(0, 5)).toEqual([true, true, true, true, true]);
    expect(results.slice(5)).toEqual([false, false]);
  });

  it('forgets history older than its window, so normal use is never blocked', () => {
    const s = store();
    let now = 0;
    for (let i = 0; i < 5; i++) {
      recordAttempt(s, now);
      clearAttempts(s);
      now += HISTORY_WINDOW_MS / 4;
    }
    // Well past the window: nothing from the earlier run counts any more.
    expect(recordAttempt(s, now + HISTORY_WINDOW_MS).allowed).toBe(true);
  });
});
