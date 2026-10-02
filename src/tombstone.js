const VERSION_HEADER = 'X-ZPHLM-Worker-Version';

export default {
  fetch(request, env) {
    const body = request.method === 'HEAD'
      ? null
      : JSON.stringify({ ok: false, code: 'release_tombstone' });
    return new Response(body, {
      status: 503,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': '60',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex, nofollow',
        [VERSION_HEADER]: String(env.CF_VERSION_METADATA?.id || 'unavailable'),
      },
    });
  },
};
