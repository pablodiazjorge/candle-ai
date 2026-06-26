/**
 * Web Worker — Calculates technical indicators from Candle[] data.
 * Runs off the main thread to avoid blocking the UI.
 */

import { Candle } from '../models/candle.model';
import {
  IndicatorResults,
  IndicatorSettings,
  AdxResult,
  MarketRegime,
  RegimeResult,
  VolumeClimaxResult,
  VolumeDryUpResult,
  VolumeDivergenceResult,
  RsiResult,
  MacdResult,
  BollingerBandsResult,
  SmaResult,
  EmaResult,
  VolumeProfileResult,
} from '../models/indicator.model';

export interface IndicatorWorkerInput {
  candles: Candle[];
  settings: IndicatorSettings;
}

// ─── RSI ────────────────────────────────────────────────────────────

function calcRsi(candles: Candle[], period: number): RsiResult {
  const values: Record<number, number> = {};
  if (candles.length < period + 1) return { values, period };

  const closes = candles.map((c) => c.close);
  let avgGain = 0;
  let avgLoss = 0;

  // Initial average
  for (let i = 1; i <= period; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta > 0) avgGain += delta;
    else avgLoss += -delta;
  }
  avgGain /= period;
  avgLoss /= period;

  let rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  values[candles[period].time] = rsi;

  // Smooth subsequent values
  for (let i = period + 1; i < candles.length; i++) {
    const delta = closes[i] - closes[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    values[candles[i].time] = rsi;
  }

  return { values, period };
}

// ─── MACD ───────────────────────────────────────────────────────────

function calcEmaRaw(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(0);
  if (values.length === 0) return result;

  // SMA as first EMA value
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = ema;

  const multiplier = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema;
    result[i] = ema;
  }
  return result;
}

function calcMacd(candles: Candle[], fast: number, slow: number, signal: number): MacdResult {
  const values: Record<number, { macd: number; signal: number; histogram: number }> = {};
  if (candles.length < slow + signal) {
    return { values, fastPeriod: fast, slowPeriod: slow, signalPeriod: signal };
  }

  const closes = candles.map((c) => c.close);
  const emaFast = calcEmaRaw(closes, fast);
  const emaSlow = calcEmaRaw(closes, slow);

  // MACD line = fast EMA - slow EMA
  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    macdLine.push(i < slow - 1 ? 0 : emaFast[i] - emaSlow[i]);
  }

  // Signal line = EMA of MACD line
  const signalLine = calcEmaRaw(macdLine.slice(slow - 1), signal);
  const offset = slow - 1;

  for (let i = offset + signal - 1; i < candles.length; i++) {
    const si = i - offset;
    const macd = macdLine[i];
    const sig = signalLine[si];
    values[candles[i].time] = {
      macd: round2(macd),
      signal: round2(sig),
      histogram: round2(macd - sig),
    };
  }

  return { values, fastPeriod: fast, slowPeriod: slow, signalPeriod: signal };
}

// ─── SMA ────────────────────────────────────────────────────────────

function calcSma(candles: Candle[], period: number): SmaResult {
  const values: Record<number, number> = {};
  if (candles.length < period) return { values, period };

  let sum = candles.slice(0, period).reduce((a, c) => a + c.close, 0);
  values[candles[period - 1].time] = round2(sum / period);

  for (let i = period; i < candles.length; i++) {
    sum += candles[i].close - candles[i - period].close;
    values[candles[i].time] = round2(sum / period);
  }

  return { values, period };
}

// ─── EMA ────────────────────────────────────────────────────────────

function calcEma(candles: Candle[], period: number): EmaResult {
  const values: Record<number, number> = {};
  if (candles.length < period) return { values, period };

  const closes = candles.map((c) => c.close);
  const emaRaw = calcEmaRaw(closes, period);

  for (let i = period - 1; i < candles.length; i++) {
    values[candles[i].time] = round2(emaRaw[i]);
  }

  return { values, period };
}

// ─── Bollinger Bands ────────────────────────────────────────────────

function calcBollingerBands(candles: Candle[], period: number, stdDev: number): BollingerBandsResult {
  const values: Record<number, { upper: number; middle: number; lower: number }> = {};
  if (candles.length < period) return { values, period, stdDev };

  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, c) => a + c.close, 0) / period;
    const variance = slice.reduce((a, c) => a + (c.close - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);

    values[candles[i].time] = {
      upper: round2(mean + stdDev * std),
      middle: round2(mean),
      lower: round2(mean - stdDev * std),
    };
  }

  return { values, period, stdDev };
}

// ─── Volume Profile ─────────────────────────────────────────────────

function calcVolumeProfile(candles: Candle[]): VolumeProfileResult {
  const priceVolume: Map<number, number> = new Map();

  // Bin prices to whole numbers
  for (const c of candles) {
    const bin = Math.round(c.close);
    priceVolume.set(bin, (priceVolume.get(bin) ?? 0) + c.volume);
  }

  const levels = Array.from(priceVolume.entries())
    .map(([price, volume]) => ({ price, volume }))
    .sort((a, b) => b.volume - a.volume);

  // Point of Control (highest volume price level)
  const poc = levels[0]?.price ?? 0;

  // Value Area (70% of total volume)
  const totalVolume = levels.reduce((a, l) => a + l.volume, 0);
  const vaThreshold = totalVolume * 0.7;
  let accumulated = 0;
  let vaHigh = poc;
  let vaLow = poc;

  for (const level of levels) {
    accumulated += level.volume;
    vaHigh = Math.max(vaHigh, level.price);
    vaLow = Math.min(vaLow, level.price);
    if (accumulated >= vaThreshold) break;
  }

  return { levels, poc, valueAreaHigh: vaHigh, valueAreaLow: vaLow };
}

// ─── ADX ────────────────────────────────────────────────────────────

function calcAdx(candles: Candle[], period: number): AdxResult {
  const values: Record<number, number> = {};
  if (candles.length < period * 2 + 1) return { values, period };

  const trValues: number[] = [];
  const plusDm: number[] = [];
  const minusDm: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;

    // True Range
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose),
    );
    trValues.push(tr);

    // Directional Movement
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    if (upMove > downMove && upMove > 0) {
      plusDm.push(upMove);
    } else {
      plusDm.push(0);
    }
    if (downMove > upMove && downMove > 0) {
      minusDm.push(downMove);
    } else {
      minusDm.push(0);
    }
  }

  // Wilder's smoothing for AT
  let atr = trValues.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedPlusDm = plusDm.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedMinusDm = minusDm.slice(0, period).reduce((a, b) => a + b, 0);

  const diPlus: number[] = [];
  const diMinus: number[] = [];
  const adxValues: number[] = [];

  for (let i = period; i < trValues.length; i++) {
    atr = atr - atr / period + trValues[i];
    smoothedPlusDm = smoothedPlusDm - smoothedPlusDm / period + plusDm[i];
    smoothedMinusDm = smoothedMinusDm - smoothedMinusDm / period + minusDm[i];

    const dip = atr === 0 ? 0 : (smoothedPlusDm / atr) * 100;
    const dim = atr === 0 ? 0 : (smoothedMinusDm / atr) * 100;
    diPlus.push(dip);
    diMinus.push(dim);

    const dx = dip + dim === 0 ? 0 : (Math.abs(dip - dim) / (dip + dim)) * 100;
    adxValues.push(dx);
  }

  // Smooth ADX with Wilder's method
  if (adxValues.length >= period) {
    let adx = adxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
    values[candles[period * 2].time] = round2(adx);

    for (let i = period; i < adxValues.length; i++) {
      adx = (adx * (period - 1) + adxValues[i]) / period;
      const candleIdx = period * 2 + (i - period) + 1;
      if (candleIdx < candles.length) {
        values[candles[candleIdx].time] = round2(adx);
      }
    }
  }

  return { values, period };
}

// ─── Market Regime Detection ────────────────────────────────────────

function detectRegime(
  candles: Candle[],
  sma20: Record<number, number> | null,
  sma50: Record<number, number> | null,
  sma200: Record<number, number> | null,
  adxValues: Record<number, number> | null,
): RegimeResult | null {
  if (candles.length < 50) return null;

  const last = candles[candles.length - 1].time;

  // Method 1: SMA alignment
  const s20 = sma20 ? Object.values(sma20).pop() : null;
  const s50 = sma50 ? Object.values(sma50).pop() : null;
  const s200 = sma200 ? Object.values(sma200).pop() : null;

  let smaAlignment = 'unknown';
  if (s20 && s50 && s200) {
    if (s20 > s50 && s50 > s200) smaAlignment = 'uptrend';
    else if (s20 < s50 && s50 < s200) smaAlignment = 'downtrend';
    else smaAlignment = 'ranging';
  }

  // Method 2: ADX
  const adx = adxValues ? Object.values(adxValues).pop() ?? 0 : 0;
  let adxSignal = 'ranging';
  if (adx > 25) adxSignal = 'trending';
  else if (adx < 20) adxSignal = 'ranging';

  // Method 3: Market structure (HH/HL or LH/LL over last 20 candles)
  let structure = 'ranging';
  if (candles.length >= 20) {
    const recent = candles.slice(-20);
    const highs = recent.map((c) => c.high);
    const lows = recent.map((c) => c.low);

    // Find swing points
    const swingHighs = findSwings(highs, 'high');
    const swingLows = findSwings(lows, 'low');

    if (swingHighs.length >= 2 && swingLows.length >= 2) {
      const hh = swingHighs[swingHighs.length - 1] > swingHighs[swingHighs.length - 2];
      const hl = swingLows[swingLows.length - 1] > swingLows[swingLows.length - 2];
      const lh = swingHighs[swingHighs.length - 1] < swingHighs[swingHighs.length - 2];
      const ll = swingLows[swingLows.length - 1] < swingLows[swingLows.length - 2];

      if (hh && hl) structure = 'uptrend';
      else if (lh && ll) structure = 'downtrend';
      else structure = 'transitional';
    }
  }

  // Consensus: at least 2 of 3 must agree
  const signals = [smaAlignment, adxSignal, structure];
  const upVotes = signals.filter((s) => s === 'uptrend').length;
  const downVotes = signals.filter((s) => s === 'downtrend').length;
  const rangeVotes = signals.filter((s) => s === 'ranging' || s === 'transitional' || s === 'unknown').length;

  let regime: MarketRegime = 'transitional';
  let confidence = 0.5;

  if (upVotes >= 2) {
    regime = upVotes === 3 ? 'strong_uptrend' : 'weak_uptrend';
    confidence = upVotes === 3 ? 0.8 : 0.6;
  } else if (downVotes >= 2) {
    regime = downVotes === 3 ? 'strong_downtrend' : 'weak_downtrend';
    confidence = downVotes === 3 ? 0.8 : 0.6;
  } else if (rangeVotes >= 2) {
    regime = 'ranging';
    confidence = rangeVotes === 3 ? 0.7 : 0.55;
  }

  return {
    regime,
    confidence,
    methods: {
      smaAlignment,
      adxValue: round2(adx),
      structure,
    },
  };
}

function findSwings(values: number[], type: 'high' | 'low'): number[] {
  const swings: number[] = [];
  for (let i = 2; i < values.length - 2; i++) {
    if (type === 'high') {
      if (values[i] > values[i - 1] && values[i] > values[i - 2] &&
          values[i] > values[i + 1] && values[i] > values[i + 2]) {
        swings.push(values[i]);
      }
    } else {
      if (values[i] < values[i - 1] && values[i] < values[i - 2] &&
          values[i] < values[i + 1] && values[i] < values[i + 2]) {
        swings.push(values[i]);
      }
    }
  }
  return swings;
}

// ─── Volume Analysis ────────────────────────────────────────────────

function detectVolumeClimaxes(candles: Candle[]): VolumeClimaxResult {
  if (candles.length < 21) return { spikes: [] };

  const spikes: { time: number; ratio: number }[] = [];
  for (let i = 20; i < candles.length; i++) {
    const avg20 = candles.slice(i - 20, i).reduce((sum, c) => sum + c.volume, 0) / 20;
    if (avg20 > 0) {
      const ratio = candles[i].volume / avg20;
      if (ratio >= 2.5) {
        spikes.push({ time: candles[i].time, ratio: round2(ratio) });
      }
    }
  }
  return { spikes };
}

function detectVolumeDryUps(candles: Candle[]): VolumeDryUpResult {
  if (candles.length < 21) return { dips: [] };

  const dips: { time: number; ratio: number }[] = [];
  for (let i = 20; i < candles.length; i++) {
    const avg20 = candles.slice(i - 20, i).reduce((sum, c) => sum + c.volume, 0) / 20;
    if (avg20 > 0) {
      const ratio = candles[i].volume / avg20;
      if (ratio <= 0.5) {
        dips.push({ time: candles[i].time, ratio: round2(ratio) });
      }
    }
  }
  return { dips };
}

function detectVolumeDivergence(candles: Candle[]): VolumeDivergenceResult {
  if (candles.length < 10) return { divergences: [] };

  const divergences: { time: number; type: 'bullish' | 'bearish' }[] = [];
  for (let i = 10; i < candles.length; i++) {
    const currentHigh = candles[i].high;
    const currentLow = candles[i].low;
    const currentVol = candles[i].volume;
    const prevHigh = candles[i - 5].high;
    const prevLow = candles[i - 5].low;
    const prevVol = candles[i - 5].volume;

    // Bullish divergence: lower low but lower volume (selling pressure weakening)
    if (currentLow < prevLow && currentVol < prevVol && prevVol > 0) {
      divergences.push({ time: candles[i].time, type: 'bullish' });
    }
    // Bearish divergence: higher high but lower volume (buying pressure weakening)
    if (currentHigh > prevHigh && currentVol < prevVol && prevVol > 0) {
      divergences.push({ time: candles[i].time, type: 'bearish' });
    }
  }
  return { divergences };
}

// ─── Helpers ────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Main handler ───────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<IndicatorWorkerInput>) => {
  const { candles, settings } = event.data;

  const result: IndicatorResults = {
    rsi: null,
    macd: null,
    bb: null,
    sma20: null,
    sma50: null,
    sma200: null,
    ema9: null,
    ema21: null,
    volumeProfile: null,
    adx: null,
    regime: null,
    volumeClimax: null,
    volumeDryUp: null,
    volumeDivergence: null,
  };

  if (!candles.length) {
    self.postMessage(result);
    return;
  }

  if (settings.rsi) result.rsi = calcRsi(candles, 14);
  if (settings.macd) result.macd = calcMacd(candles, 12, 26, 9);
  if (settings.bb) result.bb = calcBollingerBands(candles, 20, 2);
  if (settings.sma20) result.sma20 = calcSma(candles, 20);
  if (settings.sma50) result.sma50 = calcSma(candles, 50);
  if (settings.sma200) result.sma200 = calcSma(candles, 200);
  if (settings.ema9) result.ema9 = calcEma(candles, 9);
  if (settings.ema21) result.ema21 = calcEma(candles, 21);
  if (settings.volumeProfile) result.volumeProfile = calcVolumeProfile(candles);
  if (settings.adx) result.adx = calcAdx(candles, 14);
  if (settings.volumeClimax) result.volumeClimax = detectVolumeClimaxes(candles);
  if (settings.volumeDryUp) result.volumeDryUp = detectVolumeDryUps(candles);
  if (settings.volumeDivergence) result.volumeDivergence = detectVolumeDivergence(candles);

  // Regime detection runs automatically if SMAs are computed
  if (settings.sma20 && settings.sma50 && settings.sma200) {
    result.regime = detectRegime(
      candles,
      result.sma20?.values ?? null,
      result.sma50?.values ?? null,
      result.sma200?.values ?? null,
      result.adx?.values ?? null,
    );
  }

  self.postMessage(result);
};
