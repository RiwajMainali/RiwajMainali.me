import type { NextApiRequest, NextApiResponse } from 'next';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { db, type GymUser } from './db';
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
export const digest = (s: string) =>
  createHash('sha256').update(s).digest('hex');
export const token = () => randomBytes(32).toString('hex');
export function requireMethod(req: NextApiRequest, ...methods: string[]) {
  if (!methods.includes(req.method ?? ''))
    throw new ApiError(405, 'Method not allowed');
}
export function sameOrigin(req: NextApiRequest) {
  if (['GET', 'HEAD'].includes(req.method ?? '')) return;
  const expected = process.env.GYM_ORIGIN ?? 'http://localhost:3000';
  const allowed = [expected, 'https://riwaj.me', 'https://www.riwaj.me'].map(value => new URL(value).origin);
  if (!allowed.includes(String(req.headers.origin ?? '')))
    throw new ApiError(403, 'Request origin does not match this site');
}
export function userFor(req: NextApiRequest): GymUser | undefined {
  const raw = req.cookies.gym_device;
  if (!raw || !/^[a-f0-9]{64}$/.test(raw)) return undefined;
  return db()
    .prepare(
      'SELECT u.* FROM devices d JOIN users u ON u.id=d.user_id WHERE d.token=? AND d.expires>?'
    )
    .get(digest(raw), Date.now()) as GymUser | undefined;
}
export function requireUser(req: NextApiRequest) {
  const user = userFor(req);
  if (!user)
    throw new ApiError(401, 'Pair this device or request access first');
  if (user.status !== 'approved')
    throw new ApiError(403, 'Your access is awaiting approval');
  return user;
}
export function newDevice(res: NextApiResponse, userId: string) {
  const raw = token(),
    age = 180 * 86400;
  db()
    .prepare('INSERT INTO devices VALUES(?,?,?)')
    .run(digest(raw), userId, Date.now() + age * 1000);
  res.setHeader(
    'Set-Cookie',
    `gym_device=${raw}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${age}${
      process.env.NODE_ENV === 'production' ? '; Secure' : ''
    }`
  );
}
export function limited(key: string, max: number, seconds: number) {
  db()
    .transaction(() => {
      db().prepare('DELETE FROM rate_limits WHERE expires<?').run(Date.now());
      const row = db()
        .prepare('SELECT count FROM rate_limits WHERE key=?')
        .get(key) as { count: number } | undefined;
      if ((row?.count ?? 0) >= max)
        throw new ApiError(429, 'Too many attempts. Try again later.');
      db()
        .prepare(
          'INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1'
        )
        .run(key, Date.now() + seconds * 1000);
    })
    .immediate();
}
export async function readJson(req: NextApiRequest) {
  let size = 0;
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    const b = Buffer.from(chunk);
    size += b.length;
    if (size > 512 * 1024) throw new ApiError(413, 'Request is too large');
    chunks.push(Uint8Array.from(b));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString()) as Record<
      string,
      unknown
    >;
  } catch {
    throw new ApiError(400, 'Invalid JSON');
  }
}
export const id = randomUUID;
