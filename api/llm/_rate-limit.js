// api/llm/_rate-limit.js - per-IP rate limit for the LLM proxy, backed by the Vercel Firewall.
// A counter in memory does not work in serverless functions: each instance would keep its own.
// The limit itself (20 requests per 60 s per IP, answer 429) lives in a Vercel Firewall rule
// whose condition is "@vercel/firewall" with this rate limit ID. See docs/adr/0001-llm-proxy.md.
import { checkRateLimit } from '@vercel/firewall';

export const RATE_LIMIT_ID = 'llm-proxy';
const CHECK_TIMEOUT_MS = 1000;
// checkRateLimit copies every header it receives to the firewall request as x-rr-*.
// Pass only what it needs (host and client IP), never x-target-api-key or cookies.
const RATE_LIMIT_HEADERS = ['host', 'x-real-ip', 'x-forwarded-for'];

/**
 * True when the caller is over the limit. Fails open: if the check itself fails
 * (rule not configured, timeout, unexpected answer) the request goes on and the
 * failure is logged. The target allowlist, not this limit, is the security boundary.
 */
export async function isRateLimited(req, check = checkRateLimit) {
  const headers = Object.fromEntries(RATE_LIMIT_HEADERS.filter((h) => req.headers[h]).map((h) => [h, req.headers[h]]));
  try {
    const { rateLimited, error } = await check(RATE_LIMIT_ID, { headers, timeout: CHECK_TIMEOUT_MS });
    if (error === 'not-found') console.error(`llm proxy: rate limit rule '${RATE_LIMIT_ID}' is not configured`);
    return rateLimited === true;
  } catch (err) {
    console.error('llm proxy: rate limit check failed', err?.name, err?.message);
    return false;
  }
}
