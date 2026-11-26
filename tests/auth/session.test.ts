import { existsSync } from 'node:fs';
import { expect, test } from 'vitest';

const config = {
  origin: 'http://localhost:5173',
  account: { email: 'player@example.test', password: 'test-fixture-password' },
};

async function setup(ttlMs = 60_000) {
  const entry = new URL('../../src/auth/session.ts', import.meta.url);
  expect(existsSync(entry), 'The auth API must implement login, current session, and logout').toBe(true);
  const { createAuth } = await import(entry.href) as typeof import('../../src/auth/session.ts');
  const auth = createAuth({ ...config, ttlMs, secureCookie: true });
  const call = (path: string, options?: RequestInit) => auth.handle(
    new Request('http://localhost:3001/api/v1/auth/' + path, options),
  );
  const login = (email = config.account.email, password = config.account.password, origin = config.origin) =>
    call('login', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return { auth, call, login };
}

test('login sets a secure session and /me reads it', async () => {
  const { auth, call, login } = await setup();
  try {
    const response = await login();
    expect(response.status).toBe(200);
    const saved = response.headers.get('set-cookie')!;
    expect(saved).toContain('HttpOnly');
    expect(saved).toContain('SameSite=Lax');
    expect(saved).toContain('Secure');
    expect(saved).not.toContain('Domain=');
    const current = await call('me', { headers: { cookie: saved.split(';')[0] } });
    expect(current.status).toBe(200);
    expect(await current.json()).toEqual(await response.json());
  } finally { auth.close(); }
});

test('an unknown account and a wrong password produce the same response', async () => {
  const { auth, login } = await setup();
  try {
    const wrong = await login(config.account.email, 'wrong-password');
    const unknown = await login('unknown@example.test', 'wrong-password');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
    expect(wrong.headers.get('set-cookie')).toBeNull();
    expect(unknown.headers.get('set-cookie')).toBeNull();
  } finally { auth.close(); }
});

test('logout revokes the session and writes from another origin are forbidden', async () => {
  const { auth, call, login } = await setup();
  try {
    expect((await login(config.account.email, config.account.password, 'http://foreign.test')).status).toBe(403);
    const cookie = (await login()).headers.get('set-cookie')!.split(';')[0];
    const logout = await call('logout', { method: 'POST', headers: { cookie, origin: config.origin } });
    expect(logout.status).toBe(204);
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await call('me', { headers: { cookie } })).status).toBe(401);
  } finally { auth.close(); }
});

test('an expired session is rejected', async () => {
  const { auth, call, login } = await setup(0);
  try {
    const cookie = (await login()).headers.get('set-cookie')!.split(';')[0];
    expect((await call('me', { headers: { cookie } })).status).toBe(401);
  } finally { auth.close(); }
});
