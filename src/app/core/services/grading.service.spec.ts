/**
 * Unit tests for GradingService — pattern quality grading (A/B/C/D).
 * Covers all 6 criteria: volume confirmation, S/R proximity, trend alignment,
 * body-to-range ratio, prior trend length, next-candle confirmation.
 */
import { describe, it, expect } from 'vitest';
import { GradingService } from './grading.service';
import { Candle } from '../models/candle.model';
import { DetectedPattern } from '../models/pattern.model';

// ─── Helpers ───────────────────────────────────────────────────────

function makeCandle(overrides: Partial<Candle> & { time: number }): Candle {
  return {
    open: 100, high: 105, low: 95, close: 101, volume: 1000000,
    ...overrides,
  };
}

function makePattern(
  type: string,
  sentiment: 'bullish' | 'bearish' | 'neutral',
  time: number,
  confidence = 0.7,
): DetectedPattern {
  return { type: type as any, time, sentiment, confidence, labelKey: `pattern.${type}` };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('GradingService', () => {
  const service = new GradingService();

  describe('single criterion', () => {
    it('volume confirmation: candle volume >= 1.5x avg → +2', () => {
      // Build candles where the pattern candle has 2x avg volume
      const candles: Candle[] = [];
      for (let i = 0; i < 15; i++) {
        candles.push({
          time: i + 1,
          open: 100 - i, high: 101 - i, low: 99 - i, close: 99.5 - i, // downtrend
          volume: 500000,
        });
      }
      // Pattern candle at index 10 with high volume
      candles[10] = {
        time: 11,
        open: 90, high: 91, low: 85, close: 89, // hammer-like
        volume: 1500000, // 3x avg
      };
      const pattern = makePattern('hammer', 'bullish', 11, 0.8);
      const grade = service.gradePattern(pattern, candles, 500000);
      // Gets +2 volume, +2 trend (bullish in downtrend = aligned), possibly S/R
      expect(['A', 'B']).toContain(grade);
    });

    it('volume at average level → +1', () => {
      const candles: Candle[] = [];
      for (let i = 0; i < 15; i++) {
        candles.push({
          time: i + 1,
          open: 100 - i, high: 101 - i, low: 99 - i, close: 99.5 - i,
          volume: 1000000,
        });
      }
      candles[10] = {
        time: 11,
        open: 90, high: 91, low: 85, close: 89,
        volume: 1000000, // exactly avg
      };
      const pattern = makePattern('hammer', 'bullish', 11);
      const grade = service.gradePattern(pattern, candles, 1000000);
      expect(['A', 'B', 'C']).toContain(grade);
    });
  });

  describe('gradeAll batch', () => {
    it('grades multiple patterns at once', () => {
      const candles = Array.from({ length: 20 }, (_, i) =>
        makeCandle({ time: i + 1, volume: i === 10 ? 3000000 : 500000 }),
      );
      const patterns = [
        makePattern('hammer', 'bullish', 11),
        makePattern('shooting_star', 'bearish', 12),
        makePattern('doji', 'neutral', 13),
      ];
      const graded = service.gradeAll(patterns, candles);
      expect(graded).toHaveLength(3);
      for (const g of graded) {
        expect(g.grade).toMatch(/A|B|C|D/);
      }
    });

    it('returns empty array for empty input', () => {
      expect(service.gradeAll([], [])).toEqual([]);
    });
  });

  describe('grade thresholds', () => {
    it('A requires score >= 7', () => {
      // Build a strong setup that maximizes all 6 criteria:
      // 1. Volume: candle at index 12 has 3x avg (+2)
      // 2. S/R: clear swing low near pattern (+2)
      // 3. Trend: bullish reversal in prior downtrend = aligned (+2)
      // 4. Body/range: strong body >= 50% of range (+1)
      // 5. Prior trend: 5+ red candles before (+1)
      // 6. Next-candle confirmation: next close higher (+1)
      // Bonus: confidence >= 0.7 (+1) → Total: 10 = A
      const candles: Candle[] = [];
      // Prior downtrend (10 red candles)
      for (let i = 0; i < 10; i++) {
        const o = 110 - i * 1.5;
        candles.push({
          time: i + 1,
          open: o, high: o + 0.5, low: o - 2, close: o - 1.5,
          volume: 500000,
        });
      }
      // Swing low + pattern candle
      candles.push({
        time: 11, open: 92, high: 93, low: 88, close: 91, // body=1, range=5
        volume: 500000,
      });
      // Pattern candle with high volume and decisive body
      candles.push({
        time: 12, open: 89, high: 91, low: 83, close: 90, // body=1, range=8, long lower shadow
        volume: 2000000, // 4x avg of ~500K
      });
      // Next candle confirms
      candles.push({
        time: 13, open: 90, high: 94, low: 89.5, close: 93,
        volume: 800000,
      });

      const pattern = makePattern('hammer', 'bullish', 12, 0.85);
      const grade = service.gradePattern(pattern, candles, 500000);
      expect(grade).toBe('A');
    });

    it('D is returned for very low scores', () => {
      // No volume, no S/R proximity, counter-trend, small body
      const candles = Array.from({ length: 5 }, (_, i) =>
        makeCandle({ time: i + 1, volume: 100000, close: 100 + i * 2, open: 100 + i * 2 - 0.1 }),
      );
      const pattern = makePattern('doji', 'neutral', 4, 0.3);
      const grade = service.gradePattern(pattern, candles, 1000000);
      expect(grade).toBe('D');
    });
  });

  describe('pattern not found in candles', () => {
    it('returns C when pattern time does not match any candle', () => {
      const candles = [makeCandle({ time: 1 })];
      const pattern = makePattern('hammer', 'bullish', 999);
      expect(service.gradePattern(pattern, candles, 1000000)).toBe('C');
    });
  });
});
