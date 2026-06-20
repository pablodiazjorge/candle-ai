import { Injectable, signal, computed } from '@angular/core';
import {
  LlmProviderConfig,
  LLM_PROVIDER_PRESETS,
} from '../llm/llm-config.model';

const STORAGE_KEY = 'candle-ai-llm-settings';

@Injectable({ providedIn: 'root' })
export class LlmSettingsStore {
  // --- All available presets ---
  readonly presets = signal<LlmProviderConfig[]>(LLM_PROVIDER_PRESETS);

  // --- Active config ---
  readonly activeConfig = signal<LlmProviderConfig>(this.loadConfig());
  readonly activePresetName = signal<string>(this.loadPresetName());

  // --- Computed ---
  readonly isConfigured = computed(() => {
    const c = this.activeConfig();
    return c.baseUrl.length > 0 && c.model.length > 0;
  });

  readonly hasApiKey = computed(() => {
    return this.activeConfig().apiKey.length > 0;
  });

  // --- Actions ---

  /** Select a preset by name */
  selectPreset(name: string): void {
    const preset = this.presets().find((p) => p.name === name);
    if (!preset) return;

    // Keep existing API key if switching to same preset
    const existing = this.activeConfig();
    const config: LlmProviderConfig = {
      ...preset,
      apiKey: existing.apiKey || preset.apiKey,
    };

    this.activeConfig.set(config);
    this.activePresetName.set(name);
    this.persist(config, name);
  }

  /** Update the active config (for custom settings) */
  updateConfig(partial: Partial<LlmProviderConfig>): void {
    this.activeConfig.update((current) => {
      const updated = { ...current, ...partial };
      this.persist(updated, 'Custom');
      return updated;
    });
    this.activePresetName.set('Custom');
  }

  /** Set API key for the active config */
  setApiKey(key: string): void {
    this.updateConfig({ apiKey: key });
  }

  /** Set base URL */
  setBaseUrl(url: string): void {
    this.updateConfig({ baseUrl: url });
  }

  /** Set model name */
  setModel(model: string): void {
    this.updateConfig({ model });
  }

  // --- Persistence ---

  private loadConfig(): LlmProviderConfig {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    // Default: first preset
    return { ...LLM_PROVIDER_PRESETS[0] };
  }

  private loadPresetName(): string {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY}--name`);
      if (raw) return raw;
    } catch { /* ignore */ }
    return LLM_PROVIDER_PRESETS[0].name;
  }

  private persist(config: LlmProviderConfig, name: string): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    localStorage.setItem(`${STORAGE_KEY}--name`, name);
  }
}
