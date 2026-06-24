import { Component, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TickerStore } from '../../core/state/ticker.store';
import { PineScriptService } from '../../core/services/pine-script.service';

@Component({
  selector: 'app-export-panel',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './export-panel.html',
  styleUrl: './export-panel.css',
})
export class ExportPanel {
  readonly store = inject(TickerStore);
  private readonly pineScript = inject(PineScriptService);

  readonly isOpen = signal(false);
  readonly copied = signal(false);

  get hasData(): boolean {
    return this.store.hasData();
  }

  get pineCode(): string {
    return this.pineScript.generate();
  }

  get tradingViewUrl(): string {
    return this.pineScript.getTradingViewUrl();
  }

  toggle(): void {
    this.isOpen.update((v) => !v);
  }

  /** Highlighted lines of code for display */
  get highlightedLines(): { text: string; cls: string }[] {
    return this.pineCode.split('\n').map((line) => ({
      text: line,
      cls: getLineClass(line),
    }));
  }

  async copyToClipboard(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.pineCode);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = this.pineCode;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }
  }

  download(): void {
    const ticker = this.store.selectedTicker() ?? 'SPY';
    const filename = `${ticker.replace(/[^a-zA-Z0-9]/g, '_')}.pine`;
    const blob = new Blob([this.pineCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// ─── Syntax Highlighting ──────────────────────────────────────────

function getLineClass(line: string): string {
  const trimmed = line.trimStart();

  if (trimmed.startsWith('//@version')) return 'line-version';
  if (trimmed.startsWith('//') && trimmed.includes('───')) return 'line-section';
  if (trimmed.startsWith('//')) return 'line-comment';
  if (trimmed.startsWith('indicator(')) return 'line-declaration';
  if (trimmed.startsWith('plot(')) return 'line-plot';
  if (trimmed.startsWith('hline(')) return 'line-plot';
  if (trimmed.startsWith('fill(')) return 'line-plot';
  if (trimmed.startsWith('label.')) return 'line-comment';
  if (/^\w+\s*=/.test(trimmed)) return 'line-assignment';

  return '';
}
