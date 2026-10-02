import { handleLearningEvidenceRequest } from './learning-evidence-proxy.js';

/**
 * 紅樓夢脂評匯校本 · The Story of the Stone (Zhiyanzhai Annotated Master Edition)
 * Cloudflare Worker + D1 Backend for zphlm.bdfz.net
 */

const MAX_INTENSITY = 5;
const WRITES_PER_MIN = 40;
const COMMENTS_PER_MIN = 8;
const BOOK_DEFAULT = 'zphlm';
const USER_CENTER = 'https://my.bdfz.net/api/session';

// ── tiny helpers ──
function cors(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extra
  };
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...cors(),
      ...extra
    }
  });
}

function err(detail, status) {
  return json({ ok: false, detail }, status);
}

function clientIP(r) {
  return r.headers.get('CF-Connecting-IP') || r.headers.get('X-Real-IP') ||
         r.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || '0.0.0.0';
}

async function hashIP(ip, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ip}|${salt}`));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function clean(s, max) {
  return String(s == null ? '' : s).replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, max);
}

const SEG_RE = /^[A-Za-z0-9_:-]{1,64}$/;
const BOOK_RE = /^[A-Za-z0-9_-]{1,32}$/;

function okBook(b) {
  return BOOK_RE.test(b) ? b : BOOK_DEFAULT;
}

// ── rate limiting (in-memory per isolate fallback) ──
const rateBuckets = new Map();
async function rateOk(env, ipHash, kind, limit) {
  const now = Math.floor(Date.now() / 60000);
  const key = `${kind}:${ipHash}:${now}`;
  const cur = (rateBuckets.get(key) || 0) + 1;
  rateBuckets.set(key, cur);
  if (rateBuckets.size > 2000) {
    for (const k of rateBuckets.keys()) {
      if (!k.endsWith(`:${now}`)) rateBuckets.delete(k);
    }
  }
  return cur <= limit;
}

// ── user-center resolution ──
async function resolveUser(request) {
  const cookie = request.headers.get('Cookie') || '';
  if (!cookie.includes('bdfz_uc_session=')) return null;
  try {
    const res = await fetch(USER_CENTER, {
      headers: { Cookie: cookie, 'Accept': 'application/json' },
      cf: { cacheTtl: 30 }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.user || null;
  } catch (_) {
    return null;
  }
}

// ── DB operations ──
function recompute(env, segmentId) {
  return env.DB.prepare(
    `INSERT INTO segment_stats (segment_id, voters, total, updated_at)
     SELECT ?1, COUNT(*), COALESCE(SUM(intensity), 0), datetime('now')
     FROM reactions WHERE segment_id = ?1 AND intensity > 0
     ON CONFLICT(segment_id) DO UPDATE SET
       voters=excluded.voters, total=excluded.total, updated_at=datetime('now')`
  ).bind(segmentId);
}

async function handleReact(request, env) {
  let b;
  try { b = await request.json(); } catch { return err('bad json', 400); }
  const segmentId = String(b.target || b.segment_id || '');
  const uid = String(b.uid || 'guest-' + clientIP(request).slice(0, 16));
  const book = okBook(b.book);
  let intensity = parseInt(b.intensity ?? b.score ?? 1, 10);

  if (!SEG_RE.test(segmentId)) return err('bad segment_id', 400);
  if (!Number.isFinite(intensity) || intensity < 0 || intensity > MAX_INTENSITY) return err('intensity 0..5', 400);

  const ipHash = await hashIP(clientIP(request), env.SECRET_SALT || 'salt-zphlm');
  if (!await rateOk(env, ipHash, 'reactions', WRITES_PER_MIN)) return err('請稍候再試 · slow down', 429);
  const user = await resolveUser(request);

  if (!env.DB) {
    return json({ ok: true, segment_id: segmentId, voters: intensity > 0 ? 1 : 0, total: intensity });
  }

  if (intensity === 0) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM reactions WHERE segment_id=? AND uid=?').bind(segmentId, uid),
      recompute(env, segmentId),
    ]);
  } else {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO reactions (segment_id, uid, intensity, ip_hash, slug, name, book, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'), datetime('now'))
         ON CONFLICT(segment_id, uid) DO UPDATE SET
           intensity=excluded.intensity, ip_hash=excluded.ip_hash, slug=excluded.slug, name=excluded.name,
           book=excluded.book, updated_at=datetime('now')`
      ).bind(segmentId, uid, intensity, ipHash, user?.slug || null, user?.name || null, book),
      recompute(env, segmentId),
    ]);
  }

  const stat = await env.DB.prepare('SELECT voters, total FROM segment_stats WHERE segment_id=?').bind(segmentId).first();
  return json({
    ok: true,
    segment_id: segmentId,
    voters: stat?.voters || 0,
    total: stat?.total || 0,
    intensity
  });
}

async function handleStats(request, env) {
  const user = await resolveUser(request);
  let reactions = {};

  if (env.DB) {
    try {
      const { results } = await env.DB.prepare(
        'SELECT segment_id, total, voters FROM segment_stats WHERE total > 0'
      ).all();
      (results || []).forEach(r => {
        reactions[r.segment_id] = r.total;
      });
    } catch (_) {}
  }

  return json({
    ok: true,
    reactions,
    user
  });
}

async function handleRanking(request, env) {
  if (!env.DB) return json([]);

  try {
    const { results } = await env.DB.prepare(
      `SELECT segment_id AS id, total AS score, voters
       FROM segment_stats
       WHERE total > 0
       ORDER BY total DESC, voters DESC
       LIMIT 30`
    ).all();

    const items = (results || []).map(r => {
      const parts = r.id.split('-');
      const chId = parts[0] || '';
      return {
        id: r.id,
        chapterId: chId,
        score: r.score,
        voters: r.voters,
        text: `段落 ${r.id}`
      };
    });

    return json(items);
  } catch (_) {
    return json([]);
  }
}

async function handleComments(request, env) {
  const url = new URL(request.url);
  const target = clean(url.searchParams.get('target') || '', 64);

  if (request.method === 'GET') {
    if (!env.DB || !target) return json([]);
    try {
      const { results } = await env.DB.prepare(
        `SELECT id, segment_id AS target, content, name AS userName, slug AS userSlug, created_at AS createdAt
         FROM comments
         WHERE segment_id = ?
         ORDER BY created_at ASC
         LIMIT 100`
      ).bind(target).all();
      return json(results || []);
    } catch (_) {
      return json([]);
    }
  }

  if (request.method === 'POST') {
    let b;
    try { b = await request.json(); } catch { return err('bad json', 400); }
    const segmentId = clean(b.target || b.segment_id, 64);
    const content = clean(b.content, 2000);
    const book = okBook(b.book);

    if (!segmentId || !content) return err('target and content required', 400);

    const user = await resolveUser(request);
    const ipHash = await hashIP(clientIP(request), env.SECRET_SALT || 'salt-zphlm');
    if (!await rateOk(env, ipHash, 'comments', COMMENTS_PER_MIN)) {
      return err('發言過於頻繁，請稍候再試', 429);
    }

    if (!env.DB) {
      return json({ ok: true, id: 'temp-' + Date.now(), content });
    }

    const commentId = 'c-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await env.DB.prepare(
      `INSERT INTO comments (id, segment_id, content, ip_hash, slug, name, book, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))`
    ).bind(
      commentId, segmentId, content, ipHash,
      user?.slug || 'guest',
      user?.name || '共讀者',
      book
    ).run();

    return json({
      ok: true,
      id: commentId,
      target: segmentId,
      content,
      userName: user?.name || '共讀者',
      createdAt: new Date().toISOString()
    });
  }

  return err('method not allowed', 405);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors() });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Learning evidence proxy
    if (path.startsWith('/api/learning/')) {
      return handleLearningEvidenceRequest(request, env, path);
    }

    // Health check
    if (path === '/api/health') {
      return json({
        ok: true,
        service: 'zphlm-reader',
        version: env.CF_VERSION_METADATA?.id || '20261001.1',
        edition: '2014',
        chapters: 87,
        timestamp: new Date().toISOString()
      });
    }

    // Reaction & Social APIs
    if (path === '/api/react' && request.method === 'POST') {
      return handleReact(request, env);
    }
    if (path === '/api/stats' && request.method === 'GET') {
      return handleStats(request, env);
    }
    if (path === '/api/ranking' && request.method === 'GET') {
      return handleRanking(request, env);
    }
    if (path === '/api/comments') {
      return handleComments(request, env);
    }

    // Serve static assets from ASSETS binding
    if (env.ASSETS) {
      try {
        const assetRes = await env.ASSETS.fetch(request);
        if (assetRes.status !== 404) {
          return assetRes;
        }
        // Fallback for HTML5 SPA routing
        if (request.method === 'GET' && !path.startsWith('/api/') && !path.includes('.')) {
          const indexUrl = new URL('/index.html', request.url);
          return env.ASSETS.fetch(new Request(indexUrl, request));
        }
        return assetRes;
      } catch (_) {}
    }

    return new Response('Not Found', { status: 404 });
  }
};
