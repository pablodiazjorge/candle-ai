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
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly maxTokens: number = 2048,
    private readonly temperature: number = 0.3,
  ) {}

  /** Send a chat completion request */
  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    const url = `${this.baseUrl}/chat/completions`;

    const body: LlmCompletionRequest = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: this.maxTokens,
      temperature: this.temperature,
    };

    // Only send response_format for providers that support it (OpenAI, DeepSeek)
    if (!this.baseUrl.includes('localhost') && !this.baseUrl.includes('127.0.0.1') && !this.baseUrl.includes('ollama')) {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error ${response.status}: ${errorText}`);
    }

    const json: LlmCompletionResponse = await response.json();
    let content = json.choices?.[0]?.message?.content;

    // Fallback: reasoning models (qwen3, deepseek-r1, etc.) put output in `reasoning`
    if (!content) {
      content = (json.choices?.[0]?.message as Record<string, unknown>)?.['reasoning'] as string;
    }

    if (!content) {
      throw new Error('Empty response from LLM');
    }

    return content;
  }

  /**
   * Multi-turn conversation — sends full message history.
   * Used by interactive follow-up (Epic 8 Track B).
   * Enforces a max of 10 messages to protect small local models.
   */
  async completeMultiTurn(messages: LlmMessage[]): Promise<string> {
    const url = `${this.baseUrl}/chat/completions`;

    // Enforce max messages to avoid token-limit errors with small models
    const clamped = messages.length > 10
      ? [messages[0], ...messages.slice(-9)]
      : messages;

    const body: LlmCompletionRequest = {
      model: this.model,
      messages: clamped,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
    };
    // NOTE: no response_format — follow-up is conversational, not JSON
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error ${response.status}: ${errorText}`);
    }

    const json: LlmCompletionResponse = await response.json();
    let content = json.choices?.[0]?.message?.content;

    if (!content) {
      content = (json.choices?.[0]?.message as Record<string, unknown>)?.['reasoning'] as string;
    }

    if (!content) {
      throw new Error('Empty response from LLM');
    }

    return content;
  }

  /** Quick health check — calls the models endpoint */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
