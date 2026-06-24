import { Injectable, signal, computed } from '@angular/core';
import { Candle } from '../models/candle.model';
import { IndicatorResults, IndicatorSettings, DEFAULT_INDICATOR_SETTINGS } from '../models/indicator.model';
import { DetectedPattern } from '../models/pattern.model';
import { AnalysisResult } from '../models/analysis.model';
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
  range: '6mo',
  candleData: [],
  indicators: null,
  activeIndicators: DEFAULT_INDICATOR_SETTINGS,
  patterns: [],
  analysis: null,
  watchlist: ['SPY', 'QQQ', 'AAPL', 'MSFT', 'BTC-USD', 'GC=F'],
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
  readonly analysis = signal<AnalysisResult | null>(initialState.analysis);
  readonly watchlist = signal<string[]>(initialState.watchlist);
  readonly activeIndicators = signal<IndicatorSettings>(initialState.activeIndicators);

  // --- Computed ---
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
    this.analysis.set(null);
  }

  setTimeframe(tf: Timeframe): void {
    this.timeframe.set(tf);
  }

  setRange(r: Range): void {
    this.range.set(r);
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

  setAnalysis(a: AnalysisResult): void {
    this.analysis.set(a);
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
    this.analysis.set(null);
  }
}
