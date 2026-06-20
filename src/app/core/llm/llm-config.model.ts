/** LLM provider configuration — supports any OpenAI-compatible API */

export interface LlmProviderConfig {
  /** Display name */
  name: string;
  /** Base URL (e.g. https://api.deepseek.com/v1) */
  baseUrl: string;
  /** API key (stored in localStorage, NEVER hardcoded) */
  apiKey: string;
  /** Model name (e.g. deepseek-chat, gpt-4o, local-model) */
  model: string;
  /** Max tokens for response */
  maxTokens: number;
  /** Temperature (0-2) */
  temperature: number;
}

/** Pre-built provider presets — user can also define custom */
export const LLM_PROVIDER_PRESETS: LlmProviderConfig[] = [
  {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat',
    maxTokens: 2048,
    temperature: 0.3,
  },
  {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o',
    maxTokens: 2048,
    temperature: 0.3,
  },
  {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: '',
    model: 'llama-3.3-70b-versatile',
    maxTokens: 2048,
    temperature: 0.3,
  },
  {
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    apiKey: '',
    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    maxTokens: 2048,
    temperature: 0.3,
  },
  {
    name: 'llama.cpp (local)',
    baseUrl: 'http://localhost:8080/v1',
    apiKey: 'not-needed',
    model: 'local-model',
    maxTokens: 2048,
    temperature: 0.3,
  },
  {
    name: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: 'ollama',
    model: 'llama3.2',
    maxTokens: 2048,
    temperature: 0.3,
  },
  {
    name: 'Custom',
    baseUrl: '',
    apiKey: '',
    model: '',
    maxTokens: 2048,
    temperature: 0.3,
  },
];
