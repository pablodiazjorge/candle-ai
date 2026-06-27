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
  /**
   * If true, this provider only works on localhost (e.g. Ollama, llama.cpp).
   * The UI shows a warning when using a local-only provider in production.
   */
  isLocalOnly?: boolean;
}

/**
 * Pre-built provider presets.
 *
 * IMPORTANT: Use instruct/chat models, NOT reasoning models.
 * Reasoning models (deepseek-reasoner, o1, o3, qwen3, qwq, deepseek-r1)
 * output chain-of-thought that can't be parsed as JSON.
 *
 * Recommended local setup: install Ollama → `ollama pull llama3.1:8b`
 */
export const LLM_PROVIDER_PRESETS: LlmProviderConfig[] = [
  // ── Local (free, private, runs on your hardware) ──
  {
    name: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: 'ollama',
    model: 'llama3.1:8b',
    maxTokens: 2048,
    temperature: 0.3,
    isLocalOnly: true,
  },
  {
    name: 'llama.cpp (local)',
    baseUrl: 'http://localhost:8080/v1',
    apiKey: 'not-needed',
    model: 'local-model',
    maxTokens: 2048,
    temperature: 0.3,
    isLocalOnly: true,
  },
  // ── Cloud APIs (use chat models, NOT reasoner/reasoning variants) ──
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
    name: 'Custom',
    baseUrl: '',
    apiKey: '',
    model: '',
    maxTokens: 2048,
    temperature: 0.3,
  },
];

/**
 * Check if the current origin is a production deployment (not localhost).
 * Used to decide defaults and show warnings.
 */
export function isProductionOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return hostname !== 'localhost' && hostname !== '127.0.0.1' && !hostname.startsWith('192.168.');
}
