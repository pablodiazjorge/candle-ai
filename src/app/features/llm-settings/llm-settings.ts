import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LlmSettingsStore } from '../../core/state/llm-settings.store';
import { LlmProvider } from '../../core/llm/llm-provider';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-llm-settings',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './llm-settings.html',
  styleUrl: './llm-settings.css',
})
export class LlmSettings {
  readonly store = inject(LlmSettingsStore);

  isOpen = signal(false);
  showApiKey = signal(false);
  testingConnection = signal(false);
  connectionStatus = signal<'idle' | 'success' | 'error'>('idle');

  toggle(): void {
    this.isOpen.update((v) => !v);
  }

  close(): void {
    this.isOpen.set(false);
  }

  /** Handle Escape key to close modal */
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }

  onPresetChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.store.selectPreset(select.value);
    this.connectionStatus.set('idle');
  }

  async testConnection(): Promise<void> {
    const config = this.store.activeConfig();
    if (!config.baseUrl || !config.model) return;

    this.testingConnection.set(true);
    this.connectionStatus.set('idle');

    try {
      const provider = new LlmProvider(
        config.baseUrl,
        config.apiKey,
        config.model,
      );
      const ok = await provider.healthCheck();
      this.connectionStatus.set(ok ? 'success' : 'error');
    } catch {
      this.connectionStatus.set('error');
    } finally {
      this.testingConnection.set(false);
    }
  }
}
