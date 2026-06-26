import { Component, inject, signal, computed } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { TickerStore } from '../../core/state/ticker.store';
import { LlmSettingsStore } from '../../core/state/llm-settings.store';
import { AnalysisService } from '../../core/services/analysis.service';
import { AnalysisResult, ConfluenceResult } from '../../core/models/analysis.model';

@Component({
  selector: 'app-analysis-dashboard',
  standalone: true,
  imports: [TranslatePipe, CurrencyPipe, DatePipe, DecimalPipe],
  templateUrl: './analysis-dashboard.html',
  styleUrl: './analysis-dashboard.css',
})
export class AnalysisDashboard {
  readonly store = inject(TickerStore);
  readonly settingsStore = inject(LlmSettingsStore);
  private readonly analysisService = inject(AnalysisService);

  readonly isOpen = signal(true);
  readonly error = signal<string | null>(null);
  readonly showContributingSignals = signal(false);

  get confluence(): ConfluenceResult | null {
    return this.store.confluence();
  }

  get analysis(): AnalysisResult | null {
    return this.store.analysis();
  }

  get isAnalyzing(): boolean {
    return this.analysisService.analyzing();
  }

  get isConfigured(): boolean {
    return this.settingsStore.isConfigured() && this.settingsStore.hasApiKey();
  }

  readonly hasAnyResult = computed(() =>
    this.confluence !== null || this.analysis !== null,
  );

  async runAnalysis(): Promise<void> {
    this.error.set(null);
    const result = await this.analysisService.runAnalysis();
    if (result) {
      this.store.setAnalysis(result);
    } else {
      this.error.set(this.analysisService.error());
    }
  }

  toggle(): void {
    this.isOpen.update((v) => !v);
  }

  toggleSignals(): void {
    this.showContributingSignals.update((v) => !v);
  }

  tierClass(tier: string): string {
    if (tier === 'HIGH') return 'tier-high';
    if (tier === 'MEDIUM') return 'tier-medium';
    if (tier === 'LOW') return 'tier-low';
    return 'tier-neutral';
  }

  directionClass(dir: string): string {
    if (dir === 'bullish') return 'positive';
    if (dir === 'bearish') return 'negative';
    return 'neutral';
  }

  sentimentClass(sentiment: string): string {
    if (sentiment === 'bullish' || sentiment === 'buy') return 'positive';
    if (sentiment === 'bearish' || sentiment === 'sell') return 'negative';
    return 'neutral';
  }

  riskClass(level: string): string {
    if (level === 'low') return 'positive';
    if (level === 'high') return 'negative';
    return 'neutral';
  }

  tierLabel(tier: string): string {
    if (tier === 'HIGH') return 'Alta';
    if (tier === 'MEDIUM') return 'Media';
    if (tier === 'LOW') return 'Baja';
    return 'Neutral';
  }
}
