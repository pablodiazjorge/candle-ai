/**
 * Vercel Edge Function — LLM API Proxy (catch-all route)
 *
 * Matches: /api/llm/models, /api/llm/chat/completions, etc.
 *
 * Solves CORS for browser→LLM direct calls in production.
 * Frontend sends requests with headers:
 *   X-Target-Base-URL: https://api.deepseek.com/v1
 *   X-Target-API-Key:  sk-...
 *
 * The function strips these headers and forwards the request
 * to the real LLM API, then returns the response with CORS headers.
 *
 * SECURITY: Target URL is validated against a whitelist.
 */

// Whitelist of allowed LLM API base URLs
const ALLOWED_TARGETS = [
  'http://localhost:11434',
  'http://localhost:8080',
  'http://127.0.0.1:11434',
  'http://127.0.0.1:8080',
  'https://api.deepseek.com',
  'https://api.openai.com',
  'https://api.groq.com',
  'https://api.together.xyz',
  'https://openrouter.ai',
  'https://api.mistral.ai',
  'https://api.anthropic.com',
  'https://generativelanguage.googleapis.com',
];

function isAllowedTarget(baseUrl) {
  if (!baseUrl) return false;
  const normalized = baseUrl.replace(/\/+$/, '');
  return ALLOWED_TARGETS.some((allowed) => normalized.startsWith(allowed));
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };
}

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    res.writeHead(405, { ...corsHeaders(), 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const targetBaseUrl = req.headers['x-target-base-url'];
  const targetApiKey = req.headers['x-target-api-key'];

  if (!targetBaseUrl) {
    res.writeHead(400, { ...corsHeaders(), 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing X-Target-Base-URL header' }));
    return;
  }

  if (!isAllowedTarget(targetBaseUrl)) {
    res.writeHead(403, { ...corsHeaders(), 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Target URL not allowed: ${targetBaseUrl}` }));
    return;
  }

  // Reconstruct the API path from catch-all route segments
  // [...route] → req.query.route is an array of path segments
  const routeSegments = req.query.route || [];
  const apiPath = '/' + routeSegments.join('/');
  const baseUrl = targetBaseUrl.replace(/\/+$/, '');
  const forwardUrl = `${baseUrl}${apiPath}`;

  try {
    // Build forwarded headers — strip custom/internal headers
    const forwardHeaders = {};
    for (const [key, value] of Object.entries(req.headers)) {
      const lower = key.toLowerCase();
      if (
        lower === 'x-target-base-url' ||
        lower === 'x-target-api-key' ||
        lower === 'host' ||
        lower === 'origin' ||
        lower === 'referer'
      ) {
        continue;
      }
      forwardHeaders[key] = value;
    }

    if (targetApiKey) {
      forwardHeaders['Authorization'] = `Bearer ${targetApiKey}`;
    }

    // Read the request body for POST requests
    let body = undefined;
    if (req.method === 'POST') {
      body = await readBody(req);
    }

    const upstreamRes = await fetch(forwardUrl, {
      method: req.method,
      headers: forwardHeaders,
      body,
    });

    // Build response headers with CORS
    const responseHeaders = {
      ...corsHeaders(),
    };
    const contentType = upstreamRes.headers.get('Content-Type');
    if (contentType) {
      responseHeaders['Content-Type'] = contentType;
    }

    const responseBody = await upstreamRes.text();

    res.writeHead(upstreamRes.status, responseHeaders);
    res.end(responseBody);
  } catch (err) {
    res.writeHead(502, { ...corsHeaders(), 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Proxy error: ${err.message}` }));
  }
}

/** Read the full request body as a string */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
