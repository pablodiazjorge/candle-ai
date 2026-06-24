/**
 * Unit tests for candle.model.ts — Yahoo Finance data parsing.
 */
import { describe, it, expect } from 'vitest';
import { candlesFromYahoo, Candle } from '../models/candle.model';

describe('candlesFromYahoo', () => {
  it('parses a complete OHLCV response correctly', () => {
    const timestamps = [1700000000, 1700086400, 1700172800];
    const quote = {
      open: [100, 102, 101],
      high: [105, 106, 104],
      low: [99, 100, 100],
      close: [102, 101, 103],
      volume: [1000000, 1200000, 900000],
    };

    const result = candlesFromYahoo(timestamps, quote);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual<Candle>({
      time: 1700000000,
      open: 100,
      high: 105,
      low: 99,
      close: 102,
      volume: 1000000,
    });
  });

  it('skips candles with null values', () => {
    const timestamps = [1700000000, 1700086400, 1700172800];
    const quote = {
      open: [100, null, 101],
      high: [105, 106, 104],
      low: [99, 100, null],
      close: [102, 101, 103],
      volume: [1000000, null, 900000],
    };

    const result = candlesFromYahoo(timestamps, quote);
    // Second candle has null open, third has null low — both should be skipped
    expect(result).toHaveLength(1);
    expect(result[0].time).toBe(1700000000);
  });

  it('handles null volume by defaulting to 0', () => {
    const timestamps = [1700000000];
    const quote = {
      open: [100],
      high: [105],
      low: [99],
      close: [102],
      volume: [null],
    };

    const result = candlesFromYahoo(timestamps, quote);
    expect(result).toHaveLength(1);
    expect(result[0].volume).toBe(0);
  });

  it('returns empty array for empty input', () => {
    const result = candlesFromYahoo([], {
      open: [],
      high: [],
      low: [],
      close: [],
      volume: [],
    });
    expect(result).toHaveLength(0);
  });

  it('returns empty array when all values are null', () => {
    const timestamps = [1700000000, 1700086400];
    const quote = {
      open: [null, null],
      high: [null, null],
      low: [null, null],
      close: [null, null],
      volume: [null, null],
    };

    const result = candlesFromYahoo(timestamps, quote);
    expect(result).toHaveLength(0);
  });

  it('handles large datasets efficiently', () => {
    const count = 1000;
    const timestamps = Array.from({ length: count }, (_, i) => 1700000000 + i * 86400);
    const quote = {
      open: Array.from({ length: count }, () => 100 + Math.random() * 10),
      high: Array.from({ length: count }, () => 105 + Math.random() * 10),
      low: Array.from({ length: count }, () => 95 + Math.random() * 10),
      close: Array.from({ length: count }, () => 100 + Math.random() * 10),
      volume: Array.from({ length: count }, () => Math.floor(Math.random() * 2000000)),
    };

    const result = candlesFromYahoo(timestamps, quote);
    expect(result).toHaveLength(count);
  });
});
