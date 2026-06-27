import { Component, inject, signal, computed, OnInit, effect, ElementRef, viewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { TickerStore } from '../../core/state/ticker.store';
import { LlmSettingsStore } from '../../core/state/llm-settings.store';
import { CacheStore, AnalysisHistoryEntry } from '../../core/state/cache.store';
import { AnalysisService } from '../../core/services/analysis.service';
import { AnalysisResult, ConfluenceResult } from '../../core/models/analysis.model';
import { LlmMessage } from '../../core/llm/llm-provider';

@Component({
  selector: 'app-analysis-dashboard',
  standalone: true,
  imports: [TranslatePipe, CurrencyPipe, DatePipe, DecimalPipe],
  templateUrl: './analysis-dashboard.html',
  styleUrl: './analysis-dashboard.css',
})
export class AnalysisDashboard implements OnInit {
  readonly store = inject(TickerStore);
  readonly settingsStore = inject(LlmSettingsStore);
  private readonly analysisService = inject(AnalysisService);
  private readonly cacheStore = inject(CacheStore);
  private readonly sanitizer = inject(DomSanitizer);

  readonly isOpen = signal(true);
  readonly error = signal<string | null>(null);
  readonly showContributingSignals = signal(false);

  // ── Epic 8 Track B: Interactive follow-up ──────────────────────
  readonly followUpQuestion = signal('');
  readonly followUpHistory = signal<LlmMessage[]>([]);
  readonly followUpLoading = signal(false);
  readonly followUpError = signal<string | null>(null);

  // ── Epic 8 Track C: Analysis history ────────────────────────────
  readonly previousAnalysis = signal<AnalysisHistoryEntry | null>(null);
  readonly showHistory = signal(false);

  // ── Chat auto-scroll ────────────────────────────────────────────
  readonly chatContainer = viewChild<ElementRef<HTMLDivElement>>('chatBubbles');

  constructor() {
    // Auto-scroll chat to bottom when new messages arrive
    effect(() => {
      this.followUpHistory(); // track signal changes
      const el = this.chatContainer()?.nativeElement;
      if (el) {
        // Use setTimeout to wait for DOM render after signal update
        setTimeout(() => { el.scrollTop = el.scrollHeight; }, 0);
      }
    });
  }

  ngOnInit(): void {
    this.loadPreviousAnalysis();
  }

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

  // ── Epic 8 Track A: Weekly context ──────────────────────────────
  get weeklyConfluence(): ConfluenceResult | null {
    return this.store.weeklyConfluence();
  }

  readonly hasAnyResult = computed(() =>
    this.confluence !== null || this.analysis !== null,
  );

  async runAnalysis(): Promise<void> {
    this.error.set(null);
    const result = await this.analysisService.runAnalysis();
    if (result) {
      this.store.setAnalysis(result);
      // Reload history after new analysis
      this.loadPreviousAnalysis();
    } else {
      this.error.set(this.analysisService.error());
    }
  }

  // ── Epic 8 Track C: Load previous analysis for comparison ──────
  private async loadPreviousAnalysis(): Promise<void> {
    const ticker = this.store.selectedTicker();
    const timeframe = this.store.timeframe();
    if (!ticker) return;

    try {
      const history = await this.cacheStore.getAnalysisHistory(ticker, timeframe, 2);
      // history[0] is current, history[1] is previous
      if (history.length >= 2) {
        this.previousAnalysis.set(history[1]);
        this.showHistory.set(true);
      } else {
        this.previousAnalysis.set(null);
        this.showHistory.set(false);
      }
    } catch {
      // History is non-critical
    }
  }

  tierDeltaClass(prev: string, curr: string): string {
    const rank = { HIGH: 3, MEDIUM: 2, LOW: 1, NEUTRAL: 0 };
    const diff = (rank[curr as keyof typeof rank] ?? 0) - (rank[prev as keyof typeof rank] ?? 0);
    if (diff > 0) return 'positive';
    if (diff < 0) return 'negative';
    return 'neutral';
  }

  // ── Epic 8 Track B: Follow-up chat ─────────────────────────────
  async askFollowUp(): Promise<void> {
    const question = this.followUpQuestion().trim();
    if (!question || this.followUpLoading()) return;

    this.followUpLoading.set(true);
    this.followUpError.set(null);

    try {
      const answer = await this.analysisService.askFollowUp(question, this.followUpHistory());
      if (answer) {
        this.followUpHistory.update((h) => [
          ...h,
          { role: 'user', content: question },
          { role: 'assistant', content: answer },
        ]);
      } else {
        this.followUpError.set('No response from LLM. Check your connection and settings.');
      }
    } catch (err) {
      this.followUpError.set((err as Error).message || 'Follow-up failed');
    } finally {
      this.followUpLoading.set(false);
      this.followUpQuestion.set('');
    }
  }

  canAskFollowUp(): boolean {
    return this.isConfigured && this.followUpHistory().length < 10 && !this.followUpLoading();
  }

  /** Convert basic markdown to safe HTML for chat rendering */
  formatMarkdown(text: string): SafeHtml {
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Split inline bullets: "text:* item" → "text:\n* item"
    html = html.replace(/([^\s\n])([*+-])([ \u00a0])/g, '$1\n$2$3');

    // Bullet lines → • lines
    html = html.replace(/(^|\n)[*+-][ \u00a0]+/g, '$1• ');

    // Paragraphs and line breaks
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    html = `<p>${html}</p>`;
    html = html.replace(/<p><\/p>/g, '');

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  clearChat(): void {
    this.followUpHistory.set([]);
    this.followUpError.set(null);
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


}
