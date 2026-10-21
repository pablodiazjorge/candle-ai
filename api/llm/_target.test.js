// @vitest-environment node
// Attack tests for the LLM proxy target validation, including the tricks the old startsWith check let through.
import { describe, it, expect } from 'vitest';
import { resolveTarget } from './_target.js';

describe('resolveTarget', () => {
  it.each([
    'https://api.openai.com.evil.com/v1',      // suffix trick that startsWith accepted
    'https://api.openai.com@evil.com/v1',      // userinfo trick that startsWith accepted
    'https://user:pass@api.openai.com/v1',     // any userinfo
    'https://evil.com/?u=https://api.openai.com',
    'http://api.openai.com/v1',                // plain http
    'https://api.openai.com:8443/v1',          // explicit non-default port
    'https://api.openai.com:80/v1',
    'http://localhost:11434', 'http://localhost:11434/v1', 'http://localhost:8080/v1',
    'http://127.0.0.1:8080', 'http://127.0.0.1:11434/v1', 'https://127.0.0.1/v1', 'http://[::1]/',
    'https://0x7f000001/v1',                   // 127.0.0.1 in hex
    'file:///etc/passwd', 'data:text/plain,hi', 'ftp://api.openai.com/v1',
    'https://api.openai.com/v1?x=1', 'https://api.openai.com/v1#frag',
    'not a url', '', undefined, null, 42, ['https://api.openai.com/v1'],
  ])('rejects %s', (raw) => expect(resolveTarget(raw, ['chat', 'completions'])).toBeNull());

  it('accepts the exact host and keeps the base path', () => {
    expect(resolveTarget('https://api.openai.com/v1/', ['chat', 'completions'])?.href)
      .toBe('https://api.openai.com/v1/chat/completions');
  });

  it.each([
    ['https://api.deepseek.com/v1', 'https://api.deepseek.com/v1/chat/completions'],
    ['https://api.deepseek.com', 'https://api.deepseek.com/chat/completions'],
    ['https://api.openai.com/v1', 'https://api.openai.com/v1/chat/completions'],
    ['https://api.groq.com/openai/v1', 'https://api.groq.com/openai/v1/chat/completions'],
    ['https://api.together.xyz/v1', 'https://api.together.xyz/v1/chat/completions'],
    ['https://openrouter.ai/api/v1', 'https://openrouter.ai/api/v1/chat/completions'],
    ['https://api.mistral.ai/v1', 'https://api.mistral.ai/v1/chat/completions'],
    ['https://api.anthropic.com/v1', 'https://api.anthropic.com/v1/chat/completions'],
    ['https://generativelanguage.googleapis.com/v1beta/openai/', 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'],
  ])('accepts the provider base %s', (raw, expected) => {
    expect(resolveTarget(raw, ['chat', 'completions'])?.href).toBe(expected);
  });

  it('accepts /models for the health check', () => {
    expect(resolveTarget('https://api.groq.com/openai/v1', ['models'])?.href)
      .toBe('https://api.groq.com/openai/v1/models');
  });

  it('normalises case and the default port, and accepts the route as a string', () => {
    expect(resolveTarget('https://API.OPENAI.COM:443/v1', 'chat/completions')?.href)
      .toBe('https://api.openai.com/v1/chat/completions');
    expect(resolveTarget('HTTPS://Api.OpenAI.com/v1', ['models'])?.href)
      .toBe('https://api.openai.com/v1/models');
  });

  it.each([
    'http://localhost:11434.evil.com',
    'https://api.openai.com./v1',              // trailing dot
    'https://1.1.1.1/v1',                      // bare IP
    'https://openai.com/v1',                   // parent domain
    'https://evil.api.openai.com/v1',          // subdomain
    'https://аpi.openai.com/v1',          // Cyrillic "a": URL turns it into punycode (xn--pi-6kc...)
    'https://xn--pi-6kc.openai.com/v1',        // the same host already in punycode
    'https://api.openai.com%2eevil.com/v1',    // encoded dot in the host
    'https:\\\\evil.com',                       // backslashes
    'https://api.openai.com\\evil.com',
  ])('rejects look-alike hosts and IPs: %s', (raw) => expect(resolveTarget(raw, ['models'])).toBeNull());

  it.each([
    'https://api.openai.com',                  // OpenAI needs /v1
    'https://api.openai.com/x',
    'https://api.openai.com/v1/admin',
    'https://api.openai.com/v1/..',
    'https://api.openai.com/v1/../v2',
    'https://api.openai.com/v1/%2e%2e/admin',  // URL would normalise this to /admin
    'https://api.openai.com/v1%2F..',
    'https://api.groq.com/v1',                 // Groq lives under /openai/v1
    'https://openrouter.ai/v1',
  ])('rejects base paths outside the provider API root: %s', (raw) => {
    expect(resolveTarget(raw, ['chat', 'completions'])).toBeNull();
  });

  it('rejects traversal, encoded traversal and endpoints outside the allowlist', () => {
    const base = 'https://api.openai.com/v1';
    expect(resolveTarget(base, ['..', 'admin'])).toBeNull();
    expect(resolveTarget(base, ['.', 'models'])).toBeNull();
    expect(resolveTarget(base, ['%2e%2e', 'models'])).toBeNull();
    expect(resolveTarget(base, ['%2E%2E', 'chat', 'completions'])).toBeNull();
    expect(resolveTarget(base, '../../admin')).toBeNull();
    expect(resolveTarget(base, ['chat%2Fcompletions'])).toBeNull();
    expect(resolveTarget(base, ['chat\\completions'])).toBeNull();
    expect(resolveTarget(base, ['models?x=1'])).toBeNull();
    expect(resolveTarget(base, ['files'])).toBeNull();
    expect(resolveTarget(base, ['chat', 'completions', 'extra'])).toBeNull();
    expect(resolveTarget(base, ['embeddings'])).toBeNull();
    expect(resolveTarget(base, [])).toBeNull();
    expect(resolveTarget(base, undefined)).toBeNull();
  });
});
