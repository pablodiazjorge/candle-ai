import { Injectable } from '@angular/core';
import { Candle } from '../models/candle.model';
import { DetectedPattern } from '../models/pattern.model';
import {
  IndicatorResults,
  RegimeResult,
  MarketRegime,
} from '../models/indicator.model';
import {
  ConfluenceResult,
  ConfluenceDirection,
  ConfidenceTier,
  SignalContribution,
  RiskParams,
} from '../models/analysis.model';

/** Known mega-cap tickers and ETFs subject to passive flow override */
const MEGA_CAPS = new Set([
  'SPY', 'QQQ', 'IVV', 'VOO', 'DIA', 'IWM',
  'NVDA', 'META', 'GOOGL', 'GOOG', 'TSLA', 'AAPL', 'MSFT', 'AMZN',
  'SPCX',
]);

/** Base probability of bullish by regime (analytical-framework.md Section 5.2) */
const REGIME_BASE: Record<MarketRegime, number> = {
  strong_uptrend: 0.60,
  weak_uptrend: 0.55,
  ranging: 0.50,
  weak_downtrend: 0.45,
  strong_downtrend: 0.40,
  transitional: 0.50,
};

/** Evidence modifiers (analytical-framework.md Section 5.3) */
const EVIDENCE = {
  CHART_PATTERN_A: { aligned: 0.15, counter: 0.08 },
  CHART_PATTERN_B: { aligned: 0.10, counter: 0.05 },
  CANDLE_PATTERN_A: { aligned: 0.10, counter: 0.03 },
  CANDLE_PATTERN_B: { aligned: 0.07, counter: 0.02 },
  RSI_DIVERGENCE: { aligned: 0.08, counter: 0.05 },
  MACD_CROSSOVER: { aligned: 0.06, counter: 0.03 },
  VOLUME_CONFIRM: 1.2,
  VOLUME_ABSENT: 0.8,
  VOLUME_CONTRA: 0.7,
};

/**
 * Deterministic probabilistic scoring engine.
 *
 * Replaces the LLM as primary analyst. Computes confidence tiers from
 * graded patterns, regime, and volume signals using conditional probability
 * modification — NOT weighted sums.
 *
 * Per analytical-framework.md Section 5 and development-roadmap.md Epic 7.
 */
@Injectable({ providedIn: 'root' })
export class ConfluenceService {
  /**
   * Score the current market state and produce a ConfluenceResult.
   *
   * @param regime - Regime classification from indicators worker
   * @param patterns - Graded candlestick + chart patterns (A-D)
   * @param indicators - All computed indicator results
   * @param candles - Source candle data (for swing point detection in risk)
   * @param ticker - Current ticker symbol (for 2026 overrides)
   * @param accountSize - Optional account size for position sizing
   */
  score(
    regime: RegimeResult | null,
    patterns: DetectedPattern[],
    indicators: IndicatorResults | null,
    candles: Candle[],
    ticker: string,
    accountSize?: number,
  ): ConfluenceResult {
    const contributions: SignalContribution[] = [];
    const overrides: string[] = [];

    // ─── 1. Base Rate ────────────────────────────────────────────
    let pBullish = regime
      ? REGIME_BASE[regime.regime]
      : 0.50;

    // Cache initial regime direction BEFORE any signal modifications.
    // Prevents path-dependent labeling where signals change their
    // own alignment context as pBullish updates mid-loop.
    const initialRegimeIsBullish = pBullish >= 0.50;

    const regimeLabel = regime ? regime.regime.replace(/_/g, ' ') : 'unknown';
    const hasRegime = regime !== null;
    contributions.push({
      signal: `Market Regime: ${regimeLabel}`,
      direction: pToDirection(pBullish),
      baseModifier: pBullish - 0.50,
      appliedModifier: pBullish - 0.50,
      description: hasRegime
        ? `Base rate from regime classification (ADX=${regime!.methods.adxValue.toFixed(0)}, SMA=${regime!.methods.smaAlignment}, Structure=${regime!.methods.structure})`
        : 'No regime data — neutral base rate (50% bullish). All signals scored with neutral context.',
    });

    // ─── 2. Chart Patterns (Level 2 in hierarchy) ─────────────────
    // Only score recent chart patterns (last 60 candles = ~3 months daily)
    const CHART_LOOKBACK = 60;
    const chartRecentTimestamps = new Set(candles.slice(-CHART_LOOKBACK).map((c) => c.time));
    const chartPatterns = patterns.filter((p) =>
      ['double_top', 'double_bottom', 'head_and_shoulders', 'inverse_head_and_shoulders'].includes(p.type) &&
      chartRecentTimestamps.has(p.time),
    );

    for (const cp of chartPatterns) {
      const grade = cp.grade ?? 'C';
      const tier = grade === 'A' || grade === 'B' ? grade : 'B'; // C/D treated as B for scoring
      const config = tier === 'A' ? EVIDENCE.CHART_PATTERN_A : EVIDENCE.CHART_PATTERN_B;

      const sigDir = cp.sentiment === 'neutral' ? 'neutral' : cp.sentiment;
      const isAligned = sigDir === 'bullish';

      // Determine if pattern aligns with INITIAL regime
      const regimeAligned = (sigDir === 'bullish' && initialRegimeIsBullish) ||
        (sigDir === 'bearish' && !initialRegimeIsBullish);

      const modifier = regimeAligned ? config.aligned : config.counter;
      const signedModifier = sigDir === 'bullish' ? modifier : sigDir === 'bearish' ? -modifier : 0;

      pBullish += signedModifier;

      const patternLabel = formatPatternLabel(cp.type, grade);
      contributions.push({
        signal: patternLabel,
        direction: sigDir,
        baseModifier: signedModifier,
        appliedModifier: signedModifier,
        description: hasRegime
          ? (regimeAligned
            ? `${patternLabel} — regime-aligned, full weight`
            : `${patternLabel} — counter-regime, reduced weight (×${(config.counter / config.aligned).toFixed(2)})`)
          : `${patternLabel} — neutral context (no regime data)`,
      });
    }

    // ─── 3. Candlestick Patterns (Level 3 in hierarchy) ────────────
    // Only score recent patterns (last 30 candles) to avoid noise
    const RECENT_WINDOW = 30;
    const recentTimestamps = new Set(candles.slice(-RECENT_WINDOW).map((c) => c.time));
    const candlePatterns = patterns.filter((p) =>
      !['double_top', 'double_bottom', 'head_and_shoulders', 'inverse_head_and_shoulders'].includes(p.type) &&
      recentTimestamps.has(p.time),
    );

    for (const cp of candlePatterns) {
      const grade = cp.grade ?? 'C';
      const tier = grade === 'A' || grade === 'B' ? grade : 'B';
      const config = tier === 'A' ? EVIDENCE.CANDLE_PATTERN_A : EVIDENCE.CANDLE_PATTERN_B;

      const sigDir = cp.sentiment === 'neutral' ? 'neutral' : cp.sentiment;
      const regimeAligned = (sigDir === 'bullish' && initialRegimeIsBullish) ||
        (sigDir === 'bearish' && !initialRegimeIsBullish);

      const modifier = regimeAligned ? config.aligned : config.counter;
      const signedModifier = sigDir === 'bullish' ? modifier : sigDir === 'bearish' ? -modifier : 0;

      pBullish += signedModifier;

      const patternLabel = formatPatternLabel(cp.type, grade);
      contributions.push({
        signal: patternLabel,
        direction: sigDir,
        baseModifier: signedModifier,
        appliedModifier: signedModifier,
        description: hasRegime
          ? (regimeAligned
            ? `${patternLabel} — regime-aligned`
            : `${patternLabel} — counter-regime, reduced weight`)
          : `${patternLabel} — neutral context (no regime data)`,
      });
    }

    // ─── 4. Momentum (Level 4 in hierarchy) ──────────────────────
    if (indicators) {
      const rsiDiv = detectRsiDivergence(indicators, candles);
      if (rsiDiv) {
        const config = EVIDENCE.RSI_DIVERGENCE;
        const regimeAligned = (rsiDiv === 'bullish' && initialRegimeIsBullish) ||
          (rsiDiv === 'bearish' && !initialRegimeIsBullish);
        const modifier = regimeAligned ? config.aligned : config.counter;
        const signedModifier = rsiDiv === 'bullish' ? modifier : -modifier;

        pBullish += signedModifier;

        const label = rsiDiv === 'bullish' ? 'RSI Bullish Divergence' : 'RSI Bearish Divergence';
        contributions.push({
          signal: label,
          direction: rsiDiv,
          baseModifier: signedModifier,
          appliedModifier: signedModifier,
          description: hasRegime
            ? (regimeAligned
              ? 'Price-RSI divergence — regime-aligned'
              : 'Price-RSI divergence — counter-regime')
            : 'Price-RSI divergence — neutral context',
        });
      }

      const macdCross = detectMacdCrossover(indicators);
      if (macdCross) {
        const config = EVIDENCE.MACD_CROSSOVER;
        const regimeAligned = (macdCross === 'bullish' && initialRegimeIsBullish) ||
          (macdCross === 'bearish' && !initialRegimeIsBullish);
        const modifier = regimeAligned ? config.aligned : config.counter;
        const signedModifier = macdCross === 'bullish' ? modifier : -modifier;

        pBullish += signedModifier;

        const label = macdCross === 'bullish' ? 'MACD Bullish Crossover' : 'MACD Bearish Crossover';
        contributions.push({
          signal: label,
          direction: macdCross,
          baseModifier: signedModifier,
          appliedModifier: signedModifier,
          description: hasRegime
            ? (regimeAligned
              ? 'MACD line crossed signal — regime-aligned'
              : 'MACD line crossed signal — counter-regime')
            : 'MACD crossover — neutral context',
        });
      }
    }

    // ─── 5. Volume Multiplier (Level 5 in hierarchy) ──────────────
    const volSignal = detectVolumeSignal(indicators, patterns);
    if (volSignal === 'confirm') {
      pBullish *= EVIDENCE.VOLUME_CONFIRM;
      contributions.push({
        signal: 'Volume Confirmation',
        direction: 'neutral',
        baseModifier: EVIDENCE.VOLUME_CONFIRM - 1,
        appliedModifier: EVIDENCE.VOLUME_CONFIRM - 1,
        description: 'Volume supports the dominant direction — confidence boosted',
      });
    } else if (volSignal === 'contradict') {
      pBullish *= EVIDENCE.VOLUME_CONTRA;
      contributions.push({
        signal: 'Volume Contradiction',
        direction: 'neutral',
        baseModifier: 1 - EVIDENCE.VOLUME_CONTRA,
        appliedModifier: 1 - EVIDENCE.VOLUME_CONTRA,
        description: 'Volume contradicts the dominant direction — confidence heavily reduced',
      });
    } else if (volSignal === 'absent') {
      pBullish *= EVIDENCE.VOLUME_ABSENT;
      contributions.push({
        signal: 'Volume Absent',
        direction: 'neutral',
        baseModifier: 1 - EVIDENCE.VOLUME_ABSENT,
        appliedModifier: 1 - EVIDENCE.VOLUME_ABSENT,
        description: 'No volume signal detected — confidence reduced',
      });
    }
    // Note: if volSignal is null, volume indicators are not active — skip multiplier

    // ─── 6. 2026 Market Overrides ─────────────────────────────────
    pBullish = this.apply2026Overrides(pBullish, ticker, candles, overrides);

    // ─── 7. Clamp ─────────────────────────────────────────────────
    pBullish = clamp(pBullish, 0.05, 0.95);

    // ─── 8. Filter zero-impact signals ─────────────────────────────
    // Remove signals with 0 appliedModifier (e.g., Doji D grade)
    // — they contribute nothing but clutter the UI
    const filtered = contributions.filter((s) => s.appliedModifier !== 0);

    // ─── 9. Compute Tier ──────────────────────────────────────────
    const { direction, tier } = computeTier(pBullish);

    // ─── 10. Risk Parameters ──────────────────────────────────────
    const riskParams = this.computeRiskParams(candles, direction, tier, accountSize);

    return {
      direction,
      tier,
      probability: pBullish,
      contributingSignals: filtered,
      riskParams,
      overridesApplied: overrides,
    };
  }

  /**
   * Apply 2026 market-specific overrides.
   *
   * - Passive Flow Override: ×1.1 bullish / ×0.9 bearish for mega-caps/ETFs
   * - 0DTE Gamma Override: downgrade intraday patterns on M/W/F
   */
  private apply2026Overrides(
    pBullish: number,
    ticker: string,
    candles: Candle[],
    overrides: string[],
  ): number {
    // Passive Flow Override for mega-caps and ETFs
    if (MEGA_CAPS.has(ticker)) {
      // Structural bid from passive flows tilts bullish
      if (pBullish > 0.50) {
        pBullish *= 1.1;
        overrides.push('Passive Flow ×1.1 (mega-cap/ETF structural bid)');
      } else if (pBullish < 0.50) {
        pBullish *= 0.9;
        overrides.push('Passive Flow ×0.9 (mega-cap/ETF bearish resistance)');
      }
      pBullish = clamp(pBullish, 0.05, 0.95);
    }

    // 0DTE Gamma Override: M/W/F intraday patterns downgraded
    // Only applies to sub-daily timeframes (daily/weekly skip this)
    const dow = new Date().getUTCDay(); // 1=Mon, 3=Wed, 5=Fri
    if (dow === 1 || dow === 3 || dow === 5) {
      if (candles.length >= 2) {
        const intervalMs = (candles[1].time - candles[0].time) * 1000;
        const hours = intervalMs / (1000 * 60 * 60);
        // Skip for daily (24h) and weekly (168h) data
        if (hours > 0 && hours < 24) {
          pBullish = pBullish * 0.7 + 0.50 * 0.3;
          overrides.push('0DTE Gamma: intraday signals neutralized (M/W/F)');
        }
      }
    }

    return clamp(pBullish, 0.05, 0.95);
  }

  /**
   * Compute risk parameters from market structure.
   *
   * Stop-loss is derived from swing points, not arbitrary percentages.
   * (analytical-framework.md Section 6.1)
   */
  computeRiskParams(
    candles: Candle[],
    direction: ConfluenceDirection,
    tier: ConfidenceTier,
    accountSize?: number,
    riskPercent: number = 0.02,
  ): RiskParams {
    if (candles.length < 20) {
      return { stopLoss: null, takeProfit: null, riskRewardRatio: null, positionSize: null };
    }

    const lastCandle = candles[candles.length - 1];
    const entry = lastCandle.close;

    let stopLoss: number | null = null;
    let takeProfit: number | null = null;

    const minRR = tier === 'HIGH' ? 2 : tier === 'MEDIUM' ? 3 : 1.5;

    if (direction === 'bullish') {
      stopLoss = findSwingLow(candles, 10);
      if (stopLoss && stopLoss < entry) {
        // Cap risk at 20% of entry to avoid absurd stops from synthetic data
        const risk = Math.min(entry - stopLoss, entry * 0.20);
        takeProfit = entry + risk * minRR;
        stopLoss = entry - risk;
      }
    } else if (direction === 'bearish') {
      stopLoss = findSwingHigh(candles, 10);
      if (stopLoss && stopLoss > entry) {
        // Cap risk at 20% of entry to avoid absurd stops from synthetic data
        const risk = Math.min(stopLoss - entry, entry * 0.20);
        takeProfit = entry - risk * minRR;
        stopLoss = entry + risk;
      }
    }

    // Ensure take-profit is always a positive absolute price
    if (takeProfit !== null && takeProfit <= 0) {
      takeProfit = null;
    }

    // R:R = risk * minRR / risk = minRR (exact, no floating-point subtraction)
    const rr = (stopLoss && entry && takeProfit)
      ? minRR
      : null;

    const positionSize = accountSize && stopLoss && entry
      ? Math.floor((accountSize * riskPercent) / Math.abs(entry - stopLoss))
      : null;

    return { stopLoss, takeProfit, riskRewardRatio: rr, positionSize };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

function pToDirection(p: number): ConfluenceDirection {
  if (p > 0.55) return 'bullish';
  if (p < 0.45) return 'bearish';
  return 'neutral';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatPatternLabel(type: string, grade: string): string {
  const labels: Record<string, string> = {
    double_top: 'Double Top',
    double_bottom: 'Double Bottom',
    head_and_shoulders: 'Head & Shoulders',
    inverse_head_and_shoulders: 'Inv. Head & Shoulders',
    doji: 'Doji',
    hammer: 'Hammer',
    shooting_star: 'Shooting Star',
    bullish_engulfing: 'Bullish Engulfing',
    bearish_engulfing: 'Bearish Engulfing',
    morning_star: 'Morning Star',
    evening_star: 'Evening Star',
    bullish_harami: 'Bullish Harami',
    bearish_harami: 'Bearish Harami',
    three_white_soldiers: 'Three White Soldiers',
    three_black_crows: 'Three Black Crows',
  };
  return `${labels[type] ?? type} (${grade})`;
}

function computeTier(p: number): { direction: ConfluenceDirection; tier: ConfidenceTier } {
  if (p >= 0.75) return { direction: 'bullish', tier: 'HIGH' };
  if (p >= 0.60) return { direction: 'bullish', tier: 'MEDIUM' };
  if (p >= 0.50) return { direction: 'bullish', tier: 'LOW' };
  if (p > 0.40) return { direction: 'neutral', tier: 'NEUTRAL' };
  if (p >= 0.25) return { direction: 'bearish', tier: 'LOW' };
  if (p >= 0.15) return { direction: 'bearish', tier: 'MEDIUM' };
  return { direction: 'bearish', tier: 'HIGH' };
}

/**
 * Detect RSI divergence by comparing price extremes with RSI extremes
 * over the last ~20 candles.
 */
function detectRsiDivergence(
  indicators: IndicatorResults,
  candles: Candle[],
): 'bullish' | 'bearish' | null {
  if (!indicators.rsi) return null;

  const rsiValues = indicators.rsi.values;
  const lookback = Math.min(20, candles.length);

  // Find price lows and RSI values in the lookback window
  let lowestPrice = Infinity;
  let lowestPriceIdx = -1;
  let secondLowestPrice = Infinity;
  let secondLowestPriceIdx = -1;

  for (let i = candles.length - lookback; i < candles.length; i++) {
    const c = candles[i];
    if (c.low < lowestPrice) {
      secondLowestPrice = lowestPrice;
      secondLowestPriceIdx = lowestPriceIdx;
      lowestPrice = c.low;
      lowestPriceIdx = i;
    } else if (c.low < secondLowestPrice && c.low > lowestPrice) {
      secondLowestPrice = c.low;
      secondLowestPriceIdx = i;
    }
  }

  // Bullish divergence: price makes lower low, RSI makes higher low
  if (
    lowestPriceIdx > secondLowestPriceIdx &&
    secondLowestPriceIdx >= 0 &&
    rsiValues[candles[lowestPriceIdx]?.time] !== undefined &&
    rsiValues[candles[secondLowestPriceIdx]?.time] !== undefined
  ) {
    const rsiNew = rsiValues[candles[lowestPriceIdx].time];
    const rsiOld = rsiValues[candles[secondLowestPriceIdx].time];
    if (rsiNew > rsiOld && lowestPrice < secondLowestPrice) {
      return 'bullish';
    }
  }

  // Find price highs and RSI values
  let highestPrice = -Infinity;
  let highestPriceIdx = -1;
  let secondHighestPrice = -Infinity;
  let secondHighestPriceIdx = -1;

  for (let i = candles.length - lookback; i < candles.length; i++) {
    const c = candles[i];
    if (c.high > highestPrice) {
      secondHighestPrice = highestPrice;
      secondHighestPriceIdx = highestPriceIdx;
      highestPrice = c.high;
      highestPriceIdx = i;
    } else if (c.high > secondHighestPrice && c.high < highestPrice) {
      secondHighestPrice = c.high;
      secondHighestPriceIdx = i;
    }
  }

  // Bearish divergence: price makes higher high, RSI makes lower high
  if (
    highestPriceIdx > secondHighestPriceIdx &&
    secondHighestPriceIdx >= 0 &&
    rsiValues[candles[highestPriceIdx]?.time] !== undefined &&
    rsiValues[candles[secondHighestPriceIdx]?.time] !== undefined
  ) {
    const rsiNew = rsiValues[candles[highestPriceIdx].time];
    const rsiOld = rsiValues[candles[secondHighestPriceIdx].time];
    if (rsiNew < rsiOld && highestPrice > secondHighestPrice) {
      return 'bearish';
    }
  }

  return null;
}

/**
 * Detect recent MACD crossover.
 * Checks if MACD line crossed signal line in the last few candles.
 */
function detectMacdCrossover(
  indicators: IndicatorResults,
): 'bullish' | 'bearish' | null {
  if (!indicators.macd) return null;

  const macdValues = indicators.macd.values;
  const timestamps = Object.keys(macdValues)
    .map(Number)
    .sort((a, b) => a - b);

  if (timestamps.length < 3) return null;

  // Check last two data points for crossover
  const last = macdValues[timestamps[timestamps.length - 1]];
  const prev = macdValues[timestamps[timestamps.length - 2]];

  if (!last || !prev) return null;

  // Bullish crossover: MACD crosses above signal
  if (prev.macd <= prev.signal && last.macd > last.signal) {
    return 'bullish';
  }

  // Bearish crossover: MACD crosses below signal
  if (prev.macd >= prev.signal && last.macd < last.signal) {
    return 'bearish';
  }

  return null;
}

/**
 * Determine volume signal: confirm, absent, or contradict.
 *
 * "Confirm" = volume climax in direction of dominant patterns
 * "Contradict" = volume climax opposes dominant direction
 * "Absent" = no volume signal detected
 */
function detectVolumeSignal(
  indicators: IndicatorResults | null,
  patterns: DetectedPattern[],
): 'confirm' | 'absent' | 'contradict' | null {
  if (!indicators) return null;

  const hasClimax = indicators.volumeClimax && indicators.volumeClimax.spikes.length > 0;
  const hasDryUp = indicators.volumeDryUp && indicators.volumeDryUp.dips.length > 0;
  const hasDivergence = indicators.volumeDivergence && indicators.volumeDivergence.divergences.length > 0;

  // If no volume indicators are active (all null), skip multiplier
  if (!hasClimax && !hasDryUp && !hasDivergence) {
    // Check if volume indicators are explicitly null (not active)
    if (!indicators.volumeClimax && !indicators.volumeDryUp && !indicators.volumeDivergence) {
      return null;
    }
    return 'absent';
  }

  // Determine dominant direction from patterns
  let bullishCount = 0;
  let bearishCount = 0;
  for (const p of patterns) {
    if (p.sentiment === 'bullish') bullishCount++;
    if (p.sentiment === 'bearish') bearishCount++;
  }

  const dominantBullish = bullishCount > bearishCount;

  // Volume divergence is directional
  if (hasDivergence) {
    const lastDiv = indicators.volumeDivergence!.divergences.at(-1)!;
    if (
      (lastDiv.type === 'bullish' && dominantBullish) ||
      (lastDiv.type === 'bearish' && !dominantBullish)
    ) {
      return 'confirm';
    }
    return 'contradict';
  }

  // Volume climax in absence of divergence — confirming by default
  // (high volume during pattern completion = conviction)
  if (hasClimax && patterns.length > 0) return 'confirm';

  // Volume dry-up = low conviction
  if (hasDryUp) return 'absent';

  return 'absent';
}

/**
 * Find the lowest low in the last `window` candles, excluding the last one.
 */
function findSwingLow(candles: Candle[], window: number): number | null {
  const start = Math.max(0, candles.length - window);
  let lowest = Infinity;
  for (let i = start; i < candles.length - 1; i++) {
    if (candles[i].low < lowest) {
      lowest = candles[i].low;
    }
  }
  return lowest === Infinity ? null : lowest;
}

/**
 * Find the highest high in the last `window` candles, excluding the last one.
 */
function findSwingHigh(candles: Candle[], window: number): number | null {
  const start = Math.max(0, candles.length - window);
  let highest = -Infinity;
  for (let i = start; i < candles.length - 1; i++) {
    if (candles[i].high > highest) {
      highest = candles[i].high;
    }
  }
  return highest === -Infinity ? null : highest;
}
