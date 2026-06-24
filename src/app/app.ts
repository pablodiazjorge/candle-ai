import { Component, inject, OnInit, effect } from '@angular/core';
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
import { MarketDataService } from './core/services/market-data.service';
import { IndicatorsService } from './core/services/indicators.service';
import { PatternsService } from './core/services/patterns.service';
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
  private readonly indicatorsService = inject(IndicatorsService);
  private readonly patternsService = inject(PatternsService);
  private readonly cacheStore = inject(CacheStore);

  readonly timeframes = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'] as const;
  isSidebarOpen = true;
  isDarkTheme = true;

  constructor() {
    // React to ticker changes: load market data (must be in constructor for effect())
    effect(() => {
      const ticker = this.store.selectedTicker();
      if (ticker) {
        this.loadMarketData(ticker);
      }
    });
  }

  ngOnInit(): void {
    // Theme initialization
    this.isDarkTheme = localStorage.getItem('candle-ai-theme') !== 'light';
    this.applyTheme();

    // i18n setup
    this.translate.addLangs(['en', 'es']);

    // Detect browser language
    const browserLang = navigator.language.split('-')[0];
    const lang = this.translate.getLangs().includes(browserLang) ? browserLang : 'en';
    this.translate.use(lang);

    // Load persisted watchlist
    this.store.loadWatchlist();

    // Clear expired cache entries on startup
    this.cacheStore.purgeExpired();
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
    }
  }

  /** Run pattern detection on candle data */
  private detectPatterns(candles: Candle[]): void {
    const patterns = this.patternsService.detectAll(candles);
    this.store.setPatterns(patterns);
  }

  /** Compute indicators if any are active */
  private async computeActiveIndicators(candles: Candle[]): Promise<void> {
    const settings = this.store.activeIndicators();
    const hasAny = Object.values(settings).some(Boolean);

    if (!hasAny || candles.length === 0) {
      this.store.setIndicators({
        rsi: null, macd: null, bb: null,
        sma20: null, sma50: null, sma200: null,
        ema9: null, ema21: null, volumeProfile: null,
      });
      return;
    }

    try {
      const results = await this.indicatorsService.computeIndicators(candles, settings);
      this.store.setIndicators(results);
    } catch (err) {
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

  toggleTheme(): void {
    this.isDarkTheme = !this.isDarkTheme;
    localStorage.setItem('candle-ai-theme', this.isDarkTheme ? 'dark' : 'light');
    this.applyTheme();
  }

  get themeLabel(): string {
    return this.isDarkTheme ? 'Switch to light mode' : 'Switch to dark mode';
  }

  get isLoading(): boolean {
    return this.marketData.loading() || this.indicatorsService.computing();
  }

  get currentLang(): string {
    return this.translate.currentLang() ?? 'en';
  }

  private applyTheme(): void {
    if (this.isDarkTheme) {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }
}
