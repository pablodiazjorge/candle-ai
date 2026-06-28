import { Component, inject, OnInit, effect, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { TickerSelector } from './features/ticker-selector/ticker-selector';
import { CandleChart } from './features/candle-chart/candle-chart';
import { IndicatorPanel } from './features/indicator-panel/indicator-panel';
import { PatternOverlay } from './features/pattern-overlay/pattern-overlay';
import { AnalysisDashboard } from './features/analysis-dashboard/analysis-dashboard';
import { ExportPanel } from './features/export-panel/export-panel';
import { LlmSettings } from './features/llm-settings/llm-settings';
import { LlmSettingsStore } from './core/state/llm-settings.store';
import { TickerStore } from './core/state/ticker.store';
import { MarketDataService, Range } from './core/services/market-data.service';
import { MarketContextService } from './core/services/market-context.service';
import { IndicatorsService } from './core/services/indicators.service';
import { PatternsService } from './core/services/patterns.service';
import { GradingService } from './core/services/grading.service';
import { ConfluenceService } from './core/services/confluence.service';
import { CacheStore } from './core/state/cache.store';
import { IndicatorSettings } from './core/models/indicator.model';
import { Candle } from './core/models/candle.model';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [TickerSelector, CandleChart, IndicatorPanel, PatternOverlay, AnalysisDashboard, ExportPanel, LlmSettings, TranslatePipe, CurrencyPipe, DecimalPipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private readonly translate = inject(TranslateService);
  readonly store = inject(TickerStore);
  private readonly marketData = inject(MarketDataService);
  private readonly marketContextService = inject(MarketContextService);
  private readonly indicatorsService = inject(IndicatorsService);
  private readonly patternsService = inject(PatternsService);
  private readonly gradingService = inject(GradingService);
  private readonly confluenceService = inject(ConfluenceService);
  private readonly cacheStore = inject(CacheStore);

  readonly timeframes = ['1m', '5m', '15m', '1h', '4h', '1d', '1wk', '1mo'] as const;
  readonly ranges = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', 'max'] as const;
  isSidebarOpen = true;
  readonly isDarkTheme = signal(true);

  constructor() {
    // React to ticker, timeframe, or range changes: reload market data
    effect(() => {
      const ticker = this.store.selectedTicker();
      // Track these signals so effect re-runs when they change
      this.store.timeframe();
      this.store.range();
      // Force re-run even when same ticker is re-selected
      this.store.refreshCounter();
      if (ticker) {
        this.loadMarketData(ticker);
      }
    });
  }

  ngOnInit(): void {
    // Theme initialization
    this.isDarkTheme.set(localStorage.getItem('candle-ai-theme') !== 'light');
    this.applyTheme();

    // i18n setup
    this.translate.addLangs(['en', 'es']);

    // Detect browser language
    const browserLang = navigator.language.split('-')[0];
    const lang = this.translate.getLangs().includes(browserLang) ? browserLang : 'en';
    this.translate.use(lang);

    // Load persisted watchlist
    this.store.loadWatchlist();

    // Clear expired cache entries on startup (non-critical)
    this.cacheStore.purgeExpired().catch(() => {});
  }

  /** Load market data for a ticker: cache → API → mock fallback */
  private async loadMarketData(ticker: string): Promise<void> {
    const tf = this.store.timeframe();
    const range = this.store.range();

    // Try cache first
    const cacheKey = CacheStore.buildKey(ticker, tf, range);
    const cached = await this.cacheStore.get(cacheKey);
    if (cached) {
      this.store.setCandleData(cached);
      this.computeActiveIndicators(cached);
      this.detectPatterns(cached);
      // Fire-and-forget weekly context (non-blocking)
      this.loadWeeklyContext(ticker, range).catch(() => {});
      // Fire-and-forget market context (non-blocking)
      this.marketContextService.loadContext(ticker, cached).then((ctx) => {
        this.store.marketContext.set(ctx);
      }).catch(() => {});
      return;
    }

    // Fetch from API
    const candles = await this.marketData.fetchCandles(ticker, tf, range);

    if (candles.length > 0) {
      // Cache the result
      await this.cacheStore.set(cacheKey, candles);
      this.store.setCandleData(candles);
      this.computeActiveIndicators(candles);
      this.detectPatterns(candles);
      // Fire-and-forget weekly context (non-blocking)
      this.loadWeeklyContext(ticker, range).catch(() => {});
      // Fire-and-forget market context (non-blocking)
      this.marketContextService.loadContext(ticker, candles).then((ctx) => {
        this.store.marketContext.set(ctx);
      }).catch(() => {});
    }
  }

  /**
   * Epic 8 Track A: Load weekly timeframe data for multi-TF context.
   * Runs in background — does not block the main data pipeline.
   * Gracefully degrades: if weekly fails, the badge simply won't appear.
   */
  private async loadWeeklyContext(ticker: string, range: Range): Promise<void> {
    // Skip if already on weekly or monthly timeframe
    if (this.store.timeframe() === '1wk' || this.store.timeframe() === '1mo') return;

    const cacheKey = CacheStore.buildKey(ticker, '1wk', range);
    const cached = await this.cacheStore.get(cacheKey);
    if (cached) {
      this.store.setWeeklyCandleData(cached);
      this.computeWeeklyConfluence(cached);
      return;
    }

    const candles = await this.marketData.fetchCandles(ticker, '1wk', range);
    if (candles.length > 0) {
      await this.cacheStore.set(cacheKey, candles);
      this.store.setWeeklyCandleData(candles);
      this.computeWeeklyConfluence(candles);
    }
  }

  /** Compute confluence for weekly data (lightweight — no indicators by default) */
  private computeWeeklyConfluence(candles: Candle[]): void {
    const ticker = this.store.selectedTicker() ?? 'SPY';
    // Run confluence on weekly candles with whatever patterns can be detected
    const patterns = this.patternsService.detectAll(candles);
    const chartPatterns = this.patternsService.detectChartPatterns(candles);
    const graded = this.gradingService.gradeAll([...patterns, ...chartPatterns], candles);

    const result = this.confluenceService.score(
      null, // no regime for weekly (would need indicators worker)
      graded,
      null, // no indicators for weekly
      candles,
      ticker,
    );
    this.store.setWeeklyConfluence(result);
  }

  /** Run pattern detection on candle data, then compute confluence */
  private detectPatterns(candles: Candle[]): void {
    // Detection window = 240 candles (60 chart lookback × 4).
    // Covers the longest-forming pattern (H&S ~50 candles) with buffer.
    // Patterns outside this window are discarded by temporal decay anyway.
    const detectionWindow = Math.min(candles.length, 240);
    const detectionCandles = candles.slice(-detectionWindow);

    const candlestickPatterns = this.patternsService.detectAll(detectionCandles);
    const chartPatterns = this.patternsService.detectChartPatterns(detectionCandles);
    const graded = this.gradingService.gradeAll(
      [...candlestickPatterns, ...chartPatterns],
      candles, // Full candles needed for grading context (S/R levels, volume avg)
    );
    this.store.setPatterns(graded);
    this.computeConfluence(candles);
  }

  /** Compute probabilistic confluence scoring (Epic 7) */
  private computeConfluence(candles: Candle[]): void {
    const regime = this.store.regime();
    const patterns = this.store.patterns();
    const indicators = this.store.indicators();
    const ticker = this.store.selectedTicker() ?? 'SPY';

    const result = this.confluenceService.score(
      regime,
      patterns,
      indicators,
      candles,
      ticker,
      undefined, // accountSize
      this.store.timeframe(),
      this.store.marketContext(),
    );
    this.store.setConfluence(result);
  }

  /** Compute indicators if any are active */
  private computeCallId = 0;

  private async computeActiveIndicators(candles: Candle[]): Promise<void> {
    const settings = this.store.activeIndicators();
    const hasAny = Object.values(settings).some(Boolean);
    const callId = ++this.computeCallId;

    if (!hasAny || candles.length === 0) {
      this.store.setIndicators({
        rsi: null, macd: null, bb: null,
        sma20: null, sma50: null, sma200: null,
        ema9: null, ema21: null, volumeProfile: null,
        adx: null, atr: null, regime: null,
        volumeClimax: null, volumeDryUp: null, volumeDivergence: null,
      });
      this.store.setRegime(null);
      return;
    }

    try {
      const results = await this.indicatorsService.computeIndicators(candles, settings);
      // Discard stale results from superseded calls
      if (callId !== this.computeCallId) return;
      this.store.setIndicators(results);
      if (results.regime) {
        this.store.setRegime(results.regime);
      }
    } catch (err) {
      if (callId !== this.computeCallId) return;
      console.error('Indicator computation failed:', err);
    }
  }

  /** Called when indicator-panel toggles change */
  onIndicatorsChanged(_settings: IndicatorSettings): void {
    const candles = this.store.candleData();
    if (candles.length > 0) {
      this.computeActiveIndicators(candles);
    }
  }

  switchLanguage(lang: string): void {
    this.translate.use(lang);
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  /** Skip to main content for keyboard accessibility */
  skipToMain(event: Event): void {
    event.preventDefault();
    const main = document.getElementById('main-content');
    if (main) {
      main.focus();
      main.scrollIntoView();
    }
  }

  toggleTheme(): void {
    this.isDarkTheme.update((v) => !v);
    localStorage.setItem('candle-ai-theme', this.isDarkTheme() ? 'dark' : 'light');
    this.applyTheme();
  }

  get themeLabel(): string {
    return this.isDarkTheme() ? 'Switch to light mode' : 'Switch to dark mode';
  }

  get isLoading(): boolean {
    // Only show loading overlay for initial market data fetch.
    // Indicator recomputation is a background operation — the web worker
    // completes in ~10-50ms and should not trigger the full-viewport blur.
    return this.marketData.loading();
  }

  get currentLang(): string {
    return this.translate.currentLang() ?? 'en';
  }

  private applyTheme(): void {
    if (this.isDarkTheme()) {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }
}
