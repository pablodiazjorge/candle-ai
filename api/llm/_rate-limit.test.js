// @vitest-environment node
// Tests for the per-IP rate limit wrapper, with an injected check: no network.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RATE_LIMIT_ID, isRateLimited } from './_rate-limit.js';

const req = {
  headers: {
    host: 'candle-ai.pablodiazjorge.com',
    'x-real-ip': '203.0.113.7',
    'x-forwarded-for': '203.0.113.7',
    'x-target-base-url': 'https://api.openai.com/v1',
    'x-target-api-key': 'test-key-not-a-real-secret',
    cookie: 'session=abc',
  },
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('isRateLimited', () => {
  it('asks the firewall with the llm-proxy ID, a timeout and only the host and client IP headers', async () => {
    const check = vi.fn(async () => ({ rateLimited: false }));
    await isRateLimited(req, check);
    expect(check).toHaveBeenCalledWith(RATE_LIMIT_ID, {
      headers: { host: 'candle-ai.pablodiazjorge.com', 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '203.0.113.7' },
      timeout: 1000,
    });
    expect(RATE_LIMIT_ID).toBe('llm-proxy');
  });

  it('is true when the firewall says the caller is over the limit or blocked', async () => {
    expect(await isRateLimited(req, async () => ({ rateLimited: true }))).toBe(true);
    expect(await isRateLimited(req, async () => ({ rateLimited: true, error: 'blocked' }))).toBe(true);
  });

  it('is false under the limit', async () => {
    expect(await isRateLimited(req, async () => ({ rateLimited: false }))).toBe(false);
  });

  it('fails open and logs when the rule is not configured', async () => {
    expect(await isRateLimited(req, async () => ({ rateLimited: false, error: 'not-found' }))).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  it('fails open and logs when the check throws or times out', async () => {
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    expect(await isRateLimited(req, async () => { throw timeout; })).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  it('makes no network call outside production with the real @vercel/firewall check', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await isRateLimited(req)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
