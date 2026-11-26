import { createHash, randomBytes, randomUUID, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_SESSION_TTL = 60 * 60 * 1000;
const cookieName = 'room_session';
const migration = readFileSync(new URL('../../migrations/001-auth.sql', import.meta.url), 'utf8');

function hashPassword(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

type User = { id: string; email: string; displayName: string; role: 'user' | 'admin' };
type StoredUser = User & { salt: string; passwordHash: string };

interface AuthOptions {
  origin: string;
  account: { email: string; password: string; displayName?: string };
  secureCookie?: boolean;
  ttlMs?: number;
  database?: string;
}

function problem(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

function sessionHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function readSession(request: Request) {
  const cookies = request.headers.get('cookie')?.split(';') ?? [];
  const token = cookies.map(cookie => cookie.trim()).find(cookie => cookie.startsWith(cookieName + '='));
  return token?.slice(cookieName.length + 1);
}

function loginInput(data: unknown): data is { email: string; password: string } {
  if (typeof data !== 'object' || data === null || Array.isArray(data) || Object.keys(data).length !== 2) return false;
  const { email, password } = data as Record<string, unknown>;
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    && typeof password === 'string' && password.length > 0 && password.length <= 1024;
}

export function createAuth({ origin, account, secureCookie = true, ttlMs = DEFAULT_SESSION_TTL, database = ':memory:' }: AuthOptions) {
  const db = new DatabaseSync(database, { enableForeignKeyConstraints: true });
  db.exec(migration);
  const salt = randomBytes(16).toString('hex');
  const dummyHash = randomBytes(64);
  const email = account.email.toLowerCase();
  db.prepare(
    'INSERT INTO users (id, email, display_name, role, password_salt, password_hash) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING',
  ).run(randomUUID(), email, account.displayName ?? 'ผู้เล่น', 'user', salt, scryptSync(account.password, salt, 64).toString('hex'));

  const userByEmail = db.prepare(
    'SELECT id, email, display_name AS displayName, role, password_salt AS salt, password_hash AS passwordHash FROM users WHERE email = ?',
  );
  const userBySession = db.prepare(
    'SELECT users.id, users.email, users.display_name AS displayName, users.role'
      + ' FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?',
  );
  const addSession = db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)');
  const removeSession = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
  const removeExpired = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');

  const cookie = (value: string, maxAge: number) =>
    cookieName + '=' + value + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + maxAge + (secureCookie ? '; Secure' : '');

  return {
    close: () => db.close(),
    async handle(request: Request): Promise<Response> {
      const path = new URL(request.url).pathname;
      if (path === '/api/v1/auth/me' && request.method === 'GET') {
        const token = readSession(request);
        const user = token && userBySession.get(sessionHash(token), Date.now()) as User | undefined;
        return user ? Response.json({ user }) : problem(401, 'UNAUTHENTICATED', 'Session is missing or expired');
      }

      const login = path === '/api/v1/auth/login' && request.method === 'POST';
      const logout = path === '/api/v1/auth/logout' && request.method === 'POST';
      if (!login && !logout) return new Response(null, { status: 404 });
      if (request.headers.get('origin') !== origin) return problem(403, 'FORBIDDEN', 'Origin is not allowed');

      if (logout) {
        const token = readSession(request);
        if (token) removeSession.run(sessionHash(token));
        return new Response(null, { status: 204, headers: { 'Set-Cookie': cookie('', 0) } });
      }

      const input: unknown = await request.json().catch(() => null);
      if (!loginInput(input)) return problem(422, 'VALIDATION_ERROR', 'Enter a valid email and password');

      const user = userByEmail.get(input.email.toLowerCase()) as StoredUser | undefined;
      const candidate = await hashPassword(input.password, user?.salt ?? salt);
      const expected = user ? Buffer.from(user.passwordHash, 'hex') : dummyHash;
      if (!timingSafeEqual(candidate, expected) || !user) {
        return problem(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
      }

      const token = randomBytes(32).toString('base64url');
      const now = Date.now();
      removeExpired.run(now);
      addSession.run(sessionHash(token), user.id, now + ttlMs);
      return Response.json(
        { user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role } },
        { headers: { 'Set-Cookie': cookie(token, Math.ceil(ttlMs / 1000)) } },
      );
    },
  };
}
