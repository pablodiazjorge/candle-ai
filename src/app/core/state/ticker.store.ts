import { Injectable, signal, computed } from '@angular/core';
import { Candle } from '../models/candle.model';
import { IndicatorResults, IndicatorSettings, RegimeResult, DEFAULT_INDICATOR_SETTINGS } from '../models/indicator.model';
import { DetectedPattern, PatternType } from '../models/pattern.model';
import { AnalysisResult, ConfluenceResult } from '../models/analysis.model';
import { Timeframe, Range } from '../services/market-data.service';

export interface TickerState {
  selectedTicker: string | null;
  timeframe: Timeframe;
  range: Range;
  candleData: Candle[];
  indicators: IndicatorResults | null;
  activeIndicators: IndicatorSettings;
  patterns: DetectedPattern[];
  analysis: AnalysisResult | null;
  watchlist: string[];
}

const initialState: TickerState = {
  selectedTicker: null,
  timeframe: '1d',
  range: '5y',
  candleData: [],
  indicators: null,
  activeIndicators: DEFAULT_INDICATOR_SETTINGS,
  patterns: [],
  analysis: null,
  watchlist: ['SPY', 'QQQ', 'NVDA', 'META', 'GOOGL', 'TSLA', 'SPCX', 'BTC-USD'],
};

@Injectable({ providedIn: 'root' })
export class TickerStore {
  // --- Core state signals ---
  readonly selectedTicker = signal<string | null>(initialState.selectedTicker);
  readonly timeframe = signal<Timeframe>(initialState.timeframe);
  readonly range = signal<Range>(initialState.range);
  readonly candleData = signal<Candle[]>(initialState.candleData);
  readonly indicators = signal<IndicatorResults | null>(initialState.indicators);
  readonly patterns = signal<DetectedPattern[]>(initialState.patterns);
  readonly regime = signal<RegimeResult | null>(null);
  readonly confluence = signal<ConfluenceResult | null>(null);
  readonly analysis = signal<AnalysisResult | null>(initialState.analysis);

  // ── Epic 8 Track A: Multi-timeframe weekly context ──
  readonly weeklyCandleData = signal<Candle[]>([]);
  readonly weeklyRegime = signal<RegimeResult | null>(null);
  readonly weeklyConfluence = signal<ConfluenceResult | null>(null);
  readonly hasWeeklyContext = computed(() => this.weeklyCandleData().length > 0);
  readonly watchlist = signal<string[]>(initialState.watchlist);
  readonly activeIndicators = signal<IndicatorSettings>(initialState.activeIndicators);
  /** Set of pattern types currently visible on the chart */
  readonly visiblePatternTypes = signal<Set<PatternType>>(new Set());

  // --- Computed ---

  /** Whether any pattern type is selected for display */
  readonly hasVisiblePatterns = computed(() => this.visiblePatternTypes().size > 0);
  readonly hasData = computed(() => this.candleData().length > 0);
  readonly hasTicker = computed(() => this.selectedTicker() !== null);
  readonly lastCandle = computed(() => {
    const data = this.candleData();
    return data.length > 0 ? data[data.length - 1] : null;
  });
  readonly priceChange = computed(() => {
    const data = this.candleData();
    if (data.length < 2) return 0;
    const first = data[0].close;
    const last = data[data.length - 1].close;
    return ((last - first) / first) * 100;
  });

  // --- Actions ---
  selectTicker(ticker: string): void {
    this.selectedTicker.set(ticker);
    this.candleData.set([]);
    this.indicators.set(null);
    this.activeIndicators.set(DEFAULT_INDICATOR_SETTINGS);
    this.patterns.set([]);
    this.regime.set(null);
    this.confluence.set(null);
    this.analysis.set(null);
    this.weeklyCandleData.set([]);
    this.weeklyRegime.set(null);
    this.weeklyConfluence.set(null);
  }

  setTimeframe(tf: Timeframe): void {
    this.timeframe.set(tf);
    // Clamp range for intraday timeframes — Yahoo Finance rejects
    // range=max for 1m/5m/15m/1h/4h intervals
    const maxRange = intradayMaxRange(tf);
    const current = this.range();
    if (rangeRank(current) > rangeRank(maxRange)) {
      this.range.set(maxRange as Range);
    }
  }

  setRange(r: Range): void {
    this.range.set(r);
    // Max range → auto-switch to monthly candles for readability
    if (r === 'max') {
      this.timeframe.set('1mo');
    }
  }

  setCandleData(data: Candle[]): void {
    this.candleData.set(data);
  }

  setIndicators(ind: IndicatorResults): void {
    this.indicators.set(ind);
  }

  setPatterns(pat: DetectedPattern[]): void {
    this.patterns.set(pat);
  }

  setRegime(r: RegimeResult | null): void {
    this.regime.set(r);
  }

  setConfluence(c: ConfluenceResult): void {
    this.confluence.set(c);
  }

  setAnalysis(a: AnalysisResult): void {
    this.analysis.set(a);
  }

  setWeeklyCandleData(data: Candle[]): void {
    this.weeklyCandleData.set(data);
  }

  setWeeklyRegime(r: RegimeResult | null): void {
    this.weeklyRegime.set(r);
  }

  setWeeklyConfluence(c: ConfluenceResult | null): void {
    this.weeklyConfluence.set(c);
  }

  toggleIndicator(key: keyof IndicatorSettings): void {
    this.activeIndicators.update((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  setActiveIndicators(settings: IndicatorSettings): void {
    this.activeIndicators.set(settings);
  }

  addToWatchlist(ticker: string): void {
    this.watchlist.update((list) => {
      if (!list.includes(ticker)) {
        return [...list, ticker];
      }
      return list;
    });
    this.persistWatchlist();
  }

  removeFromWatchlist(ticker: string): void {
    this.watchlist.update((list) => list.filter((t) => t !== ticker));
    this.persistWatchlist();
  }

  private persistWatchlist(): void {
    localStorage.setItem('candle-ai-watchlist', JSON.stringify(this.watchlist()));
  }

  togglePatternType(type: PatternType): void {
    this.visiblePatternTypes.update((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  isPatternVisible(type: PatternType): boolean {
    return this.visiblePatternTypes().has(type);
  }

  selectAllPatternTypes(types: PatternType[]): void {
    this.visiblePatternTypes.set(new Set(types));
  }

  deselectAllPatternTypes(): void {
    this.visiblePatternTypes.set(new Set());
  }

  loadWatchlist(): void {
    const stored = localStorage.getItem('candle-ai-watchlist');
    if (stored) {
      try {
        this.watchlist.set(JSON.parse(stored));
      } catch {
        // ignore
      }
    }
  }

  reset(): void {
    this.selectedTicker.set(null);
    this.candleData.set([]);
    this.indicators.set(null);
    this.activeIndicators.set(DEFAULT_INDICATOR_SETTINGS);
    this.patterns.set([]);
    this.regime.set(null);
    this.confluence.set(null);
    this.analysis.set(null);
    this.weeklyCandleData.set([]);
    this.weeklyRegime.set(null);
    this.weeklyConfluence.set(null);
  }
}

// ─── Intraday range clamping ─────────────────────────────────────

/** Rank ranges so we can compare them: higher = more data */
function rangeRank(r: string): number {
  const order = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', 'max'];
  return order.indexOf(r);
}

/**
 * Yahoo Finance limits intraday intervals to certain maximum ranges.
 * If the range exceeds what the interval supports, the API returns 400.
 */
function intradayMaxRange(tf: string): string {
  switch (tf) {
    case '1m':   return '5d';    // 1-minute bars: max ~5 days
    case '5m':   return '1mo';   // 5-minute bars: max ~1 month
    case '15m':  return '1mo';   // 15-minute bars: max ~1 month
    case '1h':   return '3mo';   // hourly bars: max ~3 months
    case '4h':   return '6mo';   // 4-hour bars: max ~6 months
    case '1mo':  return 'max';   // monthly: unlimited
    default:     return 'max';   // daily/weekly: unlimited
  }
}