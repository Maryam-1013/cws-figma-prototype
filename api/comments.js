// Shared comments for the kiosk prototype, stored in Upstash Redis (connected through Vercel's Storage tab).
// GET  /api/comments            → every comment, oldest first
// GET  /api/comments?log=1      → activity log, newest first (who created, edited, replied, marked done or deleted what)
// POST /api/comments {action}   → create | reply | edit | editReply | deleteReply | resolve | delete, then returns every comment
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});
const KEY = 'cws-kiosk:comments';
const LOG = 'cws-kiosk:log';
const LOG_MAX = 2000;

const text = (v, max) => String(v ?? '').slice(0, max);
const coord = v => Math.max(0, Math.min(2000, Math.round(Number(v) || 0)));
const parse = v => (typeof v === 'string' ? JSON.parse(v) : v);

async function list() {
  const all = (await redis.hgetall(KEY)) || {};
  return Object.values(all).map(parse).sort((a, b) => a.time - b.time);
}

// Every change is recorded with who made it, kept even after the comment itself is deleted
async function audit(entry) {
  await redis.lpush(LOG, JSON.stringify({ time: Date.now(), ...entry }));
  await redis.ltrim(LOG, 0, LOG_MAX - 1);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      if (new URL(req.url, 'http://local').searchParams.has('log')) {
        return res.status(200).json(((await redis.lrange(LOG, 0, 499)) || []).map(parse));
      }
      return res.status(200).json(await list());
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use GET or POST' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const id = text(body.id, 48);
    if (!/^c[a-z0-9]{4,47}$/.test(id)) return res.status(400).json({ error: 'Invalid comment id' });
    const by = text(body.by, 40).trim() || 'Guest';

    if (body.action === 'create') {
      const c = body.comment || {};
      const item = {
        id,
        screen: text(c.screen, 40),
        screenName: text(c.screenName, 80),
        x: coord(c.x),
        y: coord(c.y),
        author: text(c.author, 40).trim() || 'Guest',
        text: text(c.text, 2000).trim(),
        time: Date.now(),
        replies: [],
        resolved: false,
      };
      if (!item.text) return res.status(400).json({ error: 'Comment is empty' });
      await redis.hset(KEY, { [id]: JSON.stringify(item) });
      await audit({ by, action: 'added a comment', id, screenName: item.screenName, text: item.text });
      return res.status(200).json(await list());
    }

    const raw = await redis.hget(KEY, id);
    if (!raw) return res.status(404).json({ error: 'Comment not found' });
    const item = parse(raw);
    const where = { id, screenName: item.screenName };

    if (body.action === 'reply') {
      const reply = { author: text(body.author, 40).trim() || 'Guest', text: text(body.text, 2000).trim(), time: Date.now() };
      if (!reply.text) return res.status(400).json({ error: 'Reply is empty' });
      item.replies.push(reply);
      await redis.hset(KEY, { [id]: JSON.stringify(item) });
      await audit({ by, action: 'replied', ...where, text: reply.text });
    } else if (body.action === 'edit') {
      const t = text(body.text, 2000).trim();
      if (!t) return res.status(400).json({ error: 'Comment is empty' });
      const before = item.text;
      item.text = t; item.edited = true;
      await redis.hset(KEY, { [id]: JSON.stringify(item) });
      await audit({ by, action: 'edited a comment', ...where, author: item.author, before, after: t });
    } else if (body.action === 'editReply' || body.action === 'deleteReply') {
      const i = Number(body.index);
      if (!Number.isInteger(i) || i < 0 || i >= item.replies.length) return res.status(400).json({ error: 'Reply not found' });
      const r = item.replies[i];
      if (body.action === 'deleteReply') {
        item.replies.splice(i, 1);
        await redis.hset(KEY, { [id]: JSON.stringify(item) });
        await audit({ by, action: 'deleted a reply', ...where, author: r.author, text: r.text });
      } else {
        const t = text(body.text, 2000).trim();
        if (!t) return res.status(400).json({ error: 'Reply is empty' });
        const before = r.text;
        r.text = t; r.edited = true;
        await redis.hset(KEY, { [id]: JSON.stringify(item) });
        await audit({ by, action: 'edited a reply', ...where, author: r.author, before, after: t });
      }
    } else if (body.action === 'resolve') {
      item.resolved = !!body.resolved;
      await redis.hset(KEY, { [id]: JSON.stringify(item) });
      await audit({ by, action: item.resolved ? 'marked as done' : 'reopened', ...where, text: item.text });
    } else if (body.action === 'delete') {
      await redis.hdel(KEY, id);
      await audit({ by, action: 'deleted a comment', ...where, author: item.author, text: item.text, replies: item.replies });
    } else {
      return res.status(400).json({ error: 'Unknown action' });
    }
    return res.status(200).json(await list());
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Comments are unavailable right now' });
  }
}
