// api/llm/_target.js - pure, no I/O: the validated forward URL, or null.
// Vercel does not deploy files in api/ whose name starts with "_" as functions.

// Exact provider hosts and the base paths of their OpenAI-compatible APIs.
const ALLOWED_TARGETS = new Map([
  ['api.deepseek.com', new Set(['', '/v1'])],
  ['api.openai.com', new Set(['/v1'])],
  ['api.groq.com', new Set(['/openai/v1'])],
  ['api.together.xyz', new Set(['/v1'])],
  ['openrouter.ai', new Set(['/api/v1'])],
  ['api.mistral.ai', new Set(['/v1'])],
  ['api.anthropic.com', new Set(['/v1'])],
  ['generativelanguage.googleapis.com', new Set(['/v1beta/openai'])],
]);
const ALLOWED_PATHS = new Set(['/models', '/chat/completions']);

export function resolveTarget(rawBase, routeSegments) {
  if (typeof rawBase !== 'string' || /[%\\]/.test(rawBase)) return null; // no encoded tricks
  let base;
  try { base = new URL(rawBase); } catch { return null; }
  if (base.protocol !== 'https:') return null;          // no http, no file:, no data:
  if (base.username || base.password) return null;      // blocks https://api.openai.com@evil.com
  if (base.port !== '') return null;                    // default 443 only
  if (base.search || base.hash) return null;
  const basePaths = ALLOWED_TARGETS.get(base.hostname); // EXACT host (URL lowercases it and applies punycode)
  if (!basePaths) return null;
  const basePath = base.pathname.replace(/\/+$/, '');
  if (!basePaths.has(basePath)) return null;            // the provider's API root, nothing else

  // Vercel may deliver the catch-all as an array or as one 'a/b' string: normalise both.
  const segments = (Array.isArray(routeSegments) ? routeSegments : String(routeSegments ?? '').split('/')).filter(Boolean);
  if (segments.some((s) => s === '.' || s === '..' || /[\\/?#%]/.test(s))) return null;
  const apiPath = '/' + segments.join('/');
  if (!ALLOWED_PATHS.has(apiPath)) return null;

  const forward = new URL(basePath + apiPath, base.origin);
  return forward.origin === base.origin ? forward : null; // belt and braces
}
