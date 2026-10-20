// Shared comments for the kiosk prototype, stored in Upstash Redis (connected through Vercel's Storage tab).
// GET  /api/comments            → every comment, oldest first
// POST /api/comments {action}   → create | reply | resolve | delete, then returns every comment
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});
const KEY = 'cws-kiosk:comments';

const text = (v, max) => String(v ?? '').slice(0, max);
const coord = v => Math.max(0, Math.min(2000, Math.round(Number(v) || 0)));
const parse = v => (typeof v === 'string' ? JSON.parse(v) : v);

async function list() {
  const all = (await redis.hgetall(KEY)) || {};
  return Object.values(all).map(parse).sort((a, b) => a.time - b.time);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') return res.status(200).json(await list());
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use GET or POST' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const id = text(body.id, 48);
    if (!/^c[a-z0-9]{4,47}$/.test(id)) return res.status(400).json({ error: 'Invalid comment id' });

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
      return res.status(200).json(await list());
    }

    const raw = await redis.hget(KEY, id);
    if (!raw) return res.status(404).json({ error: 'Comment not found' });
    const item = parse(raw);

    if (body.action === 'reply') {
      const reply = { author: text(body.author, 40).trim() || 'Guest', text: text(body.text, 2000).trim(), time: Date.now() };
      if (!reply.text) return res.status(400).json({ error: 'Reply is empty' });
      item.replies.push(reply);
      await redis.hset(KEY, { [id]: JSON.stringify(item) });
    } else if (body.action === 'resolve') {
      item.resolved = !!body.resolved;
      await redis.hset(KEY, { [id]: JSON.stringify(item) });
    } else if (body.action === 'delete') {
      await redis.hdel(KEY, id);
    } else {
      return res.status(400).json({ error: 'Unknown action' });
    }
    return res.status(200).json(await list());
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Comments are unavailable right now' });
  }
}
