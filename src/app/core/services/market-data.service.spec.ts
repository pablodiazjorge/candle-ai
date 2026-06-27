/**
 * Unit tests for MarketDataService — Yahoo Finance fetching and synthetic data.
 * Covers: fetchCandles() flow, tryFetch() with Yahoo format parsing,
 * synthetic data generation for various asset classes, and error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Angular inject()
vi.mock('@angular/core', async () => {
  const actual = await vi.importActual('@angular/core');
  return { ...actual, inject: vi.fn(), Injectable: actual['Injectable'], signal: actual['signal'] };
});

import { MarketDataService } from './market-data.service';
import { Candle, candlesFromYahoo } from '../models/candle.model';

// ─── Test Helpers ──────────────────────────────────────────────────

function makeYahooResponse(timestamps: number[], prices: number[]): unknown {
  return {
    chart: {
      result: [{
        timestamp: timestamps,
        indicators: {
          quote: [{
            open: prices.map((p) => p - 0.5),
            high: prices.map((p) => p + 1),
            low: prices.map((p) => p - 1),
            close: prices,
            volume: prices.map(() => 1000000 + Math.floor(Math.random() * 500000)),
          }],
        },
      }],
      error: null,
    },
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('MarketDataService', () => {
  let service: MarketDataService;

  beforeEach(() => {
    vi.restoreAllMocks();
    service = new MarketDataService();
  });

  // ── fetchCandles() ───────────────────────────────────────────────

  describe('fetchCandles()', () => {
    it('should return candles on successful Yahoo fetch', async () => {
      const timestamps = [1700000000, 1700086400, 1700172800];
      const prices = [100, 101, 102.5];
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeYahooResponse(timestamps, prices)),
      }) as unknown as typeof fetch;

      const candles = await service.fetchCandles('SPY', '1d', '3mo');

      expect(candles).toHaveLength(3);
      expect(candles[0].time).toBe(1700000000);
      expect(candles[0].close).toBe(100);
      expect(candles[2].close).toBe(102.5);
      expect(service.loading()).toBe(false);
      expect(service.error()).toBeNull();
    });

    it('should fallback to synthetic data on fetch failure', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const candles = await service.fetchCandles('SPY', '1d', '3mo');

      expect(candles.length).toBeGreaterThan(0);
      expect(candles[0].time).toBeGreaterThan(0);
      expect(service.loading()).toBe(false);
    });

    it('should fallback to synthetic data on HTTP error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('Not Found'),
      }) as unknown as typeof fetch;

      const candles = await service.fetchCandles('AAPL', '1d', '1mo');

      expect(candles.length).toBeGreaterThan(0);
      expect(service.loading()).toBe(false);
    });

    it('should set loading signal during fetch', async () => {
      globalThis.fetch = vi.fn().mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve(makeYahooResponse([1700000000], [100])),
        }), 10);
      })) as unknown as typeof fetch;

      const promise = service.fetchCandles('SPY', '1d', '3mo');
      expect(service.loading()).toBe(true);
      await promise;
      expect(service.loading()).toBe(false);
    });

    it('should clear error on successful fetch', async () => {
      // Set an error first
      service.error.set('Previous error');

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeYahooResponse([1700000000], [100])),
      }) as unknown as typeof fetch;

      await service.fetchCandles('SPY', '1d', '3mo');
      expect(service.error()).toBeNull();
    });
  });

  // ── candlesFromYahoo() pure function ─────────────────────────────

  describe('candlesFromYahoo()', () => {
    it('should parse complete data correctly', () => {
      const timestamps = [1700000000, 1700086400];
      const quote = {
        open: [100, 101],
        high: [102, 103],
        low: [99, 100],
        close: [101.5, 102.5],
        volume: [1000000, 2000000],
      };

      const candles = candlesFromYahoo(timestamps, quote);

      expect(candles).toHaveLength(2);
      expect(candles[0]).toEqual({
        time: 1700000000, open: 100, high: 102, low: 99, close: 101.5, volume: 1000000,
      });
      expect(candles[1]).toEqual({
        time: 1700086400, open: 101, high: 103, low: 100, close: 102.5, volume: 2000000,
      });
    });

    it('should skip candles with null fields', () => {
      const timestamps = [1700000000, 1700086400, 1700172800];
      const quote = {
        open: [100, null, 102],
        high: [102, 103, 104],
        low: [99, 100, 101],
        close: [101.5, 102.5, null],
        volume: [1000000, 2000000, 3000000],
      };

      const candles = candlesFromYahoo(timestamps, quote);

      expect(candles).toHaveLength(1); // Only first candle is complete
      expect(candles[0].time).toBe(1700000000);
    });

    it('should handle null volume (defaults to 0)', () => {
      const timestamps = [1700000000];
      const quote = {
        open: [100], high: [102], low: [99], close: [101.5], volume: [null],
      };

      const candles = candlesFromYahoo(timestamps, quote);

      expect(candles).toHaveLength(1);
      expect(candles[0].volume).toBe(0);
    });

    it('should return empty array for empty input', () => {
      const candles = candlesFromYahoo([], { open: [], high: [], low: [], close: [], volume: [] });
      expect(candles).toHaveLength(0);
    });

    it('should handle 1000 candles efficiently', () => {
      const timestamps = Array.from({ length: 1000 }, (_, i) => 1700000000 + i * 86400);
      const quote = {
        open: timestamps.map((_, i) => 100 + i * 0.1),
        high: timestamps.map((_, i) => 102 + i * 0.1),
        low: timestamps.map((_, i) => 99 + i * 0.1),
        close: timestamps.map((_, i) => 101 + i * 0.1),
        volume: timestamps.map(() => 1000000),
      };

      const start = performance.now();
      const candles = candlesFromYahoo(timestamps, quote);
      const elapsed = performance.now() - start;

      expect(candles).toHaveLength(1000);
      expect(elapsed).toBeLessThan(50); // Should be fast
    });
  });

  // ── Synthetic data generation ─────────────────────────────────────

  describe('synthetic data', () => {
    it('should generate data for different ticker symbols', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Offline'));

      const spyCandles = await service.fetchCandles('SPY', '1d', '1mo');
      const aaplCandles = await service.fetchCandles('AAPL', '1d', '1mo');

      // Both should produce data
      expect(spyCandles.length).toBeGreaterThan(0);
      expect(aaplCandles.length).toBeGreaterThan(0);

      // Different tickers should produce different price ranges
      const spyPrices = spyCandles.map((c: Candle) => c.close);
      const aaplPrices = aaplCandles.map((c: Candle) => c.close);
      const spyAvg = spyPrices.reduce((a: number, b: number) => a + b, 0) / spyPrices.length;
      const aaplAvg = aaplPrices.reduce((a: number, b: number) => a + b, 0) / aaplPrices.length;

      // SPY and AAPL should have different price ranges
      expect(spyAvg).not.toBe(aaplAvg);
    });

    it('should be deterministic for the same ticker', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Offline'));

      const candles1 = await service.fetchCandles('SPY', '1d', '1mo');
      const candles2 = await service.fetchCandles('SPY', '1d', '1mo');

      expect(candles1).toHaveLength(candles2.length);
      expect(candles1[0].close).toBe(candles2[0].close);
      expect(candles1[candles1.length - 1].close).toBe(candles2[candles2.length - 1].close);
    });

    it('should generate crypto data with realistic prices', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Offline'));

      const candles = await service.fetchCandles('BTC-USD', '1d', '1mo');

      expect(candles.length).toBeGreaterThan(0);
      const avgPrice = candles.reduce((s: number, c: Candle) => s + c.close, 0) / candles.length;
      // BTC should be in the tens of thousands
      expect(avgPrice).toBeGreaterThan(10000);
    });

    it('should generate forex data with realistic prices', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Offline'));

      const candles = await service.fetchCandles('EURUSD=X', '1d', '1mo');

      expect(candles.length).toBeGreaterThan(0);
      const avgPrice = candles.reduce((s: number, c: Candle) => s + c.close, 0) / candles.length;
      // EUR/USD should be around 1.0-1.2
      expect(avgPrice).toBeGreaterThan(0.5);
      expect(avgPrice).toBeLessThan(2.0);
    });

    it('should respect different timeframes', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Offline'));

      const dailyCandles = await service.fetchCandles('SPY', '1d', '1mo');
      const hourlyCandles = await service.fetchCandles('SPY', '1h', '1mo');

      // Hourly should have more candles than daily for the same range
      expect(hourlyCandles.length).toBeGreaterThan(dailyCandles.length);
    });

    it('should cap at 5000 candles for performance', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Offline'));

      const candles = await service.fetchCandles('SPY', '1m', 'max');

      expect(candles.length).toBeLessThanOrEqual(5000);
    });
  });

  // ── Signal state ──────────────────────────────────────────────────

  describe('signals', () => {
    it('should start with loading=false and error=null', () => {
      expect(service.loading()).toBe(false);
      expect(service.error()).toBeNull();
    });
  });
});
