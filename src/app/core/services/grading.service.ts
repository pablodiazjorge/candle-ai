import { Injectable } from '@angular/core';
import { Candle } from '../models/candle.model';
import { DetectedPattern, PatternGrade } from '../models/pattern.model';

export interface GradingContext {
  candles: Candle[];
  avgVolume: number;
  /** Index in the candles array where the pattern completes */
  candleIndex: number;
}

/**
 * Grades detected patterns A (highest) through D (lowest) based on
 * objective, programmable criteria defined in the knowledge base.
 *
 * Six criteria (classical-patterns.md Section 9.3):
 * 1. Volume confirmation (vs 20-period avg)
 * 2. S/R proximity (swing high/low)
 * 3. Trend alignment (prior candles direction)
 * 4. Body-to-range ratio (pattern conviction)
 * 5. Prior trend length (how many candles in opposite direction)
 * 6. Next-candle confirmation (did next candle support?)
 */
@Injectable({ providedIn: 'root' })
export class GradingService {
  gradePattern(
    pattern: DetectedPattern,
    candles: Candle[],
    avgVolume: number,
  ): PatternGrade {
    let score = 0;

    // Find the candle where this pattern completes
    const idx = candles.findIndex((c) => c.time === pattern.time);
    if (idx < 0) return 'C';

    const candle = candles[idx];

    // 1. Volume confirmation: pattern candle volume vs average
    if (candle.volume >= avgVolume * 1.5) {
      score += 2; // High weight
    } else if (candle.volume >= avgVolume) {
      score += 1;
    }

    // 2. S/R proximity: is the pattern near a swing high/low?
    if (this.isNearSR(candles, idx)) {
      score += 2; // High weight
    }

    // 3. Trend alignment: pattern direction matches recent trend?
    if (this.isTrendAligned(candles, idx, pattern.sentiment)) {
      score += 2; // High weight
    } else {
      score -= 1; // Counter-trend penalty
    }

    // 4. Body-to-range ratio: how decisive is the pattern candle?
    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    if (range > 0 && body / range >= 0.5) {
      score += 1; // Medium weight
    }

    // 5. Prior trend length: how many candles in opposite direction?
    const priorLength = this.countPriorTrend(candles, idx, pattern.sentiment);
    if (priorLength >= 5) {
      score += 1; // Medium weight
    }

    // 6. Next-candle confirmation (if available)
    if (idx < candles.length - 1) {
      const next = candles[idx + 1];
      if (pattern.sentiment === 'bullish' && next.close > candle.close) {
        score += 1; // Low weight
      } else if (pattern.sentiment === 'bearish' && next.close < candle.close) {
        score += 1;
      }
    }

    // Confidence bonus: high-confidence patterns deserve consideration
    if (pattern.confidence >= 0.8) score += 1;
    else if (pattern.confidence >= 0.7) score += 0;

    // Convert score to grade
    if (score >= 7) return 'A';
    if (score >= 5) return 'B';
    if (score >= 3) return 'C';
    return 'D';
  }

  /**
   * Grade all patterns in a batch.
   */
  gradeAll(patterns: DetectedPattern[], candles: Candle[]): DetectedPattern[] {
    if (patterns.length === 0) return [];

    const avgVolume = candles.reduce((s, c) => s + c.volume, 0) / candles.length;

    return patterns.map((p) => ({
      ...p,
      grade: this.gradePattern(p, candles, avgVolume),
    }));
  }

  /** Check if pattern is near a swing high or low (within 5 candles) */
  private isNearSR(candles: Candle[], idx: number): boolean {
    const start = Math.max(0, idx - 5);
    const end = Math.min(candles.length - 1, idx + 5);

    for (let i = start + 2; i <= end - 2; i++) {
      const c = candles[i];
      // Swing high
      if (c.high > candles[i - 1].high && c.high > candles[i - 2].high &&
          c.high > candles[i + 1].high && c.high > candles[i + 2].high) {
        return true;
      }
      // Swing low
      if (c.low < candles[i - 1].low && c.low < candles[i - 2].low &&
          c.low < candles[i + 1].low && c.low < candles[i + 2].low) {
        return true;
      }
    }
    return false;
  }

  /** Check if sentiment aligns with recent trend direction */
  private isTrendAligned(
    candles: Candle[],
    idx: number,
    sentiment: string,
  ): boolean {
    const start = Math.max(0, idx - 10);
    if (idx - start < 3) return false;

    const trendUp = candles[idx].close > candles[start].close;

    if (sentiment === 'bullish') {
      // Bullish patterns work best as reversals in downtrends OR continuations in uptrends
      // For grading, we consider trend-aligned = reversal pattern in opposite trend
      return !trendUp; // Bullish reversal works in downtrend
    }
    if (sentiment === 'bearish') {
      return trendUp; // Bearish reversal works in uptrend
    }
    return false;
  }

  /** Count how many prior candles are in the opposite direction */
  private countPriorTrend(
    candles: Candle[],
    idx: number,
    sentiment: string,
  ): number {
    let count = 0;
    for (let i = idx - 1; i >= Math.max(0, idx - 15); i--) {
      const isRed = candles[i].close < candles[i].open;
      if (sentiment === 'bullish' && isRed) count++;
      else if (sentiment === 'bearish' && !isRed) count++;
      else break;
    }
    return count;
  }
}
