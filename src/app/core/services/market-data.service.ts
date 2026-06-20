import { Injectable, signal } from '@angular/core';
import { Candle, candlesFromYahoo } from '../models/candle.model';

export interface YahooChartResponse {
  chart: {
    result?: {
      timestamp: number[];
      indicators: {
        quote: {
          open: (number | null)[];
          high: (number | null)[];
          low: (number | null)[];
          close: (number | null)[];
          volume: (number | null)[];
        }[];
      };
    }[];
    error?: { code: string; description: string } | null;
  };
}

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';
export type Range = '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y';

@Injectable({ providedIn: 'root' })
export class MarketDataService {
  private readonly yahooBase = 'https://query1.finance.yahoo.com/v8/finance/chart';

  /** Loading signal */
  readonly loading = signal(false);
  /** Error signal */
  readonly error = signal<string | null>(null);

  /**
   * Fetch candles from Yahoo Finance.
   * Falls back to mock data on failure.
   */
  async fetchCandles(symbol: string, interval: Timeframe, range: Range): Promise<Candle[]> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const url = `${this.yahooBase}/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json: YahooChartResponse = await response.json();

      if (json.chart?.error) {
        throw new Error(json.chart.error.description);
      }

      const result = json.chart?.result?.[0];
      if (!result?.timestamp?.length) {
        throw new Error('No data returned from Yahoo Finance');
      }

      const quote = result.indicators.quote[0];
      return candlesFromYahoo(result.timestamp, quote);
    } catch (err) {
      console.warn('Yahoo Finance fetch failed, using mock data:', err);
      this.error.set((err as Error).message);
      return this.fetchMockData();
    } finally {
      this.loading.set(false);
    }
  }

  /** Fallback: load SPY 6-month mock data */
  private async fetchMockData(): Promise<Candle[]> {
    try {
      const response = await fetch('assets/sample-data/spy-6m.json');
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // ultimate fallback
    }
    return [];
  }
}
