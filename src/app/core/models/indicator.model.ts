/** Indicator calculation results mapped to candle timestamps */

export interface RsiResult {
  /** Map of timestamp → RSI value */
  values: Record<number, number>;
  period: number;
}

export interface MacdResult {
  /** Map of timestamp → { macd, signal, histogram } */
  values: Record<number, { macd: number; signal: number; histogram: number }>;
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
}

export interface BollingerBandsResult {
  /** Map of timestamp → { upper, middle, lower } */
  values: Record<number, { upper: number; middle: number; lower: number }>;
  period: number;
  stdDev: number;
}

export interface SmaResult {
  values: Record<number, number>;
  period: number;
}

export interface EmaResult {
  values: Record<number, number>;
  period: number;
}

export interface VolumeProfileResult {
  /** Price levels → total volume */
  levels: { price: number; volume: number }[];
  poc: number; // Point of Control
  valueAreaHigh: number;
  valueAreaLow: number;
}

export interface IndicatorResults {
  rsi: RsiResult | null;
  macd: MacdResult | null;
  bb: BollingerBandsResult | null;
  sma20: SmaResult | null;
  sma50: SmaResult | null;
  sma200: SmaResult | null;
  ema9: EmaResult | null;
  ema21: EmaResult | null;
  volumeProfile: VolumeProfileResult | null;
}
