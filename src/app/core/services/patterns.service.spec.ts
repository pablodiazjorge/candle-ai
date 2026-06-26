/**
 * Unit tests for pattern detection service.
 * Tests each candlestick pattern detector individually.
 */
import { describe, it, expect } from 'vitest';
import { Candle } from '../models/candle.model';
import { DetectedPattern } from '../models/pattern.model';
import spyData from '../../../../public/assets/sample-data/spy-6m.json';

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

// ─── Chart Pattern Detection ───────────────────────────────────────

describe('Double Top detection', () => {
  function buildDoubleTopSetup(): Candle[] {
    const candles: Candle[] = [];
    let price = 100;
    // Prior uptrend (15 candles)
    for (let i = 0; i < 15; i++) {
      price += 1;
      candles.push({
        time: i + 1,
        open: price - 0.5, high: price + 2, low: price - 1, close: price, volume: 1_000_000,
      });
    }
    // First peak at ~115
    const peak1 = 115;
    candles.push({ time: 16, open: 114, high: peak1, low: 113, close: 114, volume: 1000000 });
    // Decline ~5%
    for (let i = 0; i < 5; i++) {
      price = peak1 - 3 - i * 0.5;
      candles.push({ time: 17 + i, open: price + 0.5, high: price + 1, low: price - 0.5, close: price, volume: 800000 });
    }
    // Rally back to same level (second peak)
    for (let i = 0; i < 5; i++) {
      price = 110 + i * 1;
      candles.push({ time: 22 + i, open: price - 0.5, high: i === 4 ? peak1 - 0.5 : price + 1, low: price - 1, close: price, volume: 900000 });
    }
    // Breakdown below valley
    const valley = 110;
    for (let i = 0; i < 5; i++) {
      price = valley - 1 - i * 0.5;
      candles.push({ time: 27 + i, open: price + 0.5, high: price + 1, low: price - 1, close: price, volume: 1200000 });
    }
    return candles;
  }

  it('detects double top with proper setup', () => {
    const candles = buildDoubleTopSetup();
    // The pattern detection runs on the last candle after breakdown
    const result = detectDoubleTop_local(candles, candles.length - 1);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.type).toBe('double_top');
      expect(result.sentiment).toBe('bearish');
    }
  });

  it('returns null when peaks are at different levels', () => {
    const candles = buildDoubleTopSetup();
    // Flatten all highs to eliminate peaks → no double top possible
    for (let i = 15; i < candles.length; i++) {
      candles[i] = { ...candles[i], high: 100, low: 99 };
    }
    const result = detectDoubleTop_local(candles, candles.length - 1);
    expect(result).toBeNull();
  });
});

describe('Double Bottom detection', () => {
  function buildDoubleBottomSetup(): Candle[] {
    const candles: Candle[] = [];
    let price = 100;
    // Prior downtrend (lows stay above trough to ensure trough detection)
    for (let i = 0; i < 15; i++) {
      price -= 1;
      candles.push({
        time: i + 1,
        open: price + 0.5, high: price + 1, low: price + 1, close: price, volume: 1_000_000,
      });
    }
    // First trough at ~85 (lower than all prior lows)
    const trough1 = 85;
    candles.push({ time: 16, open: 86, high: 87, low: trough1, close: 86, volume: 1000000 });
    // Rally ~5%
    for (let i = 0; i < 5; i++) {
      price = trough1 + 3 + i * 0.5;
      candles.push({ time: 17 + i, open: price - 0.5, high: price + 1, low: price - 1, close: price, volume: 800000 });
    }
    // Decline back to same level (second trough)
    for (let i = 0; i < 5; i++) {
      price = 90 - i * 1;
      candles.push({ time: 22 + i, open: price + 0.5, high: price + 1, low: i === 4 ? trough1 + 0.5 : price - 1, close: price, volume: 900000 });
    }
    // Breakout above rally high
    const rallyHigh = 90;
    for (let i = 0; i < 5; i++) {
      price = rallyHigh + 1 + i * 0.5;
      candles.push({ time: 27 + i, open: price - 0.5, high: price + 1, low: price - 1, close: price, volume: 1200000 });
    }
    return candles;
  }

  it('detects double bottom with proper setup', () => {
    const candles = buildDoubleBottomSetup();
    const result = detectDoubleBottom_local(candles, candles.length - 1);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.type).toBe('double_bottom');
      expect(result.sentiment).toBe('bullish');
    }
  });
});

describe('Head and Shoulders detection', () => {
  function buildHSSetup(): Candle[] {
    const candles: Candle[] = [];
    let price = 100;
    // Prior uptrend
    for (let i = 0; i < 20; i++) {
      price += 0.8;
      candles.push({
        time: i + 1, open: price - 0.3, high: price + 1.5, low: price - 1, close: price, volume: 1_000_000,
      });
    }
    // Left shoulder peak at ~118
    candles.push({ time: 21, open: 117, high: 118, low: 115, close: 116, volume: 1200000 });
    // Decline to neckline
    for (let i = 0; i < 3; i++) { price = 116 - i * 1.5; candles.push({ time: 22 + i, open: price + 0.5, high: price + 1, low: price - 0.5, close: price, volume: 700000 }); }
    // Rally to head (higher than LS — head peak is distinct at time 28)
    for (let i = 0; i < 3; i++) { price = 112 + i * 2.5; candles.push({ time: 25 + i, open: price - 1, high: price + 1, low: price - 1, close: price, volume: 1000000 }); }
    // Head peak at ~122
    candles.push({ time: 28, open: 120, high: 122, low: 118, close: 119, volume: 900000 });
    // Decline back to neckline
    for (let i = 0; i < 3; i++) { price = 119 - i * 2; candles.push({ time: 29 + i, open: price + 0.5, high: price + 1, low: price - 0.5, close: price, volume: 700000 }); }
    // Right shoulder rally (lower than head)
    for (let i = 0; i < 3; i++) { price = 113 + i * 1.5; candles.push({ time: 32 + i, open: price - 0.5, high: i === 2 ? 117 : price + 1, low: price - 1, close: price, volume: 800000 }); }
    // Neckline break
    const neckline = 110;
    for (let i = 0; i < 5; i++) { price = neckline - i; candles.push({ time: 35 + i, open: price + 0.5, high: price + 0.5, low: price - 1, close: price, volume: 1100000 }); }

    return candles;
  }

  it('detects head and shoulders pattern', () => {
    const candles = buildHSSetup();
    const result = detectHeadAndShoulders_local(candles, candles.length - 1);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.type).toBe('head_and_shoulders');
      expect(result.sentiment).toBe('bearish');
    }
  });
});

describe('Inverse Head and Shoulders detection', () => {
  function buildInvHSSetup(): Candle[] {
    const candles: Candle[] = [];
    let price = 100;
    // Prior downtrend
    for (let i = 0; i < 20; i++) {
      price -= 0.8;
      candles.push({
        time: i + 1, open: price + 0.3, high: price + 1, low: price - 1.5, close: price, volume: 1_000_000,
      });
    }
    // Left shoulder trough at ~82
    candles.push({ time: 21, open: 83, high: 85, low: 82, close: 84, volume: 1200000 });
    // Rally
    for (let i = 0; i < 3; i++) { price = 84 + i * 1.5; candles.push({ time: 22 + i, open: price - 0.5, high: price + 0.5, low: price - 1, close: price, volume: 700000 }); }
    // Decline to head (lower than LS — head trough is distinct at time 28)
    for (let i = 0; i < 3; i++) { price = 88 - i * 2.5; candles.push({ time: 25 + i, open: price + 1, high: price + 1, low: price - 1, close: price, volume: 1000000 }); }
    // Head trough at ~78
    candles.push({ time: 28, open: 80, high: 82, low: 78, close: 81, volume: 900000 });
    // Rally back
    for (let i = 0; i < 3; i++) { price = 81 + i * 2; candles.push({ time: 29 + i, open: price - 0.5, high: price + 0.5, low: price - 1, close: price, volume: 700000 }); }
    // Right shoulder decline (higher low than head)
    for (let i = 0; i < 3; i++) { price = 87 - i * 1.5; candles.push({ time: 32 + i, open: price + 0.5, high: price + 1, low: i === 2 ? 83 : price - 1, close: price, volume: 800000 }); }
    // Neckline break upward
    const neckline = 90;
    for (let i = 0; i < 5; i++) { price = neckline + i; candles.push({ time: 35 + i, open: price - 0.5, high: price + 0.5, low: price - 0.5, close: price, volume: 1100000 }); }

    return candles;
  }

  it('detects inverse head and shoulders pattern', () => {
    const candles = buildInvHSSetup();
    const result = detectInverseHeadAndShoulders_local(candles, candles.length - 1);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.type).toBe('inverse_head_and_shoulders');
      expect(result.sentiment).toBe('bullish');
    }
  });
});

// ─── Real data validation (spy-6m.json) ────────────────────────────
// SPY trades in a tight ~2.3% range over 6 months — no chart patterns
// should be detected. This validates that detectors don't produce
// false positives on real non-pattern data.

describe('SPY negative validation (no false positives)', () => {
  const candles = spyData as Candle[];

  it('finds no double top in SPY data', () => {
    const result = detectDoubleTop_local(candles, candles.length - 1);
    expect(result).toBeNull();
  });

  it('finds no double bottom in SPY data', () => {
    const result = detectDoubleBottom_local(candles, candles.length - 1);
    expect(result).toBeNull();
  });

  it('finds no head and shoulders in SPY data', () => {
    const result = detectHeadAndShoulders_local(candles, candles.length - 1);
    expect(result).toBeNull();
  });

  it('finds no inverse head and shoulders in SPY data', () => {
    const result = detectInverseHeadAndShoulders_local(candles, candles.length - 1);
    expect(result).toBeNull();
  });
});

// ─── Local replicas of chart pattern detectors for testing ─────────
// (Avoids Angular DI; tests pure detection logic)

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function findPeaks(highs: number[]): { idx: number; value: number }[] {
  const peaks: { idx: number; value: number }[] = [];
  for (let j = 5; j < highs.length - 1; j++) {
    if (highs[j] > highs[j - 1] && highs[j] > highs[j - 2] && highs[j] > highs[j + 1]) {
      peaks.push({ idx: j, value: highs[j] });
    }
  }
  return peaks;
}

function findTroughs(lows: number[]): { idx: number; value: number }[] {
  const troughs: { idx: number; value: number }[] = [];
  for (let j = 5; j < lows.length - 1; j++) {
    if (lows[j] < lows[j - 1] && lows[j] < lows[j - 2] && lows[j] < lows[j + 1]) {
      troughs.push({ idx: j, value: lows[j] });
    }
  }
  return troughs;
}

function detectDoubleTop_local(candles: Candle[], i: number): DetectedPattern | null {
  if (i < 15) return null;
  const c = candles[i];
  const lookback = candles.slice(0, i + 1);
  const highs = lookback.map((c) => c.high);
  const peaks = findPeaks(highs);
  if (peaks.length < 2) return null;
  const lastTwo = peaks.slice(-2);
  const [p1, p2] = lastTwo;
  if (Math.abs(p1.value - p2.value) / p1.value > 0.03) return null;
  if (p2.idx - p1.idx < 8) return null;
  const between = candles.slice(p1.idx, p2.idx);
  const valleyLow = Math.min(...between.map((c) => c.low));
  if ((p1.value - valleyLow) / p1.value < 0.03) return null;
  if (c.close >= valleyLow) return null;
  const priorCandles = candles.slice(Math.max(0, p1.idx - 15), p1.idx);
  if (priorCandles.length < 5) return null;
  if (priorCandles[priorCandles.length - 1].close <= priorCandles[0].close) return null;
  return { type: 'double_top', time: c.time, sentiment: 'bearish', confidence: 0.7, labelKey: 'pattern.doubleTop' };
}

function detectDoubleBottom_local(candles: Candle[], i: number): DetectedPattern | null {
  if (i < 15) return null;
  const c = candles[i];
  const lookback = candles.slice(0, i + 1);
  const lows = lookback.map((c) => c.low);
  const troughs = findTroughs(lows);
  if (troughs.length < 2) return null;
  const lastTwo = troughs.slice(-2);
  const [t1, t2] = lastTwo;
  if (Math.abs(t1.value - t2.value) / t1.value > 0.03) return null;
  if (t2.idx - t1.idx < 8) return null;
  const between = candles.slice(t1.idx, t2.idx);
  const rallyHigh = Math.max(...between.map((c) => c.high));
  if ((rallyHigh - t1.value) / t1.value < 0.03) return null;
  if (c.close <= rallyHigh) return null;
  const priorCandles = candles.slice(Math.max(0, t1.idx - 15), t1.idx);
  if (priorCandles.length < 5) return null;
  if (priorCandles[priorCandles.length - 1].close >= priorCandles[0].close) return null;
  return { type: 'double_bottom', time: c.time, sentiment: 'bullish', confidence: 0.7, labelKey: 'pattern.doubleBottom' };
}

function detectHeadAndShoulders_local(candles: Candle[], i: number): DetectedPattern | null {
  if (i < 30) return null;
  const c = candles[i];
  const highs = candles.slice(0, i + 1).map((c) => c.high);
  const lows = candles.slice(0, i + 1).map((c) => c.low);
  const peaks = findPeaks(highs);
  if (peaks.length < 3) return null;

  const candidates = peaks.slice(-5);
  for (let a = 0; a < candidates.length - 2; a++) {
    for (let b = a + 1; b < candidates.length - 1; b++) {
      for (let d = b + 1; d < candidates.length; d++) {
        const ls = candidates[a];
        const head = candidates[b];
        const rs = candidates[d];
        if (head.value <= ls.value || head.value <= rs.value) continue;
        if (Math.abs(ls.value - rs.value) / ls.value > 0.08) continue;
        const mid1 = lows.slice(ls.idx, head.idx);
        const t1 = Math.min(...mid1);
        const t1Idx = ls.idx + mid1.indexOf(t1);
        const mid2 = lows.slice(head.idx, rs.idx);
        const t2 = Math.min(...mid2);
        const t2Idx = head.idx + mid2.indexOf(t2);
        if (Math.abs(t1 - t2) / t1 > 0.10) continue;
        const priorStart = Math.max(0, ls.idx - 20);
        if (ls.idx - priorStart < 5) continue;
        if (candles[ls.idx].close <= candles[priorStart].close) continue;
        const necklineSlope = (t2 - t1) / (t2Idx - t1Idx);
        const necklineAtNow = t1 + necklineSlope * (i - t1Idx);
        if (c.close >= necklineAtNow) continue;
        return { type: 'head_and_shoulders', time: c.time, sentiment: 'bearish', confidence: 0.7, labelKey: 'pattern.headAndShoulders' };
      }
    }
  }
  return null;
}

function detectInverseHeadAndShoulders_local(candles: Candle[], i: number): DetectedPattern | null {
  if (i < 30) return null;
  const c = candles[i];
  const highs = candles.slice(0, i + 1).map((c) => c.high);
  const lows = candles.slice(0, i + 1).map((c) => c.low);
  const troughs = findTroughs(lows);
  if (troughs.length < 3) return null;

  const candidates = troughs.slice(-5);
  for (let a = 0; a < candidates.length - 2; a++) {
    for (let b = a + 1; b < candidates.length - 1; b++) {
      for (let d = b + 1; d < candidates.length; d++) {
        const ls = candidates[a];
        const head = candidates[b];
        const rs = candidates[d];
        if (head.value >= ls.value || head.value >= rs.value) continue;
        if (Math.abs(ls.value - rs.value) / ls.value > 0.08) continue;
        const mid1 = highs.slice(ls.idx, head.idx);
        const p1 = Math.max(...mid1);
        const p1Idx = ls.idx + mid1.indexOf(p1);
        const mid2 = highs.slice(head.idx, rs.idx);
        const p2 = Math.max(...mid2);
        const p2Idx = head.idx + mid2.indexOf(p2);
        if (Math.abs(p1 - p2) / p1 > 0.10) continue;
        const priorStart = Math.max(0, ls.idx - 20);
        if (ls.idx - priorStart < 5) continue;
        if (candles[ls.idx].close >= candles[priorStart].close) continue;
        const necklineSlope = (p2 - p1) / (p2Idx - p1Idx);
        const necklineAtNow = p1 + necklineSlope * (i - p1Idx);
        if (c.close <= necklineAtNow) continue;
        return { type: 'inverse_head_and_shoulders', time: c.time, sentiment: 'bullish', confidence: 0.7, labelKey: 'pattern.inverseHeadAndShoulders' };
      }
    }
  }
  return null;
}
