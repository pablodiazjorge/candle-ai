import { Injectable } from '@angular/core';
import { Candle } from '../models/candle.model';
import { DetectedPattern, PatternType } from '../models/pattern.model';

/**
 * Pure-function candlestick pattern detectors.
 * Each function receives the candle array and the index to check.
 * Returns a DetectedPattern if the pattern completes at that index, or null.
 */

// ─── Doji ──────────────────────────────────────────────────────────

function detectDoji(candles: Candle[], i: number): DetectedPattern | null {
  const c = candles[i];
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  if (range === 0) return null;
  // Body is <= 5% of the total range
  if (body / range > 0.05) return null;
  return {
    type: 'doji',
    time: c.time,
    sentiment: 'neutral',
    confidence: clamp(1 - body / (range * 3), 0, 1),
    labelKey: 'pattern.doji',
  };
}

// ─── Hammer ────────────────────────────────────────────────────────

function detectHammer(candles: Candle[], i: number): DetectedPattern | null {
  const c = candles[i];
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  if (range === 0 || body === 0) return null;

  const upperShadow = c.high - Math.max(c.open, c.close);
  const lowerShadow = Math.min(c.open, c.close) - c.low;

  // Small body at upper part of range, long lower shadow (>= 2x body), tiny upper shadow
  if (lowerShadow < body * 2) return null;
  if (upperShadow > body * 0.5) return null;

  // Must appear after a downtrend (previous candle close is lower)
  if (i > 0 && candles[i - 1].close > c.close) {
    return {
      type: 'hammer',
      time: c.time,
      sentiment: 'bullish',
      confidence: clamp(lowerShadow / (range * 1.5), 0, 1),
      labelKey: 'pattern.hammer',
    };
  }
  return null;
}

// ─── Shooting Star ─────────────────────────────────────────────────

function detectShootingStar(candles: Candle[], i: number): DetectedPattern | null {
  const c = candles[i];
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  if (range === 0 || body === 0) return null;

  const upperShadow = c.high - Math.max(c.open, c.close);
  const lowerShadow = Math.min(c.open, c.close) - c.low;

  // Small body at lower part, long upper shadow (>= 2x body), tiny lower shadow
  if (upperShadow < body * 2) return null;
  if (lowerShadow > body * 0.5) return null;

  // Must appear after an uptrend
  if (i > 0 && candles[i - 1].close < c.close) {
    return {
      type: 'shooting_star',
      time: c.time,
      sentiment: 'bearish',
      confidence: clamp(upperShadow / (range * 1.5), 0, 1),
      labelKey: 'pattern.shootingStar',
    };
  }
  return null;
}

// ─── Bullish Engulfing ─────────────────────────────────────────────

function detectBullishEngulfing(candles: Candle[], i: number): DetectedPattern | null {
  if (i < 1) return null;
  const prev = candles[i - 1];
  const curr = candles[i];

  // Previous is bearish, current is bullish, current body engulfs previous body
  if (prev.close >= prev.open) return null; // prev not bearish
  if (curr.close <= curr.open) return null; // curr not bullish

  if (curr.open > prev.close || curr.close < prev.open) return null;
  const engulfRatio = Math.min(
    (prev.open - curr.open) / (prev.open - prev.close),
    (curr.close - prev.close) / (prev.open - prev.close),
  );

  return {
    type: 'bullish_engulfing',
    time: curr.time,
    sentiment: 'bullish',
    confidence: clamp(engulfRatio, 0, 1),
    labelKey: 'pattern.bullishEngulfing',
  };
}

// ─── Bearish Engulfing ─────────────────────────────────────────────

function detectBearishEngulfing(candles: Candle[], i: number): DetectedPattern | null {
  if (i < 1) return null;
  const prev = candles[i - 1];
  const curr = candles[i];

  // Previous is bullish, current is bearish, current body engulfs previous body
  if (prev.close <= prev.open) return null;
  if (curr.close >= curr.open) return null;

  if (curr.open < prev.close || curr.close > prev.open) return null;
  const engulfRatio = Math.min(
    (curr.open - prev.open) / (prev.close - prev.open),
    (prev.close - curr.close) / (prev.close - prev.open),
  );

  return {
    type: 'bearish_engulfing',
    time: curr.time,
    sentiment: 'bearish',
    confidence: clamp(engulfRatio, 0, 1),
    labelKey: 'pattern.bearishEngulfing',
  };
}

// ─── Morning Star ──────────────────────────────────────────────────

function detectMorningStar(candles: Candle[], i: number): DetectedPattern | null {
  if (i < 2) return null;
  const c1 = candles[i - 2]; // large bearish
  const c2 = candles[i - 1]; // small body (doji-like)
  const c3 = candles[i];     // large bullish

  // C1: bearish with significant body
  if (c1.close >= c1.open) return null;
  const body1 = c1.open - c1.close;
  if (body1 < avgBody(candles, i - 2)) return null;

  // C2: small body (doji-like), gaps below c1 close
  const body2 = Math.abs(c2.close - c2.open);
  if (body2 > body1 * 0.5) return null;

  // C3: bullish, closes above midpoint of c1 body
  if (c3.close <= c3.open) return null;
  const c1Mid = (c1.open + c1.close) / 2;
  if (c3.close < c1Mid) return null;

  return {
    type: 'morning_star',
    time: c3.time,
    sentiment: 'bullish',
    confidence: clamp((c3.close - c1Mid) / body1, 0, 1),
    labelKey: 'pattern.morningStar',
  };
}

// ─── Evening Star ──────────────────────────────────────────────────

function detectEveningStar(candles: Candle[], i: number): DetectedPattern | null {
  if (i < 2) return null;
  const c1 = candles[i - 2]; // large bullish
  const c2 = candles[i - 1]; // small body
  const c3 = candles[i];     // large bearish

  if (c1.close <= c1.open) return null;
  const body1 = c1.close - c1.open;
  if (body1 < avgBody(candles, i - 2)) return null;

  const body2 = Math.abs(c2.close - c2.open);
  if (body2 > body1 * 0.5) return null;

  if (c3.close >= c3.open) return null;
  const c1Mid = (c1.open + c1.close) / 2;
  if (c3.close > c1Mid) return null;

  return {
    type: 'evening_star',
    time: c3.time,
    sentiment: 'bearish',
    confidence: clamp((c1Mid - c3.close) / body1, 0, 1),
    labelKey: 'pattern.eveningStar',
  };
}

// ─── Bullish Harami ────────────────────────────────────────────────

function detectBullishHarami(candles: Candle[], i: number): DetectedPattern | null {
  if (i < 1) return null;
  const prev = candles[i - 1];
  const curr = candles[i];

  // Previous: large bearish body
  if (prev.close >= prev.open) return null;
  const prevBody = prev.open - prev.close;

  // Current: small bullish body INSIDE previous body range
  if (curr.close <= curr.open) return null;
  const currBody = curr.close - curr.open;

  if (curr.open < prev.close || curr.close > prev.open) return null;
  if (currBody > prevBody * 0.6) return null;

  return {
    type: 'bullish_harami',
    time: curr.time,
    sentiment: 'bullish',
    confidence: clamp(1 - currBody / prevBody, 0, 1),
    labelKey: 'pattern.bullishHarami',
  };
}

// ─── Bearish Harami ────────────────────────────────────────────────

function detectBearishHarami(candles: Candle[], i: number): DetectedPattern | null {
  if (i < 1) return null;
  const prev = candles[i - 1];
  const curr = candles[i];

  if (prev.close <= prev.open) return null;
  const prevBody = prev.close - prev.open;

  if (curr.close >= curr.open) return null;
  const currBody = curr.open - curr.close;

  if (curr.open > prev.close || curr.close < prev.open) return null;
  if (currBody > prevBody * 0.6) return null;

  return {
    type: 'bearish_harami',
    time: curr.time,
    sentiment: 'bearish',
    confidence: clamp(1 - currBody / prevBody, 0, 1),
    labelKey: 'pattern.bearishHarami',
  };
}

// ─── Three White Soldiers ──────────────────────────────────────────

function detectThreeWhiteSoldiers(candles: Candle[], i: number): DetectedPattern | null {
  if (i < 2) return null;
  const c1 = candles[i - 2];
  const c2 = candles[i - 1];
  const c3 = candles[i];

  // All three must be bullish with higher closes
  if (c1.close <= c1.open) return null;
  if (c2.close <= c2.open) return null;
  if (c3.close <= c3.open) return null;
  if (c2.close <= c1.close) return null;
  if (c3.close <= c2.close) return null;

  // Each opens within the previous body
  if (c2.open > c1.close || c2.open < c1.open) return null;
  if (c3.open > c2.close || c3.open < c2.open) return null;

  const totalGain = c3.close - c1.open;
  if (totalGain <= 0) return null;

  return {
    type: 'three_white_soldiers',
    time: c3.time,
    sentiment: 'bullish',
    confidence: clamp(totalGain / (c1.close - c1.open) / 3, 0, 1),
    labelKey: 'pattern.threeWhiteSoldiers',
  };
}

// ─── Three Black Crows ─────────────────────────────────────────────

function detectThreeBlackCrows(candles: Candle[], i: number): DetectedPattern | null {
  if (i < 2) return null;
  const c1 = candles[i - 2];
  const c2 = candles[i - 1];
  const c3 = candles[i];

  if (c1.close >= c1.open) return null;
  if (c2.close >= c2.open) return null;
  if (c3.close >= c3.open) return null;
  if (c2.close >= c1.close) return null;
  if (c3.close >= c2.close) return null;

  if (c2.open < c1.close || c2.open > c1.open) return null;
  if (c3.open < c2.close || c3.open > c2.open) return null;

  const totalLoss = c1.open - c3.close;
  if (totalLoss <= 0) return null;

  return {
    type: 'three_black_crows',
    time: c3.time,
    sentiment: 'bearish',
    confidence: clamp(totalLoss / (c1.open - c1.close) / 3, 0, 1),
    labelKey: 'pattern.threeBlackCrows',
  };
}

// ─── Helpers ───────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function avgBody(candles: Candle[], idx: number, lookback = 10): number {
  let sum = 0;
  let count = 0;
  const start = Math.max(0, idx - lookback);
  for (let j = start; j < idx; j++) {
    sum += Math.abs(candles[j].close - candles[j].open);
    count++;
  }
  return count > 0 ? sum / count : 0;
}

// ─── Detector registry ─────────────────────────────────────────────

type DetectorFn = (candles: Candle[], i: number) => DetectedPattern | null;

const DETECTORS: DetectorFn[] = [
  detectDoji,
  detectHammer,
  detectShootingStar,
  detectBullishEngulfing,
  detectBearishEngulfing,
  detectMorningStar,
  detectEveningStar,
  detectBullishHarami,
  detectBearishHarami,
  detectThreeWhiteSoldiers,
  detectThreeBlackCrows,
];

// ─── Chart Pattern Detectors ───────────────────────────────────────

type ChartDetectorFn = (candles: Candle[], i: number) => DetectedPattern | null;

function detectDoubleTop(candles: Candle[], i: number): DetectedPattern | null {
  // Need at least 15 candles before to establish a prior uptrend + peak separation
  if (i < 15) return null;
  const c = candles[i];

  // Find two peaks in the lookback window
  const lookback = candles.slice(0, i + 1);
  const highs = lookback.map((c) => c.high);

  // Find local maxima (potential peaks)
  const peaks: { idx: number; value: number }[] = [];
  for (let j = 5; j < highs.length - 1; j++) {
    const isPeak = highs[j] > highs[j - 1] && highs[j] > highs[j - 2] &&
                   highs[j] > highs[j + 1];
    if (isPeak) peaks.push({ idx: j, value: highs[j] });
  }

  if (peaks.length < 2) return null;
  const lastTwo = peaks.slice(-2);
  const [p1, p2] = lastTwo;

  // Peaks must be at similar levels (±3%)
  if (Math.abs(p1.value - p2.value) / p1.value > 0.03) return null;

  // At least 8 candles between peaks
  if (p2.idx - p1.idx < 8) return null;

  // Must be a trough between the peaks (at least 3% retracement)
  const between = candles.slice(p1.idx, p2.idx);
  const valleyLow = Math.min(...between.map((c) => c.low));
  const retracement = (p1.value - valleyLow) / p1.value;
  if (retracement < 0.03) return null;

  // Confirmation: current close is below the valley
  if (c.close >= valleyLow) return null;

  // Prior trend must be up
  const priorCandles = candles.slice(Math.max(0, p1.idx - 15), p1.idx);
  if (priorCandles.length < 5) return null;
  const priorStart = priorCandles[0].close;
  const priorEnd = priorCandles[priorCandles.length - 1].close;
  if (priorEnd <= priorStart) return null;

  const confidence = clamp(
    Math.min(retracement * 3, (p1.value - c.close) / p1.value * 5),
    0,
    1,
  );

  return {
    type: 'double_top',
    time: c.time,
    sentiment: 'bearish',
    confidence,
    labelKey: 'pattern.doubleTop',
  };
}

function detectDoubleBottom(candles: Candle[], i: number): DetectedPattern | null {
  if (i < 15) return null;
  const c = candles[i];

  const lookback = candles.slice(0, i + 1);
  const lows = lookback.map((c) => c.low);

  const troughs: { idx: number; value: number }[] = [];
  for (let j = 5; j < lows.length - 1; j++) {
    const isTrough = lows[j] < lows[j - 1] && lows[j] < lows[j - 2] &&
                     lows[j] < lows[j + 1];
    if (isTrough) troughs.push({ idx: j, value: lows[j] });
  }

  if (troughs.length < 2) return null;
  const lastTwo = troughs.slice(-2);
  const [t1, t2] = lastTwo;

  if (Math.abs(t1.value - t2.value) / t1.value > 0.03) return null;
  if (t2.idx - t1.idx < 8) return null;

  const between = candles.slice(t1.idx, t2.idx);
  const rallyHigh = Math.max(...between.map((c) => c.high));
  const rally = (rallyHigh - t1.value) / t1.value;
  if (rally < 0.03) return null;

  // Confirmation: current close is above the rally high
  if (c.close <= rallyHigh) return null;

  // Prior trend must be down
  const priorCandles = candles.slice(Math.max(0, t1.idx - 15), t1.idx);
  if (priorCandles.length < 5) return null;
  const priorStart = priorCandles[0].close;
  const priorEnd = priorCandles[priorCandles.length - 1].close;
  if (priorEnd >= priorStart) return null;

  const confidence = clamp(
    Math.min(rally * 3, (c.close - t1.value) / t1.value * 5),
    0,
    1,
  );

  return {
    type: 'double_bottom',
    time: c.time,
    sentiment: 'bullish',
    confidence,
    labelKey: 'pattern.doubleBottom',
  };
}

const CHART_DETECTORS: ChartDetectorFn[] = [
  detectDoubleTop,
  detectDoubleBottom,
];

// ─── Service ───────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class PatternsService {
  /**
   * Detect all candlestick patterns in the given candle array.
   * Returns detected patterns sorted by time.
   */
  detectAll(candles: Candle[]): DetectedPattern[] {
    if (candles.length < 3) return [];

    const patterns: DetectedPattern[] = [];

    for (let i = 2; i < candles.length; i++) {
      for (const detector of DETECTORS) {
        const result = detector(candles, i);
        if (result && result.confidence >= 0.5) {
          patterns.push(result);
        }
      }
    }

    return this.deduplicate(patterns);
  }

  /**
   * Detect chart patterns (Double Top/Bottom, H&S, etc.).
   * Requires more candles and wider lookback than candlestick patterns.
   */
  detectChartPatterns(candles: Candle[]): DetectedPattern[] {
    if (candles.length < 15) return [];

    const patterns: DetectedPattern[] = [];

    // Chart patterns complete at the last candle (confirmation close)
    for (const detector of CHART_DETECTORS) {
      const result = detector(candles, candles.length - 1);
      if (result && result.confidence >= 0.4) {
        patterns.push(result);
      }
    }

    return this.deduplicate(patterns);
  }

  /** Sort by time and keep only highest-confidence detection per timestamp */
  private deduplicate(patterns: DetectedPattern[]): DetectedPattern[] {
    patterns.sort((a, b) => a.time - b.time);

    const seen = new Map<number, DetectedPattern>();
    for (const p of patterns) {
      const existing = seen.get(p.time);
      if (!existing || p.confidence > existing.confidence) {
        seen.set(p.time, p);
      }
    }

    return Array.from(seen.values()).sort((a, b) => a.time - b.time);
  }
}
