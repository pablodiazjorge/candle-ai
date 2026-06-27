import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Candle } from '../models/candle.model';
import { DetectedPattern, PatternGrade, SMCSignal } from '../models/pattern.model';
import { Timeframe } from './market-data.service';
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
  MarketContext,
} from '../models/analysis.model';

/** Known mega-cap tickers and ETFs subject to passive flow override (US-centric) */
const MEGA_CAPS = new Set([
  'SPY', 'QQQ', 'IVV', 'VOO', 'DIA', 'IWM',
  'NVDA', 'META', 'GOOGL', 'GOOG', 'TSLA', 'AAPL', 'MSFT', 'AMZN',
  'SPCX',
]);

/** US equities/ETFs with active 0DTE options markets (M/W/F expiry) */
const US_OPTIONS_UNDERLYINGS = new Set([
  'SPY', 'QQQ', 'IWM', 'DIA',
  'AAPL', 'TSLA', 'NVDA', 'META', 'GOOGL', 'GOOG', 'AMZN', 'MSFT',
  'AMD', 'NFLX', 'CRM', 'BA', 'DIS', 'UBER',
]);

/** Forex majors where DXY correlation is structural (near -1.0 inverse) */
const FOREX_MAJORS = new Set([
  'EURUSD=X', 'GBPUSD=X', 'AUDUSD=X', 'NZDUSD=X',
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

/** Evidence modifiers — V1.0 arithmetic (p += modifier, p *= factor) */
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
 * Evidence weights in log-likelihood-ratio (log-LR) scale — V2.0.
 *
 * Replaces arithmetic p += 0.10 with log-odds Bayesian updating:
 *   logOdds += logLR × gradeMult × decayWeight
 *
 * Calibration: legacy +0.10 modifier ≈ LR 1.49 → ln(1.49) ≈ 0.40.
 * Counter-regime weights are 50% of aligned.
 * SMC signals pre-declared for Phase 2 forward compatibility.
 *
 * @see analytical-framework.md Section 5.3
 */
const EVIDENCE_LOG_LR = {
  CHART_PATTERN_A:   { aligned: 0.60, counter: 0.30 },
  CHART_PATTERN_B:   { aligned: 0.40, counter: 0.20 },
  CANDLE_PATTERN_A:  { aligned: 0.40, counter: 0.20 },
  CANDLE_PATTERN_B:  { aligned: 0.28, counter: 0.14 },
  RSI_DIVERGENCE:    { aligned: 0.35, counter: 0.18 },
  MACD_CROSSOVER:    { aligned: 0.25, counter: 0.12 },
  /** SMC signals (Phase 2) — pre-declared for forward compatibility */
  SMC_BOS:           { aligned: 0.60, counter: 0.30 },
  SMC_CHOCH:         { aligned: 0.70, counter: 0.35 },
  SMC_LIQUIDITY_SWEEP: { aligned: 0.50, counter: 0.25 },
  /** Volume signals in log-LR (positive = confirm, negative = contradict) */
  VOLUME_CONFIRM:    0.25,
  VOLUME_CONTRA:    -0.35,
} as const;

/** Cap on absolute log-LR per signal to prevent overconfidence explosion */
const LOG_LR_CAP = 2.0;

const GRADE_MULTIPLIER: Record<PatternGrade, number> = {
  'A': 1.0,
  'B': 0.6,
  'C': 0.3,
  'D': 0.1,
};

const TEMPORAL_LAMBDA: Record<Timeframe, number> = {
  '1m': 2.0,
  '5m': 1.5,
  '15m': 1.0,
  '1h': 0.5,
  '4h': 0.3,
  '1d': 0.15,
  '1wk': 0.05,
  '1mo': 0.02,
};

// ─── Bayesian & Decay Helpers ──────────────────────────────────────

function bayesianUpdate(p: number, logLR: number, cap: number = LOG_LR_CAP): number {
  if (p <= 0.05 || p >= 0.95) return p;
  const clampedLR = Math.max(Math.min(logLR, cap), -cap);
  const logOdds = Math.log(p / (1 - p));
  const newLogOdds = logOdds + clampedLR;
  const newOdds = Math.exp(newLogOdds);
  return newOdds / (1 + newOdds);
}

function computeTemporalDecay(
  daysAgo: number,
  timeframe: Timeframe,
  atr14?: number,
  sma20?: number,
): number {
  const lambdaBase = TEMPORAL_LAMBDA[timeframe] ?? 0.15;
  let lambdaEff = lambdaBase;
  if (atr14 !== undefined && sma20 !== undefined && sma20 > 0 && atr14 > 0) {
    const atrRatio = atr14 / sma20;
    lambdaEff = lambdaBase * (1 + Math.min(atrRatio, 3.0));
  }
  const weight = Math.exp(-lambdaEff * Math.max(daysAgo, 0));
  return Math.max(0.01, Math.min(1.0, weight));
}

// ─── SMC Detection (Phase 2) ──────────────────────────────────────

/**
 * Detect Smart Money Concept signals from market structure.
 *
 * BOS (Break of Structure): price closes beyond last swing high/low.
 * CHoCH (Change of Character): trend breaks prior structure.
 * Liquidity Sweep: price briefly breaks swing point but closes back inside.
 */
function detectSMC(candles: Candle[], swingPoints: SwingPoint[]): SMCSignal[] {
  const signals: SMCSignal[] = [];
  // Require sufficient data for reliable swing detection
  if (swingPoints.length < 2 || candles.length < 50) return signals;

  const last = candles[candles.length - 1];
  const trend = detectTrendDirection(candles, 20);

  const lastSwingHigh = swingPoints.filter((s) => s.type === 'high').pop();
  const lastSwingLow = swingPoints.filter((s) => s.type === 'low').pop();

  // BOS: close beyond swing point
  if (lastSwingHigh && last.close > lastSwingHigh.price) {
    const strength = Math.min((last.close - lastSwingHigh.price) / lastSwingHigh.price * 100, 1);
    signals.push({
      type: 'BOS', direction: 'bullish', strength,
      price: lastSwingHigh.price,
      description: `Bullish BOS: broke above swing high $${lastSwingHigh.price.toFixed(2)}`,
    });
  }
  if (lastSwingLow && last.close < lastSwingLow.price) {
    const strength = Math.min((lastSwingLow.price - last.close) / lastSwingLow.price * 100, 1);
    signals.push({
      type: 'BOS', direction: 'bearish', strength,
      price: lastSwingLow.price,
      description: `Bearish BOS: broke below swing low $${lastSwingLow.price.toFixed(2)}`,
    });
  }

  // CHoCH: trend breaks prior structure
  if (trend === 'uptrend' && lastSwingLow && last.close < lastSwingLow.price) {
    signals.push({
      type: 'CHoCH', direction: 'bearish', strength: 0.8,
      price: lastSwingLow.price,
      description: `Bearish CHoCH: uptrend broke structure at $${lastSwingLow.price.toFixed(2)}`,
    });
  }
  if (trend === 'downtrend' && lastSwingHigh && last.close > lastSwingHigh.price) {
    signals.push({
      type: 'CHoCH', direction: 'bullish', strength: 0.8,
      price: lastSwingHigh.price,
      description: `Bullish CHoCH: downtrend broke structure at $${lastSwingHigh.price.toFixed(2)}`,
    });
  }

  // Liquidity Sweep: wick breaks but close stays inside
  const recentCandles = candles.slice(-5);
  for (const c of recentCandles) {
    if (lastSwingLow && c.low < lastSwingLow.price && c.close > lastSwingLow.price) {
      signals.push({
        type: 'LIQUIDITY_SWEEP', direction: 'bullish', strength: 0.7,
        price: lastSwingLow.price,
        description: `Bullish sweep: liquidity grab below $${lastSwingLow.price.toFixed(2)}, closed above`,
      });
      break;
    }
    if (lastSwingHigh && c.high > lastSwingHigh.price && c.close < lastSwingHigh.price) {
      signals.push({
        type: 'LIQUIDITY_SWEEP', direction: 'bearish', strength: 0.7,
        price: lastSwingHigh.price,
        description: `Bearish sweep: liquidity grab above $${lastSwingHigh.price.toFixed(2)}, closed below`,
      });
      break;
    }
  }

  return signals;
}

function detectTrendDirection(candles: Candle[], period: number): 'uptrend' | 'downtrend' | 'ranging' {
  if (candles.length < period) return 'ranging';

  // Compute simple ATR(14) for volatility-normalized threshold
  let atr14 = 0;
  if (candles.length >= 15) {
    let sumTr = 0;
    for (let i = candles.length - 14; i < candles.length; i++) {
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close),
      );
      sumTr += tr;
    }
    atr14 = sumTr / 14;
  }

  const recent = candles.slice(-period);
  const firstPrice = recent[0].close;
  const lastPrice = recent[recent.length - 1].close;
  const pctChange = (lastPrice - firstPrice) / firstPrice;

  // Volatility-adaptive threshold: expected move = atr14/price × sqrt(period)
  const avgPrice = (firstPrice + lastPrice) / 2;
  const expectedMove = atr14 > 0 && avgPrice > 0
    ? (atr14 / avgPrice) * Math.sqrt(period)
    : 0.03; // fallback: 3%

  // Require price change to exceed 1.5× expected move for a valid trend
  // Floor at 0.5% (forex majors). No ceiling — high-vol assets (BTC ~27%,
  // ETH ~35%) legitimately require larger thresholds to filter noise.
  const threshold = Math.max(expectedMove * 1.5, 0.005);
  if (pctChange > threshold) return 'uptrend';
  if (pctChange < -threshold) return 'downtrend';
  return 'ranging';
}

// ─── Proximity Clustering (Phase 2) ────────────────────────────────

interface TemporalPattern {
  pattern: DetectedPattern;
  daysAgo: number;
  candleIndex: number;
  rawLogLR: number;
  effectiveLogLR: number;
  clustered: boolean;
}

/**
 * Merge similar patterns within 3 candles of each other.
 * They represent the same market event, not independent evidence.
 */
function clusterPatterns(
  patterns: DetectedPattern[],
  candles: Candle[],
  baseLogLR: (p: DetectedPattern) => number,
): TemporalPattern[] {
  const lastIdx = candles.length - 1;

  const temporal: TemporalPattern[] = patterns
    .filter((p) => p.sentiment !== 'neutral')
    .map((p) => {
      const idx = candles.findIndex((c) => c.time === p.time);
      const daysAgo = idx >= 0 ? lastIdx - idx : 0;
      return {
        pattern: p,
        daysAgo,
        candleIndex: idx,
        rawLogLR: baseLogLR(p),
        effectiveLogLR: 0,
        clustered: false,
      };
    })
    .sort((a, b) => a.candleIndex - b.candleIndex);

  const clustered: TemporalPattern[] = [];

  for (let i = 0; i < temporal.length; i++) {
    if (temporal[i].clustered) continue;

    const cluster: TemporalPattern[] = [temporal[i]];

    for (let j = i + 1; j < temporal.length; j++) {
      const other = temporal[j];
      if (other.clustered) continue;
      if (other.pattern.type !== temporal[i].pattern.type) continue;
      if (other.pattern.sentiment !== temporal[i].pattern.sentiment) continue;
      if (Math.abs(other.candleIndex - temporal[i].candleIndex) <= 3) {
        cluster.push(other);
        other.clustered = true;
      }
    }

    if (cluster.length === 1) {
      cluster[0].effectiveLogLR = cluster[0].rawLogLR;
    } else {
      // Merge: max logLR + consistency bonus (capped at 1.5× base)
      const maxRaw = Math.max(...cluster.map((tp) => tp.rawLogLR));
      const bonus = 0.05 * (cluster.length - 1);
      cluster[0].effectiveLogLR = Math.min(maxRaw + bonus, maxRaw * 1.5);
      // Mark representative with cluster info via a flag (used in contribution description)
      (cluster[0] as any).isClustered = true;
      (cluster[0] as any).clusterSize = cluster.length;
    }
    clustered.push(cluster[0]);
  }

  return clustered;
}

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
  private readonly translate = inject(TranslateService);
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
    timeframe: Timeframe = '1d',
    marketContext?: MarketContext | null,
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

    const regimeLabel = regime
      ? this.translate.instant(`regime.${regime.regime}`) ?? regime.regime.replace(/_/g, ' ')
      : 'unknown';
    const hasRegime = regime !== null;
    contributions.push({
      signal: `${this.translate.instant('confluence.marketRegime')}: ${regimeLabel}`,
      direction: pToDirection(pBullish),
      baseModifier: pBullish - 0.50,
      appliedModifier: pBullish - 0.50,
      description: hasRegime
        ? this.translate.instant('confluence.desc.regimeBase', {
            adx: regime!.methods.adxValue.toFixed(0),
            sma: regime!.methods.smaAlignment,
            structure: regime!.methods.structure,
          })
        : this.translate.instant('confluence.desc.regimeNoData'),
    });

    // ─── 2. Chart Patterns (Level 2) — clustered ────────────────
    const CHART_LOOKBACK = 60;
    const chartRecent = candles.slice(-CHART_LOOKBACK);
    const chartRecentTimestamps = new Set(chartRecent.map((c) => c.time));
    const rawChartPatterns = patterns.filter((p) =>
      ['double_top', 'double_bottom', 'head_and_shoulders', 'inverse_head_and_shoulders'].includes(p.type) &&
      chartRecentTimestamps.has(p.time),
    );

    const lastCandleIdx = candles.length - 1;
    const atr14 = indicators?.atr ? Object.values(indicators.atr.values).pop() : undefined;
    const sma20Val = indicators?.sma20 ? Object.values(indicators.sma20.values).pop() : undefined;

    // Cluster chart patterns
    const clusteredCharts = clusterPatterns(rawChartPatterns, candles, (cp) => {
      const tier = (cp.grade === 'A') ? 'A' : 'B';
      const cfg = tier === 'A' ? EVIDENCE_LOG_LR.CHART_PATTERN_A : EVIDENCE_LOG_LR.CHART_PATTERN_B;
      const regimeAligned = (cp.sentiment === 'bullish' && initialRegimeIsBullish) ||
        (cp.sentiment === 'bearish' && !initialRegimeIsBullish);
      return regimeAligned ? cfg.aligned : cfg.counter;
    });

    for (const tp of clusteredCharts) {
      const cp = tp.pattern;
      const sigDir = cp.sentiment as 'bullish' | 'bearish';
      const grade = cp.grade ?? 'C';
      const gradeMult = GRADE_MULTIPLIER[grade];
      const decayWeight = computeTemporalDecay(tp.daysAgo, timeframe, atr14, sma20Val);
      const effectiveLogLR = tp.effectiveLogLR * gradeMult * decayWeight;
      const signedLogLR = sigDir === 'bullish' ? effectiveLogLR : -effectiveLogLR;

      pBullish = bayesianUpdate(pBullish, signedLogLR);

      const patternLabel = this.formatPatternLabel(cp.type, grade);
      const regimeAlignedCp = (sigDir === 'bullish' && initialRegimeIsBullish) ||
        (sigDir === 'bearish' && !initialRegimeIsBullish);
      const alignmentKey = regimeAlignedCp ? 'confluence.regimeAligned' : 'confluence.regimeCounter';
      const clusterNote = tp.effectiveLogLR > tp.rawLogLR ? ', clustered' : '';
      contributions.push({
        signal: patternLabel,
        direction: sigDir,
        baseModifier: signedLogLR,
        appliedModifier: signedLogLR,
        description: hasRegime
          ? this.translate.instant('confluence.desc.patternWithRegime', {
              pattern: patternLabel,
              alignment: this.translate.instant(alignmentKey),
              grade,
              multiplier: gradeMult.toFixed(1),
              decay: (decayWeight * 100).toFixed(0),
              cluster: clusterNote,
            })
          : this.translate.instant('confluence.desc.patternNoRegime', {
              pattern: patternLabel,
              grade,
              decay: (decayWeight * 100).toFixed(0),
            }),
      });
    }

    // ─── 3. Candlestick Patterns (Level 3) — clustered ───────────
    const RECENT_WINDOW = 30;
    const recentTimestamps = new Set(candles.slice(-RECENT_WINDOW).map((c) => c.time));
    const rawCandlePatterns = patterns.filter((p) =>
      !['double_top', 'double_bottom', 'head_and_shoulders', 'inverse_head_and_shoulders'].includes(p.type) &&
      recentTimestamps.has(p.time),
    );

    const clusteredCandles = clusterPatterns(rawCandlePatterns, candles, (cp) => {
      const tier = (cp.grade === 'A') ? 'A' : 'B';
      const cfg = tier === 'A' ? EVIDENCE_LOG_LR.CANDLE_PATTERN_A : EVIDENCE_LOG_LR.CANDLE_PATTERN_B;
      const regimeAligned = (cp.sentiment === 'bullish' && initialRegimeIsBullish) ||
        (cp.sentiment === 'bearish' && !initialRegimeIsBullish);
      return regimeAligned ? cfg.aligned : cfg.counter;
    });

    for (const tp of clusteredCandles) {
      const cp = tp.pattern;
      const sigDir = cp.sentiment as 'bullish' | 'bearish';
      const grade = cp.grade ?? 'C';
      const gradeMult = GRADE_MULTIPLIER[grade];
      const decayWeight = computeTemporalDecay(tp.daysAgo, timeframe, atr14, sma20Val);
      const effectiveLogLR = tp.effectiveLogLR * gradeMult * decayWeight;
      const signedLogLR = sigDir === 'bullish' ? effectiveLogLR : -effectiveLogLR;

      pBullish = bayesianUpdate(pBullish, signedLogLR);

      const patternLabel = this.formatPatternLabel(cp.type, grade);
      const regimeAlignedCp = (sigDir === 'bullish' && initialRegimeIsBullish) ||
        (sigDir === 'bearish' && !initialRegimeIsBullish);
      const alignmentKey = regimeAlignedCp ? 'confluence.regimeAligned' : 'confluence.regimeCounter';
      const clusterNote = tp.effectiveLogLR > tp.rawLogLR ? ', clustered' : '';
      contributions.push({
        signal: patternLabel,
        direction: sigDir,
        baseModifier: signedLogLR,
        appliedModifier: signedLogLR,
        description: hasRegime
          ? this.translate.instant('confluence.desc.patternWithRegime', {
              pattern: patternLabel,
              alignment: this.translate.instant(alignmentKey),
              grade,
              multiplier: gradeMult.toFixed(1),
              decay: (decayWeight * 100).toFixed(0),
              cluster: clusterNote,
            })
          : this.translate.instant('confluence.desc.patternNoRegime', {
              pattern: patternLabel,
              grade,
              decay: (decayWeight * 100).toFixed(0),
            }),
      });
    }

    // ─── 3.5 SMC Signals (Level 2.5) ──────────────────────────────
    const swingPoints = detectSwingPoints(candles, indicators?.atr?.values);
    const smcSignals = detectSMC(candles, swingPoints);
    for (const smc of smcSignals) {
      const logLrKey = `SMC_${smc.type}` as keyof typeof EVIDENCE_LOG_LR;
      const logLrCfg = EVIDENCE_LOG_LR[logLrKey];
      if (typeof logLrCfg !== 'object' || !('aligned' in logLrCfg)) continue;

      const regimeAligned = (smc.direction === 'bullish' && initialRegimeIsBullish) ||
        (smc.direction === 'bearish' && !initialRegimeIsBullish);
      const baseLogLR = regimeAligned ? logLrCfg.aligned : logLrCfg.counter;
      const signedLogLR = (smc.direction === 'bullish' ? baseLogLR : -baseLogLR) * smc.strength;

      pBullish = bayesianUpdate(pBullish, signedLogLR);

      const smcDescKey = this.smcDescriptionKey(smc.type, smc.direction);
      const smcDesc = this.translate.instant(smcDescKey, { price: smc.price.toFixed(2) });
      const smcSignalKey = this.translate.instant('confluence.smcSignal', { desc: smcDesc });
      const smcAlignKey = regimeAligned ? 'confluence.regimeAligned' : 'confluence.regimeCounter';

      contributions.push({
        signal: smcSignalKey,
        direction: smc.direction,
        baseModifier: signedLogLR,
        appliedModifier: signedLogLR,
        description: hasRegime
          ? this.translate.instant('confluence.desc.smcWithRegime', {
              desc: smcDesc,
              alignment: this.translate.instant(smcAlignKey),
              strength: (smc.strength * 100).toFixed(0),
            })
          : this.translate.instant('confluence.desc.smcNoRegime', { desc: smcDesc }),
      });
    }

    // ─── 4. Momentum (Level 4 in hierarchy) ──────────────────────
    if (indicators) {
      const rsiDiv = detectRsiDivergence(indicators, candles);
      if (rsiDiv) {
        const logLrCfg = EVIDENCE_LOG_LR.RSI_DIVERGENCE;
        const regimeAligned = (rsiDiv === 'bullish' && initialRegimeIsBullish) ||
          (rsiDiv === 'bearish' && !initialRegimeIsBullish);
        const logLR = regimeAligned ? logLrCfg.aligned : logLrCfg.counter;
        const signedLogLR = rsiDiv === 'bullish' ? logLR : -logLR;

        pBullish = bayesianUpdate(pBullish, signedLogLR);

        const label = rsiDiv === 'bullish'
          ? this.translate.instant('confluence.rsiBullishDivergence')
          : this.translate.instant('confluence.rsiBearishDivergence');
        const rsiDescKey = hasRegime
          ? (regimeAligned ? 'confluence.desc.rsiAligned' : 'confluence.desc.rsiCounter')
          : 'confluence.desc.rsiNeutral';
        contributions.push({
          signal: label,
          direction: rsiDiv,
          baseModifier: signedLogLR,
          appliedModifier: signedLogLR,
          description: this.translate.instant(rsiDescKey),
        });
      }

      const macdCross = detectMacdCrossover(indicators);
      if (macdCross) {
        const logLrCfg = EVIDENCE_LOG_LR.MACD_CROSSOVER;
        const regimeAligned = (macdCross === 'bullish' && initialRegimeIsBullish) ||
          (macdCross === 'bearish' && !initialRegimeIsBullish);
        const logLR = regimeAligned ? logLrCfg.aligned : logLrCfg.counter;
        const signedLogLR = macdCross === 'bullish' ? logLR : -logLR;

        pBullish = bayesianUpdate(pBullish, signedLogLR);

        const label = macdCross === 'bullish'
          ? this.translate.instant('confluence.macdBullishCrossover')
          : this.translate.instant('confluence.macdBearishCrossover');
        const macdDescKey = hasRegime
          ? (regimeAligned ? 'confluence.desc.macdAligned' : 'confluence.desc.macdCounter')
          : 'confluence.desc.macdNeutral';
        contributions.push({
          signal: label,
          direction: macdCross,
          baseModifier: signedLogLR,
          appliedModifier: signedLogLR,
          description: this.translate.instant(macdDescKey),
        });
      }
    }

    // ─── 5. Volume (Level 5) — directional context ──────────────
    const volCtx = analyzeVolumeContext(candles, indicators, patterns);
    if (volCtx) {
      let volLogLR = 0;
      let volDescKey = '';

      if (volCtx.climaxType === 'buy_climax') {
        if (initialRegimeIsBullish) {
          volLogLR = EVIDENCE_LOG_LR.VOLUME_CONTRA;
          volDescKey = 'confluence.desc.climaxBuyUptrend';
        } else {
          volLogLR = EVIDENCE_LOG_LR.VOLUME_CONFIRM;
          volDescKey = 'confluence.desc.climaxBuyDowntrend';
        }
      } else if (volCtx.climaxType === 'sell_climax') {
        if (initialRegimeIsBullish) {
          volLogLR = EVIDENCE_LOG_LR.VOLUME_CONTRA;
          volDescKey = 'confluence.desc.climaxSellUptrend';
        } else {
          volLogLR = EVIDENCE_LOG_LR.VOLUME_CONFIRM;
          volDescKey = 'confluence.desc.climaxSellDowntrend';
        }
      } else if (volCtx.deltaDirection === 'buy') {
        volLogLR = EVIDENCE_LOG_LR.VOLUME_CONFIRM * 0.5;
        volDescKey = 'confluence.desc.buyPressure';
      } else if (volCtx.deltaDirection === 'sell') {
        volLogLR = EVIDENCE_LOG_LR.VOLUME_CONTRA * 0.5;
        volDescKey = 'confluence.desc.sellPressure';
      } else {
        volLogLR = -0.10;
        volDescKey = 'confluence.desc.noDirection';
      }

      const volDesc = this.translate.instant(volDescKey);
      const volSignalType = volCtx.climaxType !== 'none'
        ? volCtx.climaxType.replace('_', ' ')
        : '';

      pBullish = bayesianUpdate(pBullish, volLogLR);
      contributions.push({
        signal: volCtx.climaxType !== 'none'
          ? this.translate.instant('confluence.volumeSignal', { type: volSignalType })
          : this.translate.instant('confluence.volumePressure'),
        direction: volCtx.deltaDirection === 'buy' ? 'bullish' : volCtx.deltaDirection === 'sell' ? 'bearish' : 'neutral',
        baseModifier: volLogLR,
        appliedModifier: volLogLR,
        description: this.translate.instant('confluence.desc.volume', {
          desc: volDesc,
          delta: volCtx.deltaDirection,
          strength: (volCtx.deltaStrength * 100).toFixed(0),
        }),
      });
    }
    // Note: if volSignal is null, volume indicators are not active — skip multiplier

    // ─── 5.5 Market Context (Epic 9) ────────────────────────────
    if (marketContext) {
      const vixKey = applyVixAdjustmentKey(marketContext.vixLevel);
      if (vixKey) {
        pBullish = bayesianUpdate(pBullish, marketContext.vixAdjustment);
        contributions.push({
          signal: `VIX: ${marketContext.vixLevel}`,
          direction: 'neutral',
          baseModifier: marketContext.vixAdjustment,
          appliedModifier: marketContext.vixAdjustment,
          description: this.translate.instant(vixKey),
        });
      }

      if (marketContext.dxyCorrelation !== 0 && !ticker.includes('-USD')) {
        const isForexMajor = FOREX_MAJORS.has(ticker);
        const dxyAdjust = isForexMajor
          ? -0.12
          : marketContext.dxyCorrelation > 0.3 ? -0.08
            : marketContext.dxyCorrelation < -0.3 ? 0.08 : 0;
        if (dxyAdjust !== 0) {
          pBullish = bayesianUpdate(pBullish, dxyAdjust);
          const dxyDescKey = isForexMajor ? 'confluence.desc.dxyForex' : 'confluence.desc.dxyCorrelation';
          const dxyDescParams = isForexMajor
            ? { logLR: '−0.12' }
            : { ticker, pct: (marketContext.dxyCorrelation * 100).toFixed(0) };
          contributions.push({
            signal: `DXY Correlation: ${marketContext.dxyCorrelation.toFixed(2)}`,
            direction: dxyAdjust > 0 ? 'bullish' : 'bearish',
            baseModifier: dxyAdjust,
            appliedModifier: dxyAdjust,
            description: this.translate.instant(dxyDescKey, dxyDescParams),
          });
        }
      }

      if (marketContext.fundingRate !== undefined) {
        const funding = marketContext.fundingRate;
        if (Math.abs(funding) > 0.001) {
          const fundingLR = funding > 0 ? -0.15 : 0.10;
          pBullish = bayesianUpdate(pBullish, fundingLR);
          const fundingDescKey = funding > 0
            ? 'confluence.desc.fundingPositive'
            : 'confluence.desc.fundingNegative';
          contributions.push({
            signal: `Funding Rate: ${(funding * 100).toFixed(3)}%`,
            direction: funding > 0 ? 'bearish' : 'bullish',
            baseModifier: fundingLR,
            appliedModifier: fundingLR,
            description: this.translate.instant(fundingDescKey),
          });
        }
      }
    }

    // ─── 6. 2026 Market Overrides ─────────────────────────────────
    pBullish = this.apply2026Overrides(pBullish, ticker, candles, overrides);

    // ─── 7. Clamp ─────────────────────────────────────────────────
    pBullish = clamp(pBullish, 0.05, 0.95);

    // ─── 8. Filter zero-impact signals ─────────────────────────────
    const filtered = contributions.filter((s) => Math.abs(s.appliedModifier) > 0.001);

    // ─── 9. Compute Tier ──────────────────────────────────────────
    const { direction, tier } = computeTier(pBullish);

    // ─── 10. Risk Parameters ──────────────────────────────────────
    const riskParams = this.computeRiskParams(candles, direction, tier, indicators, accountSize);

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
      if (pBullish > 0.50) {
        pBullish *= 1.1;
        overrides.push(this.translate.instant('confluence.overrides.passiveFlowBullish'));
      } else if (pBullish < 0.50) {
        pBullish *= 0.9;
        overrides.push(this.translate.instant('confluence.overrides.passiveFlowBearish'));
      }
      pBullish = clamp(pBullish, 0.05, 0.95);
    }

    // 0DTE Gamma Override: M/W/F intraday — ONLY for US equities/ETFs
    const dow = new Date().getUTCDay();
    if (US_OPTIONS_UNDERLYINGS.has(ticker) && (dow === 1 || dow === 3 || dow === 5)) {
      if (candles.length >= 2) {
        const intervalMs = (candles[1].time - candles[0].time) * 1000;
        const hours = intervalMs / (1000 * 60 * 60);
        if (hours > 0 && hours < 24) {
          pBullish = pBullish * 0.7 + 0.50 * 0.3;
          overrides.push(this.translate.instant('confluence.overrides.zeroDteGamma'));
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
    indicators: IndicatorResults | null,
    accountSize?: number,
    riskPercent: number = 0.02,
  ): RiskParams {
    if (candles.length < 20) {
      return { stopLoss: null, takeProfit: null, riskRewardRatio: null, positionSize: null };
    }

    const lastCandle = candles[candles.length - 1];
    const entry = lastCandle.close;

    // Get ATR(14) — from indicators if available, else compute from last 14 candles
    let atr14 = indicators?.atr ? Object.values(indicators.atr.values).pop() ?? 0 : 0;
    if (atr14 <= 0 && candles.length >= 15) {
      atr14 = computeAtrSync(candles, 14);
    }
    if (atr14 <= 0) {
      // Fallback: use 2% of price as proxy for ATR
      atr14 = entry * 0.02;
    }

    // Compute ATR percentile — compare current ATR(14) to historical ATR(14)
    // Prefer worker's pre-computed values; fall back to raw TR if unavailable
    let atrPercentile = 0.5;
    if (candles.length >= 20) {
      const historicalAtr: number[] = [];

      if (indicators?.atr?.values) {
        // Use worker's pre-computed ATR(14) map
        const atrEntries = Object.entries(indicators.atr.values)
          .sort((a, b) => Number(a[0]) - Number(b[0]));
        for (const [, val] of atrEntries) {
          if (val > 0) historicalAtr.push(val);
        }
      } else {
        // Fallback: compute simple rolling TR (not Wilder's smoothed, but better than nothing)
        for (let i = Math.max(14, candles.length - 100); i < candles.length; i++) {
          let sumTr = 0;
          for (let j = i - 13; j <= i; j++) {
            const prevClose = candles[j - 1].close;
            const tr = Math.max(
              candles[j].high - candles[j].low,
              Math.abs(candles[j].high - prevClose),
              Math.abs(candles[j].low - prevClose),
            );
            sumTr += tr;
          }
          historicalAtr.push(sumTr / 14);
        }
      }

      if (historicalAtr.length > 0) {
        const belowCurrent = historicalAtr.filter((a) => a < atr14).length;
        atrPercentile = belowCurrent / historicalAtr.length;
      }
    }

    // Adaptive SL multiplier and R:R
    let slMultiplier: number;
    let rrRatio: number;
    if (atrPercentile > 0.8) {
      slMultiplier = 2.5;
      rrRatio = tier === 'HIGH' ? 1.5 : tier === 'MEDIUM' ? 2.0 : 1.0;
    } else if (atrPercentile < 0.2) {
      slMultiplier = 1.5;
      rrRatio = tier === 'HIGH' ? 3.0 : tier === 'MEDIUM' ? 4.0 : 2.0;
    } else {
      slMultiplier = 2.0;
      rrRatio = tier === 'HIGH' ? 2.0 : tier === 'MEDIUM' ? 3.0 : 1.5;
    }

    const slDistance = atr14 * slMultiplier;

    let stopLoss: number | null = null;
    let takeProfit: number | null = null;

    // Adaptive risk cap: 5× ATR as % of price, clamped to [1%, 20%]
    const atrPct = atr14 / entry;
    const maxRiskPct = Math.min(0.20, Math.max(atrPct * 5, 0.01));

    // Use swing-point-based stop as a floor (structure beats indicator)
    const swingStop = direction === 'bullish'
      ? findSwingLow(candles, 10)
      : findSwingHigh(candles, 10);

    if (direction === 'bullish') {
      const atrStop = entry - slDistance;
      stopLoss = swingStop && swingStop < entry && swingStop > atrStop ? swingStop : atrStop;
      const risk = Math.min(entry - stopLoss, entry * maxRiskPct);
      stopLoss = entry - risk;
      takeProfit = entry + risk * rrRatio;
    } else if (direction === 'bearish') {
      const atrStop = entry + slDistance;
      stopLoss = swingStop && swingStop > entry && swingStop < atrStop ? swingStop : atrStop;
      const risk = Math.min(stopLoss - entry, entry * maxRiskPct);
      stopLoss = entry + risk;
      takeProfit = entry - risk * rrRatio;
    }

    if (takeProfit !== null && takeProfit <= 0) {
      takeProfit = null;
    }

    const positionSize = accountSize && stopLoss && entry
      ? Math.floor((accountSize * riskPercent) / Math.abs(entry - stopLoss))
      : null;

    return { stopLoss, takeProfit, riskRewardRatio: rrRatio, positionSize };
  }

  /** Format a pattern type + grade label using translated pattern names */
  private formatPatternLabel(type: string, grade: string): string {
    const keyMap: Record<string, string> = {
      double_top: 'pattern.doubleTop',
      double_bottom: 'pattern.doubleBottom',
      head_and_shoulders: 'pattern.headAndShoulders',
      inverse_head_and_shoulders: 'pattern.inverseHeadAndShoulders',
      doji: 'pattern.doji',
      hammer: 'pattern.hammer',
      shooting_star: 'pattern.shootingStar',
      bullish_engulfing: 'pattern.bullishEngulfing',
      bearish_engulfing: 'pattern.bearishEngulfing',
      morning_star: 'pattern.morningStar',
      evening_star: 'pattern.eveningStar',
      bullish_harami: 'pattern.bullishHarami',
      bearish_harami: 'pattern.bearishHarami',
      three_white_soldiers: 'pattern.threeWhiteSoldiers',
      three_black_crows: 'pattern.threeBlackCrows',
    };
    const key = keyMap[type];
    const label = key ? (this.translate.instant(key) ?? type) : type;
    return `${label} (${grade})`;
  }

  /** Build i18n key for SMC signal description */
  private smcDescriptionKey(type: string, direction: string): string {
    const prefix = 'confluence.smc.';
    if (type === 'BOS') return direction === 'bullish' ? `${prefix}bosBullish` : `${prefix}bosBearish`;
    if (type === 'CHoCH') return direction === 'bullish' ? `${prefix}chochBullish` : `${prefix}chochBearish`;
    if (type === 'LIQUIDITY_SWEEP') return direction === 'bullish' ? `${prefix}sweepBullish` : `${prefix}sweepBearish`;
    return `${prefix}bosBullish`; // fallback
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

/** Synchronous ATR computation (fallback when worker data unavailable) */
function computeAtrSync(candles: Candle[], period: number): number {
  if (candles.length < period + 1) return 0;
  let sum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const prev = candles[i - 1]!;
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - prev.close),
      Math.abs(candles[i].low - prev.close),
    );
    sum += tr;
  }
  return sum / period;
}

/** Return i18n key for VIX adjustment message, or null if no adjustment needed */
function applyVixAdjustmentKey(vixLevel: string): string | null {
  switch (vixLevel) {
    case 'extreme':
      return 'confluence.desc.vixExtreme';
    case 'high':
      return 'confluence.desc.vixHigh';
    case 'low':
      return 'confluence.desc.vixLow';
    default:
      return null;
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

function computeTier(p: number): { direction: ConfluenceDirection; tier: ConfidenceTier } {
  // V2.0: Bayesian converges more conservatively, thresholds adjusted
  if (p >= 0.72) return { direction: 'bullish', tier: 'HIGH' };
  if (p >= 0.58) return { direction: 'bullish', tier: 'MEDIUM' };
  if (p >= 0.50) return { direction: 'bullish', tier: 'LOW' };
  if (p > 0.42) return { direction: 'neutral', tier: 'NEUTRAL' };
  if (p >= 0.28) return { direction: 'bearish', tier: 'LOW' };
  if (p >= 0.18) return { direction: 'bearish', tier: 'MEDIUM' };
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
    rsiValues[candles[lowestPriceIdx].time] !== undefined &&
    rsiValues[candles[secondLowestPriceIdx].time] !== undefined
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
    rsiValues[candles[highestPriceIdx].time] !== undefined &&
    rsiValues[candles[secondHighestPriceIdx].time] !== undefined
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
// ─── Volume Context (Phase 3) ─────────────────────────────────────

interface VolumeContext {
  deltaDirection: 'buy' | 'sell' | 'neutral';
  deltaStrength: number;
  climaxType: 'buy_climax' | 'sell_climax' | 'none';
}

function analyzeVolumeContext(
  candles: Candle[],
  indicators: IndicatorResults | null,
  patterns: DetectedPattern[],
): VolumeContext | null {
  if (!indicators) return null;

  const hasClimax = indicators.volumeClimax && indicators.volumeClimax.spikes.length > 0;
  const hasDryUp = indicators.volumeDryUp && indicators.volumeDryUp.dips.length > 0;
  const hasDivergence = indicators.volumeDivergence && indicators.volumeDivergence.divergences.length > 0;

  // If no volume indicators active, return null (skip)
  if (!hasClimax && !hasDryUp && !hasDivergence) {
    if (!indicators.volumeClimax && !indicators.volumeDryUp && !indicators.volumeDivergence) {
      return null;
    }
  }

  const last = candles[candles.length - 1];
  const range = last.high - last.low;
  const closeLocation = range > 0 ? (last.close - last.low) / range : 0.5;

  // Close-location delta proxy
  let deltaDirection: 'buy' | 'sell' | 'neutral';
  let deltaStrength: number;
  if (closeLocation > 0.7) {
    deltaDirection = 'buy';
    deltaStrength = (closeLocation - 0.7) / 0.3;
  } else if (closeLocation < 0.3) {
    deltaDirection = 'sell';
    deltaStrength = (0.3 - closeLocation) / 0.3;
  } else {
    deltaDirection = 'neutral';
    deltaStrength = 0;
  }

  // Climax type: high volume + directional close
  const isClimax = hasClimax && indicators.volumeClimax!.spikes.some(
    (s) => s.time === last.time
  );
  let climaxType: 'buy_climax' | 'sell_climax' | 'none' = 'none';
  if (isClimax) {
    if (deltaDirection === 'buy') climaxType = 'buy_climax';
    else if (deltaDirection === 'sell') climaxType = 'sell_climax';
  }

  return { deltaDirection, deltaStrength, climaxType };
}

// ─── Structural Swing Detection (V2.0 enhanced) ───────────────────

interface SwingPoint {
  type: 'high' | 'low';
  price: number;
  time: number;
  index: number;
}

/**
 * Find structural swing points in candle data.
 *
 * A swing high requires: higher than 2 candles before AND 2 candles after.
 * A swing low requires: lower than 2 candles before AND 2 candles after.
 *
 * Enhanced from V1.0's simple min/max window scan. Used by SMC detection
 * (Phase 2) and stop-loss placement.
 */
function detectSwingPoints(
  candles: Candle[],
  atrValues?: Record<number, number>,
): SwingPoint[] {
  const swings: SwingPoint[] = [];
  if (candles.length < 5) return swings;

  // Minimum ATR fraction for a swing to be meaningful (noise filter)
  const minSwingDistance = atrValues
    ? (Object.values(atrValues).pop() ?? 0) * 0.5
    : 0;

  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];

    // Swing high
    if (
      c.high > candles[i - 1].high &&
      c.high > candles[i - 2].high &&
      c.high > candles[i + 1].high &&
      c.high > candles[i + 2].high
    ) {
      // Noise filter: skip if too close to previous swing OF THE SAME TYPE
      if (minSwingDistance > 0) {
        const prevSameType = [...swings].reverse().find((s) => s.type === 'high');
        if (prevSameType && Math.abs(c.high - prevSameType.price) < minSwingDistance) continue;
      }
      swings.push({ type: 'high', price: c.high, time: c.time, index: i });
    }

    // Swing low
    if (
      c.low < candles[i - 1].low &&
      c.low < candles[i - 2].low &&
      c.low < candles[i + 1].low &&
      c.low < candles[i + 2].low
    ) {
      if (minSwingDistance > 0) {
        const prevSameType = [...swings].reverse().find((s) => s.type === 'low');
        if (prevSameType && Math.abs(c.low - prevSameType.price) < minSwingDistance) continue;
      }
      swings.push({ type: 'low', price: c.low, time: c.time, index: i });
    }
  }

  return swings;
}

/**
 * Find the lowest swing low in the last `window` candles (excluding last).
 * Enhanced V2.0: uses structural swing detection instead of simple min scan.
 */
function findSwingLow(candles: Candle[], window: number): number | null {
  if (candles.length < 5) return null;
  const startIdx = Math.max(0, candles.length - window);
  const windowCandles = candles.slice(startIdx, candles.length - 1);
  const swings = detectSwingPoints(candles).filter(
    (s) => s.type === 'low' && s.index >= startIdx && s.index < candles.length - 1,
  );
  if (swings.length === 0) {
    // Fallback: simple min in window
    let lowest = Infinity;
    for (const c of windowCandles) {
      if (c.low < lowest) lowest = c.low;
    }
    return lowest === Infinity ? null : lowest;
  }
  return Math.min(...swings.map((s) => s.price));
}

/**
 * Find the highest swing high in the last `window` candles (excluding last).
 * Enhanced V2.0: uses structural swing detection instead of simple max scan.
 */
function findSwingHigh(candles: Candle[], window: number): number | null {
  if (candles.length < 5) return null;
  const startIdx = Math.max(0, candles.length - window);
  const swings = detectSwingPoints(candles).filter(
    (s) => s.type === 'high' && s.index >= startIdx && s.index < candles.length - 1,
  );
  if (swings.length === 0) {
    // Fallback: simple max in window
    let highest = -Infinity;
    for (let i = startIdx; i < candles.length - 1; i++) {
      if (candles[i].high > highest) highest = candles[i].high;
    }
    return highest === -Infinity ? null : highest;
  }
  return Math.max(...swings.map((s) => s.price));
}
