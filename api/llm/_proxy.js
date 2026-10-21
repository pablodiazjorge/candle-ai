/**
 * LLM API proxy - shared logic for the endpoint functions.
 *
 * Served by one Vercel Node.js Function per allowed endpoint, each with a fixed route:
 *   api/llm/models.js            -> /api/llm/models            (['models'])
 *   api/llm/chat/completions.js  -> /api/llm/chat/completions  (['chat', 'completions'])
 * There is no catch-all: outside Next.js, Vercel does not support [...param] files in api/.
 * This file starts with "_", so Vercel does not deploy it as a function.
 *
 * Most cloud LLM APIs do not send CORS headers, so in production the
 * browser calls these same-origin functions instead. The frontend sends:
 *   X-Target-Base-URL: https://api.deepseek.com/v1
 *   X-Target-API-Key:  <the user's key>
 *
 * The proxy validates the target against an exact allowlist of provider
 * hosts, base paths and endpoints (_target.js), forwards only content-type,
 * accept and the key as a Bearer token, never follows redirects, caps the
 * body at 256 KB and returns generic errors. The key is never logged.
 * The per-IP rate limit is not in this code: a Vercel Firewall rule for every
 * path under /api/llm/ answers 429 at the edge, before the request reaches
 * the function.
 * See docs/adr/0001-llm-proxy.md.
 */
import { resolveTarget } from './_target.js';

const MAX_BODY = 256 * 1024;
const FORWARDED = ['content-type', 'accept'];

/**
 * Proxy one request to the provider endpoint named by `segments`
 * (for example ['chat', 'completions']). The route comes from the endpoint
 * file, never from the request.
 */
export async function proxy(req, res, segments) {
  if (req.method !== 'POST' && req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  const target = resolveTarget(req.headers['x-target-base-url'], segments);
  if (!target) return json(res, 403, { error: 'Target not allowed' }); // no echo of the input

  const headers = Object.fromEntries(FORWARDED.filter((h) => req.headers[h]).map((h) => [h, req.headers[h]]));
  const key = req.headers['x-target-api-key'];
  if (key) headers.authorization = `Bearer ${key}`;

  let body;
  if (req.method === 'POST') {
    try {
      body = await readBody(req, MAX_BODY);
    } catch (err) {
      if (err?.code === 'BODY_TOO_LARGE') return json(res, 413, { error: 'Request body too large' });
      console.error('llm proxy: could not read the request body', err?.name);
      return json(res, 400, { error: 'Bad request' });
    }
  }

  try {
    const upstream = await fetch(target, { method: req.method, headers, body, redirect: 'error' });
    const text = await upstream.text();
    res.writeHead(upstream.status, {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    });
    res.end(text);
  } catch (err) {
    // Logged for the owner, never returned to the client. Only the host and the
    // error, never the headers: they carry the user's key.
    console.error('llm proxy: upstream request failed', target.host, err);
    json(res, 502, { error: 'Upstream request failed' });
  }
}

function json(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...extraHeaders });
  res.end(JSON.stringify(payload));
}

/** Read the request body as a string, stopping at `limit` bytes. */
function readBody(req, limit) {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) return Promise.reject(tooLarge());
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk) => {
      if (done) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buf.length;
      if (size > limit) {
        done = true;
        req.pause();
        reject(tooLarge());
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks).toString('utf8')); } });
    req.on('error', (err) => { if (!done) { done = true; reject(err); } });
  });
}

function tooLarge() {
  return Object.assign(new Error('Request body too large'), { code: 'BODY_TOO_LARGE' });
}
