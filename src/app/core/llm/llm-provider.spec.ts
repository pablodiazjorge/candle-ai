/**
 * Unit tests for LlmProvider — OpenAI-compatible LLM client.
 * Covers: complete(), completeMultiTurn(), healthCheck(),
 * reasoning-model fallback, response_format detection,
 * error handling, and multi-turn message clamping.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LlmProvider, LlmMessage } from './llm-provider';

// ─── Test Helpers ──────────────────────────────────────────────────

function mockFetch(response: unknown, status = 200): vi.Mock {
  const mock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
  });
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

function mockFetchError(status: number, body: string): vi.Mock {
  const mock = vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: () => Promise.resolve(body),
  });
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('LlmProvider', () => {
  let provider: LlmProvider;

  beforeEach(() => {
    vi.restoreAllMocks();
    provider = new LlmProvider('https://api.openai.com/v1', 'sk-test', 'gpt-4o', 2048, 0.3);
  });

  // ── complete() ───────────────────────────────────────────────────

  describe('complete()', () => {
    it('should send a chat completion request and return content', async () => {
      const fetchMock = mockFetch({
        id: 'chatcmpl-123',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      const result = await provider.complete('You are helpful.', 'Say hello.');

      expect(result).toBe('Hello!');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      const body = JSON.parse(opts.body as string);
      expect(body.model).toBe('gpt-4o');
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
      expect(body.messages[1]).toEqual({ role: 'user', content: 'Say hello.' });
      expect(body.max_tokens).toBe(2048);
      expect(body.temperature).toBe(0.3);
    });

    it('should include response_format json_object for complete() calls', async () => {
      const fetchMock = mockFetch({
        choices: [{ index: 0, message: { role: 'assistant', content: '{}' }, finish_reason: 'stop' }],
      });

      await provider.complete('sys', 'user');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.response_format).toEqual({ type: 'json_object' });
    });

    it('should send response_format by default (capability detection via retry)', async () => {
      const localProvider = new LlmProvider('http://localhost:11434/v1', 'ollama', 'llama3.1');
      const fetchMock = mockFetch({
        choices: [{ index: 0, message: { role: 'assistant', content: 'Hi!' }, finish_reason: 'stop' }],
      });

      await localProvider.complete('sys', 'user');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      // Now always sends response_format first; retries without on 400
      expect(body.response_format).toEqual({ type: 'json_object' });
    });

    it('should retry without response_format on 400 errors', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ ok: false, status: 400, text: () => Promise.resolve('Bad request') });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            choices: [{ index: 0, message: { role: 'assistant', content: 'Retry success!' }, finish_reason: 'stop' }],
          }),
        });
      }) as unknown as typeof fetch;

      const result = await provider.complete('sys', 'user');

      expect(result).toBe('Retry success!');
      expect(callCount).toBe(2);
    });

    it('should fallback to reasoning field when content is empty', async () => {
      mockFetch({
        id: 'chatcmpl-456',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: '', reasoning: 'Let me think... The answer is bullish.' },
          finish_reason: 'stop',
        }],
      });

      const result = await provider.complete('sys', 'user');

      expect(result).toBe('Let me think... The answer is bullish.');
    });

    it('should throw on HTTP error', async () => {
      mockFetchError(500, 'Internal Server Error');

      await expect(provider.complete('sys', 'user')).rejects.toThrow('LLM API error 500');
    });

    it('should throw on empty response', async () => {
      mockFetch({
        choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'stop' }],
      });

      await expect(provider.complete('sys', 'user')).rejects.toThrow('Empty response from LLM');
    });

    it('should throw on network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      await expect(provider.complete('sys', 'user')).rejects.toThrow('Network error');
    });

    it('should retry on 5xx errors', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve({ ok: false, status: 503, text: () => Promise.resolve('Service Unavailable') });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            choices: [{ index: 0, message: { role: 'assistant', content: 'Finally!' }, finish_reason: 'stop' }],
          }),
        });
      }) as unknown as typeof fetch;

      const result = await provider.complete('sys', 'user');

      expect(result).toBe('Finally!');
      expect(callCount).toBe(3); // 2 failures + 1 success
    });
  });

  // ── completeMultiTurn() ──────────────────────────────────────────

  describe('completeMultiTurn()', () => {
    it('should send full message history to LLM', async () => {
      const fetchMock = mockFetch({
        choices: [{ index: 0, message: { role: 'assistant', content: 'Follow-up answer.' }, finish_reason: 'stop' }],
      });

      const messages: LlmMessage[] = [
        { role: 'system', content: 'You are an analyst.' },
        { role: 'user', content: 'First question?' },
        { role: 'assistant', content: 'First answer.' },
        { role: 'user', content: 'Second question?' },
      ];

      const result = await provider.completeMultiTurn(messages);

      expect(result).toBe('Follow-up answer.');
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.messages).toHaveLength(4);
      expect(body.response_format).toBeUndefined(); // conversational, not JSON
    });

    it('should clamp messages to max 10', async () => {
      const fetchMock = mockFetch({
        choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
      });

      const messages: LlmMessage[] = [
        { role: 'system', content: 'System' },
        ...Array.from({ length: 15 }, (_, i) => ({
          role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
          content: `Message ${i}`,
        })),
      ];

      await provider.completeMultiTurn(messages);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.messages).toHaveLength(10); // system + 9 most recent
      expect(body.messages[0]).toEqual({ role: 'system', content: 'System' });
    });

    it('should not clamp when messages <= 10', async () => {
      const fetchMock = mockFetch({
        choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
      });

      const messages: LlmMessage[] = [
        { role: 'system', content: 'S' },
        { role: 'user', content: 'Q1' },
        { role: 'assistant', content: 'A1' },
      ];

      await provider.completeMultiTurn(messages);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.messages).toHaveLength(3);
    });
  });

  // ── healthCheck() ────────────────────────────────────────────────

  describe('healthCheck()', () => {
    it('should return true when /models returns 200', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as Response);

      const result = await provider.healthCheck();

      expect(result).toBe(true);
    });

    it('should return false when /models returns error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response);

      const result = await provider.healthCheck();

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Offline'));

      const result = await provider.healthCheck();

      expect(result).toBe(false);
    });
  });

  // ── Constructor defaults ─────────────────────────────────────────

  describe('construction', () => {
    it('should use default maxTokens and temperature when not provided', async () => {
      const defaultProvider = new LlmProvider('http://localhost:11434/v1', 'key', 'model');
      const fetchMock = mockFetch({
        choices: [{ index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }],
      });

      await defaultProvider.complete('s', 'u');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.max_tokens).toBe(2048);
      expect(body.temperature).toBe(0.3);
    });

    it('should use custom maxTokens and temperature', async () => {
      const customProvider = new LlmProvider('http://localhost:11434/v1', 'key', 'model', 512, 0.8);
      const fetchMock = mockFetch({
        choices: [{ index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }],
      });

      await customProvider.complete('s', 'u');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.max_tokens).toBe(512);
      expect(body.temperature).toBe(0.8);
    });
  });
});
