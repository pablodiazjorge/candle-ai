// @vitest-environment node
// Tests for the LLM proxy (_proxy.js) and its two endpoint functions, with a simulated
// req/res and a mocked fetch: no network.
import { readdirSync } from 'node:fs';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './_proxy.js';
import completions from './chat/completions.js';
import models from './models.js';

const ENDPOINTS = [
  ['models', models],
  ['chat/completions', completions],
];

// No req.query by default: the route comes from the endpoint file, as in production.
function makeReq({ method = 'POST', headers = {}, query, body } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.isBuffer(body) ? body : Buffer.from(body)]);
  req.method = method;
  req.headers = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  if (query !== undefined) req.query = query;
  return req;
}

function makeRes() {
  const res = { status: 0, headers: {}, body: '' };
  res.writeHead = (status, headers = {}) => { res.status = status; res.headers = headers; return res; };
  res.end = (chunk = '') => { res.body += String(chunk); };
  return res;
}

/** Call an endpoint handler (default: chat/completions). */
async function call(reqOptions, handler = completions) {
  const res = makeRes();
  await handler(makeReq(reqOptions), res);
  return res;
}

const KEY = 'test-key-not-a-real-secret';
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('LLM proxy endpoints', () => {
  it('deploys one function per allowed endpoint and no dynamic [param] files', () => {
    // Outside Next.js, Vercel does not support [...param] files: the old catch-all left
    // /api/llm/chat/completions answering 404. Files starting with "_" are not deployed.
    const dir = fileURLToPath(new URL('.', import.meta.url));
    const files = readdirSync(dir, { recursive: true })
      .map((f) => String(f).replaceAll('\\', '/'))
      .filter((f) => f.endsWith('.js') && !f.split('/').some((part) => part.startsWith('_')));
    expect(files.sort()).toEqual(['chat/completions.js', 'models.js']);
  });

  it.each(ENDPOINTS)('%s forwards to the same path on the provider', async (path, handler) => {
    const res = await call({ method: 'GET', headers: { 'X-Target-Base-URL': 'https://api.deepseek.com/v1' } }, handler);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`https://api.deepseek.com/v1/${path}`);
  });

  it.each(ENDPOINTS.flatMap(([path, handler]) => [
    [path, 'https://api.openai.com.evil.com', handler],
    [path, 'https://api.openai.com@evil.com', handler],
  ]))('%s answers 403 to the Anexo C.7 trick %s without calling upstream or echoing it', async (_path, base, handler) => {
    const res = await call({ headers: { 'X-Target-Base-URL': base }, body: '{}' }, handler);
    expect(res.status).toBe(403);
    expect(res.body).not.toContain('evil');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['no query at all', undefined],
    ['an empty query, as Vercel delivered it to the old catch-all', {}],
    ['a query that names /models', { route: ['models'] }],
    ['a query that names /chat/completions', { route: 'chat/completions' }],
    ['a query that names a route outside the allowlist', { route: 'files' }],
  ])('ignores req.query: %s', async (_label, query) => {
    const headers = { 'X-Target-Base-URL': 'https://api.openai.com/v1' };
    expect((await call({ headers, query, body: '{}' }, completions)).status).toBe(200);
    expect((await call({ method: 'GET', headers, query }, models)).status).toBe(200);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.openai.com/v1/chat/completions',
      'https://api.openai.com/v1/models',
    ]);
  });
});

describe('LLM proxy handler', () => {
  it('answers 403 when the target header is missing or points to localhost', async () => {
    expect((await call({ body: '{}' })).status).toBe(403);
    expect((await call({ headers: { 'X-Target-Base-URL': 'http://localhost:11434/v1' }, body: '{}' })).status).toBe(403);
    expect((await call({ headers: { 'X-Target-Base-URL': 'http://127.0.0.1:8080/v1' }, body: '{}' })).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 403 to endpoints outside the allowlist', async () => {
    const res = makeRes();
    await proxy(makeReq({ headers: { 'X-Target-Base-URL': 'https://api.openai.com/v1' } }), res, ['files']);
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 405 to other methods, including the CORS preflight, without CORS headers', async () => {
    for (const [, handler] of ENDPOINTS) {
      for (const method of ['OPTIONS', 'PUT', 'DELETE']) {
        const res = await call({ method, headers: { 'X-Target-Base-URL': 'https://api.openai.com/v1' } }, handler);
        expect(res.status).toBe(405);
        expect(Object.keys(res.headers).map((h) => h.toLowerCase())).not.toContain('access-control-allow-origin');
      }
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards a legitimate completion with only the allowed headers and no redirects', async () => {
    const res = await call({
      headers: {
        'X-Target-Base-URL': 'https://api.deepseek.com/v1',
        'X-Target-API-Key': KEY,
        'Content-Type': 'application/json',
        Accept: '*/*',
        Cookie: 'session=abc',
        Origin: 'https://candle-ai.pablodiazjorge.com',
        'X-Forwarded-For': '203.0.113.7',
        Host: 'candle-ai.pablodiazjorge.com',
      },
      body: '{"model":"deepseek-chat","messages":[]}',
    });

    expect(res.status).toBe(200);
    expect(res.body).toBe('{"ok":true}');
    expect(res.headers['content-type']).toBe('application/json');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Object.keys(res.headers).map((h) => h.toLowerCase())).not.toContain('access-control-allow-origin');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');
    expect(init.body).toBe('{"model":"deepseek-chat","messages":[]}');
    expect(init.headers).toEqual({ 'content-type': 'application/json', accept: '*/*', authorization: `Bearer ${KEY}` });
  });

  it('forwards the health check as a GET to /models without a body', async () => {
    const res = await call({
      method: 'GET',
      headers: { 'X-Target-Base-URL': 'https://api.groq.com/openai/v1', 'X-Target-API-Key': KEY },
    }, models);
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.groq.com/openai/v1/models');
    expect(init.method).toBe('GET');
    expect(init.redirect).toBe('error');
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({ authorization: `Bearer ${KEY}` });
  });

  it('passes the upstream status through', async () => {
    fetchMock.mockImplementation(async () => new Response('{"error":"bad key"}', { status: 401, headers: { 'content-type': 'application/json' } }));
    const res = await call({ headers: { 'X-Target-Base-URL': 'https://api.openai.com/v1', 'X-Target-API-Key': KEY }, body: '{}' });
    expect(res.status).toBe(401);
  });

  it('answers 413 to a body over 256 KB, streamed or declared, without calling upstream', async () => {
    const big = Buffer.alloc(256 * 1024 + 1, 'a');
    const headers = { 'X-Target-Base-URL': 'https://api.openai.com/v1' };
    expect((await call({ headers, body: big })).status).toBe(413);
    expect((await call({ headers: { ...headers, 'Content-Length': String(big.length) }, body: '{}' })).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a body of exactly 256 KB', async () => {
    const res = await call({ headers: { 'X-Target-Base-URL': 'https://api.openai.com/v1' }, body: Buffer.alloc(256 * 1024, 'a') });
    expect(res.status).toBe(200);
  });

  it('answers a generic 502 when upstream fails or redirects, logs it, and never returns the error or the key', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed: redirect to http://169.254.169.254/'));
    const res = await call({ headers: { 'X-Target-Base-URL': 'https://api.openai.com/v1', 'X-Target-API-Key': KEY }, body: '{}' });
    expect(res.status).toBe(502);
    expect(JSON.parse(res.body)).toEqual({ error: 'Upstream request failed' });
    expect(res.body).not.toContain('169.254');
    expect(console.error).toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(KEY);
  });
});
