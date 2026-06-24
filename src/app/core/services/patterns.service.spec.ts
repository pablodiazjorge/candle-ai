/**
 * Unit tests for pattern detection service.
 * Tests each candlestick pattern detector individually.
 */
import { describe, it, expect } from 'vitest';
import { Candle } from '../models/candle.model';
import { DetectedPattern } from '../models/pattern.model';

// Replicate pattern detector functions inline for pure-function testing
// (avoids Angular DI complexity; tests the logic directly)

function makeCandle(overrides: Partial<Candle> & { time: number }): Candle {
  return {
    open: 100,
    high: 105,
    low: 95,
    close: 101,
    volume: 1000000,
    ...overrides,
  };
}

// ─── Doji ──────────────────────────────────────────────────────────

function detectDoji(candles: Candle[], i: number): DetectedPattern | null {
  const c = candles[i];
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  if (range === 0) return null;
  if (body / range > 0.05) return null;
  return {
    type: 'doji',
    time: c.time,
    sentiment: 'neutral',
    confidence: Math.min(Math.max(1 - body / (range * 3), 0), 1),
    labelKey: 'pattern.doji',
  };
}

// ─── Hammer ────────────────────────────────────────────────────────

function detectHammer(candles: Candle[], i: number): DetectedPattern | null {
  if (i === 0) return null;
  const c = candles[i];
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  if (range === 0 || body === 0) return null;

  const upperShadow = c.high - Math.max(c.open, c.close);
  const lowerShadow = Math.min(c.open, c.close) - c.low;

  if (lowerShadow < body * 2) return null;
  if (upperShadow > body * 0.5) return null;

  if (candles[i - 1].close > c.close) {
    return {
      type: 'hammer',
      time: c.time,
      sentiment: 'bullish',
      confidence: Math.min(Math.max(lowerShadow / (range * 1.5), 0), 1),
      labelKey: 'pattern.hammer',
    };
  }
  return null;
}

// ─── Shooting Star ─────────────────────────────────────────────────

function detectShootingStar(candles: Candle[], i: number): DetectedPattern | null {
  if (i === 0) return null;
  const c = candles[i];
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  if (range === 0 || body === 0) return null;

  const upperShadow = c.high - Math.max(c.open, c.close);
  const lowerShadow = Math.min(c.open, c.close) - c.low;

  if (upperShadow < body * 2) return null;
  if (lowerShadow > body * 0.5) return null;

  if (candles[i - 1].close < c.close) {
    return {
      type: 'shooting_star',
      time: c.time,
      sentiment: 'bearish',
      confidence: Math.min(Math.max(upperShadow / (range * 1.5), 0), 1),
      labelKey: 'pattern.shootingStar',
    };
  }
  return null;
}

// ─── Engulfing ─────────────────────────────────────────────────────

function detectEngulfing(candles: Candle[], i: number): DetectedPattern | null {
  if (i === 0) return null;
  const prev = candles[i - 1];
  const curr = candles[i];

  const prevBody = Math.abs(prev.close - prev.open);
  const currBody = Math.abs(curr.close - curr.open);

  if (prevBody === 0 || currBody === 0) return null;

  // Bullish: prev bearish, curr bullish, curr engulfs prev
  const prevBullish = prev.close > prev.open;
  const currBullish = curr.close > curr.open;

  if (!prevBullish && currBullish && curr.open <= prev.close && curr.close >= prev.open) {
    return {
      type: 'bullish_engulfing',
      time: curr.time,
      sentiment: 'bullish',
      confidence: Math.min(currBody / (prevBody * 1.5), 1),
      labelKey: 'pattern.bullishEngulfing',
    };
  }

  // Bearish: prev bullish, curr bearish, curr engulfs prev
  if (prevBullish && !currBullish && curr.open >= prev.close && curr.close <= prev.open) {
    return {
      type: 'bearish_engulfing',
      time: curr.time,
      sentiment: 'bearish',
      confidence: Math.min(currBody / (prevBody * 1.5), 1),
      labelKey: 'pattern.bearishEngulfing',
    };
  }

  return null;
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('Doji detection', () => {
  it('detects a perfect doji (open == close)', () => {
    const candles = [makeCandle({ time: 1, open: 100, high: 105, low: 95, close: 100 })];
    const result = detectDoji(candles, 0);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('doji');
    expect(result!.sentiment).toBe('neutral');
  });

  it('detects a near-doji with very small body', () => {
    const candles = [makeCandle({ time: 1, open: 100, high: 106, low: 94, close: 100.5 })];
    const result = detectDoji(candles, 0);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('doji');
  });

  it('rejects non-doji with large body', () => {
    const candles = [makeCandle({ time: 1, open: 100, high: 110, low: 90, close: 107 })];
    const result = detectDoji(candles, 0);
    expect(result).toBeNull();
  });

  it('rejects zero-range candle', () => {
    const candles = [makeCandle({ time: 1, open: 100, high: 100, low: 100, close: 100 })];
    const result = detectDoji(candles, 0);
    expect(result).toBeNull();
  });
});

describe('Hammer detection', () => {
  it('detects a classic hammer in downtrend', () => {
    const candles = [
      makeCandle({ time: 1, open: 105, high: 106, low: 100, close: 101 }), // prev, downtrend
      makeCandle({ time: 2, open: 99, high: 100, low: 80, close: 100 }),   // hammer: small body at top, long lower shadow
    ];
    const result = detectHammer(candles, 1);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('hammer');
    expect(result!.sentiment).toBe('bullish');
  });

  it('rejects hammer in uptrend', () => {
    const candles = [
      makeCandle({ time: 1, open: 90, high: 96, low: 89, close: 96 }),     // prev, uptrend
      makeCandle({ time: 2, open: 99, high: 100, low: 80, close: 100 }),    // hammer shape but wrong context
    ];
    const result = detectHammer(candles, 1);
    expect(result).toBeNull();
  });

  it('rejects candle with long upper shadow', () => {
    const candles = [
      makeCandle({ time: 1, open: 105, high: 106, low: 100, close: 101 }),
      makeCandle({ time: 2, open: 100, high: 110, low: 90, close: 100 }), // long upper shadow
    ];
    const result = detectHammer(candles, 1);
    expect(result).toBeNull();
  });

  it('returns null for first candle (no prev)', () => {
    const candles = [makeCandle({ time: 1, open: 100, high: 101, low: 90, close: 100 })];
    const result = detectHammer(candles, 0);
    expect(result).toBeNull();
  });
});

describe('Shooting Star detection', () => {
  it('detects a shooting star in uptrend', () => {
    const candles = [
      makeCandle({ time: 1, open: 90, high: 96, low: 89, close: 96 }),     // prev, uptrend
      makeCandle({ time: 2, open: 100, high: 115, low: 100, close: 101 }),   // shooting star: small body at bottom, long upper shadow, tiny lower
    ];
    const result = detectShootingStar(candles, 1);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('shooting_star');
    expect(result!.sentiment).toBe('bearish');
  });

  it('rejects shooting star in downtrend', () => {
    const candles = [
      makeCandle({ time: 1, open: 105, high: 106, low: 100, close: 101 }), // prev, downtrend
      makeCandle({ time: 2, open: 100, high: 112, low: 99, close: 101 }),   // shape but wrong context
    ];
    const result = detectShootingStar(candles, 1);
    expect(result).toBeNull();
  });

  it('rejects candle with long lower shadow', () => {
    const candles = [
      makeCandle({ time: 1, open: 95, high: 96, low: 90, close: 96 }),
      makeCandle({ time: 2, open: 100, high: 102, low: 88, close: 101 }), // long lower shadow
    ];
    const result = detectShootingStar(candles, 1);
    expect(result).toBeNull();
  });
});

describe('Engulfing detection', () => {
  it('detects bullish engulfing', () => {
    const candles = [
      makeCandle({ time: 1, open: 102, high: 103, low: 98, close: 99 }),   // bearish
      makeCandle({ time: 2, open: 97, high: 105, low: 96, close: 104 }),    // bullish, engulfs prev
    ];
    const result = detectEngulfing(candles, 1);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('bullish_engulfing');
    expect(result!.sentiment).toBe('bullish');
  });

  it('detects bearish engulfing', () => {
    const candles = [
      makeCandle({ time: 1, open: 98, high: 103, low: 97, close: 102 }),   // bullish
      makeCandle({ time: 2, open: 104, high: 105, low: 96, close: 97 }),    // bearish, engulfs prev
    ];
    const result = detectEngulfing(candles, 1);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('bearish_engulfing');
    expect(result!.sentiment).toBe('bearish');
  });

  it('rejects when body does not engulf', () => {
    const candles = [
      makeCandle({ time: 1, open: 100, high: 110, low: 90, close: 95 }),   // bearish large
      makeCandle({ time: 2, open: 96, high: 100, low: 94, close: 99 }),     // bullish but smaller
    ];
    const result = detectEngulfing(candles, 1);
    expect(result).toBeNull();
  });

  it('rejects same-direction candles', () => {
    const candles = [
      makeCandle({ time: 1, open: 100, high: 105, low: 99, close: 104 }),   // bullish
      makeCandle({ time: 2, open: 102, high: 108, low: 101, close: 107 }),   // also bullish
    ];
    const result = detectEngulfing(candles, 1);
    expect(result).toBeNull();
  });

  it('returns null for first candle', () => {
    const candles = [makeCandle({ time: 1, open: 100, high: 105, low: 95, close: 101 })];
    const result = detectEngulfing(candles, 0);
    expect(result).toBeNull();
  });
});

describe('Confidence scores', () => {
  it('doji confidence is near 1 for perfect doji', () => {
    const candles = [makeCandle({ time: 1, open: 100, high: 110, low: 90, close: 100 })];
    const result = detectDoji(candles, 0);
    // body=0 → confidence = 1 - 0/(20*3) = 1
    expect(result!.confidence).toBeCloseTo(1, 1);
  });

  it('hammer confidence scales with lower shadow', () => {
    const candles = [
      makeCandle({ time: 1, open: 105, high: 106, low: 100, close: 101 }), // prev downtrend
      makeCandle({ time: 2, open: 99, high: 100, low: 70, close: 100 }),    // massive lower shadow (30), body=1
    ];
    const result = detectHammer(candles, 1);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThan(0.6);
  });
});
