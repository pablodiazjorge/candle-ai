/**
 * OpenAI-compatible LLM provider.
 * Works with Ollama, llama.cpp, DeepSeek, OpenAI, Groq, Together AI, etc.
 *
 * NOTE: reasoning/thinking models (o1, o3, deepseek-r1, qwen3, qwq, etc.)
 * output chain-of-thought that can't be parsed as JSON.
 * Use standard chat/instruct models for structured output.
 */

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCompletionRequest {
  model: string;
  messages: LlmMessage[];
  max_tokens: number;
  temperature: number;
  response_format?: { type: 'json_object' };
}

export interface LlmCompletionResponse {
  id: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class LlmProvider {
  private static readonly DEFAULT_TIMEOUT_MS = 30_000;
  private static readonly MAX_RETRIES = 2;
  private static readonly RETRY_BACKOFF_MS = [1000, 2000];

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly maxTokens: number = 2048,
    private readonly temperature: number = 0.3,
  ) {}

  /** Send a chat completion request with retry + timeout */
  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    const messages: LlmMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    return this.completeWithRetry(messages, true);
  }

  /**
   * Multi-turn conversation — sends full message history.
   * Used by interactive follow-up (Epic 8 Track B).
   * Enforces a max of 10 messages to protect small local models.
   */
  async completeMultiTurn(messages: LlmMessage[]): Promise<string> {
    const clamped = messages.length > 10
      ? [messages[0], ...messages.slice(-9)]
      : messages;
    return this.completeWithRetry(clamped, false);
  }

  /** Core completion logic with retry + timeout */
  private async completeWithRetry(
    messages: LlmMessage[],
    includeResponseFormat: boolean,
  ): Promise<string> {
    const url = `${this.baseUrl}/chat/completions`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= LlmProvider.MAX_RETRIES; attempt++) {
      try {
        return await this.sendRequest(url, messages, includeResponseFormat);
      } catch (err) {
        lastError = err as Error;

        // Don't retry on 4xx errors (client errors: bad request, auth, etc.)
        if (lastError.message.includes('API error 4')) {
          // If it's a 400/404 and we sent response_format, retry once without it
          if (includeResponseFormat && (lastError.message.includes('400') || lastError.message.includes('404'))) {
            includeResponseFormat = false;
            continue;
          }
          throw lastError;
        }

        // Retry on network errors or 5xx
        if (attempt < LlmProvider.MAX_RETRIES) {
          const delay = LlmProvider.RETRY_BACKOFF_MS[attempt] ?? 2000;
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw lastError ?? new Error('LLM request failed');
  }

  /** Send a single request with timeout */
  private async sendRequest(
    url: string,
    messages: LlmMessage[],
    includeResponseFormat: boolean,
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LlmProvider.DEFAULT_TIMEOUT_MS);

    try {
      const body: LlmCompletionRequest = {
        model: this.model,
        messages,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
      };

      if (includeResponseFormat) {
        body.response_format = { type: 'json_object' };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`LLM API error ${response.status}: ${errorText}`);
      }

      const json: LlmCompletionResponse = await response.json();
      let content = json.choices?.[0]?.message?.content;

      // Fallback: reasoning models put output in `reasoning` field
      if (!content) {
        content = (json.choices?.[0]?.message as Record<string, unknown>)?.['reasoning'] as string;
      }

      if (!content) {
        throw new Error('Empty response from LLM');
      }

      return content;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(`LLM request timed out after ${LlmProvider.DEFAULT_TIMEOUT_MS / 1000}s`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Quick health check — calls the models endpoint */
  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }
}
