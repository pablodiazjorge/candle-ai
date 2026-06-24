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
   * Tries direct connection first, falls back to CORS proxy, then mock data.
   */
  async fetchCandles(symbol: string, interval: Timeframe, range: Range): Promise<Candle[]> {
    this.loading.set(true);
    this.error.set(null);

    const yahooUrl = `${this.yahooBase}/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;

    // Try direct first, then CORS proxy, then mock
    for (const fetchUrl of [yahooUrl, `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`]) {
      try {
        const candles = await this.tryFetch(fetchUrl);
        if (candles.length > 0) {
          this.loading.set(false);
          return candles;
        }
      } catch (err) {
        console.warn(`Fetch failed for ${fetchUrl.substring(0, 60)}...:`, err);
      }
    }

    // Final fallback: synthetic data
    console.warn('All fetch attempts failed, using synthetic data');
    this.loading.set(false);
    return this.fetchMockData(symbol);
  }

  private async tryFetch(url: string): Promise<Candle[]> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json: YahooChartResponse = await response.json();
    if (json.chart?.error) throw new Error(json.chart.error.description);
    const result = json.chart?.result?.[0];
    if (!result?.timestamp?.length) throw new Error('No data');
    return candlesFromYahoo(result.timestamp, result.indicators.quote[0]);
  }

  /** Fallback: generate per-ticker synthetic OHLCV data */
  private async fetchMockData(symbol: string): Promise<Candle[]> {
    // Always generate fresh synthetic data per ticker for visual variety
    return generateSynthetic(symbol);
  }
}

// ─── Synthetic data helpers ───────────────────────────────────────

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function perturbData(base: Candle[], symbol: string): Candle[] {
  const rng = mulberry32(hashString(symbol));
  const factor = 0.5 + rng() * 2.0;
  return base.map((c) => ({
    time: c.time,
    open: +(c.open * factor * (1 + (rng() - 0.5) * 0.02)).toFixed(2),
    high: +(c.high * factor * (1 + (rng() - 0.5) * 0.02)).toFixed(2),
    low: +(c.low * factor * (1 + (rng() - 0.5) * 0.02)).toFixed(2),
    close: +(c.close * factor * (1 + (rng() - 0.5) * 0.02)).toFixed(2),
    volume: Math.round(c.volume * (0.3 + rng() * 3)),
  }));
}

function generateSynthetic(symbol: string): Candle[] {
  const rng = mulberry32(hashString(symbol));
  const trend = (rng() - 0.5) * 0.6;
  const approxPrice = knownPrice(symbol);
  // Use known price as center with ±20% variation, or fall back to asset class range
  const basePrice = approxPrice
    ? approxPrice * (0.8 + rng() * 0.4)
    : priceRange(symbol).min + rng() * (priceRange(symbol).max - priceRange(symbol).min);
  const volatility = basePrice * (0.01 + rng() * 0.04);
  const count = 100 + Math.floor(rng() * 60);
  const candles: Candle[] = [];
  const now = Math.floor(Date.now() / 1000);
  let price = basePrice;

  for (let i = count - 1; i >= 0; i--) {
    const change = (rng() - 0.5 + trend) * volatility;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + rng() * volatility * 0.6;
    const low = Math.min(open, close) - rng() * volatility * 0.6;
    price = close;

    candles.push({
      time: now - i * 86400,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
      volume: Math.round(500000 + rng() * 8000000),
    });
  }
  return candles;
}

/** Realistic price ranges per asset class */
function priceRange(symbol: string): { min: number; max: number } {
  const s = symbol.toUpperCase();
  if (s.includes('-USD')) return { min: 100, max: 100000 };       // Crypto
  if (s.includes('=X'))  return { min: 0.5, max: 2.0 };           // Forex
  if (s.startsWith('^')) return { min: 1000, max: 20000 };        // Indices
  if (s.includes('=F'))  return { min: 20, max: 2000 };           // Commodities
  return { min: 10, max: 700 };                                    // Stocks/ETFs
}

/** Approximate real-world prices for well-known tickers (mid-2026) */
function knownPrice(symbol: string): number | null {
  const prices: Record<string, number> = {
    'BTC-USD': 62000, 'ETH-USD': 2400, 'SOL-USD': 140, 'DOGE-USD': 0.12,
    'XRP-USD': 2.30, 'ADA-USD': 0.45, 'AVAX-USD': 28, 'DOT-USD': 6.50,
    'LINK-USD': 15, 'SHIB-USD': 0.000018, 'PEPE-USD': 0.000008,
    'SPY': 600, 'QQQ': 520, 'IWM': 225, 'DIA': 440, 'VTI': 310, 'VOO': 550,
    'GLD': 270, 'SLV': 32, 'TLT': 88, 'ARKK': 52, 'SOXX': 250, 'SMH': 280,
    'AAPL': 250, 'MSFT': 500, 'GOOGL': 190, 'AMZN': 225, 'NVDA': 1100,
    'META': 620, 'TSLA': 350, 'NFLX': 950, 'AMD': 110, 'INTC': 30,
    'BA': 190, 'JPM': 260, 'GS': 600, 'BAC': 48, 'WMT': 95, 'COST': 980,
    'DIS': 105, 'UBER': 80, 'PYPL': 85, 'ADBE': 450, 'CRM': 290,
    'ORCL': 180, 'IBM': 260, 'QCOM': 200, 'AVGO': 1800, 'LLY': 900,
    'UNH': 620, 'JNJ': 170, 'PFE': 30, 'XOM': 125, 'CVX': 175,
    'CAT': 380, 'GE': 210, 'F': 12, 'PLTR': 110, 'HOOD': 55, 'COIN': 280,
    'SNAP': 12, 'RBLX': 45, 'MSTR': 1500, 'RDDT': 180, 'ARM': 160,
    'GC=F': 3200, 'CL=F': 68, 'SI=F': 35, 'NG=F': 3.50, 'HG=F': 5.20,
    'PL=F': 1050, 'ZC=F': 460, 'ZS=F': 1100, 'ZW=F': 580,
    'EURUSD=X': 1.08, 'GBPUSD=X': 1.32, 'USDJPY=X': 157, 'USDCHF=X': 0.88,
    'AUDUSD=X': 0.66, 'USDCAD=X': 1.37, 'NZDUSD=X': 0.61,
    '^GSPC': 5900, '^IXIC': 21000, '^DJI': 42000, '^RUT': 2250, '^VIX': 16,
    'BABA': 140, 'TSM': 200, 'NIO': 5, 'SHEL': 38, 'BP': 35, 'NVS': 120,
    'TM': 180, 'SONY': 130, 'BHP': 55, 'RIO': 65, 'SAP': 230, 'ASML': 1000,
    'VALE': 12, 'T': 28, 'VZ': 44, 'TGT': 120, 'LOW': 270, 'HD': 420,
    'AXP': 290, 'MA': 550, 'V': 340, 'ABNB': 160, 'DASH': 190, 'DDOG': 140,
    'CRWD': 400, 'ZS': 220, 'NET': 120, 'MDB': 300, 'TTD': 130,
  };
  return prices[symbol.toUpperCase()] ?? null;
}
