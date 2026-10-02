const MAX_COOKIE_BYTES = 4096;
const MAX_JSON_BYTES = 4096;
const MAX_VISIBLE_SEGMENTS = 3;
const READER_LOADER_CONTRACT_VERSION = 'source-rpc-timed-reading-v1';
const RESOURCE_KEY_RE = /^[A-Za-z0-9_:-]{1,160}$/;
const SESSION_ID_RE = /^[A-Za-z0-9._:~-]{16,256}$/;
const SEGMENT_ID_RE = /^[A-Za-z0-9_:-]{1,64}$/;
const MANIFEST_VERSION_RE = /^[A-Za-z0-9._:-]{1,160}$/;
const MANIFEST_DIGEST_RE = /^sha256:[a-f0-9]{64}$/;

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extra,
    },
  });
}

function fail(code, message, status) {
  return json({ ok: false, error: { code, message, retryable: status >= 500 } }, status);
}

function isSameOrigin(request) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get('Origin');
  if (origin && origin !== requestOrigin) return false;
  const fetchSite = request.headers.get('Sec-Fetch-Site');
  return !fetchSite || fetchSite === 'same-origin' || fetchSite === 'none';
}

function onlyKeys(value, allowed) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => allowed.includes(key));
}

async function readBoundedJson(request) {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) {
    throw Object.assign(new Error('request body too large'), { status: 413 });
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_JSON_BYTES) {
    throw Object.assign(new Error('request body too large'), { status: 413 });
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('request body must be an object');
    }
    return parsed;
  } catch (error) {
    if (error.status) throw error;
    throw Object.assign(new Error('invalid json'), { status: 400 });
  }
}

function cookieHeader(request) {
  const cookie = request.headers.get('Cookie') || '';
  if (!/(?:^|;\s*)bdfz_uc_session=[^;]+/.test(cookie)) return null;
  if (new TextEncoder().encode(cookie).byteLength > MAX_COOKIE_BYTES) return null;
  return cookie;
}

function normalizeStart(body) {
  if (!onlyKeys(body, ['resourceKey'])) return null;
  const resourceKey = String(body.resourceKey || '');
  return RESOURCE_KEY_RE.test(resourceKey) ? { resourceKey } : null;
}

function normalizeHeartbeat(body) {
  if (!onlyKeys(body, ['sessionId', 'sequence', 'visibleSegmentIds'])) return null;
  const sessionId = String(body.sessionId || '');
  const sequence = Number(body.sequence);
  if (!SESSION_ID_RE.test(sessionId)
      || !Number.isSafeInteger(sequence) || sequence < 1 || sequence > 1_000_000_000
      || !Array.isArray(body.visibleSegmentIds)
      || body.visibleSegmentIds.length > MAX_VISIBLE_SEGMENTS) {
    return null;
  }
  const visibleSegmentIds = body.visibleSegmentIds.map((value) => String(value));
  if (visibleSegmentIds.some((value) => !SEGMENT_ID_RE.test(value))
      || new Set(visibleSegmentIds).size !== visibleSegmentIds.length) {
    return null;
  }
  return { sessionId, sequence, visibleSegmentIds };
}

function normalizeComplete(body) {
  if (!onlyKeys(body, ['sessionId'])) return null;
  const sessionId = String(body.sessionId || '');
  return SESSION_ID_RE.test(sessionId) ? { sessionId } : null;
}

function responseStatus(result) {
  if (result?.ok === true) return 200;
  const status = Number(result?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 422;
}

async function loadSourceDescriptor(request, env) {
  if (!env.ASSETS || typeof env.ASSETS.fetch !== 'function') {
    throw Object.assign(new Error('asset binding unavailable'), { status: 503 });
  }
  const manifestUrl = new URL('/learning-manifest.json', request.url);
  const response = await env.ASSETS.fetch(new Request(manifestUrl, { method: 'GET' }));
  if (!response?.ok) {
    throw Object.assign(new Error('learning manifest unavailable'), { status: 503 });
  }
  let manifest;
  try {
    manifest = await response.json();
  } catch {
    throw Object.assign(new Error('learning manifest invalid'), { status: 503 });
  }
  const sourceSiteKey = String(manifest?.siteKey || '');
  const manifestVersion = String(manifest?.manifestVersion || '');
  const manifestDigest = String(manifest?.manifestDigest || '');
  const itemCount = Number(manifest?.chapterCount);
  if (
    manifest?.schema !== 'bdfz-reader-learning-manifest-v1'
    || !RESOURCE_KEY_RE.test(sourceSiteKey)
    || !MANIFEST_VERSION_RE.test(manifestVersion)
    || !MANIFEST_DIGEST_RE.test(manifestDigest)
    || !Number.isSafeInteger(itemCount)
    || itemCount < 1
    || !Array.isArray(manifest?.chapters)
    || manifest.chapters.length !== itemCount
  ) throw Object.assign(new Error('learning manifest invalid'), { status: 503 });
  return {
    sourceSiteKey,
    manifestVersion,
    manifestDigest,
    itemCount,
    loaderContractVersion: READER_LOADER_CONTRACT_VERSION,
  };
}

function exactSourceReceipt(receipt, descriptor) {
  return receipt
    && typeof receipt === 'object'
    && !Array.isArray(receipt)
    && receipt.ok === true
    && receipt.status === 'active'
    && receipt.sourceSiteKey === descriptor.sourceSiteKey
    && receipt.manifestVersion === descriptor.manifestVersion
    && receipt.manifestDigest === descriptor.manifestDigest
    && receipt.itemCount === descriptor.itemCount
    && receipt.loaderContractVersion === descriptor.loaderContractVersion;
}

async function sourceHealth(request, env) {
  const descriptor = await loadSourceDescriptor(request, env);
  const service = env.GROWTH_EVIDENCE;
  if (!service || typeof service.getSourceReceipt !== 'function') {
    throw Object.assign(new Error('binding method unavailable'), { status: 503 });
  }
  const receipt = await service.getSourceReceipt(descriptor);
  if (!exactSourceReceipt(receipt, descriptor)) {
    throw Object.assign(new Error('source receipt mismatch'), { status: 503 });
  }
  return receipt;
}

async function callGrowthEvidence(env, operation, cookie, payload) {
  const service = env.GROWTH_EVIDENCE;
  if (!service) throw Object.assign(new Error('binding unavailable'), { status: 503 });
  if (operation === 'start' && typeof service.startReading === 'function') {
    return service.startReading(cookie, payload);
  }
  if (operation === 'heartbeat' && typeof service.heartbeatReading === 'function') {
    return service.heartbeatReading(cookie, payload);
  }
  if (operation === 'complete' && typeof service.completeReading === 'function') {
    return service.completeReading(cookie, payload);
  }
  throw Object.assign(new Error('binding method unavailable'), { status: 503 });
}

export async function handleLearningEvidenceRequest(request, env, path) {
  if (path === '/api/learning/health') {
    if (request.method !== 'GET') {
      return fail('method_not_allowed', 'GET required', 405);
    }
    try {
      return json(await sourceHealth(request, env));
    } catch {
      return fail('learning_evidence_unavailable', 'learning evidence unavailable', 503);
    }
  }
  if (request.method !== 'POST') {
    return fail('method_not_allowed', 'POST required', 405);
  }
  if (!isSameOrigin(request)) {
    return fail('cross_origin_denied', 'same-origin request required', 403);
  }
  const cookie = cookieHeader(request);
  if (!cookie) {
    return fail('authentication_required', 'User Center login required', 401);
  }

  let operation;
  let normalize;
  if (path === '/api/learning/start') {
    operation = 'start';
    normalize = normalizeStart;
  } else if (path === '/api/learning/heartbeat') {
    operation = 'heartbeat';
    normalize = normalizeHeartbeat;
  } else if (path === '/api/learning/complete') {
    operation = 'complete';
    normalize = normalizeComplete;
  } else {
    return fail('not_found', 'not found', 404);
  }

  try {
    const payload = normalize(await readBoundedJson(request));
    if (!payload) return fail('invalid_request', 'invalid learning evidence request', 400);
    const result = await callGrowthEvidence(env, operation, cookie, payload);
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      return fail('invalid_upstream_response', 'learning evidence unavailable', 502);
    }
    return json(result, responseStatus(result));
  } catch (error) {
    const status = Number(error?.status);
    if (status === 400 || status === 413) {
      return fail(status === 413 ? 'request_too_large' : 'invalid_json', error.message, status);
    }
    return fail('learning_evidence_unavailable', 'learning evidence unavailable', 503);
  }
}
