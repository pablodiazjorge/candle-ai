/**
 * OpenAI-compatible LLM provider.
 * Works with DeepSeek, OpenAI, Groq, Together AI, llama.cpp, Ollama, etc.
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
      response_format: { type: 'json_object' },
    };

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
    const content = json.choices?.[0]?.message?.content;

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
