/**
 * Unit tests for technical indicator calculations.
 * These test the pure math functions that run in the Web Worker.
 */
import { describe, it, expect } from 'vitest';
import { Candle } from '../models/candle.model';

// ─── Helper: generate test candles ─────────────────────────────────

function makeCandles(count: number, basePrice = 100, volatility = 2): Candle[] {
  const candles: Candle[] = [];
  let price = basePrice;
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * volatility;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    price = close;
    candles.push({
      time: 1700000000 + i * 86400,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: Math.floor(Math.random() * 2000000) + 500000,
    });
  }
  return candles;
}

// ─── Indicator calculation functions (replicated from worker) ──────

function calcSMA(candles: Candle[], period: number): Record<number, number> {
  const result: Record<number, number> = {};
  if (candles.length < period) return result;

  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += candles[j].close;
    }
    result[candles[i].time] = Math.round((sum / period) * 100) / 100;
  }
  return result;
}

function calcEMA(candles: Candle[], period: number): Record<number, number> {
  const result: Record<number, number> = {};
  if (candles.length < period) return result;

  const multiplier = 2 / (period + 1);

  // First EMA = SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  let ema = sum / period;
  result[candles[period - 1].time] = Math.round(ema * 100) / 100;

  // Subsequent EMAs
  for (let i = period; i < candles.length; i++) {
    ema = (candles[i].close - ema) * multiplier + ema;
    result[candles[i].time] = Math.round(ema * 100) / 100;
  }
  return result;
}

function calcRSI(candles: Candle[], period: number): Record<number, number> {
  const result: Record<number, number> = {};
  if (candles.length < period + 1) return result;

  let avgGain = 0;
  let avgLoss = 0;

  // Initial average
  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change >= 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < candles.length; i++) {
    if (avgLoss === 0) {
      result[candles[i].time] = 100;
    } else {
      const rs = avgGain / avgLoss;
      result[candles[i].time] = Math.round((100 - 100 / (1 + rs)) * 100) / 100;
    }

    // Update for next iteration
    const change = candles[i].close - candles[i - 1].close;
    const gain = change >= 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  return result;
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('SMA calculation', () => {
  it('returns empty for insufficient data', () => {
    const candles = makeCandles(5, 100, 0); // 5 candles, period 20
    const result = calcSMA(candles, 20);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('calculates correct SMA for constant prices', () => {
    const candles = Array.from({ length: 5 }, (_, i) => ({
      time: 1700000000 + i * 86400,
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 1000000,
    }));
    const result = calcSMA(candles, 3);
    const values = Object.values(result);
    expect(values).toHaveLength(3); // candles 2,3,4
    values.forEach((v) => expect(v).toBe(100));
  });

  it('calculates SMA for varying prices', () => {
    const candles = [
      { time: 1, open: 10, high: 10, low: 10, close: 10, volume: 1 },
      { time: 2, open: 20, high: 20, low: 20, close: 20, volume: 1 },
      { time: 3, open: 30, high: 30, low: 30, close: 30, volume: 1 },
    ];
    const result = calcSMA(candles, 3);
    // SMA(3) on [10, 20, 30] = 20
    expect(result[3]).toBe(20);
  });
});

describe('EMA calculation', () => {
  it('returns empty for insufficient data', () => {
    const candles = makeCandles(5, 100, 0);
    const result = calcEMA(candles, 9);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('first EMA equals SMA for the period', () => {
    const candles = Array.from({ length: 5 }, (_, i) => ({
      time: i + 1,
      open: (i + 1) * 10,
      high: (i + 1) * 10,
      low: (i + 1) * 10,
      close: (i + 1) * 10,
      volume: 1,
    }));
    const result = calcEMA(candles, 3);
    // First EMA at index 2: avg of 10,20,30 = 20
    expect(result[3]).toBe(20);
  });
});

describe('RSI calculation', () => {
  it('returns empty for insufficient data', () => {
    const candles = makeCandles(5, 100, 0);
    const result = calcRSI(candles, 14);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('returns 100 when no losses', () => {
    // Strictly increasing prices
    const candles = Array.from({ length: 20 }, (_, i) => ({
      time: i + 1,
      open: i * 10,
      high: (i + 1) * 10,
      low: i * 10,
      close: (i + 1) * 10,
      volume: 1,
    }));
    const result = calcRSI(candles, 14);
    const lastValue = Object.values(result).pop()!;
    expect(lastValue).toBe(100);
  });

  it('returns 0 when no gains', () => {
    // Strictly decreasing prices
    const candles = Array.from({ length: 20 }, (_, i) => ({
      time: i + 1,
      open: (20 - i) * 10,
      high: (20 - i) * 10,
      low: (20 - i - 1) * 10,
      close: (20 - i - 1) * 10,
      volume: 1,
    }));
    const result = calcRSI(candles, 14);
    const lastValue = Object.values(result).pop()!;
    expect(lastValue).toBe(0);
  });

  it('RSI values are between 0 and 100', () => {
    const candles = makeCandles(100, 100, 3);
    const result = calcRSI(candles, 14);
    const values = Object.values(result);
    expect(values.length).toBeGreaterThan(0);
    values.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    });
  });

  it('returns correct number of RSI values', () => {
    const candles = makeCandles(50, 100, 2);
    const result = calcRSI(candles, 14);
    // 50 candles, period 14 → first RSI at index 14, so 50-14 = 36 values
    expect(Object.keys(result)).toHaveLength(36);
  });
});

// ─── ADX Calculation ───────────────────────────────────────────────

function calcADX(candles: Candle[], period: number): Record<number, number> {
  const result: Record<number, number> = {};
  if (candles.length < period + 1) return result;

  const trValues: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose),
    );
    trValues.push(tr);

    const upMove = high - candles[i - 1].high;
    const downMove = candles[i - 1].low - low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  // Wilder's smoothing
  let atr = trValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let smoothedPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let smoothedMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < trValues.length; i++) {
    atr = (atr * (period - 1) + trValues[i]) / period;
    smoothedPlusDM = (smoothedPlusDM * (period - 1) + plusDM[i]) / period;
    smoothedMinusDM = (smoothedMinusDM * (period - 1) + minusDM[i]) / period;

    const plusDI = atr > 0 ? (smoothedPlusDM / atr) * 100 : 0;
    const minusDI = atr > 0 ? (smoothedMinusDM / atr) * 100 : 0;
    const dxSum = plusDI + minusDI;
    const dx = dxSum > 0 ? Math.abs(plusDI - minusDI) / dxSum * 100 : 0;

    result[candles[i + 1].time] = Math.round(dx * 100) / 100;
  }

  return result;
}

describe('ADX calculation', () => {
  it('returns ADX values for sufficient candles', () => {
    const candles = makeCandles(50, 100, 3);
    const result = calcADX(candles, 14);
    const values = Object.values(result);
    expect(values.length).toBeGreaterThan(0);
  });

  it('ADX values are between 0 and 100', () => {
    const candles = makeCandles(100, 100, 3);
    const result = calcADX(candles, 14);
    Object.values(result).forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    });
  });

  it('returns empty for insufficient candles', () => {
    const candles = makeCandles(10, 100, 2);
    const result = calcADX(candles, 14);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('strong trending candles produce higher ADX', () => {
    // Create candles with consistent upward movement
    const candles: Candle[] = [];
    let price = 100;
    for (let i = 0; i < 50; i++) {
      price += 2; // Strong trend
      candles.push({
        time: 1700000000 + i * 86400,
        open: price - 1,
        high: price + 1,
        low: price - 1.5,
        close: price,
        volume: 1000000,
      });
    }
    const result = calcADX(candles, 14);
    const values = Object.values(result);
    const lastValue = values[values.length - 1];
    // Strong trend should produce high ADX
    expect(lastValue).toBeGreaterThan(25);
  });
});

// ─── Volume Analysis ───────────────────────────────────────────────

function detectVolumeClimax(candles: Candle[]): { time: number; ratio: number }[] {
  if (candles.length < 20) return [];
  const avgVolume = candles.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;
  const spikes: { time: number; ratio: number }[] = [];
  for (let i = candles.length - 20; i < candles.length; i++) {
    const ratio = candles[i].volume / avgVolume;
    if (ratio >= 2.5) spikes.push({ time: candles[i].time, ratio });
  }
  return spikes;
}

function detectVolumeDryUp(candles: Candle[]): { time: number; ratio: number }[] {
  if (candles.length < 20) return [];
  const avgVolume = candles.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;
  if (avgVolume === 0) return [];
  const dips: { time: number; ratio: number }[] = [];
  for (let i = candles.length - 20; i < candles.length; i++) {
    const ratio = candles[i].volume / avgVolume;
    if (ratio <= 0.5) dips.push({ time: candles[i].time, ratio });
  }
  return dips;
}

describe('Volume analysis', () => {
  it('volume climax detects spikes >= 2.5x average', () => {
    const candles = makeCandles(30, 100, 2);
    // Inject a spike
    candles[candles.length - 5].volume = 10_000_000; // ~8x of normal
    const spikes = detectVolumeClimax(candles);
    expect(spikes.length).toBeGreaterThan(0);
    const spike = spikes.find((s) => s.time === candles[candles.length - 5].time);
    expect(spike).toBeDefined();
    expect(spike!.ratio).toBeGreaterThanOrEqual(2.5);
  });

  it('volume dry-up detects dips <= 0.5x average', () => {
    const candles = makeCandles(30, 100, 2);
    candles[candles.length - 3].volume = 100_000; // ~0.1x of normal
    const dips = detectVolumeDryUp(candles);
    expect(dips.length).toBeGreaterThan(0);
    const dip = dips.find((d) => d.time === candles[candles.length - 3].time);
    expect(dip).toBeDefined();
    expect(dip!.ratio).toBeLessThanOrEqual(0.5);
  });

  it('no spikes when volume is consistent', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 30; i++) {
      candles.push({
        time: 1700000000 + i * 86400,
        open: 100, high: 102, low: 98, close: 101,
        volume: 1_000_000,
      });
    }
    const spikes = detectVolumeClimax(candles);
    expect(spikes).toHaveLength(0);
  });
});
