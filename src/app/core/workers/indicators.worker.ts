/**
 * Web Worker — Calculates technical indicators from Candle[] data.
 * Runs off the main thread to avoid blocking the UI.
 */

import { Candle } from '../models/candle.model';
import { IndicatorResults, RsiResult, MacdResult, BollingerBandsResult, SmaResult, EmaResult, VolumeProfileResult } from '../models/indicator.model';

export interface IndicatorWorkerInput {
  candles: Candle[];
  settings: IndicatorSettings;
}

export interface IndicatorSettings {
  rsi: boolean;
  macd: boolean;
  bb: boolean;
  sma20: boolean;
  sma50: boolean;
  sma200: boolean;
  ema9: boolean;
  ema21: boolean;
  volumeProfile: boolean;
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

  self.postMessage(result);
};
