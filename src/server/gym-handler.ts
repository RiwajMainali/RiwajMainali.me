import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { db, type GymUser } from '../lib/gym/db';
import {
  ApiError,
  digest,
  id,
  limited,
  newDevice,
  readJson,
  requireMethod,
  requireUser,
  sameOrigin,
  token,
  userFor,
} from '../lib/gym/server';
import { draftSchema, revisionSchema } from '../lib/gym/validation';
import { sendApproval } from '../lib/gym/mail';
import {
  searchExercises,
  queryVariants,
  exerciseIdentity,
  type ExerciseUsage,
} from '../lib/gym/search';
import { emptyDraft, type Draft, type Exercise } from '../lib/gym/types';
import { upload, serveMedia } from '../lib/gym/media';
export const config = { api: { bodyParser: false, responseLimit: false } };
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    sameOrigin(req);
    const route = ((req.query.route as string[]) ?? []).join('/');
    if (route === 'session') {
      requireMethod(req, 'GET');
      const u = userFor(req);
      return res.json({
        user: u
          ? {
              id: u.id,
              name: u.name,
              status: u.status,
              owner:
                u.email ===
                (process.env.GYM_OWNER_EMAIL ?? 'riwaj227@gmail.com'),
            }
          : null,
      });
    }
    if (route === 'request') {
      requireMethod(req, 'POST');
      // Global and per-address limits remain effective behind an untrusted proxy.
      limited('requests:global', 20, 3600);
      const b = z
        .object({
          email: z
            .string()
            .email()
            .max(200)
            .transform((s) => s.trim().toLowerCase()),
          name: z
            .string()
            .trim()
            .min(1)
            .max(80)
            .regex(/^[^\r\n]+$/),
        })
        .parse(await readJson(req));
      limited('request:' + digest(b.email), 2, 3600);
      if (b.email === (process.env.GYM_OWNER_EMAIL ?? 'riwaj227@gmail.com'))
        throw new ApiError(
          403,
          'Owner access is initialized on the server. Use a pairing code from the owner setup command.'
        );
      const raw = token(),
        userId = id();
      db()
        .transaction(() => {
          const existing = db()
            .prepare('SELECT id FROM users WHERE email=?')
            .get(b.email);
          if (existing)
            throw new ApiError(
              409,
              'An account already exists. Pair from an approved device. Contact the owner if you need recovery.'
            );
          const n = db()
            .prepare(
              "SELECT count(*) n FROM users WHERE status IN ('approved','pending')"
            )
            .get() as { n: number };
          if (n.n >= 100)
            throw new ApiError(409, 'All 100 places are currently reserved.');
          db()
            .prepare('INSERT INTO users VALUES(?,?,?,?,?)')
            .run(userId, b.email, b.name, 'pending', new Date().toISOString());
          db()
            .prepare('INSERT INTO approvals VALUES(?,?,?)')
            .run(digest(raw), userId, Date.now() + 48 * 3600000);
        })
        .immediate();
      try {
        await sendApproval(b.email, b.name, raw);
      } catch {
        db().prepare('DELETE FROM users WHERE id=?').run(userId);
        throw new ApiError(
          503,
          'Approval email could not be sent. Ask the owner to configure SMTP on the EC2 server, then retry.'
        );
      }
      newDevice(res, userId);
      return res.status(201).json({
        message:
          'Approval requested. Keep this device connected; access activates after approval.',
      });
    }
    if (route === 'approve') {
      requireMethod(req, 'GET', 'POST');
      if (req.method === 'GET') {
        const raw = z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .parse(req.query.token);
        const u = db()
          .prepare(
            'SELECT u.name,u.email FROM approvals a JOIN users u ON u.id=a.user_id WHERE a.token=? AND a.expires>?'
          )
          .get(digest(raw), Date.now());
        if (!u)
          throw new ApiError(
            410,
            'This approval link has expired or was already used'
          );
        return res.json(u);
      }
      const b = z
        .object({
          token: z.string().regex(/^[a-f0-9]{64}$/),
          decision: z.enum(['approved', 'rejected']),
        })
        .parse(await readJson(req));
      db()
        .transaction(() => {
          const a = db()
            .prepare(
              'SELECT user_id FROM approvals WHERE token=? AND expires>?'
            )
            .get(digest(b.token), Date.now()) as
            | { user_id: string }
            | undefined;
          if (!a)
            throw new ApiError(
              410,
              'This approval link has expired or was already used'
            );
          db()
            .prepare('UPDATE users SET status=? WHERE id=?')
            .run(b.decision, a.user_id);
          db().prepare('DELETE FROM approvals WHERE user_id=?').run(a.user_id);
        })
        .immediate();
      return res.json({
        message: `Access ${b.decision}. The requesting device can now refresh.`,
      });
    }
    if (route === 'pair/redeem') {
      requireMethod(req, 'POST');
      limited('pair:global', 60, 3600);
      const b = z
        .object({ code: z.string().regex(/^[a-f0-9]{64}$/) })
        .parse(await readJson(req));
      db()
        .transaction(() => {
          const p = db()
            .prepare(
              "SELECT p.user_id FROM pairs p JOIN users u ON u.id=p.user_id WHERE p.token=? AND p.expires>? AND u.status='approved'"
            )
            .get(digest(b.code), Date.now()) as { user_id: string } | undefined;
          if (!p)
            throw new ApiError(410, 'Pairing code expired or was already used');
          db().prepare('DELETE FROM pairs WHERE token=?').run(digest(b.code));
          newDevice(res, p.user_id);
        })
        .immediate();
      return res.json({ message: 'Device paired' });
    }
    const user = requireUser(req);
    limited('api:' + user.id, 1000, 60);
    if (route === 'pair') {
      requireMethod(req, 'POST');
      const raw = token();
      db()
        .prepare('DELETE FROM pairs WHERE user_id=? OR expires<?')
        .run(user.id, Date.now());
      db()
        .prepare('INSERT INTO pairs VALUES(?,?,?)')
        .run(digest(raw), user.id, Date.now() + 10 * 60000);
      return res.json({ code: raw });
    }
    if (route === 'logout') {
      requireMethod(req, 'POST');
      db()
        .prepare('DELETE FROM devices WHERE token=?')
        .run(digest(req.cookies.gym_device ?? ''));
      res.setHeader(
        'Set-Cookie',
        'gym_device=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0'
      );
      return res.json({ ok: true });
    }
    if (route === 'devices/revoke') {
      requireMethod(req, 'POST');
      db()
        .prepare('DELETE FROM devices WHERE user_id=? AND token<>?')
        .run(user.id, digest(req.cookies.gym_device ?? ''));
      db().prepare('DELETE FROM pairs WHERE user_id=?').run(user.id);
      return res.json({ ok: true });
    }
    if (route === 'admin/users') {
      requireMethod(req, 'GET', 'POST');
      if (user.email !== (process.env.GYM_OWNER_EMAIL ?? 'riwaj227@gmail.com'))
        throw new ApiError(403, 'Owner access required');
      if (req.method === 'GET')
        return res.json({
          users: db()
            .prepare(
              'SELECT id,name,email,status,created_at FROM users ORDER BY created_at DESC'
            )
            .all(),
        });
      const b = z
        .object({
          userId: z.string().uuid(),
          status: z.enum(['approved', 'rejected']),
        })
        .parse(await readJson(req));
      if (b.userId === user.id)
        throw new ApiError(400, 'Cannot revoke your own owner account');
      db()
        .transaction(() => {
          const target = db()
            .prepare('SELECT * FROM users WHERE id=?')
            .get(b.userId) as GymUser | undefined;
          if (!target) throw new ApiError(404, 'User not found');
          const n = db()
            .prepare(
              "SELECT count(*) n FROM users WHERE status IN ('approved','pending')"
            )
            .get() as { n: number };
          if (
            b.status === 'approved' &&
            target.status === 'rejected' &&
            n.n >= 100
          )
            throw new ApiError(409, 'All 100 places are reserved');
          db()
            .prepare('UPDATE users SET status=? WHERE id=?')
            .run(b.status, b.userId);
          db().prepare('DELETE FROM approvals WHERE user_id=?').run(b.userId);
          if (b.status === 'rejected') {
            db().prepare('DELETE FROM devices WHERE user_id=?').run(b.userId);
            db().prepare('DELETE FROM pairs WHERE user_id=?').run(b.userId);
          }
        })
        .immediate();
      return res.json({ ok: true });
    }
    if (route === 'exercise') {
      requireMethod(req, 'GET');
      const exercise = db()
        .prepare(
          'SELECT id,name,equipment,muscle,bodyPart,category FROM exercises WHERE id=? AND (owner_id IS NULL OR owner_id=?)'
        )
        .get(String(req.query.id ?? ''), user.id);
      if (!exercise) throw new ApiError(404, 'Exercise not found');
      return res.json({ exercise });
    }
    if (route === 'exercises') {
      requireMethod(req, 'GET', 'POST');
      if (req.method === 'POST') {
        const b = z
          .object({
            name: z.string().trim().min(2).max(150),
            equipment: z.string().trim().min(1).max(50),
            muscle: z.string().trim().min(1).max(50),
          })
          .parse(await readJson(req));
        if (queryVariants(b.name).length > 1)
          throw new ApiError(
            400,
            'This shorthand has multiple meanings. Use the full exercise name or select an existing variation from search.'
          );
        const available = db()
          .prepare(
            'SELECT id,name,equipment,muscle,bodyPart,category FROM exercises WHERE owner_id IS NULL OR owner_id=?'
          )
          .all(user.id) as Exercise[];
        const identical = available.filter(
          (e) => exerciseIdentity(e) === exerciseIdentity(b)
        );
        if (identical.length === 1)
          return res.status(200).json({ exercise: identical[0], reused: true });
        if (identical.length > 1)
          throw new ApiError(
            409,
            'Equivalent variations already exist. Select one from exercise search.'
          );
        limited('custom:' + user.id, 100, 86400);
        const e = { ...b, id: id(), bodyPart: 'custom', category: 'strength' };
        db()
          .prepare(
            'INSERT INTO exercises VALUES(@id,@name,@equipment,@muscle,@bodyPart,@category,@owner_id)'
          )
          .run({ ...e, owner_id: user.id });
        return res.status(201).json({ exercise: e });
      }
      const query = String(req.query.q ?? '').slice(0, 150);
      const equipment = String(req.query.equipment ?? '').slice(0, 50);
      const offset = Math.max(
        0,
        Math.min(100000, Number(req.query.offset) || 0)
      );
      const available = db()
        .prepare(
          'SELECT id,name,equipment,muscle,bodyPart,category FROM exercises WHERE owner_id IS NULL OR owner_id=?'
        )
        .all(user.id) as Exercise[];
      const usage = db()
        .prepare(
          'SELECT exercise_id exerciseId, count(*) count, max(created_at) lastUsed FROM entries WHERE user_id=? GROUP BY exercise_id'
        )
        .all(user.id) as ExerciseUsage[];
      const result = searchExercises(
        available,
        query,
        equipment,
        offset,
        usage
      );
      return res.json({
        ...result,
        equipments: [...new Set(available.map((e) => e.equipment))].sort(),
      });
    }
    if (route === 'draft') {
      requireMethod(req, 'GET', 'PUT');
      if (req.method === 'GET') {
        const row = db()
          .prepare('SELECT * FROM drafts WHERE user_id=?')
          .get(user.id) as
          | { content: string; revision: number; updated_at: string }
          | undefined;
        return res.json({
          draft: row ? JSON.parse(row.content) : emptyDraft(),
          revision: row?.revision ?? 0,
          updatedAt: row?.updated_at ?? null,
        });
      }
      const b = z
        .object({ revision: revisionSchema, draft: draftSchema })
        .parse(await readJson(req));
      db()
        .transaction(() => {
          const current = db()
            .prepare('SELECT revision FROM drafts WHERE user_id=?')
            .get(user.id) as { revision: number } | undefined;
          if ((current?.revision ?? 0) !== b.revision)
            throw new ApiError(
              409,
              'This draft changed on another device. Your changes are still here; reload the server draft or explicitly replace it.'
            );
          checkExerciseAndMedia(b.draft, user.id, false);
          db()
            .prepare(
              'INSERT INTO drafts VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision,content=excluded.content,updated_at=excluded.updated_at'
            )
            .run(
              user.id,
              b.revision + 1,
              JSON.stringify(b.draft),
              new Date().toISOString()
            );
        })
        .immediate();
      return res.json({ revision: b.revision + 1 });
    }
    if (route === 'entries') {
      requireMethod(req, 'GET', 'POST', 'DELETE');
      if (req.method === 'GET') {
        const exercise = String(req.query.exerciseId ?? '');
        const offset = Math.max(0, Number(req.query.offset) || 0);
        const rows = db()
          .prepare(
            "SELECT e.id,e.content,e.created_at,x.name exercise FROM entries e JOIN exercises x ON x.id=e.exercise_id WHERE e.user_id=? AND (?='' OR e.exercise_id=?) ORDER BY e.created_at DESC,e.id LIMIT 200 OFFSET ?"
          )
          .all(user.id, exercise, exercise, offset) as {
          id: string;
          content: string;
          created_at: string;
          exercise: string;
        }[];
        const count = db()
          .prepare(
            "SELECT count(*) n FROM entries WHERE user_id=? AND (?='' OR exercise_id=?)"
          )
          .get(user.id, exercise, exercise) as { n: number };
        return res.json({
          entries: rows.map((r) => ({
            ...JSON.parse(r.content),
            id: r.id,
            exercise: r.exercise,
            createdAt: r.created_at,
          })),
          hasMore: offset + rows.length < count.n,
          total: count.n,
        });
      }
      if (req.method === 'DELETE') {
        const b = z
          .object({ id: z.string().uuid() })
          .parse(await readJson(req));
        const r = db()
          .prepare('DELETE FROM entries WHERE user_id=? AND id=?')
          .run(user.id, b.id);
        if (!r.changes) throw new ApiError(404, 'Entry not found');
        return res.json({ ok: true });
      }
      const b = z
        .object({ id: z.string().uuid(), revision: revisionSchema })
        .parse(await readJson(req));
      const entry = db()
        .transaction(() => {
          const existing = db()
            .prepare('SELECT id FROM entries WHERE id=? AND user_id=?')
            .get(b.id, user.id);
          if (existing) return existing; // Retried saves are idempotent, including lost responses.
          const row = db()
            .prepare('SELECT * FROM drafts WHERE user_id=?')
            .get(user.id) as { content: string; revision: number } | undefined;
          if (!row || row.revision !== b.revision)
            throw new ApiError(409, 'Draft changed; sync it before saving');
          const draft = draftSchema.parse(JSON.parse(row.content));
          if (draft.sets.some((s) => s.weight === null || s.reps === null))
            throw new ApiError(
              400,
              'Enter weight and reps for every set before saving. Use 0 for no external weight.'
            );
          checkExerciseAndMedia(draft, user.id, true);
          if (draft.sets.every((s) => s.warmup))
            throw new ApiError(400, 'Add at least one working set');
          db()
            .prepare('INSERT INTO entries VALUES(?,?,?,?,?)')
            .run(
              b.id,
              user.id,
              draft.exerciseId,
              JSON.stringify(draft),
              new Date().toISOString()
            );
          // Retain exercise and last load for the next session, but never carry old notes/media.
          const next = {
            ...draft,
            date: emptyDraft().date,
            notes: '',
            mediaIds: [],
          };
          db()
            .prepare(
              'UPDATE drafts SET revision=revision+1,content=?,updated_at=? WHERE user_id=?'
            )
            .run(JSON.stringify(next), new Date().toISOString(), user.id);
          return { id: b.id };
        })
        .immediate();
      return res.status(201).json({ entry });
    }
    if (route === 'media') {
      requireMethod(req, 'GET', 'POST');
      if (req.method === 'POST') return await upload(req, res, user.id);
      return res.json({
        media: db()
          .prepare(
            'SELECT id,name,type,size FROM media WHERE user_id=? ORDER BY created_at DESC LIMIT 500'
          )
          .all(user.id),
      });
    }
    if (route.startsWith('media/')) {
      requireMethod(req, 'GET', 'HEAD', 'DELETE');
      return await serveMedia(req, res, user.id, route.slice(6));
    }
    throw new ApiError(404, 'Not found');
  } catch (e) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (e instanceof z.ZodError)
      return res.status(400).json({
        error: e.issues
          .map((x) => `${x.path.join('.')}: ${x.message}`)
          .join('; '),
      });
    if (e instanceof ApiError)
      return res.status(e.status).json({ error: e.message });
    console.error(
      'Gym request failed',
      e instanceof Error ? e.name : 'unknown'
    );
    return res
      .status(500)
      .json({ error: 'Server error. Your saved data has not been cleared.' });
  }
}
function checkExerciseAndMedia(
  draft: Draft,
  userId: string,
  required: boolean
) {
  if (required || draft.exerciseId) {
    const ex = db()
      .prepare(
        'SELECT id FROM exercises WHERE id=? AND (owner_id IS NULL OR owner_id=?)'
      )
      .get(draft.exerciseId, userId);
    if (!ex)
      throw new ApiError(400, 'Select an exercise available to your account');
  }
  for (const mediaId of draft.mediaIds)
    if (
      !db()
        .prepare('SELECT id FROM media WHERE id=? AND user_id=?')
        .get(mediaId, userId)
    )
      throw new ApiError(400, 'Attachment not found');
}
