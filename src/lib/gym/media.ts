import type { NextApiRequest, NextApiResponse } from 'next';
import {
  createReadStream,
  createWriteStream,
  mkdirSync,
  promises as fs,
} from 'fs';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import path from 'path';
import { db, dataDir } from './db';
import { ApiError, id } from './server';
function sniff(b: Buffer): string | null {
  if (b.toString('hex', 0, 3) === 'ffd8ff') return 'image/jpeg';
  if (b.toString('hex', 0, 8) === '89504e470d0a1a0a') return 'image/png';
  if (
    b.toString('ascii', 0, 4) === 'RIFF' &&
    b.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp';
  if (
    b.toString('ascii', 0, 4) === 'RIFF' &&
    b.toString('ascii', 8, 12) === 'WAVE'
  )
    return 'audio/wav';
  if (b.toString('ascii', 4, 8) === 'ftyp')
    return b.toString('ascii', 8, 12).startsWith('M4A')
      ? 'audio/mp4'
      : 'video/mp4';
  if (b.toString('hex', 0, 4) === '1a45dfa3') return 'video/webm';
  if (b.toString('ascii', 0, 4) === 'OggS') return 'audio/ogg';
  if (
    b.toString('ascii', 0, 3) === 'ID3' ||
    (b[0] === 255 && ((b[1] ?? 0) & 0xe0) === 0xe0)
  )
    return 'audio/mpeg';
  if (b.toString('ascii', 0, 4) === 'fLaC') return 'audio/flac';
  return null;
}
const MAX = 50 * 1024 * 1024;
export async function upload(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string
) {
  const length = Number(req.headers['content-length']);
  if (!Number.isSafeInteger(length) || length < 1 || length > MAX)
    throw new ApiError(413, 'Upload must be between 1 byte and 50 MB');
  const mediaId = id(),
    folder = path.join(dataDir(), 'uploads');
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const file = path.join(folder, mediaId),
    tmp = file + '.part';
  let name: string;
  try {
    name = decodeURIComponent(
      String(req.headers['x-file-name'] ?? 'attachment')
    )
      .replace(/[\r\n\x00-\x1f]/g, '')
      .slice(0, 150);
  } catch {
    throw new ApiError(400, 'Invalid filename');
  }
  // Reserve bytes before streaming, so concurrent uploads cannot exceed quotas.
  db()
    .transaction(() => {
      const mine = db()
        .prepare(
          'SELECT COALESCE(sum(size),0) n, count(*) count FROM media WHERE user_id=?'
        )
        .get(userId) as { n: number; count: number };
      if (mine.count >= 500)
        throw new ApiError(413, 'Maximum 500 attachments per member');
      const total = db()
        .prepare('SELECT COALESCE(sum(size),0) n FROM media')
        .get() as { n: number };
      if (
        mine.n + length > 500 * 1024 * 1024 ||
        total.n + length > 10 * 1024 * 1024 * 1024
      )
        throw new ApiError(
          413,
          'Media storage limit reached (500 MB per user, 10 GB total)'
        );
      db()
        .prepare('INSERT INTO media VALUES(?,?,?,?,?,?)')
        .run(
          mediaId,
          userId,
          name,
          'pending',
          length,
          new Date().toISOString()
        );
    })
    .immediate();
  let bytes = 0,
    header = Buffer.alloc(0);
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, cb) {
      bytes += chunk.length;
      if (bytes > length || bytes > MAX)
        return cb(new ApiError(413, 'Upload is too large'));
      if (header.length < 128)
        header = Buffer.from([
          ...header,
          ...chunk.subarray(0, 128 - header.length),
        ]);
      cb(null, chunk);
    },
  });
  try {
    await pipeline(
      req,
      limiter,
      createWriteStream(tmp, { flags: 'wx', mode: 0o600 })
    );
    const type = sniff(header);
    if (!type || bytes !== length)
      throw new ApiError(
        400,
        'Unsupported or incomplete media. Use JPEG, PNG, WebP, MP4, WebM, MP3, WAV, Ogg, M4A or FLAC.'
      );
    await fs.rename(tmp, file);
    db().prepare('UPDATE media SET type=? WHERE id=?').run(type, mediaId);
    return res
      .status(201)
      .json({ media: { id: mediaId, name, type, size: bytes } });
  } catch (e) {
    await fs.rm(tmp, { force: true });
    await fs.rm(file, { force: true });
    db().prepare('DELETE FROM media WHERE id=?').run(mediaId);
    throw e;
  }
}
export async function serveMedia(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string,
  mediaId: string
) {
  if (!/^[a-f0-9-]{36}$/.test(mediaId))
    throw new ApiError(404, 'Media not found');
  const m = db()
    .prepare("SELECT * FROM media WHERE id=? AND user_id=? AND type<>'pending'")
    .get(mediaId, userId) as
    | { id: string; name: string; type: string; size: number }
    | undefined;
  if (!m) throw new ApiError(404, 'Media not found');
  const file = path.join(dataDir(), 'uploads', mediaId);
  if (req.method === 'DELETE') {
    const entries = db()
      .prepare(
        'SELECT content FROM entries WHERE user_id=? UNION ALL SELECT content FROM drafts WHERE user_id=?'
      )
      .all(userId, userId) as { content: string }[];
    if (
      entries.some((e) =>
        (JSON.parse(e.content) as { mediaIds: string[] }).mediaIds.includes(
          mediaId
        )
      )
    )
      throw new ApiError(
        409,
        'Remove this attachment from its saved entries and draft before deleting it'
      );
    await fs.rm(file, { force: true });
    db()
      .prepare('DELETE FROM media WHERE id=? AND user_id=?')
      .run(mediaId, userId);
    return res.json({ ok: true });
  }
  const stat = await fs.stat(file);
  res.setHeader('Content-Type', m.type);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader(
    'Content-Disposition',
    `${
      req.query.download === '1' ? 'attachment' : 'inline'
    }; filename*=UTF-8''${encodeURIComponent(m.name)}`
  );
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  let start = 0,
    end = stat.size - 1;
  if (req.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!match || (!match[1] && !match[2])) {
      res.setHeader('Content-Range', `bytes */${stat.size}`);
      return res.status(416).end();
    }
    if (!match[1]) start = Math.max(0, stat.size - Number(match[2]));
    else {
      start = Number(match[1]);
      if (match[2]) end = Math.min(end, Number(match[2]));
    }
    if (start > end || start >= stat.size) {
      res.setHeader('Content-Range', `bytes */${stat.size}`);
      return res.status(416).end();
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
  }
  res.setHeader('Content-Length', end - start + 1);
  if (req.method === 'HEAD') return res.end();
  await pipeline(createReadStream(file, { start, end }), res);
}
