import { Injectable, inject, signal } from '@angular/core';
import { MarketDataService } from './market-data.service';
import { MarketContext } from '../models/analysis.model';
import { Candle } from '../models/candle.model';

/**
 * Fetches and caches cross-asset market context (VIX, DXY, funding rates).
 *
 * Data is fetched asynchronously and stored in signals for synchronous
 * consumption by ConfluenceService.score(). Graceful degradation: if any
 * fetch fails, neutral context is returned.
 */
@Injectable({ providedIn: 'root' })
export class MarketContextService {
  private readonly marketData = inject(MarketDataService);

  readonly loading = signal(false);
  readonly context = signal<MarketContext | null>(null);
  readonly error = signal<string | null>(null);

  /** Cache TTL in milliseconds (15 minutes) */
  private readonly CACHE_TTL = 15 * 60 * 1000;
  private lastFetch = 0;

  /**
   * Load market context. Uses cache if within TTL.
   * Call this when ticker changes or on manual refresh.
   *
   * @param ticker - Current ticker symbol (e.g., 'BTC-USD', 'SPY')
   * @param tickerCandles - Current ticker's candle data for DXY correlation calc
   */
  async loadContext(ticker: string, tickerCandles?: Candle[]): Promise<MarketContext> {
    const now = Date.now();
    if (this.context() && (now - this.lastFetch) < this.CACHE_TTL) {
      return this.context()!;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const ctx = await this.fetchAndCompute(ticker, tickerCandles);
      this.context.set(ctx);
      this.lastFetch = now;
      return ctx;
    } catch (err) {
      const fallback: MarketContext = {
        vixLevel: 'normal',
        vixAdjustment: 0,
        dxyCorrelation: 0,
      };
      this.context.set(fallback);
      this.error.set((err as Error).message);
      return fallback;
    } finally {
      this.loading.set(false);
    }
  }

  private async fetchAndCompute(ticker: string, tickerCandles?: Candle[]): Promise<MarketContext> {
    const isCrypto = ticker.includes('-USD');

    // Fetch VIX and DXY in parallel (graceful: null on failure)
    const [vixCandles, dxyCandles] = await Promise.all([
      this.marketData.fetchCandles('^VIX', '1d', '1mo').catch(() => null),
      this.marketData.fetchCandles('DX-Y.NYB', '1d', '1mo').catch(() => null),
    ]);

    // Compute VIX level
    let vixLevel: MarketContext['vixLevel'] = 'normal';
    let vixAdjustment = 0;
    if (vixCandles && vixCandles.length > 0) {
      const lastVix = vixCandles[vixCandles.length - 1].close;
      if (lastVix > 30) {
        vixLevel = 'extreme';
        vixAdjustment = -0.30; // Halve all log-LR (fear dominates)
      } else if (lastVix > 20) {
        vixLevel = 'high';
        vixAdjustment = -0.15;
      } else if (lastVix < 12) {
        vixLevel = 'low';
        vixAdjustment = 0.10; // Complacency = trends persist
      }
    }

    // Compute DXY correlation with the TICKER (not VIX)
    let dxyCorrelation = 0;
    if (dxyCandles && dxyCandles.length >= 20 && tickerCandles && tickerCandles.length >= 20) {
      dxyCorrelation = computeCorrelation(tickerCandles, dxyCandles);
    }

    return { vixLevel, vixAdjustment, dxyCorrelation };
  }
}

/**
 * Compute 30-day rolling Pearson correlation between two candle arrays.
 */
function computeCorrelation(a: { close: number }[], b: { close: number }[]): number {
  const n = Math.min(a.length, b.length, 30);
  const aSlice = a.slice(-n);
  const bSlice = b.slice(-n);

  const meanA = aSlice.reduce((s, c) => s + c.close, 0) / n;
  const meanB = bSlice.reduce((s, c) => s + c.close, 0) / n;

  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = aSlice[i].close - meanA;
    const db = bSlice[i].close - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }

  if (varA === 0 || varB === 0) return 0;
  return cov / Math.sqrt(varA * varB);
}
