/**
 * Unit tests for ConfluenceService — the deterministic probabilistic scoring engine.
 * Covers: base rates, evidence modification, confidence tiers,
 * 2026 overrides, risk parameter computation, and boundary cases.
 */
import { describe, it, expect } from 'vitest';
import { ConfluenceService } from './confluence.service';
import { Candle } from '../models/candle.model';
import { DetectedPattern } from '../models/pattern.model';
import { IndicatorResults, RegimeResult, MarketRegime } from '../models/indicator.model';

// ─── Test Helpers ──────────────────────────────────────────────────

function makeCandles(count: number, trend: 'up' | 'down' | 'flat' = 'flat'): Candle[] {
  const candles: Candle[] = [];
  let price = 100;
  const step = trend === 'up' ? 0.5 : trend === 'down' ? -0.5 : 0;
  for (let i = 0; i < count; i++) {
    const noise = (Math.random() - 0.5) * 2;
    const open = price;
    price += step + noise;
    const close = price;
    candles.push({
      time: 1700000000 + i * 86400,
      open: Math.round(open * 100) / 100,
      high: Math.round((Math.max(open, close) + Math.random() * 1) * 100) / 100,
      low: Math.round((Math.min(open, close) - Math.random() * 1) * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: 1000000 + Math.floor(Math.random() * 500000),
    });
    price = close;
  }
  return candles;
}

function makeRegime(regime: MarketRegime): RegimeResult {
  return {
    regime,
    confidence: 0.8,
    methods: {
      smaAlignment: regime.includes('uptrend') ? 'bullish' : regime.includes('downtrend') ? 'bearish' : 'neutral',
      adxValue: regime === 'strong_uptrend' || regime === 'strong_downtrend' ? 35 : 18,
      structure: regime.includes('uptrend') ? 'HH/HL' : regime.includes('downtrend') ? 'LH/LL' : 'mixed',
    },
  };
}

function makePattern(
  type: string,
  sentiment: 'bullish' | 'bearish' | 'neutral',
  grade: 'A' | 'B' | 'C' | 'D' = 'B',
): DetectedPattern {
  return { type: type as any, time: 1700086400, sentiment, confidence: 0.75, grade, labelKey: `pattern.${type}` };
}

function makeIndicators(overrides: Partial<IndicatorResults> = {}): IndicatorResults {
  return {
    rsi: null, macd: null, bb: null,
    sma20: null, sma50: null, sma200: null,
    ema9: null, ema21: null, volumeProfile: null,
    adx: null, regime: null,
    volumeClimax: null, volumeDryUp: null, volumeDivergence: null,
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('ConfluenceService', () => {
  const service = new ConfluenceService();

  describe('base rate from regime', () => {
    it('strong_uptrend starts at P(bullish)=0.60', () => {
      const result = service.score(makeRegime('strong_uptrend'), [], null, makeCandles(30, 'up'), 'TEST');
      expect(result.probability).toBeCloseTo(0.60, 1);
      expect(result.direction).toBe('bullish');
    });

    it('strong_downtrend starts at P(bullish)=0.40', () => {
      const result = service.score(makeRegime('strong_downtrend'), [], null, makeCandles(30, 'down'), 'TEST');
      expect(result.probability).toBeLessThan(0.50);
      expect(result.direction).toBe('bearish');
    });

    it('ranging starts at P(bullish)=0.50', () => {
      const result = service.score(makeRegime('ranging'), [], null, makeCandles(30, 'flat'), 'TEST');
      expect(result.probability).toBeCloseTo(0.50, 1);
      expect(result.tier).toBe('LOW');
    });

    it('null regime defaults to 0.50 neutral', () => {
      const result = service.score(null, [], null, makeCandles(30), 'TEST');
      expect(result.probability).toBeCloseTo(0.50, 1);
    });
  });

  describe('chart pattern evidence', () => {
    it('grade A double bottom in uptrend boosts bullish probability', () => {
      const patterns = [makePattern('double_bottom', 'bullish', 'A')];
      const result = service.score(
        makeRegime('weak_uptrend'), patterns, null, makeCandles(30, 'up'), 'TEST',
      );
      expect(result.probability).toBeGreaterThan(0.55);
      expect(result.contributingSignals.some((s) => s.signal.includes('Double Bottom'))).toBe(true);
    });

    it('grade B head and shoulders in uptrend applies counter-regime weight', () => {
      const patterns = [makePattern('head_and_shoulders', 'bearish', 'B')];
      const result = service.score(
        makeRegime('weak_uptrend'), patterns, null, makeCandles(30, 'up'), 'TEST',
      );
      // Counter-regime pattern in uptrend — should have reduced effect
      const hns = result.contributingSignals.find((s) => s.signal.includes('Head & Shoulders'));
      expect(hns).toBeDefined();
      expect(hns!.description).toContain('counter-regime');
    });

    it('grade C/D chart patterns are treated as B for scoring', () => {
      const patternsA = [makePattern('double_top', 'bearish', 'C')];
      const patternsB = [makePattern('double_top', 'bearish', 'D')];
      const resultA = service.score(
        makeRegime('weak_downtrend'), patternsA, null, makeCandles(30, 'down'), 'TEST',
      );
      const resultB = service.score(
        makeRegime('weak_downtrend'), patternsB, null, makeCandles(30, 'down'), 'TEST',
      );
      // Both C and D should apply the same B-tier modifier
      expect(resultA.probability).toBeCloseTo(resultB.probability, 2);
    });
  });

  describe('candlestick pattern evidence', () => {
    it('grade A bullish engulfing adds evidence', () => {
      const patterns = [makePattern('bullish_engulfing', 'bullish', 'A')];
      const result = service.score(
        makeRegime('ranging'), patterns, null, makeCandles(30), 'TEST',
      );
      expect(result.probability).toBeGreaterThan(0.50);
    });

    it('grade B doji (neutral) has no directional effect', () => {
      const patterns = [makePattern('doji', 'neutral', 'B')];
      const result = service.score(
        makeRegime('ranging'), patterns, null, makeCandles(30), 'TEST',
      );
      expect(result.probability).toBeCloseTo(0.50, 1);
    });
  });

  describe('RSI divergence detection', () => {
    it('detects bullish divergence when price makes lower low but RSI makes higher low', () => {
      // Create candles with clear price & RSI data matching timestamps
      const baseTime = 1700000000;
      const candles: Candle[] = [];
      const rsiValues: Record<number, number> = {};
      for (let i = 0; i < 30; i++) {
        const time = baseTime + i * 86400;
        // Prices making lower lows, with the last candle having the lowest low
        const price = 100 - i * 0.3;
        candles.push({
          time, open: price + 0.5, high: price + 1, low: price - (i >= 28 ? 2 : 0.5), close: price,
          volume: 1000000,
        });
        // RSI: second-to-last low at 28, last at 38 → divergence
        rsiValues[time] = i === 28 ? 28 : i === 29 ? 38 : 30;
      }
      const indicators = makeIndicators({
        rsi: { values: rsiValues, period: 14 },
      });

      const result = service.score(
        makeRegime('ranging'), [], indicators, candles, 'TEST',
      );
      const hasRsi = result.contributingSignals.some((s) => s.signal.includes('RSI'));
      expect(hasRsi).toBe(true);
    });
  });

  describe('MACD crossover detection', () => {
    it('detects bullish crossover', () => {
      const baseTime = 1700000000;
      const candles: Candle[] = [];
      const macdValues: Record<number, { macd: number; signal: number; histogram: number }> = {};
      for (let i = 0; i < 30; i++) {
        const time = baseTime + i * 86400;
        candles.push({
          time, open: 100, high: 102, low: 98, close: 101, volume: 1000000,
        });
        // Bullish crossover at last candle: macd > signal
        const isLast = i === 29;
        macdValues[time] = {
          macd: isLast ? 0.2 : -0.2,
          signal: isLast ? 0.05 : -0.1,
          histogram: isLast ? 0.15 : -0.1,
        };
      }
      // Set second-to-last for crossover detection: prev.macd <= prev.signal, last.macd > last.signal
      const t28 = baseTime + 28 * 86400;
      macdValues[t28] = { macd: -0.15, signal: -0.1, histogram: -0.05 };
      const indicators = makeIndicators({
        macd: { values: macdValues, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
      });

      const result = service.score(
        makeRegime('ranging'), [], indicators, candles, 'TEST',
      );
      expect(result.contributingSignals.some((s) => s.signal.includes('MACD'))).toBe(true);
    });
  });

  describe('volume multiplier', () => {
    it('volume climax with patterns = confirmation', () => {
      const indicators = makeIndicators({
        volumeClimax: { spikes: [{ time: 1700086400, ratio: 2.8 }] },
      });
      const patterns = [makePattern('hammer', 'bullish', 'B')];

      const result = service.score(
        makeRegime('weak_uptrend'), patterns, indicators, makeCandles(30), 'TEST',
      );
      expect(result.contributingSignals.some((s) => s.signal === 'Volume Confirmation')).toBe(true);
    });

    it('no volume signals but indicators active = volume absent', () => {
      // Active volume indicators but no signals detected
      const indicators: IndicatorResults = {
        rsi: null, macd: null, bb: null,
        sma20: null, sma50: null, sma200: null,
        ema9: null, ema21: null, volumeProfile: null,
        adx: null, regime: null,
        volumeClimax: { spikes: [] }, // active but empty
        volumeDryUp: null,
        volumeDivergence: null,
      };
      const result = service.score(
        makeRegime('ranging'), [makePattern('doji', 'neutral')], indicators, makeCandles(30), 'TEST',
      );
      expect(result.contributingSignals.some((s) => s.signal === 'Volume Absent')).toBe(true);
    });

    it('volume divergence opposing dominant patterns = contradict', () => {
      const indicators = makeIndicators({
        volumeDivergence: { divergences: [{ time: 1700086400, type: 'bearish' }] },
      });
      const patterns = [makePattern('bullish_engulfing', 'bullish', 'A')];

      const result = service.score(
        makeRegime('weak_uptrend'), patterns, indicators, makeCandles(30), 'TEST',
      );
      expect(result.contributingSignals.some((s) => s.signal === 'Volume Contradiction')).toBe(true);
    });
  });

  describe('confidence tier calculation', () => {
    it('P >= 0.75 → HIGH bullish', () => {
      // Use strong regime + multiple bullish patterns to push P > 0.75
      const patterns = [
        makePattern('double_bottom', 'bullish', 'A'),
        makePattern('bullish_engulfing', 'bullish', 'A'),
        makePattern('morning_star', 'bullish', 'A'),
      ];
      const result = service.score(
        makeRegime('strong_uptrend'), patterns, null, makeCandles(30, 'up'), 'TEST',
      );
      expect(result.tier).toBe('HIGH');
      expect(result.direction).toBe('bullish');
    });

    it('P between 0.60-0.749 → MEDIUM', () => {
      const patterns = [makePattern('hammer', 'bullish', 'B')];
      const result = service.score(
        makeRegime('weak_uptrend'), patterns, null, makeCandles(30, 'up'), 'TEST',
      );
      expect(result.tier).toBe('MEDIUM');
    });

    it('P = 0.50 → LOW bullish', () => {
      const result = service.score(
        makeRegime('ranging'), [], null, makeCandles(30), 'TEST',
      );
      expect(result.tier).toBe('LOW');
      expect(result.direction).toBe('bullish');
    });

    it('P between 0.40-0.50 → NEUTRAL', () => {
      const patterns = [makePattern('shooting_star', 'bearish', 'B')];
      const result = service.score(
        makeRegime('ranging'), patterns, null, makeCandles(30), 'TEST',
      );
      // Starting at 0.50, adding mild bearish should push below 0.50 but above 0.40
      expect(result.tier).toBe('NEUTRAL');
    });

    it('P <= 0.25 → MEDIUM bearish', () => {
      const patterns = [
        makePattern('double_top', 'bearish', 'A'),
        makePattern('bearish_engulfing', 'bearish', 'A'),
      ];
      const result = service.score(
        makeRegime('strong_downtrend'), patterns, null, makeCandles(30, 'down'), 'TEST',
      );
      expect(result.tier).toBe('MEDIUM');
      expect(result.direction).toBe('bearish');
    });
  });

  describe('probability clamping', () => {
    it('never exceeds 0.95', () => {
      // Stack many bullish signals to push probability up
      const patterns = Array.from({ length: 10 }, () =>
        makePattern('bullish_engulfing', 'bullish', 'A'),
      );
      const result = service.score(
        makeRegime('strong_uptrend'), patterns, null, makeCandles(30, 'up'), 'TEST',
      );
      expect(result.probability).toBeLessThanOrEqual(0.95);
    });

    it('never goes below 0.05', () => {
      const patterns = Array.from({ length: 10 }, () =>
        makePattern('bearish_engulfing', 'bearish', 'A'),
      );
      const result = service.score(
        makeRegime('strong_downtrend'), patterns, null, makeCandles(30, 'down'), 'TEST',
      );
      expect(result.probability).toBeGreaterThanOrEqual(0.05);
    });
  });

  describe('2026 overrides', () => {
    it('applies passive flow override for mega-cap tickers', () => {
      const result = service.score(
        makeRegime('weak_uptrend'),
        [makePattern('hammer', 'bullish', 'B')],
        null,
        makeCandles(30, 'up'),
        'SPY',
      );
      expect(result.overridesApplied.some((o) => o.includes('Passive Flow'))).toBe(true);
    });

    it('does not apply passive flow for non-mega-cap', () => {
      const result = service.score(
        makeRegime('weak_uptrend'),
        [makePattern('hammer', 'bullish', 'B')],
        null,
        makeCandles(30, 'up'),
        'RANDOM',
      );
      expect(result.overridesApplied.some((o) => o.includes('Passive Flow'))).toBe(false);
    });
  });

  describe('risk parameters', () => {
    it('computes stop-loss and take-profit for bullish direction', () => {
      const candles = makeCandles(30, 'up');
      const result = service.score(
        makeRegime('weak_uptrend'),
        [makePattern('hammer', 'bullish', 'B')],
        null,
        candles,
        'TEST',
      );
      if (result.tier === 'HIGH' || result.tier === 'MEDIUM') {
        expect(result.riskParams.stopLoss).toBeDefined();
        expect(result.riskParams.takeProfit).toBeDefined();
        expect(result.riskParams.riskRewardRatio).toBeDefined();
      }
    });

    it('returns null risk params for insufficient data', () => {
      const result = service.score(
        makeRegime('ranging'), [], null, makeCandles(5), 'TEST',
      );
      expect(result.riskParams.stopLoss).toBeNull();
      expect(result.riskParams.positionSize).toBeNull();
    });

    it('computes position size when account size is provided', () => {
      const candles = makeCandles(30, 'up');
      const result = service.score(
        makeRegime('weak_uptrend'),
        [makePattern('hammer', 'bullish', 'B')],
        null,
        candles,
        'TEST',
        100000,
      );
      if (result.riskParams.stopLoss) {
        expect(result.riskParams.positionSize).toBeGreaterThan(0);
      }
    });

    it('HIGH tier uses 1:2 minimum R:R', () => {
      // Need enough patterns to reach HIGH tier
      const candles = makeCandles(30, 'up');
      const patterns = [
        makePattern('double_bottom', 'bullish', 'A'),
        makePattern('bullish_engulfing', 'bullish', 'A'),
        makePattern('morning_star', 'bullish', 'A'),
      ];
      const result = service.score(
        makeRegime('strong_uptrend'), patterns, null, candles, 'TEST',
      );
      if (result.tier === 'HIGH' && result.riskParams.riskRewardRatio) {
        expect(result.riskParams.riskRewardRatio).toBeGreaterThanOrEqual(2.0);
      }
    });
  });

  describe('contributing signals', () => {
    it('includes regime as first signal', () => {
      const result = service.score(
        makeRegime('weak_uptrend'), [], null, makeCandles(30), 'TEST',
      );
      expect(result.contributingSignals.length).toBeGreaterThan(0);
      expect(result.contributingSignals[0].signal).toContain('Market Regime');
    });

    it('each signal has direction, modifiers, and description', () => {
      const result = service.score(
        makeRegime('ranging'),
        [makePattern('hammer', 'bullish', 'A')],
        null,
        makeCandles(30),
        'TEST',
      );
      for (const s of result.contributingSignals) {
        expect(s.signal).toBeTruthy();
        expect(s.direction).toMatch(/bullish|bearish|neutral/);
        expect(typeof s.baseModifier).toBe('number');
        expect(typeof s.appliedModifier).toBe('number');
        expect(s.description).toBeTruthy();
      }
    });
  });
});
